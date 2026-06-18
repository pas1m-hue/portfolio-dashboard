import { useState, useEffect, useMemo } from "react";
import {
  ChevronDown, ExternalLink, AlertTriangle,
  Clock, CheckCircle2, TrendingUp, TrendingDown, Activity,
} from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────────
function money(v, c) {
  const n = Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (c === "USD") return "$" + n;
  if (c === "SEK") return n + " kr";
  return n + " €";
}
function actionColor(a = "") {
  if (a.includes("BUY"))                                    return "var(--green)";
  if (a.includes("AVOID") || a.includes("SELL") || a.includes("REDUCE")) return "var(--red)";
  if (a.includes("HOLD") || a.includes("WATCH"))            return "var(--amber)";
  return "var(--blue)";
}
function category(a = "") {
  if (a.includes("BUY"))                                    return "Buy";
  if (a.includes("AVOID") || a.includes("SELL") || a.includes("REDUCE")) return "Avoid";
  return "Hold/Watch";
}
function qcMeta(s = "") {
  if (s.startsWith("PASS"))         return { c: "var(--green)", label: s };
  if (s.includes("CONDITIONAL"))    return { c: "var(--amber)", label: s };
  if (s.includes("FAIL"))           return { c: "var(--red)",   label: s };
  return                                   { c: "var(--blue)",  label: s };
}
function scoreColor(s)      { return s >= 7 ? "var(--green)" : s >= 5.5 ? "var(--amber)" : "var(--red)"; }
function ownershipColor(s)  { return s === "OWNED" ? "var(--green)" : s === "NOT_OWNED" ? "var(--faint)" : "var(--amber)"; }
function clamp(n)           { return Math.max(0, Math.min(100, n)); }
function fmtSynced(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ── RangeBar ──────────────────────────────────────────────────────────────────
function RangeBar({ low, base, high, price, currency }) {
  const span   = high - low || 1;
  const pPrice = clamp(((price - low) / span) * 100);
  const pBase  = clamp(((base  - low) / span) * 100);
  const up     = base >= price;
  const segL   = Math.min(pPrice, pBase);
  const segW   = Math.abs(pBase - pPrice);
  return (
    <div style={{ margin: "14px 0 6px" }}>
      <div style={{ position: "relative", height: 6, borderRadius: 6, background: "#0d1017", border: "1px solid var(--border)" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${segL}%`, width: `${segW}%`, background: up ? "var(--green)" : "var(--red)", opacity: 0.55, borderRadius: 6 }} />
        <div style={{ position: "absolute", top: -4, bottom: -4, left: `${pBase}%`, width: 2, marginLeft: -1, background: "var(--dim)" }} />
        <div style={{ position: "absolute", top: "50%", left: `${pPrice}%`, width: 9, height: 9, marginLeft: -4.5, marginTop: -4.5, borderRadius: 9, background: "var(--text)", boxShadow: "0 0 0 2px var(--bg)" }} />
      </div>
      <div className="mono" style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10.5, color: "var(--faint)" }}>
        <span>{money(low, currency)}</span>
        <span style={{ color: "var(--dim)" }}>FV {money(base, currency)}</span>
        <span>{money(high, currency)}</span>
      </div>
    </div>
  );
}

function Section({ icon, label, tint, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, color: tint || "var(--faint)" }}>
        {icon}
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--faint)" }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function Card({ c, open, onToggle, index }) {
  const upside   = c.base > 0 ? ((c.base - c.price) / c.price) * 100 : null;
  const up       = upside !== null && upside >= 0;
  const qc       = qcMeta(c.qc);
  const triggers = c.triggers || [];
  const caveats  = c.caveats  || [];
  const links    = c.links    || {};

  return (
    <div
      className="card-in tap"
      style={{ animationDelay: `${index * 55}ms`, background: "var(--panel)", border: `1px solid ${open ? "#2d3744" : "var(--border)"}`, borderRadius: 14, padding: 14, cursor: "pointer", boxShadow: open ? "0 10px 30px rgba(0,0,0,.35)" : "none" }}
      onClick={onToggle}
    >
      {/* top row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="mono" style={{ fontSize: 15, fontWeight: 600, letterSpacing: 0.4 }}>{c.ticker}</span>
            <span style={{ width: 7, height: 7, borderRadius: 7, background: qc.c, flexShrink: 0 }} title={qc.label} />
          </div>
          <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
          <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.6 }}>
            {c.sector} · {c.region}
            {c.ownershipStatus && (
              <span style={{ marginLeft: 7, color: ownershipColor(c.ownershipStatus), opacity: 0.85 }}>{c.ownershipStatus}</span>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <span className="mono" style={{ display: "inline-block", fontSize: 10.5, fontWeight: 600, color: actionColor(c.action), border: `1px solid ${actionColor(c.action)}`, borderRadius: 6, padding: "3px 7px", opacity: 0.95 }}>{c.action}</span>
          <div className="mono" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 8, fontSize: 13, fontWeight: 600, color: up ? "var(--green)" : upside === null ? "var(--faint)" : "var(--red)" }}>
            {upside !== null ? (up ? <TrendingUp size={13} /> : <TrendingDown size={13} />) : null}
            {upside !== null ? `${up ? "+" : ""}${upside.toFixed(1)}%` : <span style={{ fontSize: 11 }}>PENDING</span>}
          </div>
        </div>
      </div>

      {/* range bar — only when FV data exists */}
      {c.base > 0 && <RangeBar low={c.low} base={c.base} high={c.high} price={c.price} currency={c.currency} />}

      {/* mid row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: c.base > 0 ? 8 : 14 }}>
        <span className="mono" style={{ fontSize: 11.5, color: "var(--dim)" }}>
          {c.price > 0 ? `last ${money(c.price, c.currency)}` : "—"}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 10.5, color: "var(--faint)", textTransform: "uppercase", letterSpacing: 0.6 }}>score</span>
          <div style={{ width: 42, height: 4, borderRadius: 4, background: "#0d1017", border: "1px solid var(--border)", overflow: "hidden" }}>
            <div style={{ width: `${(c.score || 0) * 10}%`, height: "100%", background: scoreColor(c.score) }} />
          </div>
          <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: c.score > 0 ? scoreColor(c.score) : "var(--faint)" }}>
            {c.score > 0 ? Number(c.score).toFixed(1) : "—"}
          </span>
          <ChevronDown size={15} color="var(--faint)" style={{ transition: "transform .25s ease", transform: open ? "rotate(180deg)" : "none", marginLeft: 2 }} />
        </div>
      </div>

      {/* expandable detail */}
      <div className="detail" style={{ maxHeight: open ? 600 : 0, opacity: open ? 1 : 0, marginTop: open ? 12 : 0 }}>
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>

          <Section icon={<CheckCircle2 size={12} />} label="QC status" tint={qc.c}>
            <span className="mono" style={{ fontSize: 11.5, color: qc.c }}>{qc.label}</span>
          </Section>

          {triggers.length > 0 && (
            <Section icon={<Activity size={12} />} label="Upgrade triggers">
              {triggers.map((t, i) => {
                const conf = t.status === "confirmed";
                return (
                  <div key={t.id || i} style={{ display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 5 }}>
                    {conf
                      ? <CheckCircle2 size={13} color="var(--green)" style={{ marginTop: 1, flexShrink: 0 }} />
                      : <Clock        size={13} color="var(--amber)" style={{ marginTop: 1, flexShrink: 0 }} />}
                    <span style={{ fontSize: 12, color: "var(--text)" }}>{t.t}</span>
                    {t.when && t.when !== "—" && (
                      <span className="mono" style={{ fontSize: 10, color: "var(--faint)", marginLeft: "auto", flexShrink: 0 }}>{t.when}</span>
                    )}
                  </div>
                );
              })}
            </Section>
          )}

          <Section icon={<AlertTriangle size={12} />} label="Caveats" tint="var(--amber)">
            {caveats.map((cv, i) => (
              <div key={cv.id || i} style={{ display: "flex", gap: 7, marginBottom: 5 }}>
                <span style={{ color: cv.severity === "high" ? "var(--red)" : cv.severity === "low" ? "var(--faint)" : "var(--amber)", flexShrink: 0 }}>·</span>
                <span style={{ fontSize: 12, color: "var(--dim)" }}>{cv.text || cv}</span>
              </div>
            ))}
          </Section>

          {/* footer: reviewed · next · dataFreshness */}
          <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)", margin: "10px 0 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>reviewed {c.reviewed || "—"}</span>
              <span>next: {c.next || "—"}</span>
            </div>
            {c.dataFreshness && c.dataFreshness !== "—" && (
              <div style={{ marginTop: 3, opacity: 0.7 }}>data: {c.dataFreshness}</div>
            )}
          </div>

          {/* links */}
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { l: "Terminal",   href: links.terminal   },
              { l: "Memo",       href: links.memo       },
              { l: "Masterlog",  href: links.masterlog  },
            ].map((x) => (
              <a
                key={x.l}
                href={x.href || "#"}
                target={x.href ? "_blank" : undefined}
                rel="noreferrer"
                onClick={(e) => { e.stopPropagation(); if (!x.href) e.preventDefault(); }}
                className="tap"
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 11, color: "var(--blue)", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 0", textDecoration: "none", opacity: x.href ? 1 : 0.55 }}
              >
                {x.l} <ExternalLink size={11} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function Loading() {
  return (
    <div className="ptf-bg">
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "20px 14px 40px" }}>
        <div className="skel" style={{ height: 28, width: 140, borderRadius: 8, background: "var(--panel)", marginBottom: 18 }} />
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skel" style={{ flex: 1, height: 52, borderRadius: 10, background: "var(--panel)" }} />
          ))}
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skel" style={{ height: 120, borderRadius: 14, background: "var(--panel)", marginBottom: 11 }} />
        ))}
      </div>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div className="ptf-bg" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 320 }}>{children}</div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [filter,  setFilter]  = useState("All");
  const [sort,    setSort]    = useState("upside");
  const [openId,  setOpenId]  = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(import.meta.env.BASE_URL + "portfolio.json", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((j) => { if (alive) { setData(j); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const companies = data?.companies || [];
  const filters   = ["All", "Buy", "Hold/Watch", "Avoid"];
  const sorts     = [
    { k: "upside", label: "Upside" },
    { k: "score",  label: "Score"  },
    { k: "name",   label: "Name"   },
  ];

  const rows = useMemo(() => {
    const r = companies.filter((c) => filter === "All" || category(c.action) === filter);
    return [...r].sort((a, b) => {
      if (sort === "name")  return a.name.localeCompare(b.name);
      if (sort === "score") return b.score - a.score;
      const ua = a.base > 0 ? (a.base - a.price) / a.price : -Infinity;
      const ub = b.base > 0 ? (b.base - b.price) / b.price : -Infinity;
      return ub - ua;
    });
  }, [companies, filter, sort]);

  const avg    = companies.length
    ? (companies.filter(c => c.score > 0).reduce((s, c) => s + Number(c.score), 0) /
       Math.max(1, companies.filter(c => c.score > 0).length)).toFixed(1)
    : "—";
  const counts = companies.reduce((m, c) => {
    const k = category(c.action);
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});

  if (loading) return <Loading />;
  if (error)
    return (
      <Centered>
        <AlertTriangle size={28} color="var(--red)" style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Could not load portfolio</div>
        <div className="mono" style={{ fontSize: 12, color: "var(--dim)" }}>portfolio.json — {error}</div>
      </Centered>
    );
  if (!companies.length)
    return (
      <Centered>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No companies yet</div>
        <div style={{ fontSize: 12.5, color: "var(--dim)" }}>Run the sync to publish your coverage.</div>
      </Centered>
    );

  return (
    <div className="ptf-bg">
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "20px 14px 40px" }}>

        {/* masthead */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.3 }}>Portfolio</div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 2, textTransform: "uppercase", letterSpacing: 1 }}>equity research · coverage</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{companies.length}</div>
            <div style={{ fontSize: 10, color: "var(--faint)", textTransform: "uppercase", letterSpacing: 0.6 }}>names</div>
          </div>
        </div>

        {/* summary strip */}
        <div style={{ display: "flex", gap: 8, margin: "14px 0 16px" }}>
          {[
            { v: counts["Buy"]        || 0, l: "Buy",        c: "var(--green)" },
            { v: counts["Hold/Watch"] || 0, l: "Hold/Watch", c: "var(--amber)" },
            { v: counts["Avoid"]      || 0, l: "Avoid",      c: "var(--red)"   },
            { v: avg,                       l: "Avg score",  c: "var(--blue)"  },
          ].map((s) => (
            <div key={s.l} style={{ flex: 1, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 6px", textAlign: "center" }}>
              <div className="mono" style={{ fontSize: 17, fontWeight: 600, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 9, color: "var(--faint)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* filters */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {filters.map((f) => {
            const on = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)} className="chip"
                style={{ fontSize: 11.5, padding: "6px 11px", borderRadius: 20, cursor: "pointer", border: `1px solid ${on ? "transparent" : "var(--border)"}`, background: on ? "var(--text)" : "transparent", color: on ? "var(--bg)" : "var(--dim)", fontWeight: on ? 600 : 500 }}>
                {f}
              </button>
            );
          })}
        </div>

        {/* sort */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
          <span style={{ fontSize: 10, color: "var(--faint)", textTransform: "uppercase", letterSpacing: 0.7 }}>sort</span>
          {sorts.map((s) => {
            const on = sort === s.k;
            return (
              <button key={s.k} onClick={() => setSort(s.k)} className="chip mono"
                style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, cursor: "pointer", border: "1px solid var(--border)", background: on ? "var(--panel-2)" : "transparent", color: on ? "var(--text)" : "var(--faint)" }}>
                {s.label}
              </button>
            );
          })}
        </div>

        {/* cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {rows.map((c, i) => (
            <Card key={c.id || c.ticker} c={c} index={i}
              open={openId === (c.id || c.ticker)}
              onToggle={() => setOpenId(openId === (c.id || c.ticker) ? null : (c.id || c.ticker))} />
          ))}
        </div>

        {/* footer */}
        <div className="mono" style={{ marginTop: 22, paddingTop: 14, borderTop: "1px solid var(--border)", textAlign: "center" }}>
          <div style={{ fontSize: 10.5, color: "var(--faint)" }}>
            export {data?.meta?.exportVersion || "—"} · synced {fmtSynced(data?.meta?.syncedAt)} · source: {data?.meta?.source || "Drive"}
          </div>
          <div style={{ fontSize: 9.5, color: "var(--faint)", marginTop: 4, opacity: 0.7 }}>read-only mirror — Drive / Sheets is source of truth</div>
        </div>
      </div>
    </div>
  );
}
