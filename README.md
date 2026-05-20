# Prusa e-shop — search results prototype

Interactive, data-driven prototype of the Prusa e-shop search results page. Used for usability testing — moderator picks a real query, participant sees it as a normal search result page.

Live: <https://cajpij.github.io/prusa-eshop-prototype/> (once GitHub Pages is enabled)

## Run locally

```sh
python3 -m http.server 8092
# open http://localhost:8092
```

No build step. Static HTML/CSS/JS.

## How it works

- `index.html` — page structure
- `styles.css` — Prusa DS design tokens (colors / typography / spacing / shadows pulled 1:1 from the Figma file)
- `app.js` — data-driven rendering, URL query (`?q=…`), moderator panel
- `data.json` — search result data

## Adding a new test query

Append a new entry under `queries.<key>` in `data.json`. See the `_schema` block at the top of the file for the shape. Each query feeds the Highlighted block, Goods grid, Articles & Support list, Blogs, and the four sidebar sections.

Example:

```json
"queries": {
  "drybox": {
    "totalResults": 18,
    "tabs": { "all": 18, "products": 15, "articles": 2, "blog": 1, "models": 0 },
    "highlighted": { "title": "...", "description": "...", "badges": [...], "price": "..." },
    "goods": [ { "name": "...", "price": "CZK 779", "stock": "low", "stockLabel": "Estimated leadtime 6 weeks" } ],
    "articles": [ { "title": "...", "description": "...", "badges": [...] } ],
    "blog": [...],
    "sidebar": {
      "popularCategories": [...],
      "trendingSearches": [...],
      "usefulLinks": [...],
      "topics": [...]
    }
  }
}
```

If a query isn't in `data.json`, the page falls back to `default` (placeholder lorem ipsum).

## Moderator panel

Hidden by default so test participants see a clean page. Press **`Q`** to toggle a floating purple panel in the bottom-right corner with the test-query dropdown. State is persisted in `localStorage` so the panel survives reloads.

URL parameter `?q=<key>` works as a shortcut — handy for sharing a specific query view.

## Responsive breakpoints

- Desktop ≥ 1280 px — sidebar visible on the right, full nav
- 1024 – 1280 px — sidebar moves below, condensed nav
- 768 – 1024 px — 2-up sidebar grid
- < 768 px — hamburger menu, single-column layout
