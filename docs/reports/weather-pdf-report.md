# Task 8 report: weather and plan PDF

Branch wt/weather. Files: src/weather/openmeteo.js, src/data/storms-richmond.json,
scripts/make-richmond-storms.mjs, src/plan/pdf.js, test/weather.test.js, test/pdf.test.js.

## TDD evidence
- RED: both test files written first; `node --test test/weather.test.js test/pdf.test.js` failed with
  ERR_MODULE_NOT_FOUND for src/weather/openmeteo.js and src/plan/pdf.js (pass 0, fail 2).
- GREEN: pdf first (3/3), then weather. One intermediate RED on the weather fallback tests (source text had
  "Offline sample" capitalised; spec wants "offline sample") fixed; final run: 9 tests, 9 pass, 0 fail.
- Tests use injected fetch only; no network.

## Real Richmond numbers (live Open-Meteo, run 2026-10-13, lat 49.17 lon -123.14)
- recent: 24.3 mm on 2026-09-29 (real hourly profile, peak 4.3 mm/h at 04:00)
- typical: 7.4 mm (median wet day >= 1 mm, 2016-2025)
- design: 23.3 mm (90th percentile wet day, nearest rank)

## Decisions and notes
- Recent window = the 30 complete days before today (UTC date of `today`); archive and forecast (past_days=7,
  forecast_days=1) hourly data merged per timestamp, archive wins where it has data, forecast fills the lag.
  Only days with 24 hourly values count. source.url for recent is the archive URL.
- typical uses the true median (mean of the middle two on even counts); design uses nearest rank
  (`wetDayPercentile`). Zero rain in any of the three numbers is treated as failure -> bundled fallback (Review Focus 3).
- Default shapeFn is uniform (app injects storm.js `hyetograph`); shape 'IA' for pnw, 'II' for on.
  Offline set: recent is the stored real hourly profile; typical/design are shaped by the injected shapeFn.
- openmeteo.js also exports `apiUrls` and `fetchNumbers` so the build script stores exactly what the app computes.
- The JSON is imported with `with { type: 'json' }` (Node 24 and Vite 7 both support it).
- PDF: image full page width at the top, capped at 70% of page height (centred) so text always has room;
  text at 9 pt, 12 pt leading, 36 pt margin, lines that do not fit are dropped. Latin-1 (0xA0-0xFF) chars kept,
  everything else -> '?'. Not opened in an external viewer (no PDF tooling installed); correctness is checked by the
  byte-exact xref test.
- Gotcha: shell heredocs in this environment dropped backslashes; src files were written with the Write tool.

## Fix round 1
Changes:
1. Window now computed in the user's local days from the response's `utc_offset_seconds` (forecast, else archive, else 0); it ends at local yesterday, so the current local day (possibly forecast hours) is never chosen. Test: 02:00 UTC 14 Oct with offset -7 h, forecast 50 mm/h-day on local 13 Oct must not win.
2. weather.test.js pins: typical = median wet day (5.5), design = nearest-rank P90 (9) on a known series, shapeFn gets 'IA' (pnw) / 'II' (on) with (total,shape,24,300), exact source.url strings (2 dp coords), peakMmH.
3. shapeFn wrapped: a throw falls back to the uniform shape (both live and offline paths) with a `[raingarden]` console.warn; the caught fetch/parse error is also console.warn'ed with a `[raingarden]` prefix.
4. pdf.js header documents that lines are not wrapped (pre-wrap, about 16 lines budget).
RED: with src changes stashed, the 3 new tests failed (9 tests, 6 pass, 3 fail). Note the pinned test had an additional float-equality slip in the test itself, fixed with a tolerance.
Command: `node --test test/weather.test.js test/pdf.test.js` -> tests 12, pass 12, fail 0.
