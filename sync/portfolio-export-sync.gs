/**
 * Portfolio Export Sync — V2.1  (merge-upsert)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lukee yhtiöterminaaleista 21_PORTFOLIO_EXPORT-välilehden, tekee id-pohjaisen
 * upsert-mergen GitHubin portfolio.jsoniin ja committaa.
 *
 * Merge-sääntö:
 *   - Hae nykyinen portfolio.json GitHubista
 *   - Korvaa matching company.id:llä, säilytä muut ennallaan
 *   - Lisää uudet yhtiöt loppuun
 *   → Mandatum-ajo ei koskaan pudota muita yhtiöitä
 *
 * ── Kertasetup: Extensions → Apps Script → Project Settings → Script Properties
 *   GITHUB_TOKEN    ghp_xxx   (fine-grained PAT, Contents: Read & write)
 *   GITHUB_OWNER    github-käyttäjänimi
 *   GITHUB_REPO     portfolio-dashboard
 *   GITHUB_BRANCH   main
 *   EXPORT_SHEET    21_PORTFOLIO_EXPORT
 *
 *   ⚠ Älä koskaan liitä tokenia chattiin — vain Script Properties -kenttään.
 *
 * FILE_PATH = "portfolio.json" (repo-juuri, GitHub Pages no-build-rakenne)
 * Jos käytät Vite-buildia: "public/portfolio.json"
 * ─────────────────────────────────────────────────────────────────────────────
 */

const FILE_PATH = "public/portfolio.json"; // Vite: public/ → dist/ on build

// ── Valikko ──────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Portfolio")
    .addItem("Sync portfolio export", "syncPortfolioExport")
    .addToUi();
}

// ── Pääfunktio ───────────────────────────────────────────────────────────────

function syncPortfolioExport() {
  const props     = PropertiesService.getScriptProperties();
  const sheetName = props.getProperty("EXPORT_SHEET") || "21_PORTFOLIO_EXPORT";
  const sheet     = SpreadsheetApp.getActive().getSheetByName(sheetName);

  if (!sheet) {
    SpreadsheetApp.getUi().alert("Välilehteä ei löydy: " + sheetName);
    return;
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    SpreadsheetApp.getUi().alert("Export-välilehti on tyhjä tai sisältää vain otsikkorivin.");
    return;
  }

  // 1. Lue tämän terminaalin rivit
  const headers  = values.shift().map(h => String(h || "").trim());
  const skipped  = [];
  const incoming = [];

  values.forEach((row, i) => {
    if (row.every(cell => cell === "" || cell === null || cell === undefined)) return;
    const c = rowToCompany(row, headers);
    if (!c.id) {
      skipped.push("Rivi " + (i + 2) + " (" + (c.ticker || "?") + "): ei id-kenttää → ohitettu");
      return;
    }
    incoming.push(c);
  });

  if (incoming.length === 0) {
    SpreadsheetApp.getUi().alert(
      "Yhtään kelvollista riviä ei löytynyt.\n\n" +
      (skipped.length ? "Ohitetut:\n" + skipped.join("\n") : "")
    );
    return;
  }

  // 2. Hae nykyinen portfolio.json GitHubista (sisältö + sha yhdellä pyynnöllä)
  const current    = fetchFromGitHub();
  const existing   = (current.data && current.data.companies) ? current.data.companies : [];

  // 3. Merge: id-pohjainen upsert, muut yhtiöt säilyvät ennallaan
  const { companies, stats } = upsertCompanies(existing, incoming);

  // 4. Safety guard — sync ei saa koskaan vähentää yhtiömäärää ilman eksplisiittistä poistoa
  if (existing.length > 0 && companies.length < existing.length) {
    SpreadsheetApp.getUi().alert(
      "⚠ Sync keskeytettiin\n\n" +
      "Merge vähentäisi yhtiömäärää " + existing.length + " → " + companies.length + ".\n" +
      "Yhtiöitä ei voi poistaa tällä skriptillä.\n\n" +
      "Jos tämä on tarkoituksellista: muokkaa portfolio.json manuaalisesti GitHubissa."
    );
    return;
  }

  // 5. Rakenna payload
  const payload = {
    meta: {
      exportVersion: "v2",
      syncedAt:      new Date().toISOString(),
      source:        "Drive",
    },
    companies: companies,
  };

  // 5. Commit (sha suoraan fetchistä, ei toista GET:iä)
  commitToGitHub(JSON.stringify(payload, null, 2), current.sha);

  // 6. Yhteenveto
  let summary = stats.updated + " päivitetty · " +
                stats.added   + " lisätty · " +
                stats.kept    + " ennallaan → " + FILE_PATH;
  if (skipped.length) {
    summary += "\n\nOhitettu (" + skipped.length + "):\n" + skipped.join("\n");
    console.log("Sync: ohitetut rivit:\n" + skipped.join("\n"));
  }
  SpreadsheetApp.getActive().toast(summary, "Portfolio sync ✓", 8);
}

// ── fetchFromGitHub — hae nykyinen JSON + sha yhdellä pyynnöllä ──────────────

function fetchFromGitHub() {
  const props  = PropertiesService.getScriptProperties();
  const token  = props.getProperty("GITHUB_TOKEN");
  const owner  = props.getProperty("GITHUB_OWNER");
  const repo   = props.getProperty("GITHUB_REPO");
  const branch = props.getProperty("GITHUB_BRANCH") || "main";

  if (!token || !owner || !repo) {
    throw new Error("Script Properties puuttuu: GITHUB_TOKEN, GITHUB_OWNER tai GITHUB_REPO.");
  }

  const api     = "https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + FILE_PATH;
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" };

  const res = UrlFetchApp.fetch(api + "?ref=" + branch, {
    method: "get", headers: headers, muteHttpExceptions: true,
  });

  if (res.getResponseCode() === 404) {
    // Tiedostoa ei vielä ole — ensimmäinen ajo
    return { data: null, sha: null };
  }
  if (res.getResponseCode() !== 200) {
    throw new Error("GitHub GET epäonnistui (" + res.getResponseCode() + "):\n" + res.getContentText());
  }

  const raw = JSON.parse(res.getContentText());
  const sha = raw.sha;

  let data = null;
  try {
    const decoded = Utilities.newBlob(
      Utilities.base64Decode(raw.content.replace(/\n/g, ""))
    ).getDataAsString();
    data = JSON.parse(decoded);
  } catch (e) {
    console.log("portfolio.json parse-virhe, aloitetaan tyhjältä: " + e.message);
  }

  return { data: data, sha: sha };
}

// ── upsertCompanies — id-pohjainen merge ─────────────────────────────────────
// Palauttaa { companies: [], stats: { updated, added, kept } }

function upsertCompanies(existing, incoming) {
  const incomingById = {};
  incoming.forEach(c => { if (c.id) incomingById[c.id] = c; });

  let updated = 0, kept = 0;
  const result = existing.map(c => {
    if (c.id && incomingById[c.id]) {
      updated++;
      return incomingById[c.id]; // korvaa incoming-versiolla
    }
    kept++;
    return c; // säilytä ennallaan
  });

  // Lisää aidosti uudet yhtiöt (id ei löydy existingistä)
  const existingIds = new Set(existing.map(c => c.id).filter(Boolean));
  let added = 0;
  incoming.forEach(c => {
    if (c.id && !existingIds.has(c.id)) {
      result.push(c);
      added++;
    }
  });

  return { companies: result, stats: { updated: updated, added: added, kept: kept } };
}

// ── commitToGitHub — idempotent PUT, sha parametrina ─────────────────────────

function commitToGitHub(content, sha) {
  const props  = PropertiesService.getScriptProperties();
  const token  = props.getProperty("GITHUB_TOKEN");
  const owner  = props.getProperty("GITHUB_OWNER");
  const repo   = props.getProperty("GITHUB_REPO");
  const branch = props.getProperty("GITHUB_BRANCH") || "main";

  const api     = "https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + FILE_PATH;
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" };

  const body = {
    message: "chore: sync portfolio export (" + new Date().toISOString() + ")",
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch:  branch,
  };
  if (sha) body.sha = sha; // pakollinen päivityksessä, puuttuu uudelle tiedostolle

  const res  = UrlFetchApp.fetch(api, {
    method: "put", headers: headers, contentType: "application/json",
    payload: JSON.stringify(body), muteHttpExceptions: true,
  });
  const code = res.getResponseCode();

  if (code !== 200 && code !== 201) {
    throw new Error("GitHub commit epäonnistui (" + code + "):\n" + res.getContentText());
  }
}

// ── rowToCompany — ChatGPT V2, trigger-fix applied ───────────────────────────

function rowToCompany(row, headers) {
  const normalizedHeaders = headers.map(h => String(h || "").trim());

  function get(key) {
    const i = normalizedHeaders.indexOf(key);
    return i === -1 ? "" : row[i];
  }
  function first(keys) {
    for (const key of keys) {
      const v = get(key);
      if (v !== "" && v !== null && v !== undefined) return v;
    }
    return "";
  }
  function text(keys, fallback) {
    const v = first(keys);
    const s = String(v === null || v === undefined ? "" : v).trim();
    return s || (fallback || "");
  }
  function num(keys) {
    const raw = first(keys);
    if (raw === "" || raw === null || raw === undefined) return 0;
    const cleaned = String(raw).trim().replace(/\s/g, "").replace("%", "").replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  return {
    id:              text(["id"]),
    ticker:          text(["ticker"]),
    name:            text(["name", "company"]),
    sector:          text(["sector"]),
    region:          text(["region"]),
    currency:        text(["currency"], "EUR"),
    ownershipStatus: text(["ownershipStatus"], "WATCH"),
    action:          text(["action", "status"]),
    score:           num(["score"]),
    qc:              text(["qc"], text(["valuationStatus"])),
    price:           num(["price"]),
    low:             num(["low"]),
    base:            num(["base"]),
    high:            num(["high"]),
    dataFreshness:   text(["dataFreshness"], "—"),
    triggers:        parseTriggers(text(["triggers"])),
    caveats:         parseCaveats(text(["caveats", "notes"])),
    reviewed:        formatPortfolioDate(first(["reviewed", "lastUpdated"])),
    next:            text(["next", "nextCatalyst"]),
    links:           buildPortfolioLinks(
                       text(["terminal"]), text(["memo"]),
                       text(["masterlog"]), text(["dashboardLink"])
                     ),
  };
}

// ── Parserit ─────────────────────────────────────────────────────────────────

function parseTriggers(cell) {
  return String(cell || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(line => {
    const parts = line.split("::").map(p => p.trim());
    if (parts.length >= 4) return { id: parts[0], status: parts[1], when: parts[2], t: parts.slice(3).join(" :: ") };
    return { id: "", status: "pending", when: "—", t: line };
  });
}

function parseCaveats(cell) {
  return String(cell || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(line => {
    const parts = line.split("::").map(p => p.trim());
    if (parts.length >= 3) return { id: parts[0], severity: normalizeSeverity(parts[1]), text: parts.slice(2).join(" :: ") };
    return { id: "", severity: "medium", text: line };
  });
}

function normalizeSeverity(value) {
  const s = String(value || "").trim().toLowerCase();
  return (s === "high" || s === "medium" || s === "low") ? s : "medium";
}

function buildPortfolioLinks(terminal, memo, masterlog, dashboard) {
  const links = {
    terminal:  String(terminal  || "").trim(),
    memo:      String(memo      || "").trim(),
    masterlog: String(masterlog || "").trim(),
  };
  const dl = String(dashboard || "").trim();
  if (dl) links.dashboard = dl;
  return links;
}

function formatPortfolioDate(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  return s;
}
