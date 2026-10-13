# Rain garden sizing — published methods

Research date: 2026-10-13. I read every document listed here as the actual PDF, downloaded and run through `pdftotext`. Page numbers are the **printed** page numbers unless marked "PDF p.". Items I could not check directly are marked **UNVERIFIED** or **COMPUTED**.

## TL;DR — what to implement

| # | Method | Region fit | Worked example (published) | Status |
|---|--------|-----------|-----------------------------|--------|
| A | **Wisconsin DNR / UW-Extension (2003) size-factor method** | Generic homeowner method, cold climate; adopted almost verbatim by Essex Region CA (Ontario) | 600 ft² × 0.25 = **150 ft²**; 10 ft wide → **15 ft** long | VERIFIED, full text |
| B | **WSU *Rain Garden Handbook for Western Washington* (2013) sizing chart** | Pacific NW (wet winters); rainfall regions by annual precipitation | 1,150 ft² × 0.34 = **391 ft²** → 16 ft × 24.5 ft = 392 ft²; overflow containment 18 × 26.5 = 477 ft² | VERIFIED, full text |
| C | **Metro Vancouver *Stormwater Source Control Design Guidelines 2023*, Infiltration Rain Garden, Sizing Approach 1 ("X mm in 24 h")** | **Canadian (Metro Vancouver)**, engineered and metric | 930 m² pavement, R = 50% × 53.2 mm, Ks = 1.5 mm/h → rock 400 mm, **I/P = 16.5** | Inputs and I/P VERIFIED. The equation is rendered partly as an image; I rebuilt it from the extracted symbols, and the rebuilt version reproduces 16.5 |
| D | Essex Region Conservation Authority (Ontario) homeowner guide | Canadian (Ontario), metric adaptation of A | 234 m² × 0.15 = 35 m² | VERIFIED as printed, but **its worked example contains an arithmetic error** (see §D). Do not use it as a test vector. |
| E | CRD (Victoria, BC) "Building a Rain Garden" | Canadian (BC) rule of thumb | none | "at least 20% of impervious area" |

**Recommendation:**
- **Homeowner mode:** use **A** as the core of the Ontario/"generic" path. Its worked example is clean and unambiguous.
- **PNW homeowner mode:** use **B**. The WSU chart is the only published table keyed to soil drainage rate *and* regional rainfall.
- **Canadian engineering mode:** use **C**. It is a Canadian method with a metric worked example we can test, so per the brief it is the **preferred Canadian method**. Test against its published I/P = 16.5.
- I found no Ontario agency (TRCA/CVC/City of Toronto) **homeowner** guide with its own sizing table and worked example. The Ontario homeowner guide that exists (ERCA, D) is a metric copy of the Wisconsin method plus a 15% rule.

---

## A. Wisconsin "Rain Gardens: A how-to manual for homeowners" (2003)

- **Citation:** Bannerman, R. (Wisconsin DNR), Considine, E. (USGS), Horwatich, J. *Rain Gardens: A how-to manual for homeowners.* Wisconsin DNR PUB-WT-776 / UW-Extension GWQ037, 2003.
- **URL read:** https://dlc.cce.cornell.edu/pluginfile.php/377370/mod_resource/content/1/Rain%20Gardens%20How-To%20Manual%20for%20Homewners%20-%20University%20of%20Wisconsin%20Extension.pdf
- **Original URL:** clean-water.uwex.edu/pubs/raingarden, and learningstore.uwex.edu/assets/pdfs/GWQ037.pdf (this one is cited in the WSU 2013 handbook, p. B-2).
- **Design basis (p. 6, sidebar):** the guidelines are "based on a goal of controlling 100% of the runoff for the average rainfall year". The garden "can be up to 30% smaller and still control almost 90% of the annual runoff."

### Table 1 — Rain gardens **less than 30 ft** from the downspout (p. 9)

Size factor, dimensionless, multiplied by the drainage area:

| Soil | 3–5 in. deep | 6–7 in. deep | 8 in. deep |
|---|---|---|---|
| Sandy | 0.19 | 0.15 | 0.08 |
| Silty | 0.34 | 0.25 | 0.16 |
| Clayey | 0.43 | 0.32 | 0.20 |

### Table 2 — Rain gardens **more than 30 ft** from the downspout (p. 9)

These factors apply at all depths:

| Soil | Size factor |
|---|---|
| Sandy | 0.03 |
| Silty | 0.06 |
| Clayey | 0.10 |

The text extraction prints the three Table 2 values in a column beside the row labels. They map in order Sandy → 0.03, Silty → 0.06, Clayey → 0.10, which is consistent with how the soils are ranked everywhere else in the manual.

### Procedure

1. **Siting (p. 4):**
   - At least **10 ft from the house**.
   - **Not over a septic system or sewer lateral.**
   - Not where water already ponds.
   - Not directly under a big tree.
   - Prefer flatter ground.
   - Avoid high foot-traffic areas.
2. **Slope (p. 7).** Set two stakes about 15 ft apart and run a level string between them. Slope % = height ÷ width × 100. **If the slope is more than 12%, pick another site.**
3. **Depth from slope (p. 7).** The manual's own bands have gaps at 4–5% and 7–8%; treat these as < 5, 5–8, 8–12:

   | Slope | Depth |
   |---|---|
   | < 4% | 3–5 in. |
   | 5–7% | 6–7 in. |
   | 8–12% | about 8 in. |

   Typical depth is **4–8 in.** A garden "more than eight inches deep might pond water too long" (p. 7).
4. **Soil type (p. 8):** sandy, silty or clayey, using the feel test or the ribbon test (see "Soil tests" below).
5. **Drainage area (p. 8):**
   - **< 30 ft from the downspout:** roof footprint (L × W) × fraction of the roof feeding that downspout. "Many houses have four downspouts, each taking about 25%."
   - **> 30 ft:** the roof drainage area plus the uphill lawn area that drains to the garden.
6. **Area (p. 9):** area = drainage area × size factor. If the result is "much more than 300 square feet, divide it into smaller rain gardens." The typical range is 100–300 ft² (p. 6).
7. **Shape (p. 10):**
   - About twice as long, perpendicular to the slope, as it is wide.
   - About 10 ft wide is a good compromise.
   - Maximum width is about 15 ft, especially on slopes over about 8%.
   - Length = area ÷ width.

### EXACT worked example ("Todd") — pp. 7–10

| Step | Published text / numbers |
|---|---|
| Slope (p. 7) | string 180 in., height 9 in. → 9/180 × 100 = **5% slope** → "Todd should build a **6 inch deep** rain garden" |
| Drainage area (p. 8) | house 60 ft × 40 ft = **2400 ft²**; downspout takes 25% → 2400 × 0.25 = **600 ft²** |
| Size factor (p. 9) | < 30 ft from downspout, 6 in. deep, silty soil → Table 1 → **0.25** |
| Area (p. 9) | 600 ft² × 0.25 = **150 ft²** |
| Dimensions (p. 10) | width 10 ft → 150 / 10 = **15 ft** long |

**Test vector:** `{drainageArea_ft2: 600, distance: '<30ft', soil: 'silty', depth_in: 6} → 150 ft²; width 10 ft → length 15 ft`. In SI that is 55.74 m² → 13.94 m².

### Other constraints in the same manual

- **Standing water:** "Usually you do not want standing water for more than a day" (p. 17).
- **Planting and mulch (p. 16):**
  - Lay out plants **one foot apart in a grid**.
  - Mulch with double-shredded mulch about **3 in.** thick.
  - Water 1 in. per week; water twice weekly until established.
- **Grouping (p. 15):** clump species in groups of **3 to 7** plants.
- **Cost (p. 17):** about $3–5/ft² DIY; $12–15/ft² by a landscaper. These are 2003 USD.
- **Berm:** about a foot across, well compacted, with gently sloping sides (p. 14).

### Soil tests in this manual (p. 9)

- **Infiltration test.**
  1. Dig a hole 6–12 in. deep and at least 4 in. in diameter.
  2. Fill it with water and let it stand 1 h to pre-soak.
  3. Refill and measure the depth, then measure again after 1 h.
  - A drop of **more than ½ in.** means the site is suitable.
  - A drop of ½ in. or less means consider another site, or a temporary hole in the berm.
- **Ribbon test.** Use 2 tsp of soil taken from 4–6 in. down, moistened to the consistency of putty.

  | Result | Soil type |
  |---|---|
  | Won't hold a ball | sandy |
  | Ribbon < 1 in. before breaking | silty |
  | Ribbon 1–2 in. | clayey |
  | Ribbon > 2 in. | "not suitable for a rain garden" |

---

## B. WSU "Rain Garden Handbook for Western Washington" (2013)

- **Citation:** Hinman, C. (principal author), Washington State University Extension; Washington State Department of Ecology Publication 13-10-027. *Rain Garden Handbook for Western Washington: A Guide for Design, Installation, and Maintenance.* June 2013.
- **URL:** https://apps.ecology.wa.gov/publications/documents/1310027.pdf
- **Page mapping:** printed page N = PDF page N+6. The sizing chart is on **printed p. 21 (PDF p. 27)**.
- **Scope note (p. 21):** "This sizing chart is meant to be a tool to help you meet your goals for managing runoff. The sizing chart should not be used to meet regulatory requirements such as the Washington State Department of Ecology's stormwater regulations."
- **2024 edition:** a 2024 edition exists (Pierce County hosts it at https://www.piercecountywa.gov/DocumentCenter/View/135906/2024-Rain-Garden-Handbook). I downloaded it (170 MB) but did **not** check whether its chart changed. The tables below are from **2013**.

### Rainfall regions (pp. 22–23, maps)

Regions are by average annual precipitation:

| Region | Annual precipitation |
|---|---|
| 1 | < 30 in |
| 2 | 30–40 in |
| 3 | 40–50 in |
| 4 | 50–70 in |
| 5 | 70–90 in |
| 6 | > 90 in |

For Metro Vancouver we would map by annual precipitation. This is **our extrapolation, not WSU guidance**, because the maps cover Washington only. Metro Vancouver ranges from about 1,100 mm (43 in, White Rock) to about 2,100 mm (83 in, Coquitlam/North Shore); see hydrology.md §d. Those values span WSU Regions 3–5.

### Rain Garden Sizing Chart (p. 21)

- **Units:** sizing factor = % of the **total contributing area**. Multiply it by the contributing area to get the **top surface of the ponding area**.
- **Columns:** soil drainage rate (in/h): **0.10–0.24 | 0.25–0.49 | 0.50–0.99 | 1.00–2.49 | 2.50+**

**Good** (captures about 80% of the water that flows to the garden). Ponding depth 6" to 12":

| Region | 0.10–0.24 | 0.25–0.49 | 0.50–0.99 | 1.00–2.49 | 2.50+ |
|---|---|---|---|---|---|
| 1 | 8% | 7% | 7% | 6% | 6% |
| 2 | 14% | 10% | 8% | 6% | 6% |
| 3 | 16% | 11% | 8% | 7% | 6% |
| 4 | 19% | 12% | 10% | 7% | 6% |
| 5 | 23% | 15% | 11% | 9% | 6% |
| 6 | 28% | 18% | 13% | 10% | 7% |

**Better** (about 95%). Ponding depth 6" to 12":

| Region | 0.10–0.24 | 0.25–0.49 | 0.50–0.99 | 1.00–2.49 | 2.50+ |
|---|---|---|---|---|---|
| 1 | 9% | 9% | 8% | 8% | 7% |
| 2 | 20% | 14% | 11% | 9% | 7% |
| 3 | 22% | 15% | 12% | 10% | 7% |
| 4 | 29% | 18% | 14% | 11% | 8% |
| 5 | 34% | 22% | 16% | 13% | 9% |
| 6 | 42% | 27% | 19% | 15% | 10% |

**Best** ("most all the water"). Separate rows for 6" and 12" ponding:

| Region | Ponding | 0.10–0.24 | 0.25–0.49 | 0.50–0.99 | 1.00–2.49 | 2.50+ |
|---|---|---|---|---|---|---|
| 1 | 6" | 13% | 10% | 9% | 9% | 8% |
| 1 | 12" | N/A | 10% | 9% | 8% | 8% |
| 2 | 6" | 39% | 32% | 26% | 21% | 15% |
| 2 | 12" | N/A | 27% | 23% | 20% | 15% |
| 3 | 6" | 45% | 36% | 30% | 25% | 17% |
| 3 | 12" | N/A | 31% | 26% | 22% | 17% |
| 4 | 6" | 54% | 43% | 34% | 27% | 18% |
| 4 | 12" | N/A | 36% | 31% | 25% | 17% |
| 5 | 6" | 75% | 47% | 35% | 26% | 17% |
| 5 | 12" | N/A | 45% | 31% | 25% | 17% |
| 6 | 6" | 72% | 56% | 42% | 30% | 19% |
| 6 | 12" | N/A | 48% | 39% | 29% | 19% |

N/A footnote: "At these low drainage rates, a 12-inch pond will not drain down within 3 days. Use a 6-inch ponding depth."

**Caveat.** Best / Region 5 / 6" / 0.10–0.24 is printed as **75%**, which is *larger* than Region 6's 72%. That is non-monotonic. I am reporting it **as extracted from the PDF text layer**. I could not render the page image to rule out a misprint, so treat this cell as "verified as printed, plausibly a typo". Unit tests must not assume monotonicity across regions.

Notes on p. 21:
- For Good and Better, the area is the same at 6 in. and 12 in. ponding.
- For Best, 6 in. gardens are generally bigger.

### Procedure (pp. 15–21, 25)

1. **Soil drainage test (pp. 15–17).** Do the infiltration test from **WSU's own procedure** (see below), giving a rate in in/h.
2. **Contributing area (p. 19).** Add up the measured horizontal areas: roof including overhang, plus driveway, plus other surfaces. "Don't worry about the slope of the roof."
3. **Rainfall region (pp. 22–23).**
4. **Performance level** (Good, Better or Best) and **ponding depth** of 6 in. or 12 in.
5. **Factor.** Top surface of ponding area = contributing area × sizing factor.
6. **Overflow containment (pp. 24–25).** Add at least **6 in.** of extra height around the ponding area. With 2:1 side slopes, this means adding 1 ft horizontally on every side. With 3:1 or 4:1 slopes, add 18 or 24 in.

### EXACT worked example (contributing area p. 19; sizing p. 25)

- **Contributing area (p. 19):**
  - Driveway 15 × 30 ft = 450 ft²
  - Roof 15 × 20 ft = 300 ft²
  - Roof 10 × 40 ft = 400 ft²
  - **Total = 1,150 ft²**
- **Sizing (p. 25, "Example Sizing Calculations"):**

| Input | Value |
|---|---|
| Soil drainage rate | 0.50 in/h |
| Contributing area | 1,150 SF |
| Ponding depth | 6 in |
| Performance | Best |
| Rainfall region | Region 4 (Maple Valley, WA) |
| **Sizing factor** | **34% (.34)** |
| **Required top surface of ponding area** | **391 SF (1,150 × 0.34 = 391)** |
| Design dimensions | 16 ft × 24.5 ft = 392 SF ("rounding up from 391") |
| Overflow containment area | 18 ft × 26.5 ft = 477 SF ("adding 1 foot horizontal to all sides for the 6-inch vertical depth required on a 2:1 slope") |

Exact product: 1,150 × 0.34 = 391.0.

**Test vector:** `{region: 4, perf: 'best', ponding_in: 6, rate_inph: 0.50, area_ft2: 1150} → factor 0.34 → 391 ft²`.

**Soil-volume example (p. 34):**
- 18 in. of soil mix = 1.5 ft.
- 392 ft² × 1.5 ft = 588 ft³.
- 588 ÷ 27 = **21.78 yd³**.

### WSU soil drainage (infiltration) test (pp. 15–17)

1. **High groundwater check.**
   - Test December–April; March is ideal.
   - Dig **36 in.** deep, 3–5 ft from the test spot.
   - If water seeps in, find another site.
2. **Dig the test hole:** about **2 ft deep**, 1–2 ft in diameter.
3. **Evaluate texture by feel** while digging:
   - Gritty and crumbles: sandy.
   - Sticky, smooth, moldable: clay.
   - Smooth, not sticky: silty.
4. **Fill and time.** Fill to **6 or 12 in.**, matching the planned ponding depth. Time how long it takes to drain fully. If water remains after a day, record the inches dropped. **Rate = total inches ÷ total hours.**
   - Example #1: 6 in. drains in 12 h → **0.5 in/h**.
   - Example #2: 12 in. drains in 40 h → **0.3 in/h**.
5. **Dry-season testing.** Run the test **3 times back to back** and use the third result.
6. **Decision rules (p. 17):**
   - < 0.25 in/h but > 0.1 in/h: "may be OK", with long standing water in winter.
   - **< 0.1 in/h: consider a different location.**

### WSU siting constraints (pp. 12–14)

Don't locate a rain garden:
1. Within **10 ft of a building foundation**.
2. Over utilities. Call 811.
3. Near steep slopes. Slopes should be **< 10%**; within **50 ft** of a slope over 10%, consult a geotechnical engineer.
4. Near septic systems. Keep **≥ 50 ft** if the garden is uphill of the septic system, **≥ 10 ft** if downhill.
5. In poorly draining low spots.
6. Where it would disturb healthy native soils or vegetation.
7. Where winter groundwater rises to within **1 ft** of the excavated bottom.
8. Within **100 ft of drinking-water wells**.

### WSU construction numbers (pp. 24, 30–36, 50)

- **Ponding depth:** 6 in. or 12 in.
- **Overflow containment:** at least 6 in.
- **Side slopes:** 2:1 maximum.
- **Soil mix depth:** 12–24 in. recommended.
- **Soil mix (p. 33):** "about **60% screened sand and 40% compost** by volume". Alternatively, amend on-site soil at **65% soil : 35% compost** (p. 34).
  - Option 3, amend in place, needs a drainage rate > 1 in/h: till 3 in. of compost to 4–5 in. deep.
- **Excavation depth:**
  - Options 1 and 2: 6 in. containment + 6 or 12 in. ponding + 12–24 in. mix = **24–42 in.**
  - Option 3: **15–21 in.**
- **Do not add sand to high-clay soils** (p. 36): it makes "a concrete-like mixture."
- **Inflow on slopes:** if the inflow slope is > 2%, add rock check dams every 5–10 ft.
- **Overflow rock:** ≥ 2 in. cobble, extending ≥ 4 ft beyond the berm.
- **Berm (p. 39):** at least 6 in. above the maximum ponding depth, and at least twice as wide as it is high.
- **Mulch (p. 50):** **2–3 in.** shredded or chipped wood. About 1 yd³ at 3 in. covers about 100 ft².
- **Spacing (p. 47):** "Space trees, shrubs, and plants at installation according to their expected mature size." The handbook gives **no numeric on-centre spacing**.

---

## C. Metro Vancouver *Stormwater Source Control Design Guidelines 2023* — Infiltration Rain Garden (CANADIAN)

- **Citation:** Lanarc Consultants Ltd., Kerr Wood Leidal Associates Ltd., Goya Ngan, for Greater Vancouver Sewerage & Drainage District (Metro Vancouver). *Stormwater Source Control Design Guidelines 2023*, Final Report, updated December 2023. Chapter 4, "Infiltration Rain Garden".
- **URL:** https://metrovancouver.org/services/liquid-waste/Documents/stormwater-source-control-design-guidelines.pdf
- **2012 predecessor:** https://metrovancouver.org/services/liquid-waste/Documents/stormwater-source-control-design-guidelines-2012.pdf
- **Pages:**
  - Design guidelines: pp. 4-3 to 4-5.
  - Sizing: pp. 4-8 to 4-11.
  - Example: pp. 4-13 to 4-14 (PDF p. 97).
- **Target user:** engineered rain gardens with a rock reservoir and subdrain. The "full infiltration, no reservoir" case is DR = 0.

### Design guidelines (§4.3, p. 4-3 to 4-5)

- **Setbacks:** **≥ 30 m from wells**; **≥ 3 m downslope of building foundations**; only where foundations have footing drains.
- **Mulch:** 50–75 mm non-floating organic.
- **Base:** bottom width ≥ 600 mm, 3000 mm desirable. Longitudinal slope ≤ 2%.
- **Side slopes:** 2H:1V maximum, 4:1 preferred.
- **Maximum ponded level:** **150–300 mm**. "**200 mm** maximum pond level is common and assumed for the simplified sizing approaches here."
- **Drawdown of maximum surface ponded volume:** **48 h preferred (72 h max.)**.
- **Depth:**
  - Rain garden depth = ponding + surcharge allowance (100 mm is common) + sediment allowance (about 3 mm/yr).
  - Footprint = base area + side-slope area; add 2 × slope × depth to each base dimension.
- **Growing medium:** ≥ **450 mm** deep, with a minimum lab-tested infiltration rate of **70 mm/h**.

### Table 4-A — Maximum I/P ratio (impervious area ÷ rain-garden base area) (p. 4-8)

This table was read from `pdftotext -raw`. The `-layout` mode scrambles the column.

| Surface type | Max I/P |
|---|---|
| General/Industrial Storage/Loading Areas | 20:1 |
| Divided or Undivided Major Road | 20:1 |
| Collector Road | 20:1 |
| Parking > 1 car/day/space | 20:1 |
| Local Road | 30:1 |
| Parking < 1 car/day/space | 40:1 |
| Low Traffic Areas/No Parking | 40:1 |
| **Single Family Residential/Lot and Roof** | **30:1** |

### Sizing Approach 1 — depth capture criterion "X mm in 24 h" (§4.7.1, p. 4-9)

1. **Rock depth** from the 4-day maximum drain time. Round down to 50 mm; the allowed range is 300–2000 mm:
   `DR = Ks × 24 × T / n` (T in days, Ks in mm/h, n = rock porosity, e.g. 0.35)
   - This form was **rebuilt from the variable list**. It is confirmed by the pervious-paving example in the same document (p. 5-12): 2.0 mm/h × 24 × 4 / 0.35 = **548 mm**, printed as "0.5 m < 548 mm".
2. **I/P ratio.** The text-layer symbols are "I / P 24 Ks DP DR n 0.2 DS 1 R". The rebuilt equation is:
   `I/P = (24·Ks + DP + DR·n + 0.2·DS) / R − 1`
   - R = rainfall capture depth (mm).
   - DP = ponding, 200 mm standard.
   - DS = soil depth, 450 mm standard.
   - 0.2 = soil storage fraction.
3. Cap I/P at the Table 4-A maximum.
4. Base area = impervious tributary area ÷ (I/P).
5. Footprint = base + side slopes.

### EXACT worked example §4.9 (pp. 4-13 to 4-14, PDF p. 97)

**Inputs (verbatim):**
- Total pavement area = **930 m²**
- Annual rainfall = 1200 mm
- 2-year 24-hour rain depth = **53.2 mm**
- Native soil infiltration rate = **1.5 mm/hr**
- Parking more than one car per day
- Capture target = **50% of 2-year 24-hour rain**

**Published steps (text layer):**
- "Use **400mm** rock depth."
- "maximum I/P ratio of 20"
- "Check that the I/P ratio is less than the maximum (**16.5** < 20, therefore OK)."
- The base-area result is in an equation image that I could not extract.

**My reproduction (COMPUTED):**
- R = 0.5 × 53.2 = 26.6 mm.
- DR,max = 1.5 × 24 × 4 / 0.35 = 411 mm → 400 mm ✔.
- I/P = (36 + 200 + 400 × 0.35 + 0.2 × 450) / 26.6 − 1 = 466 / 26.6 − 1 = **16.52** ✔ (published 16.5).
- Base area = 930 / 16.52 = **56.3 m²**. This is COMPUTED, not read from the page.

**Test vector:** `{Ks:1.5, R:26.6, DP:200, DR:400, n:0.35, DS:450} → I/P ≈ 16.5`

### Approach 2 — % of annual rainfall (§4.7.2; example §4.10, p. 4-15)

This approach uses charts in Appendix B for 1100, 1600 and 2100 mm annual rainfall. The charts are images, so we can't implement it without digitising them.

The published example reaches the I/P limit:
- 930 m², 1200 mm/yr, Ks = 1.0 mm/h, 90% capture.
- The orifice charts give I/P between 30 and 50, so the design uses the maximum of 20.
- Footprint = "930 m2 / 20 = **47 m2**".
- Rock volume = "47 m2 x 1.5 m" = **70 m³**.
- Total rock depth 1.8 m (1.5 m above the subdrain + 0.3 m).

---

## D. Essex Region Conservation Authority (Ontario) — "How to Create a Rain Garden: A Guide for Homeowners"

- **Citation:** Essex Region Conservation Authority (ERCA), Essex, Ontario. Undated. The same text was online by March 2014 (essexcountynature.com upload).
- **URLs:**
  - https://watersheds.ca/wp-content/uploads/2023/03/How-to-Create-a-Rain-Garden_-A-Guide-for-Homeowners-by-Essex-Region-Conservation-Authority.pdf
  - Identical text at https://www.essexcountynature.com/wp-content/uploads/2014/03/rain-garden-manual-web.pdf
- **References:** it cites Bannerman et al. 2003 (method A) and CVC's 2011 LID guide. It is effectively a metric copy of method A.

**Rules:**
- **3 m (10 ft) from the house** (p. 3).
- Not over septic; not where water ponds; full or partial sun.
- **Infiltration test (p. 4):** dig a 15 cm hole, fill it with water; it should soak in within 24 h.
- **Ribbon test:** a ribbon longer than 2.5 cm means unsuitable.
- **Depth by slope (p. 6):**

  | Slope | Depth |
  |---|---|
  | < 4% | 7–14 cm |
  | 5–7% | 15–18 cm |
  | 8–12% | 20 cm |

- **Typical size:** 10–30 m², 10–20 cm deep (p. 5).
- **"Far" (> 9 m) garden:** surface area ≈ **15% of the cumulative drainage area** (p. 7). This is NOT the same as Wisconsin Table 2 (0.03–0.10).
- **Planting and mulch (p. 9):** plants one foot apart in a grid; mulch about 2 in.
- **Drawdown (p. 11, FAQ):** "hold water for a maximum of **48 hours**".

**Worked example (pp. 6–7), as printed:**
- Roof 18 m × 12 m = 216 m², × 0.25 = **54 m²**. This is correct.
- Lawn "9 metres by 9 metres (30 feet by 30 feet), or **180 square metres** (900 feet²)". **This is wrong:** 9 × 9 = 81 m², and 900 ft² = 83.6 m².
- Total "234 m²" (180 + 54) × 0.15 = "35 m²". The printed product is 35.1 m². The correct total would be 81 + 54 = 135 m² → 20.3 m².

**Conclusion:** the guide is quotable for its rules, but **its example is internally inconsistent and must not be used as a test vector**.

## E. Capital Regional District (Victoria, BC) — "Building a Rain Garden" (fact sheet)

- **URL:** https://www.crd.ca/media/file/building-raingarden-2026 (CRD Environmental Protection, current download).
- **Sizing:** "A general rule is to size your rain garden to at least **20%** of the size of the impervious area ... This area should hold 70%-100% of the water."
- **Siting:** **≥ 3 m** from any building and **≤ 10 m** from downspouts; avoid septic systems and wells.
- **Infiltration test:** dig a hole about **60 cm** deep and fill it with **20 cm** of water. If it does not drain within **12 hours**, the site is unsuitable.
- **Construction:**
  - Dig **45–75 cm** deep.
  - Amend at about **2/3 soil : 1/3 compost**.
  - Leave **15–30 cm** for ponding.
  - Surface water should be present for only 1–2 days.
- **Zones:**
  - Zone 1, bottom: wetter plants.
  - Zone 2, sides: wet or dry.
  - Zone 3, top edge: drought tolerant.
- **Worked example:** none.

Other BC documents I checked and did not use for sizing:
- **RDOS "Okanagan-Similkameen Rain Garden Guide Book":** semi-arid interior; it adapts the WSU chart.
- **SFU/Surrey student "User Manual: Surrey Rain Garden Project" (2023):** not an agency guide.
- **KWL "Top Ten Design Considerations for Rain Gardens":** background for C; it gives a roof I/P maximum of 100:1, older than Table 4-A.

---

## Simple soil "jar test" (texture by sedimentation)

- **Citation:** Jeffers, A. "Soil Texture Analysis 'The Jar Test'." Clemson Cooperative Extension Home & Garden Information Center, **HGIC 1656**. Originally published 02/18, revised 12/2023.
- **URL:** https://hgic.clemson.edu/factsheet/soil-texture-analysis-the-jar-test/

**Procedure (as published):**
1. Sift the soil through a mesh sieve or colander to remove debris, rocks and large organic matter.
2. Fill a straight-sided clear jar about **one-third** full with soil.
3. Fill the rest with water, leaving some space at the top.
4. Cap and shake vigorously until the mixture is a uniform slurry.
5. Set the jar on a level surface and wait **1 minute**. Mark the top of the **sand** layer.
6. Wait **2 hours**. Mark the top of the **silt** layer.
7. Wait **48 hours**. Mark the top of the **clay** layer.
8. Measure each layer and the total height. Percent = layer ÷ total × 100.
9. Plot the three percentages on the USDA soil texture triangle.

**Variant:** Oregon State Extension describes the same method with clay found by subtraction (100 − sand − silt). It suggests a blender for better dispersion. Its example:

| Fraction | Calculation | Result |
|---|---|---|
| Sand | 9 mm / 23 mm | 39% |
| Silt | 10 mm / 23 mm | 43.5% |
| Clay | 100 − (39 + 43.5) | 17.5% |

- **Source:** https://extension.oregonstate.edu/node/139461
- **Status:** I saw this via search excerpt only, and did not open the page. **Partially verified.**

**For the app:** feed the jar-test percentages into a USDA texture-triangle classifier. Then map texture to a Wisconsin soil class:
- sand, loamy sand, sandy loam → "sandy"
- loam, silt loam, silt → "silty"
- clay loams and clays → "clayey"

This mapping is **our** simplification; none of the guides publish it. Texture can also map to Rawls Green-Ampt parameters; see hydrology.md.
