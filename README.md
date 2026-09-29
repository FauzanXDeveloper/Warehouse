# Warehouse — Static Query Editor

Browser-only SQL query editor (Retail Credit Risk), deployed to
**GitHub Pages** via the `Deploy to GitHub Pages` action
(`.github/workflows/deploy.yml`). Every push to `main` redeploys.

## First run (no database is bundled — by design)

1. `CREATE DATABASE demo;` then `USE demo;`
2. **↑ Load Data** → pick a CSV / TSV / JSON / SQL / Excel / SQLite
   `.db` file from your PC (stays in the browser).
3. `SELECT * FROM your_table LIMIT 100;`

History, saved queries, notebooks, charts, settings and editor tabs
persist in the browser via `localStorage`.

## Repo layout

Pure static files — `index.html`, `_next/`, `monaco/` (editor),
`sql-wasm.wasm` (in-browser SQLite), logos + `.nojekyll`.

## Rebuilding from source

This site was exported from a Next.js (`output: 'export'`) codebase.
To rebuild after UI changes:

```powershell
node ./node_modules/next/dist/bin/next build
```

then publish the fresh `out/` contents to `main`.
