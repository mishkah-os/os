# POS Finance Dashboard Maintenance Notes

This document records the conventions that keep the finance dashboard aligned with the rest of the Mishkah POS experience.

## Loading Strategy
- Prefer UMD-friendly scripts. `static/pos/pos_finance.html` now preloads `pos-fin-comp.js` so the finance bundle can run in local file contexts that do not support ES modules.
- When new utilities are required, expose them through globals (for example `window.PosMiniUtils`) before relying on static `import` statements.

## Data Normalisation
- Always derive order totals from order lines and payments. Orders written to SQLite may omit `total_due`/`total_paid`, so `pos_finance.js` normalises each snapshot via `enrichOrdersSnapshot` before rendering or summarising data.
- Keep fallbacks idempotent: do not mutate original records; instead, return new objects that expose resolved `subtotal`, `totalDue`, and `totalPaid` alongside the legacy snake_case fields.

## Reset Handling
- The finance reset action must clear the local tables in addition to calling the purge endpoint. After a successful response, iterate over `DEFAULT_PURGE_TABLES` and call `db.clear(table)`.
- Log failures and continue so the UI always refreshes even if a local table fails to clear.

## Styling & Accessibility
- The finance shell is centered with a max width of `1180px` and the page root allows vertical scrolling. Any new sections should inherit those layout primitives instead of redefining them.
- Light mode uses the standard Mishkah palette (`--finance-text`, `--finance-muted`, `--finance-positive`). When introducing new accents, bind them to variables so both themes stay in sync.
- Apply the reusable `finance-positive` helper class for monetary values that indicate success to keep cross-theme contrast consistent.

## Testing Checklist
- `npm test`
- Manual smoke test: open `static/pos/pos_finance.html` with sample payload, verify totals update and reset clears dashboard counts.
