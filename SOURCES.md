# Sources

All sources were read on 2026-10-13. The research notes in `docs/research/` say whether each value was verified, partly verified, or computed by us.

## Sizing and design

- **Rain Gardens: A how-to manual for homeowners.** Bannerman, Considine & Horwatich. Wisconsin DNR (PUB-WT-776) / UW-Extension (GWQ037), 2003. https://dlc.cce.cornell.edu/pluginfile.php/377370/mod_resource/content/1/Rain%20Gardens%20How-To%20Manual%20for%20Homewners%20-%20University%20of%20Wisconsin%20Extension.pdf
  - Size-factor Tables 1 and 2, with the "Todd" worked example (600 ft² × 0.25 = 150 ft²).
  - Slope and depth rules, ribbon and infiltration tests.
  - 1-ft planting grid and mulch depth.
- **Rain Garden Handbook for Western Washington.** Hinman (principal author). WSU Extension / Washington Dept. of Ecology Pub. 13-10-027, 2013. https://apps.ecology.wa.gov/publications/documents/1310027.pdf
  - Sizing chart (p. 21), with the worked example 1,150 ft² × 0.34 = 391 ft².
  - Rainfall regions, soil drainage test, siting setbacks, the 60/40 sand/compost soil mix, and mulch.
  - Appendix A plant list: zones 1–3, mature height and width, bloom.
- **Rain Garden Handbook for Western Washington, 2024 edition.** WSU / Pierce County, 2024. https://www.piercecountywa.gov/DocumentCenter/View/135906/2024-Rain-Garden-Handbook
  - Noted only. We did not check it against the 2013 edition.
- **Stormwater Source Control Design Guidelines 2023.** Lanarc, Kerr Wood Leidal & Goya Ngan for Metro Vancouver (GVS&DD), 2023. https://metrovancouver.org/services/liquid-waste/Documents/stormwater-source-control-design-guidelines.pdf
  - Canadian engineered rain-garden sizing (I/P equation), with the worked example I/P = 16.5.
  - Maximum I/P ratios.
  - DFO and BC capture criteria, the 72% rule, and station capture targets.
  - 48 h / 72 h drawdown.
- **How to Create a Rain Garden: A Guide for Homeowners.** Essex Region Conservation Authority (Ontario), undated (online by 2014). https://watersheds.ca/wp-content/uploads/2023/03/How-to-Create-a-Rain-Garden_-A-Guide-for-Homeowners-by-Essex-Region-Conservation-Authority.pdf
  - Ontario homeowner rules: 3 m setback, 15% rule, 48 h maximum ponding, 1-ft grid.
  - Its worked example contains an arithmetic error.
- **Building a Rain Garden.** Capital Regional District (Victoria, BC), current fact sheet. https://www.crd.ca/media/file/building-raingarden-2026
  - BC homeowner rules: 20% of impervious area, 3 m setback, 12 h drainage test, 15–30 cm ponding.
- **Top Ten Design Considerations for Rain Gardens.** Campbell et al., Kerr Wood Leidal Associates (Burnaby, BC), c. 2012. https://www.kwl.ca/wp-content/uploads/2019/07/3-1.pdf
  - Background on BC capture criteria (a fraction of the 2-yr 24-h storm).
- **Soil Texture Analysis "The Jar Test" (HGIC 1656).** A. Jeffers, Clemson Cooperative Extension, 2018 (revised 2023). https://hgic.clemson.edu/factsheet/soil-texture-analysis-the-jar-test/
  - Jar (sedimentation) test procedure.
- **Oregon State University Extension, soil texture jar test.** https://extension.oregonstate.edu/node/139461
  - Clay-by-subtraction variant of the jar test.
  - Seen only through a search excerpt (partly verified).

## Hydrology

- **Green-Ampt Infiltration Parameters from Soils Data.** Rawls, Brakensiek & Miller. J. Hydraulic Engineering 109(1):62–70, ASCE, 1983. https://dnrftp.state.co.us/DWR/DamSafety/HydrologyGuidelines_doNOTdelete/Guidelines_References/Rawls%20et%20al%20Green-Ampt%20Infiltration%20parameters%20from%20soils%20data%20ASCE%201983.pdf
  - Green-Ampt n, θe, ψ, K by texture. Chow et al. (1988) reproduce these as Table 4.3.1.
- **Storm Water Management Model Reference Manual Vol. I – Hydrology (Revised).** US EPA (EPA/600/R-15/162A), 2016. https://downloads.tuflow.com/SWMM/SWMM5_Reference_Manual_Volume1_Hydrology_P100NYRA.pdf
  - Cross-check of the Green-Ampt table (Table 4-7).
  - Horton fc, f0 and decay constants (Tables 4-2 to 4-6).
- **Applied Hydrology.** Chow, Maidment & Mays. McGraw-Hill, 1988. (No accessible copy.)
  - Table 4.3.1 and Example 4.3.1. Verified only through the reproductions listed below.
- **53:030 Lesson 14 Green-Ampt example solution.** University of Iowa (A.J. Bradley course handouts). https://user.engineering.uiowa.edu/~flood/handouts/EX-L14-Green-Ampt-soln.pdf
  - Silt-loam parameters quoted "from Table 4.3.1".
  - Rain-driven Green-Ampt test vector: tp = 1.366 h, Fp = 2.732 cm.
- **Graduate Hydrology 2007, Homework 3 solutions.** D. Maidment, University of Texas at Austin, 2007. https://www.caee.utexas.edu/prof/Maidment/GradHydro2007/docs/Hmwk3Soln.pdf
  - OCR copy of the Applied Hydrology solutions.
  - F = 3.17 cm (ponded silt loam).
  - Clay-loam ponding times: 0.54 h and 0.06 h.
- **Urban Hydrology for Small Watersheds (TR-55), 2nd ed.** USDA Soil Conservation Service, 1986. https://www.lmnoeng.com/Hydrology/TR55-Manual.pdf
  - Which SCS distribution type applies where: Type IA for the Pacific maritime climate, Type II for the rest.
- **Rainfall tables: Type IA / Type II 24-hr tabular (1982 TR-20 mass curves).** HydroCAD Software Solutions. https://hydrocad.net/rainfall/tables.htm
  - Cumulative P/P24 values for the SCS Type IA and Type II distributions.
- **Highway Runoff Manual M 31-16.04, Appendix 4C.** Washington State DOT, 2014. https://wsdot.wa.gov/publications/fulltext/Hydraulics/HRM/App4C_2014.pdf
  - Independent cross-check of the Type IA and Type II tables.
  - States that Type IA applies to western Washington.
- **Low Impact Development Stormwater Management Guidance Manual (DRAFT).** Ontario Ministry of the Environment, Conservation and Parks, January 2022. https://ero.ontario.ca/public/2022-01/Draft%20LID%20Stormwater%20Management%20Guidance%20Manual%202022.pdf
  - Ontario runoff volume control target: the 90th-percentile event, 23–32 mm.
  - 24–48 h drain-time inspection criterion.
- **Bioretention (LID Planning and Design Wiki).** TRCA Sustainable Technologies Evaluation Program, current. https://wiki.sustainabletechnologies.ca/wiki/Bioretention
  - 48 h drain time and I:P ratios.
  - Filter media blends.
  - 0.5–0.6 m on-centre planting of forbs and grasses.
- **Runoff volume control targets (LID Planning and Design Wiki).** TRCA Sustainable Technologies Evaluation Program, current. https://wiki.sustainabletechnologies.ca/wiki/Runoff_volume_control_targets
  - LID practices are sized to the 90th-percentile event.
- **"Vancouver adopts Rain City Strategy to manage stormwater".** Water Canada, 2019. https://watercanada.net/vancouver-adopts-rain-city-strategy-to-manage-stormwater
  - City of Vancouver's increase from 24 to 48 mm/day, and its 90% average annual rainfall goal.
  - The primary strategy PDF (https://vancouver.ca/files/cov/rain-city-strategy.pdf) returned 403, so we could not read it.

## Weather and geocoding

- **Historical Weather API docs.** Open-Meteo, current. https://open-meteo.com/en/docs/historical-weather-api
  - Archive endpoint, parameters, units, model lag (ERA5 5 days, IFS no delay), and the 1940 start.
  - CORS (tested live).
- **Geocoding API docs.** Open-Meteo, current. https://open-meteo.com/en/docs/geocoding-api
  - Forward geocoding only. There is no reverse endpoint (tested live).
- **Nominatim Usage Policy.** OpenStreetMap Foundation, current. https://operations.osmfoundation.org/policies/nominatim/
  - Free reverse geocoding: maximum 1 request per second, must identify the app, results must be cached.
- **Reverse Geocode to City API (client-side).** BigDataCloud, current. https://api.bigdatacloud.net/data/reverse-geocode-client
  - Alternative no-key reverse geocoder. CORS tested; terms not reviewed.

## Plants

- **Rain Garden Handbook for Western Washington, Appendix A "Selected Plants for Rain Gardens in Western Washington"** (pp. A-2 to A-18). WSU Extension, 2013. URL as above.
  - PNW plant zones, mature height and width, and bloom times.
- **King County Native Plant Guide ("GoNative").** King County, WA, current. https://green2.kingcounty.gov/gonative/
  - Sun exposure and moisture for PNW natives.
- **Native Plants for Rain-ready Landscapes.** Credit Valley Conservation, 2022 (revised Jan 2024). https://files.cvc.ca/cvc/uploads/2022/03/com_uo_rain-ready-plant-list_20240125_a.pdf
  - Ontario plant selection.
  - Low / Middle / High rain-garden zones.
  - Average height and spread (cm).
  - Rare-in-watershed flags.
- **Low Impact Development SWM Planning & Design Guide, Appendix B "Landscape Design Guide for LID" v1.0.** TRCA & CVC (Dougan & Associates), 2010. https://files.cvc.ca/cvc/uploads/2010/01/cvc-lid-swm-guide-appendix-b_na.pdf
  - Ontario on-centre spacing (cm), exposure, and bioretention zone lists.
- **Plant lists (Perennials, Graminoids, Shrubs).** TRCA STEP LID wiki, current. https://wiki.sustainabletechnologies.ca/wiki/Plant_lists
  - Soil-moisture, shade and salt-tolerance scores used to cross-check the Ontario zones.
- **Prairie Moon Nursery price list.** Prairie Moon Nursery (Minnesota), May 2024. https://www.prairiemoon.com/PDF/Prairie-Moon-May-2024-Pricing.pdf
  - Bloom months and flower colour for Ontario plants (Minnesota timing).
- **Native Plant Information Network.** Lady Bird Johnson Wildflower Center (University of Texas), current. https://www.wildflower.org/plants/
  - Sun ("Light Requirement") for Ontario plants.
