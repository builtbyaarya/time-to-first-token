# Grid and power data pack notes (accessed 2026-10-24)

File: pack_power.json, 108 values (71 topical + 19 state industrial prices + 18 state grid-region flags). Every value came from a page or PDF fetched today; nothing from memory. About 40 fetches.

## What I looked for and found

- Generator queue durations and completion rates: LBNL Queued Up 2025 Edition (Dec 2025, data through end 2024). Typical IR-to-COD 55 months; IA-to-COD 35 months; 13% of capacity / 19% of projects completed; per-ISO completion rates by project count (ERCOT 22, ISO-NE 18, CAISO 9, NYISO 8, West 9, Southeast 9); 2,290 GW active queue.
- FERC Order 2023: 150-day cluster study (via Troutman Pepper summary, law firm; marked sourced with publisher noted).
- ERCOT large load: 410 GW requests as of 2026-03-26, ~87% data centers (ERCOT Senate hearing deck, April 2026); batch cadence ~6 months; Batch Zero provisional results Sept 2026 (66.4 GW base load, 127.9 GW studied load, 302.2 GW excluded); 9,456 MW approved to energize and 4,132 MW operational peak (Sept 2026 monthly overview); PUCT draft rule $50,000/MW security, $100k/$300k study fees, 75 MW threshold (SB 6, via Greenberg Traurig alert).
- PJM: 32 GW peak growth 2024-2030, 30 GW from data centers (PJM Inside Lines, Aug 2025). Dominion zone 2025 summer peak 23,905 MW and 5.4%/yr growth (EIA Today in Energy, May 2026).
- Dominion: 54 GW under contract, 4.8 GW billing peak, 5-year ramp (Dominion deck at PJM LAS, Sept 2026). Connection wait 4-7 years (Data Center Knowledge/Bloomberg quoting Dominion letter, Aug 2024; secondary).
- Georgia Power: 50.9 GW pipeline, 11 GW committed (Utility Dive quoting PSC filings, Nov 2025; secondary).
- APS: 4.5 GW committed large load, 18 GW requested, 2 GW gas plant 2030 (DCD; secondary, article undated on page).
- NV Energy: 6 GW executed transmission agreements, 22 GW inquiries (Nevada Current quoting IRP; secondary).
- MISO ERAS: 90-day expedited IA target (S&P Global quoting MISO). SPP HILL: 90-day study (SPP deck to Missouri PSC, Aug 2026).
- National: 166 GW peak growth 2025-2030, transmission 6-10 years, large load build 1-2 years (Grid Strategies, Nov 2025).
- Lead times: power transformers 128 weeks, GSU 143 weeks, switchgear 44 weeks (Wood Mackenzie / ACP "Making the connection", Sept 2025); LPT range 80-210 weeks (Wood Mackenzie April 2024; same range in NIAC June 2024 draft); gas turbines 3+ years and Siemens booked out to FY2028 (Utility Dive and S&P quoting Siemens Energy); GE Vernova 116 GW backlog + slots (SEC 8-K, July 2026); Bloom 90 days (vendor claim via POWER); Caterpillar $72B backlog (no recip lead time in months found); MV switchgear 52-80 weeks, diesel gensets 50-78 weeks, UPS 30-48 weeks, pad-mount transformers 40-65 weeks (Terrapin Construction Group contractor data, secondary, no primary survey behind it).
- Capex: S&L/EIA 2024 study (2023$): aero CT $1,606/kW, H-class frame CT $836/kW, CC $868-921/kW, BESS $436/kWh, solar PV $1,502/kW, NOx 0.0075 lb/MMBtu design. NREL 2025: 4-hr BESS $334/kWh (2024$). EIA AEO2023: fuel cell $6,771/kW, CT lead time 2 years (modeling assumptions).
- Air permits: EPA NSPS KKKKa final rule Jan 2026 NOx 0.018 lb/MMBtu (high util) and 0.092 (low util); xAI Memphis permit 247 MW / 87 tpy NOx (TechCrunch quoting Shelby County).
- Electricity prices: EIA API v2 retail-sales, industrial sector, 2026-08 (released 2026-10-23), all 18 states + US (9.64). The EPM HTML table page and xlsx could not be fetched (server errors / proxy blocked direct download), so values came through the EIA open-data API URL recorded in the pack; US value cross-checked on the EPM update page.
- Grid regions: FERC electric power markets overview page. Mixed states (IA, WY, ND, NC, TN, IN, MI, IL) are flagged in notes; FERC's lists are "all or part of", so these are approximate.

## What I could not find (today, within fetch budget)

- Per-ISO median IR-to-COD durations from LBNL (only in charts, not text); only completion rates by ISO.
- ERCOT per-stage large-load durations in months (ERCOT decks give cadence and milestone dates, no typical stage durations); the ERCOT LLI web page failed to load.
- PJM large-load (not generator) interconnection timeline in months; PJM absolute summer peak MW forecast values (presentation gave deltas only).
- Georgia Power, APS, NV Energy stated connection waits in months/years (only pipeline and in-service years).
- Transmission line build time in months from a DOE page (DOE/States Newsroom articles failed to fetch); used Grid Strategies 6-10 years instead. NIETC pages not fetched.
- 345/230 kV data-center-scale substation cost ranges: only one small Dominion 230 kV distribution substation ($3.56M) and one need-to-in-service example (24 months). No sourced range for a 300+ MVA substation.
- DOE transformer lead-time figure directly from a DOE page (used Wood Mackenzie and NIAC/CISA draft instead).
- Reciprocating engine lead time in months; fuel cell $/kW commercial pricing (Bloom); diesel genset and UPS lead times from an OEM filing (only contractor data).
- NOx in g/kWh (sources give lb/MMBtu and ppm only).
- Caveat: EIA monthly state prices are preliminary and may be revised.
