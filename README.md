# Portfolio Dashboard

Mobile-first equity research portfolio dashboard. **Read-only mirror of Drive / Sheets** — Drive is always the source of truth; this app just renders the latest published snapshot.

- **Stack:** Vite + React (no backend, no database, no AI builder — you own 100% of the code)
- **Data:** a single static `public/portfolio.json`, fetched at runtime from the same origin (no CORS, Drive stays private)
- **Hosting:** any static host (Vercel / Netlify / Cloudflare Pages)

```
Sheets (source of truth)
  → Apps Script sync (sync/portfolio-export-sync.gs)
    → commits public/portfolio.json to GitHub
      → host auto-redeploys
        → app shows the update
```

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
npm run preview  # serve the build locally (also on your phone via the LAN URL)
```

Node 18+ recommended.

## Deploy

1. Push this repo to GitHub.
2. **Vercel:** New Project → import the repo. Framework preset = Vite. No env vars needed. Deploy.
   **Netlify:** build command `npm run build`, publish directory `dist`.
3. (Optional) Add a custom domain later.
4. **iPhone home screen:** open the URL in Safari → Share → *Add to Home Screen*. The dark theme-color and full-screen meta tags are already set.

## Data contract — `public/portfolio.json`

This file *is* the export schema. The sync overwrites it; nothing else should edit it by hand in production.

```jsonc
{
  "meta": { "exportVersion": "v2", "syncedAt": "2026-06-06T14:02:00Z", "source": "Drive" },
  "companies": [
    {
      "ticker": "KCR",
      "name": "Konecranes Oyj",
      "sector": "Industrials",
      "region": "Finland",
      "currency": "EUR",                 // EUR | USD | SEK (extend in src/App.jsx → money())
      "action": "HOLD · WATCHLIST",      // color/category derived from keywords BUY / HOLD / WATCH / AVOID
      "score": 6.5,                      // 0–10
      "qc": "CONDITIONAL PASS",          // PASS | CONDITIONAL … | PENDING … | FAIL …
      "price": 31.2,                     // current price — the ONLY field meant to be live-fetched later
      "low": 29.0, "base": 30.5, "high": 32.0,   // fair-value range; base drives upside %
      "triggers": [
        { "t": "Order intake reaccelerates", "when": "Q2", "status": "pending" }  // status: pending | confirmed
      ],
      "caveats": ["Order book unverified vs segment table"],
      "reviewed": "2026-05-28",
      "next": "Q2 results · Jul 2026",
      "links": {                         // optional — buttons grey out until set
        "terminal": "https://docs.google.com/spreadsheets/d/…",
        "memo": "https://drive.google.com/…",
        "masterlog": "https://docs.google.com/…"
      }
    }
  ]
}
```

Upside shown on each card = `(base − price) / price`. The range bar plots `low → base → high` with a dot at `price`.

## Updating the data (sync)

See `sync/portfolio-export-sync.gs`. It runs **inside your Google Sheet** (Extensions → Apps Script), reads the portfolio-export tab, builds the JSON above, and commits it to GitHub via the API — which triggers an automatic redeploy. Setup notes are at the top of that file. Adapt the column mapping in `rowToCompany()` to your actual export tab.

## Notes

- `price` is static here. In production fetch it live from a price API in the app and compute upside client-side — keep it out of Drive/JSON so analytical data only changes when you sync.
- All styling is inline + `src/index.css` (CSS variables). No Tailwind, no UI library to lock you in.
