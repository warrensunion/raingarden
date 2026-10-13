# Hydrology reference numbers (with citations)

Research date: 2026-10-13. Labels used in this file:
- **VERIFIED**: read in the cited document's text.
- **COMPUTED**: our own arithmetic from verified inputs.
- **UNVERIFIED**: could not be read in a primary or secondary copy.

---

## a. Green-Ampt parameters — Rawls, Brakensiek & Miller (1983)

**Primary source (VERIFIED).** Rawls, W.J., Brakensiek, D.L., Miller, N. (1983). "Green-Ampt Infiltration Parameters from Soils Data." *J. Hydraulic Engineering* 109(1):62–70. The values are in Table 2, journal p. 67.
- Copy read: https://dnrftp.state.co.us/DWR/DamSafety/HydrologyGuidelines_doNOTdelete/Guidelines_References/Rawls%20et%20al%20Green-Ampt%20Infiltration%20parameters%20from%20soils%20data%20ASCE%201983.pdf

**Cross-check (VERIFIED, identical after unit conversion).** US EPA (2016), *Storm Water Management Model Reference Manual Vol. I – Hydrology (Revised)*, EPA/600/R-15/162A, Table 4-7, printed p. 114 (PDF p. 116). It is in inches.
- Copy read: https://downloads.tuflow.com/SWMM/SWMM5_Reference_Manual_Volume1_Hydrology_P100NYRA.pdf

**Chow, Maidment & Mays, *Applied Hydrology* (1988), Table 4.3.1** reproduces this table. The silt-loam row is confirmed as "(Table 4.3.1)" in the U. Iowa handout below. I could not see the other rows in a copy of Chow, so I have not checked them against the book.

Values in parentheses are ±1 standard deviation; ψ is a log-mean.

| Texture | Porosity n | Effective porosity θe | Suction head ψ (cm) | K (cm/h) |
|---|---|---|---|---|
| Sand | 0.437 (0.374–0.500) | 0.417 (0.354–0.480) | 4.95 (0.97–25.36) | 11.78 |
| Loamy sand | 0.437 (0.363–0.506) | 0.401 (0.329–0.473) | 6.13 (1.35–27.94) | 2.99 |
| Sandy loam | 0.453 (0.351–0.555) | 0.412 (0.283–0.541) | 11.01 (2.67–45.47) | 1.09 |
| **Loam** | 0.463 (0.375–0.551) | 0.434 (0.334–0.534) | 8.89 (1.33–59.38) | 0.34 |
| **Silt loam** | 0.501 (0.420–0.582) | 0.486 (0.394–0.578) | 16.68 (2.92–95.39) | 0.65 |
| Sandy clay loam | 0.398 (0.332–0.464) | 0.330 (0.235–0.425) | 21.85 (4.42–108.0) | 0.15 |
| Clay loam | 0.464 (0.409–0.519) | 0.309 (0.279–0.501) | 20.88 (4.79–91.10) | 0.10 |
| Silty clay loam | 0.471 (0.418–0.524) | 0.432 (0.347–0.517) | 27.30 (5.67–131.50) | 0.10 |
| Sandy clay | 0.430 (0.370–0.490) | 0.321 (0.207–0.435) | 23.90 (4.08–140.2) | 0.06 |
| Silty clay | 0.479 (0.425–0.533) | 0.423 (0.334–0.512) | 29.22 (6.13–139.4) | 0.05 |
| **Clay** | 0.475 (0.427–0.523) | 0.385 (0.269–0.501) | 31.63 (6.39–156.5) | 0.03 |

Notes on the source data:
- **Sand K in SWMM.** SWMM Table 4-7 gives sand Ks as 4.74 in/h, which is 12.04 cm/h. Rawls 1983 prints 11.78 cm/h. **Use 11.78 cm/h.**
- **Bad copy on the TUFLOW wiki.** https://wiki.tuflow.com/Green-Ampt_Infiltration_Parameters swaps the loam and silt-loam K values, and its "porosity" column is actually θe. **Do not use it.**

### Worked examples (test vectors)

Equations, as in Chow, Maidment & Mays §4.3–4.4:
- Ponded cumulative infiltration (implicit in F): `F = K t + ψΔθ ln(1 + F/(ψΔθ))`
- Infiltration rate: `f = K (ψΔθ/F + 1)`
- Moisture deficit: `Δθ = (1 − Se) θe`
- Ponding time under constant rain intensity i: `tp = K ψ Δθ / (i (i − K))`, with `Fp = i·tp`

**Example 4.3.1: silt loam, Se = 0.3, continuously ponded, t = 1 h**

Inputs (VERIFIED, via U. Iowa 53:030 Lesson 14 example solution, https://user.engineering.uiowa.edu/~flood/handouts/EX-L14-Green-Ampt-soln.pdf, p. 1):
- θe = 0.486
- ψ = 16.68 cm
- K = 0.65 cm/h
- Δθ = 0.340
- ψΔθ = 5.67 cm. Chow rounds ψ to 16.7 cm, which gives ψΔθ = 5.68 cm.

Results:
- **F = 3.17 cm (PARTIALLY VERIFIED).** "the solution converges to F = 3.17 cm" appears in an OCR scan of Maidment's *Applied Hydrology* homework solutions: UT Austin CE graduate hydrology 2007, https://www.caee.utexas.edu/prof/Maidment/GradHydro2007/docs/Hmwk3Soln.pdf, solution p. 4-28. The OCR text is noisy, and the rate line on that page is garbled.
- **f = 1.81 cm/h (COMPUTED).** 0.65 × (5.68/3.17 + 1) = 1.81. Our own iteration also converges to F = 3.17 cm.

Do not confuse this with the U. Iowa example, which uses the same soil but is not ponded: rain of 2 cm/h for 4 h. Its published answers:
- tp = 1.366 h, Fp = 2.732 cm
- at t = 1 h: f = 2 cm/h and F = 2 cm
- F = 6 cm reached at t = 3.528 h

These are a second published test vector.

**Ponding-time problem: clay loam, Se = 0.25 (Chow Problem 4.4.3 / Example 4.4.1)**

The problem number is uncertain. Source: the same UT Austin solution set, pp. 4-43 to 4-44, OCR. Inputs: θe = 0.309, ψ = 20.88 cm, K = 0.1 cm/h, Δθ = 0.232, ψΔθ = 4.84 cm.

Published answers (PARTIALLY VERIFIED, OCR):

| Rain intensity i | tp | Fp | Our check |
|---|---|---|---|
| 1 cm/h | 0.54 h | 0.54 cm | tp = 0.1 × 4.84 / (1 × 0.9) = 0.538 h |
| 3 cm/h | 0.06 h | 0.17 cm | tp = 0.0556 h, Fp = 0.167 cm |

For i = 3 cm/h, the published answers at t = 1 h are **F = 1.04 cm** and **f = 0.57 cm/h** (from `F = Fp + ψΔθ ln[(ψΔθ+F)/(ψΔθ+Fp)] + K(t − tp)`).

---

## b. Horton parameters (f = fc + (f0 − fc) e^(−kt))

Source (VERIFIED): EPA SWMM Reference Manual Vol. I (2016), cited above, §4.

**Table 4-4: minimum (final) rate fc by Hydrologic Soil Group** (Musgrave 1955; printed p. 97). The manual says to take the top of each range for sand, the middle for loam and the bottom for clay. It also notes fc ≈ Ks.

| HSG | fc (in/h) | fc (mm/h) |
|---|---|---|
| A | 0.45–0.30 | 11.4–7.6 |
| B | 0.30–0.15 | 7.6–3.8 |
| C | 0.15–0.05 | 3.8–1.3 |
| D | 0.05–0 | 1.3–0 |

**Table 4-6: representative maximum rate f0** for dry soils with little or no vegetation (printed p. 99).

| Soil | f0 (in/h) | f0 (mm/h) |
|---|---|---|
| Sandy | 5 | 127 |
| Loam | 3 | 76 |
| Clay | 1 | 25 |

Adjustments to f0 from the same table:
- Dense vegetation: ×2
- Moist soil at field capacity: ÷3
- Partly dried soil: ÷1.5–2.5
- Near saturation: use a value close to fc

**Decay constant k** (printed p. 97): the literature range is 0.67–120 h⁻¹, and most values are 3–6 h⁻¹. Quote: "an estimate of 4 hr⁻¹ could be used" when no field data exist.

**Field data for comparison:**
- Table 4-2, Rawls et al. (1976), Georgia loamy sands. Example: Tooup sand fc = 1.80 in/h, f0 = 23.01 in/h, k = 32.71 h⁻¹.
- Table 4-3, Horton (1940).

**Not verified:** a secondary page (Innovyze ICM help) quotes Akan (1993) values by HSG. I did not trace them to the original, so they are not used.

| HSG | f0 (mm/h) | fc (mm/h) |
|---|---|---|
| A | 250 | 25.4 |
| B | 200 | 12.7 |
| C | 125 | 6.3 |
| D | 76 | 2.5 |

All with k = 2 h⁻¹.

---

## c. SCS/NRCS 24-hour rainfall distributions (cumulative P/P24)

**Applicability (VERIFIED, text).** USDA-SCS (1986), *TR-55: Urban Hydrology for Small Watersheds*, 2nd ed., Appendix B, p. B-1, quote: "Types I and IA represent the Pacific maritime climate with wet winters and dry summers. Type III represents Gulf of Mexico and Atlantic coastal areas … Type II represents the rest of the country."
- Copy read: https://www.lmnoeng.com/Hydrology/TR55-Manual.pdf
- This gives **coastal Pacific NW = Type IA** and **Great Lakes / Southern Ontario = Type II**.
- WSDOT HRM App. 4C, p. 4C-1, states that Type IA "is applicable to western Washington".
- The Figure B-2 map itself was not visually checked.
- Canadian practice note: these are US distributions. Ontario municipalities more commonly use Chicago or AES 12/24-h distributions for design storms. Using Type II for Ontario is **our modelling choice**, not an Ontario standard.

**Tabular values (VERIFIED as published reproductions of the 1982 TR-20 tabular mass curves).**
- Source A: HydroCAD rainfall tables "Type IA / Type II 24-hr Tabular", https://hydrocad.net/rainfall/tables.htm
- Source B, used to cross-check at multiple hours: WSDOT *Highway Runoff Manual* M 31-16.04 (2014), Appendix 4C, Tables 4C-3 (Type IA) and 4C-4 (Type II), 0.1 h steps, pp. 4C-8 to 4C-11. https://wsdot.wa.gov/publications/fulltext/Hydraulics/HRM/App4C_2014.pdf
  - Type II agrees to 3 decimals.
  - Type IA differs by ≤ 0.002 at a few hours. Example at 1 h: WSDOT 0.020, HydroCAD 0.022.
- The NRCS NEH Part 630 Ch. 4 server timed out, so it was not used.

The table below is hourly, taken from Source A.

| t (h) | Type IA | Type II |
|---|---|---|
| 0 | 0.000 | 0.0000 |
| 1 | 0.022 | 0.0105 |
| 2 | 0.051 | 0.0220 |
| 3 | 0.083 | 0.0345 |
| 4 | 0.116 | 0.0480 |
| 5 | 0.156 | 0.0630 |
| 6 | 0.204 | 0.0800 |
| 7 | 0.268 | 0.0990 |
| 8 | 0.425 | 0.1200 |
| 9 | 0.520 | 0.1470 |
| 10 | 0.577 | 0.1810 |
| 11 | 0.623 | 0.2350 |
| 12 | 0.664 | 0.6630 |
| 13 | 0.701 | 0.7720 |
| 14 | 0.736 | 0.8200 |
| 15 | 0.769 | 0.8535 |
| 16 | 0.800 | 0.8800 |
| 17 | 0.830 | 0.9018 |
| 18 | 0.858 | 0.9210 |
| 19 | 0.884 | 0.9377 |
| 20 | 0.908 | 0.9520 |
| 21 | 0.932 | 0.9647 |
| 22 | 0.956 | 0.9770 |
| 23 | 0.978 | 0.9887 |
| 24 | 1.000 | 1.0000 |

Half-hour values (Source A):

| t (h) | Type IA | Type II |
|---|---|---|
| 0.5 | 0.010 | 0.0051 |
| 1.5 | 0.036 | 0.0161 |
| 2.5 | 0.067 | 0.0281 |
| 3.5 | 0.099 | 0.0411 |
| 4.5 | 0.135 | 0.0553 |
| 5.5 | 0.179 | 0.0712 |
| 6.5 | 0.233 | 0.0892 |
| 7.5 | 0.310 | 0.1093 |
| 8.5 | 0.480 | 0.1322 |
| 9.5 | 0.550 | 0.1630 |
| 10.5 | 0.601 | 0.2040 |
| 11.5 | 0.644 | 0.2830 |
| 12.5 | 0.683 | 0.7350 |
| 13.5 | 0.719 | 0.7990 |
| 14.5 | 0.753 | 0.8376 |
| 15.5 | 0.785 | 0.8676 |
| 16.5 | 0.815 | 0.8912 |
| 17.5 | 0.844 | 0.9117 |
| 18.5 | 0.871 | 0.9297 |
| 19.5 | 0.896 | 0.9452 |
| 20.5 | 0.920 | 0.9584 |
| 21.5 | 0.944 | 0.9709 |
| 22.5 | 0.967 | 0.9829 |
| 23.5 | 0.989 | 0.9944 |

Type II peak detail at 0.1 h steps:

| t (h) | Type II |
|---|---|
| 11.5 | 0.2830 |
| 11.6 | 0.3068 |
| 11.7 | 0.3544 |
| 11.8 | 0.4308 |
| 11.9 | 0.5679 |
| 12.0 | 0.6630 |
| 12.1 | 0.6820 |
| 12.2 | 0.6986 |
| 12.3 | 0.7130 |
| 12.4 | 0.7252 |

**Implementation note.** Interpolate linearly within the table. If you use only the hourly table, the Type II 11–12 h step contains 42.8% of the storm in one hour, so the peak intensity is smeared. Use the 0.1 h detail around the peak if peak intensity matters.

---

## d. Design-storm criteria and drawdown

### Metro Vancouver / BC

Primary document (VERIFIED, read in full text): Metro Vancouver (GVS&DD), *Stormwater Source Control Design Guidelines 2023* (Lanarc, KWL, Goya Ngan), https://metrovancouver.org/services/liquid-waste/Documents/stormwater-source-control-design-guidelines.pdf

**DFO criteria (Table 1-2, p. 1-5):**
- Volume Reduction: "Retain the **6-month/24-hour** post-development volume from impervious areas on-site and infiltrate to ground."
- Water Quality: "Collect and treat the volume of the 24-hour precipitation event equalling **90% of the total rainfall**."

**The 72% rule (p. 1-5):** "the 6-month, 24-hour event ranged from 67% to 76% of the 2-year, 24-hour event volume, with an average of **72%**". Also: "capture of 72% of the 2-year, 24-hour event volume … and capture of 90% of average annual rainfall (using continuous simulation) are roughly equivalent in the Metro Vancouver region."

**Province of BC (Table 1-3, p. 1-6, summarising *Stormwater Planning: A Guidebook for British Columbia*, 2002):**
- Runoff Volume Reduction and Water Quality: "Capture **0 to 50% of the MAR** (90% of the rainfall volume in a typical year) at the source … and infiltrate, evaporate, or reuse it."
- Rate reduction: "Store 50% to 100% of MAR runoff."
- MAR = Mean Annual Rainfall event, "approximately a 2.33-year, 24-hour storm event".

**Table 1-9 (p. 1-29): typical capture targets (6-month 24-h ≈ 72% of 2-yr 24-h).** Mapping read from the raw text order:

| Station | Target |
|---|---|
| North Vancouver Lynn Creek (upper) | 86 mm |
| North Vancouver Municipal Hall | 58 mm |
| West Vancouver CS (upper) | 85 mm |
| West Vancouver Municipal Hall | 59 mm |
| Maple Ridge Reservoir | 65 mm |
| Langley Lochiel | 46 mm |
| Surrey Kwantlen Park | 48 mm |
| White Rock STP | 41 mm |
| **Vancouver Airport** | **36 mm** |

The Surrey value is confirmed independently in the text on p. 1-28: "2-year, 24-hour rainfall depth = 66.9 mm. 72% of 66.9 = 48 mm."

**Rain garden drawdown (§4.3 item 12, p. 4-4):** "Drawdown time for the maximum surface ponded volume: **48 hours preferred (72 hours max.**…)." Rock reservoir drain time is a maximum of **4 days** (§4.7.1). Maximum ponding is 150–300 mm, with 200 mm typical.

**City of Vancouver (Rain City Strategy, 2019).** "doubling the minimum volume of rainwater managed through green rainwater infrastructure from **24mm per day to 48mm per day**". Overall goal: "capturing and treating **90 per cent** of Vancouver's average annual rainfall."
- Source (secondary, VERIFIED text): Water Canada, 6 Nov 2019, https://watercanada.net/vancouver-adopts-rain-city-strategy-to-manage-stormwater
- Primary: https://vancouver.ca/files/cov/rain-city-strategy.pdf (returned HTTP 403 to automated fetch, so NOT read directly).
- Earlier 24 mm bylaw text: https://bylaws.vancouver.ca/consolidated/12245.pdf (not read).

**CRD (Victoria) homeowner sheet.** Ponded water should be present only "1–2 days". Site test: 20 cm of water must drain within 12 h. Source: https://www.crd.ca/media/file/building-raingarden-2026

### Ontario

**MECP (2022, DRAFT).** *Low Impact Development Stormwater Management Guidance Manual*, Ontario Ministry of the Environment, Conservation and Parks, January 2022 (draft posted on the Environmental Registry). https://ero.ontario.ca/public/2022-01/Draft%20LID%20Stormwater%20Management%20Guidance%20Manual%202022.pdf (VERIFIED, read)
- Exec summary p. ii and §3.2, pp. 57–58: "The Runoff Volume Control Target for Ontario is the **90th percentile precipitation event**, that is, a rainfall depth ranging from **23 mm to 32 mm**, based on local precipitation patterns across the Province of Ontario".
- How the target was derived: "hourly rainfall analysis using a 12-hour minimum inter-event time (MIT), disregarding events smaller than 2 mm". Station data are April–October, 1970–2005.
- The regional isohyet map (Figure 3.3, p. 59) is an image and was not digitised. Toronto's value has to be read from that map, which we have NOT done.
- **Status:** I did not verify whether a final version has replaced this draft. Label it "draft" in the UI.
- Drawdown as an inspection criterion: "Presence of ponded water on site beyond specified time to drain (typically **24 to 48 hours** following a rainfall event)".

**TRCA STEP LID wiki, Bioretention page.** https://wiki.sustainabletechnologies.ca/wiki/Bioretention (VERIFIED via fetch)
- "must drain within **48 hours**"; "designed to fully drain within 48 hours".
- Overflow invert: "150 to 350 mm above the surface of the mulch cover".
- I:P ratio: "**5:1 to 15:1** on low permeability soils (HSG C and D)" and "**10:1 to 20:1** on high permeability soils (HSG A and B)".
- Filter media Blend A: 3 parts sand to 1 part organic. Blend B: 3 sand : 2 topsoil : 1 organic.
- The STEP "Runoff volume control targets" page says LID practices are "sized according to the 90th percentile event".

**ERCA homeowner guide (Ontario).** A rain garden "should hold water for a maximum of **48 hours**" (p. 11). See sizing.md §D.

### Suggested app defaults (our synthesis, cite the above)

| Region | Design depth | Drawdown | Ponding |
|---|---|---|---|
| PNW (Metro Vancouver) | 6-month/24-h ≈ 72% × (2-yr 24-h) for the nearest MV station (Table 1-9); default **36 mm** (YVR) | 48 h target, 72 h max (MV 2023) | 150–300 mm (MV); 6 or 12 in (WSU) |
| Ontario | 90th-percentile event, **23–32 mm** (MECP draft). A mid value of about 27 mm is reasonable until the isohyet map is digitised. That figure is not from the map; a Toronto Metropolitan University presentation reports a provincial average near 27 mm, but I saw it only via a search excerpt (UNVERIFIED). | 48 h (STEP, ERCA); 24–48 h (MECP) | — |

---

## e. Open-Meteo

**Historical weather API.** Docs: https://open-meteo.com/en/docs/historical-weather-api (VERIFIED via fetch and live calls on 2026-10-13).

- **Endpoint:** `https://archive-api.open-meteo.com/v1/archive`
- **Required parameters:** `latitude`, `longitude`, `start_date`, `end_date` (yyyy-mm-dd).
- **Optional parameters:** `hourly=`, `daily=`, `timezone` (required when `daily` is used; `auto` is allowed), `precipitation_unit` (`mm` default, or `inch`).
- **Hourly variables:**
  - `precipitation` (mm): "Total precipitation (rain, showers, snow) sum of the **preceding hour**".
  - `rain` (mm, liquid only).
  - `snowfall` (cm; divide by 7 for mm of water, per the docs).
- **Daily variables:** `precipitation_sum` (mm), `rain_sum` (mm), `precipitation_hours` (h).
- **Data coverage and lag:**

  | Model | Resolution | Coverage | Update |
  |---|---|---|---|
  | ERA5 | 0.25° | from 1940 | "Daily with 5 days delay" |
  | ERA5-Land | 0.1° | from 1950 | "Daily with 5 days delay" |
  | ECMWF IFS | 9 km | from 2017 | "Every 6 hours with no delay" |

- **Live test.** A request with end_date = today (2026-10-13) returned values. The default "best match" blends in IFS, so recent days are available, but they come from a different model than the older record.
- **Date range.**
  - The API error reads: "Parameter 'start_date' is out of allowed range from **1940-01-01 to 2026-10-13**". Future dates are rejected.
  - The docs state no maximum span.
  - Live tests: **30 years of hourly data** (1995–2024, Toronto) returned HTTP 200 with 6.3 MB in about 12.7 s. 35 years of daily data returned about 231 kB.
  - For the browser, prefer daily data or ≤ 10-year hourly chunks.
- **CORS (VERIFIED live).** The response includes `access-control-allow-origin: *` and allows GET, POST and OPTIONS, so it can be called directly from the browser.
- **Licence.** The free tier is for non-commercial use. Commercial use needs an `apikey` and the `customer-` prefixed hosts (docs/pricing). No key is needed for non-commercial use.

**Geocoding.** Docs: https://open-meteo.com/en/docs/geocoding-api
- **Endpoint:** `https://geocoding-api.open-meteo.com/v1/search?name=…&count=…&language=…&countryCode=…`. Forward search only, based on GeoNames, with `access-control-allow-origin: *`.
- **No reverse geocoding.** The docs list no coordinate parameters, and `https://geocoding-api.open-meteo.com/v1/reverse?...` returns `{"error":true,"reason":"Not Found"}` (live test).

**Free, no-key reverse geocoding alternatives (both tested live with CORS `*`):**
- **Nominatim (OSM):** `https://nominatim.openstreetmap.org/reverse?lat=…&lon=…&format=jsonv2&zoom=10`. Usage policy (https://operations.osmfoundation.org/policies/nominatim/):
  - "an absolute maximum of 1 request per second"
  - "Provide a valid HTTP Referer or User-Agent identifying the application". Browsers send a Referer.
  - "Results must be cached on your side."
  - No client-side autocomplete.
  - Data are ODbL, so attribution is required.
- **BigDataCloud client-side API:** `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=…&longitude=…&localityLanguage=en`. It returned `principalSubdivision` and `countryCode`. Its terms (free, client-side only) were **not reviewed**.

The app's region choice (BC vs ON) can be made from `principalSubdivision` / `state`, or simply from a longitude/latitude bounding box with no network call.

---

## f. Plant spacing / quantity rules

| Source | Rule | Status |
|---|---|---|
| Wisconsin DNR/UWEX 2003, p. 16 | "Lay out the plants as planned **one foot apart in a grid pattern**" (≈ 1 plant per ft², about 10.8 per m²). Group species in clumps of **3 to 7** (p. 15). Prairie Nursery plans in the same manual: 192 ft² → 184–192 plants; 128 ft² → 128 plants (pp. 25–29). | VERIFIED |
| ERCA (Ontario) homeowner guide, p. 9 | "Plants should be planted **one foot apart in a grid pattern**." | VERIFIED |
| TRCA STEP wiki, Bioretention | "perennial forbs and grasses are planted **0.5 m on center, and no more than 0.6 m on center**"; inspect for vegetation density "≥ 80% coverage". | VERIFIED |
| TRCA/CVC LID Guide Appendix B (2010) Master Plant List | Per-species on-centre spacing in cm: perennials and sedges mostly 30–60 cm, shrubs about 100 cm, small trees about 250 cm. https://files.cvc.ca/cvc/uploads/2010/01/cvc-lid-swm-guide-appendix-b_na.pdf | VERIFIED (by sub-research) |
| WSU 2013 handbook, p. 47 | "Space trees, shrubs, and plants at installation according to their expected mature size." No numeric spacing given. | VERIFIED |

**Plant count rule for the app.**
- Per species: `count = ceil(zoneArea × share / spacing_m²)` on a square grid. For a triangular grid, use spacing² × 0.866.
- `spacing_m` comes from each plant record. Where the guide gives no spacing, spacing = mature spread.
