# SpecDelta

Section-aware construction specification diff checker and CSI MasterFormat Project Manual PDF splitter for commercial estimators.

## Key Capabilities

- **Section-Aligned Project Manual Diffing**: Extracts PDF text coordinates in dedicated Web Workers, normalizes inconsistent CSI codes (`08 71 00`, `08 7100`, `08710`), heals hyphenated line wraps, and diffs CSI section-to-section so page shifts do not trigger false positives.
- **Coordinate & Stamp Noise Stripping**: Automatically strips recurring top/bottom edge headers and footers as well as section-scoped running page stamps (e.g., `CAST-IN-PLACE CONCRETE 033000 - 5`, `08 71 00 - DOOR HARDWARE - Page 4 of 12`) with an inspectable drawer, visible stripped-line counts, and configurable sensitivity.
- **Delta-Only Money & Risk Scanner**: Flags numeric tolerances (`PSI`, `mil`, `gauge`, `AIC`), thresholds (`minimum`, `not less than`, `not exceeding`), modal directive shifts (`shall` vs. `may`), allowances, warranties, and scope-responsibility phrases (`furnish and install`, `by owner`) strictly across changed tokens.
- **CSI Spec Book Splitter**: Extract selected CSI MasterFormat divisions or sections out of large Project Manuals into standalone PDFs locally in the browser.
- **Bid-Day Export & Review Persistence**: Tracks per-section `Reviewed` status in `localStorage` keyed by parsed CSI content hash, exports full or filtered change logs via a zero-dependency pure-TypeScript OOXML `.xlsx` builder, UTF-8 RFC-4180 CSV, and clean print redlines.
- **Optional Google Gemini Scope Brief**: Strictly opt-in; sends only the top risk-ranked changed paragraphs (capped at 25 sections) to `POST /api/scope-brief` with IP-based rate limiting.

## Local Development

```bash
npm install
npm test
npm run benchmark
npm run benchmark:real
npm run lint
npm run dev
```

- `npm run benchmark` executes the 15-page sample fixture and a 603-page multi-division stress test (`2.9s` parse + diff, `211` pages/sec, `0/24` shifted false positives), writing structured metrics to `benchmarks/results.json`.
- `npm run benchmark:real` runs 10 public institutional specification & Project Manual PDFs (`benchmarks/corpus/`, `227` pages, `534,924` extractable characters across University of Houston, City of Dover NH, City of Prince Albert, Scott Township PA, UCCS, and NMSU) through the full pipeline and writes verified figures to `benchmarks/real_corpus_results.json`: `0%` parser false-positive splits (`0/21`), `0%` parser miss rate (`0/21`), `0%` diff false-positive rate across `210` verbatim page-shifted pages (`0/20` unchanged CSI sections vs. `100%` of pages changed under raw page comparison), and `0%` miss rate (`12/12` edit recall, `9/9` risk-flag recall) across controlled edits injected into `1,437` extracted real spec paragraphs.

Copy `.env.example` to `.env` and set `GEMINI_API_KEY` if you want to enable the optional `POST /api/scope-brief` endpoint.

## Verification & Disclaimer

SpecDelta is an automated pre-construction diffing aid and does not perform OCR on scanned raster pages. Always verify pricing-critical tolerances, warranties, and scope terms against the signed Addendum PDF.
