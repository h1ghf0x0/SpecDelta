# SpecDelta

Section-aware construction specification diff checker and CSI MasterFormat Project Manual PDF splitter for commercial estimators.

## Key Capabilities

- **Section-Aligned Project Manual Diffing**: Extracts PDF text coordinates in dedicated Web Workers, normalizes inconsistent CSI codes (`08 71 00`, `08 7100`, `08710`), heals hyphenated line wraps, and diffs CSI section-to-section so page shifts do not trigger false positives.
- **Coordinate & Stamp Noise Stripping**: Automatically strips recurring top/bottom edge headers and footers as well as section-scoped running page stamps (e.g., `CAST-IN-PLACE CONCRETE 033000 - 5`, `08 71 00 - DOOR HARDWARE - Page 4 of 12`) with an inspectable drawer and configurable sensitivity.
- **Deterministic Money & Risk Scanner**: Flags numeric tolerances (`PSI`, `mil`, `gauge`, `AIC`), thresholds (`minimum`, `not less than`, `not exceeding`), contractual directives (`shall` vs. `may`), allowances, warranties, and scope-responsibility phrases (`furnish and install`, `by owner`).
- **CSI Spec Book Splitter**: Extract selected CSI MasterFormat divisions or sections out of large Project Manuals into standalone PDFs locally in the browser.
- **Bid-Day Export & Review Persistence**: Tracks per-section `Reviewed` status in `localStorage`, exports full or filtered change logs to `.xlsx` (client-side write-only via `xlsx`), UTF-8 CSV, and clean print redlines.
- **Optional Google Gemini Scope Brief**: Strictly opt-in; sends only the top risk-ranked changed paragraphs (capped at 25 sections) to `POST /api/scope-brief` with IP-based rate limiting.

## Local Development

```bash
npm install
npm test
npm run lint
npm run dev
```

Copy `.env.example` to `.env` and set `GEMINI_API_KEY` if you want to enable the optional `POST /api/scope-brief` endpoint.

## Verification & Disclaimer

SpecDelta is an automated pre-construction diffing aid and does not perform OCR on scanned raster pages. Always verify pricing-critical tolerances, warranties, and scope terms against the signed Addendum PDF.
