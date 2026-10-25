# Time to First Token: independent data audit

Auditor: independent; nothing under /home/claude/ttft was edited. Date: 2026-10-24. Machine-readable list: data_audit.json (one row per check; result pass | fail | unverifiable).

Scope, as revised by the coordinator: every value the model reads (ids not starting with `ctx_`) was checked first, one fetch per unique source URL (24 URLs). With the fetch count under 60, the research inputs behind the derived values and the `ctx_` values that appear in the studies were then spot-checked (about 33 more fetches, 59 in total, two of them continuation reads of the long LBNL report). Then Task B (model maths) and Task C (the three sample studies) in full.

## Counts

| Group | pass | fail | unverifiable |
|---|---|---|---|
| A-sourced | 68 | 1 | 10 |
| A-derived | 53 | 0 | 0 |
| A-assumption | 18 | 1 | 0 |
| A-ctx | 17 | 0 | 1 |
| A-research-inputs | 39 | 1 | 2 |
| B | 19 | 2 | 0 |
| C | 12 | 8 | 0 |
| **Total** | 226 | 13 | 13 |

A-sourced = the 79 model-driving values of kind sourced; A-derived = the 53 derived values recomputed from data/research/*.json per scripts/build_pack.py; A-assumption = the 18 assumptions (two were added to the pack at 15:39, during the audit) plus the UI/export labelling check; A-ctx = 18 ctx_ values spot-checked (the 54 ctx_ values not listed were not fetched); A-research-inputs = 42 research-file inputs behind the derived values, spot-checked on their pages.

## Task A: data pack against sources

### Method
Each unique source_url was fetched once (WebFetch; curl is blocked by the egress proxy for most hosts). All values from that URL were checked against the fetched text together. The two LBNL PDFs exceed the fetch window, so the PUE/WUE section was read with an offset call. The derived values were recomputed in Python from the research JSON inputs with the same arithmetic the build script describes (weeks x 12/52.1775, days / 30.44, shares of the Cushman & Wakefield total, products of the delay shares), to one decimal where the pack rounds to one decimal.

### Fails

- **wue__air** (sourced: LBNL 2024 report): value 0.3 is the high end of a range the page attributes to hyperscale systems 'similar' to its liquid-cooled case, not to air cooling; the page gives no WUE for air cooling and says 'air-cooled chillers use no water'. The fleet (largely air-cooled) figure on the page is 0.36 L/kWh
- **ui_assumption_labelling** (assumption labelling in UI/export): js/app.js line 19 calls all 203 values 'sourced values' in the pack-meta line (16 are assumptions, 54 derived); js/app.js line 160 tags 'IT utilization' as assumption although it_utilization is a sourced LBNL value; model.js exportRows line 328 labels every pack row with section 'assumption' regardless of kind; renderSources (app.js 281) skips values with no source_url so assumptions never appear in the page's source list
- **research:lead_lpt_weeks** (research input spot check vs page): Wood Mackenzie: 128 weeks average confirmed; 80-210 range NOT on page (page says '2 to 3 years')

### Unverifiable

- **iso__IA** (sourced: label vs FERC page): text='MISO'; page names Iowa only under SPP (14 states); its MISO list does not name Iowa, so 'MISO' is not confirmed by this page (MidAmerican is in MISO in reality, but the cited page does not say so).
- **iso__GA** (sourced: label vs FERC page): text='SERC (Georgia Power)'; page puts Georgia in the Southeast bilateral market; 'SERC (Georgia Power)' is not on the page.
- **iso__AZ** (sourced: label vs FERC page): text='WECC (APS/SRP)'; page places Arizona in the CAISO Energy Imbalance Market; 'WECC (APS/SRP)' is not on the page.
- **iso__NV** (sourced: label vs FERC page): text='WECC (NV Energy)'; page says CAISO covers a portion of Nevada and NV is in the EIM; 'WECC (NV Energy)' is not on the page.
- **iso__OR** (sourced: label vs FERC page): text='WECC (PGE)'; page mentions Oregon only in the EIM; 'WECC (PGE)' is not on the page.
- **iso__WA** (sourced: label vs FERC page): text='WECC (BPA/Grant PUD)'; page mentions Washington only in the EIM; 'WECC (BPA/Grant PUD)' is not on the page.
- **iso__WY** (sourced: label vs FERC page): text='WECC (PacifiCorp)'; page lists Wyoming under SPP and in the EIM; 'WECC (PacifiCorp)' is not on the page.
- **iso__NC** (sourced: label vs FERC page): text='SERC (Duke)'; page lists North Carolina under PJM (part) and the Southeast market; 'SERC (Duke)' is not on the page.
- **iso__TN** (sourced: label vs FERC page): text='TVA'; page lists Tennessee under PJM (part) and the Southeast market; 'TVA' is not on the page.
- **gpu_gb200** (sourced: The Register): value 120 kW confirmed ('rated for a peak power draw of 120 kilowatts'); high 132 kW is not on the page (the page has no figure other than 120 kW); the Wing VC page gives 132-140 kW
- **ctx_siemens_gas_turbine_booked_out_fy** (ctx spot check vs page): not fetched (S&P page); the Utility Dive page cited for lead_gas_turbine_months does NOT contain the 'booked out to fiscal 2028' claim, only 'three years or more'
- **research:gpu_cost_per_mw_gb200** (research input spot check vs page): Wing VC: '$3 million rack' (GB200 $2.8-3.4M reported); no per-MW figure and nothing supporting the 37 high
- **research:eia_lead_time_ct_years** (research input spot check vs page): not re-fetched; AEO2023 assumptions table lead-time column not checked

### Notes on passes that an industry reader would still question

- `survey_geotech_months`, `zoning_months`, `large_load_study_months`, `air_permit_minor_months`, `pue__liquid`, `gpu_rubin`, `it_utilization`: the pack value is the midpoint of a published range; the midpoint itself is not on the page. The low/high are.
- `substation_build_months` = 24: computed from two dates on one PJM slide (need meeting 12/08/2025, in-service 12/01/2027); it is one Dominion project, used as the US default.
- `install_<plant>_months` = 6 for every onsite plant type: the Opendock 'Power Infrastructure (Months 4-10)' stage is a building electrical stage, not a gas turbine, engine, fuel cell or solar plant install. Same number for all four technologies is a modelling choice, not a sourced figure per technology.
- `tier4_cx_extra_months` = 1.2: the page says 'a little more than a month'.
- `pue__liquid` = 1.25 (1.15-1.35): the LBNL range is a US fleet average projection for 2028, not a design PUE for direct liquid cooling with dry coolers.
- `wue__liquid_tower` = 0.36: the LBNL figure is the 2023 US fleet average, not a tower-specific value.
- `pue__liquid_tower` low = 1.09: this is Google's 2025 fleet PUE (confirmed on datacenters.google), while the pack row cites AWS; the AWS page's lowest region is 1.06.
- `cx_l1_l2_months` + `cx_l3_l4_months` (2.8 months, from Archdesk's '10-14 weeks across L1-L5') plus `cx_l5_ist_months` (2.8 months, from the same publisher's '10-14 weeks' IST for a liquid-cooled AI hall): the L1-L5 window already contains L5, so the model may count the integrated systems test twice (about 2.8 months on every critical path).
- `lead_lpt_months` low/high and `stress_transformer_months`: the arithmetic is right, but the 80 and 210 week inputs are not on the cited Wood Mackenzie page (see fails under research inputs). The transformer stress test (+18.9 months) therefore has no public source for its size.
- `compute_capex_per_mw__gb200` high = 37: not derivable from the cited Wing VC page.
- `water_permit_months`: the 36 days the note calls 'public notice' is the page's 'complete application to decision' average; the sum (246 days = 8.1 months) is still a defensible receipt-to-decision figure.
- FERC grid-region labels: one quote ('PJM ... all or part of 13 states') is stored against all 18 states.

### Assumptions
All 16 values of kind assumption carry publisher 'Time to First Token (assumption)' and an empty source_url. The study appendix prints them as 'Assumption.' entries and the executive text says 'the pack's own assumption' where one is used. The UI is weaker: the pack-meta line counts all 203 values as 'sourced values'; the only 'assumption' tag on the page is on IT utilization, which is a sourced LBNL value; the CSV export labels every pack row 'assumption'; and the page's source list skips values without a URL, so the assumptions are not listed there at all.

## Task B: model maths

Runs: `node scripts/plan.mjs` for TX 100 MW grid, VA 300 MW hybrid gas turbine, IA 1000 MW bridge gas turbine. The model (js/model.js, docs/methodology.md, pack.json) was revised at 15:39-15:43 while this audit was running (new tasks: accelerator order, gas supply lateral, remaining-racks tranche; new lags; new hybrid opex rule). The checks below were re-run against the revised code; the earlier build passed the same checks with the same single exception (negative float in the VA hybrid case). All hand checks are in Python, independent of model.js.

- PASS: B1 TX (current model, 25 tasks): every start = max over predecessors of (es + frac x months) and ef = es + months. violations=[]; e.g. design es=0.5x4.5=2.25, long-lead orders es=2.25+0.5x6=5.25, cx12 es=max(5.25+0.8x11.5, 5.25+0.8x9.7)=14.45, electrical es=max(19+0.67x4, 16.75)=21.68, cx34 es=max(15.25, 32.68, 23.65, 13.15)=32.68 [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B1b TX task durations equal the pack values. mismatches=[] [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B2 TX critical path zero float, ends at first token. critical=['study', 'lpt', 'utility', 'cx5', 'compute', 'bringup']; sum=55.8; firstToken=55.8; min float=0.00 [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B1c va (current model): forward pass consistent. violations=[]; tasks=29 [checked against js/model.js as of 15:40, the version current at the end of the audit]
- FAIL: B2b va: critical path zero float and ends at first token; no negative float. critical=['genlead', 'geninst', 'cx5', 'compute', 'bringup']; firstToken=51.21; negative floats=[('study', -14.79), ('lpt', -14.79), ('substation', -9.39), ('utility', -14.79)] [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B3 va capex lines and total (current model). total expected=(10386.5, 18511.6) model=[10386.45, 18511.575]; onsite line=(219.4, 421.6) [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B4 va electricity. 300 x 0.7 x 8760 x 1.25 x 9.98c = $229.49M model=229.49 [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B5 va water. 48.60 Mgal model=48.60 [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B4c va opex (current rule: hybrid = grid share of electricity + fuel for onsite share; bridge = full electricity, no fuel). expected=(359.1, 569.1) model=[359.1, 569.1]; fuel=34.3 model fuel=34.3 bridgeFuelYear=0.0 [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B7 va: scaled tasks = pack x (300/100)^0.25 = 1.3161; compute split by tranche share 0.5; lead/permit tasks unscaled. shell=5.264; compute=2.632; gas=18; gpulead=9 [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B1c ia (current model): forward pass consistent. violations=[]; tasks=28 [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B2b ia: critical path zero float and ends at first token; no negative float. critical=['zoning', 'grading', 'foundations', 'shell', 'electrical', 'mechanical', 'whitespace', 'cx34', 'cx5', 'compute', 'bringup']; firstToken=61.87; negative floats=[] [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B3 ia capex lines and total (current model). total expected=(35353.0, 63110.5) model=[35353, 63110.5]; onsite line=(1463.0, 2810.5) [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B4 ia electricity. 1000 x 0.7 x 8760 x 1.25 x 9.31c = $713.61M model=713.61 [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B5 ia water. 161.99 Mgal model=161.99 [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B4c ia opex (current rule: hybrid = grid share of electricity + fuel for onsite share; bridge = full electricity, no fuel). expected=(1413.6, 2113.6) model=[1413.6, 2113.6]; fuel=0.0 model fuel=0.0 bridgeFuelYear=228.8 [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B7 ia: scaled tasks = pack x (1000/100)^0.25 = 1.7783; compute split by tranche share 1; lead/permit tasks unscaled. shell=7.113; compute=7.113; gas=18; gpulead=9 [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B8 risk likelihoods (current model). {'transformer': 0.24, 'utility': 0.14, 'permit': 0.11, 'interconnection': 0.14, 'gpu': 0.24, 'labour': 0.46} [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B6 2n (current model): facility low = 889 x 1.21; electrical x1.1; cx5 +1.2 for tier4. facility low=1075.69 exp=1075.69; electrical=6.6000000000000005; cx5=2.8 [checked against js/model.js as of 15:40, the version current at the end of the audit]
- PASS: B6 tier4 (current model): facility low = 889 x 1.331; electrical x1.1; cx5 +1.2 for tier4. facility low=1183.26 exp=1183.26; electrical=6.6000000000000005; cx5=4 [checked against js/model.js as of 15:40, the version current at the end of the audit]
- FAIL: methodology.md matches model.js. docs/methodology.md section 3 says the GPU allocation delay is added 'to the rack install'; model.js (15:40) adds stress_gpu_months to the accelerator order task (gpuLead), not to the install. Everything else in the task table (survey 0.5 lag, orders at design 0.5, L1-L2 at 0.8 of switchgear and cooling orders, gensets and air permit gating L3-L4, gas supply, tranche split, hybrid opex rule) matches the code.

Summary: (1) every task start in the TX run equals the max over its predecessors of (predecessor start + fraction x predecessor months), with the fractional lags 0.5 (survey to design, design to orders), 0.8 (orders to L1-L2), 0.67 (shell to fit-outs) and 0.5 (fit-outs to white space), and every task's durations equal the pack values; (2) the TX critical path study > transformers > utility wait > L5 > racks > bring-up has zero float and sums to 55.8 months = first token, with no negative float; (3) every capex line equals the pack $/MW low/high x MW x f_red x f_cool x f_metro (f_metro is always 1 because the pack has no capex_metro_index values) and the onsite line equals $/kW x MW x 1000 x share x 1.75; (4) electricity = MW x 0.7 x 8760 x 1.25 x price; (5) water = MW x 0.7 x 8760 x 1000 x 0.1 L / 3.78541 / 1e6; (6) 2N = 1 + 0.21 x (2.0 - 1) = 1.21 and Tier IV = 1.21 x 1.10 = 1.331, applied to the facility lines, electrical fit-out x 1.1, +1.2 months on L5 for Tier IV; (7) scaled tasks = pack x (MW/100)^0.25 (1.3161 at 300 MW, 1.7783 at 1000 MW), the compute install split by the tranche share, lead times and permits unscaled; (8) likelihoods 0.57 x 0.42 = 0.24, 0.57 x 0.25 = 0.14, 0.57 x 0.20 = 0.11, labour 0.46.

Discrepancies: (a) VA hybrid: the study, transformers, substation and utility energization carry negative float (-14.8, -14.8, -9.4, -14.8 months) because the grid chain ends at month 66, after first token at 51.2; they are not flagged critical, but a negative float is not a CPM quantity and the report clips it to 0.0. (b) methodology.md still says the GPU allocation delay goes on the rack install; the code puts it on the accelerator order. (c) The IST may be double counted: `cx_l1_l2_months` + `cx_l3_l4_months` are 30% and 70% of Archdesk's '10-14 weeks across L1-L5', which already includes L5, and `cx_l5_ist_months` adds another 10-14 weeks from the same publisher.

## Task C: the three sample studies

- PASS: C:tx:citations (every superscript citation resolves to an appendix entry). 44 numbers cited, 44 appendix entries, none unresolved, none uncited
- PASS: C:tx:appendix_urls (every appendix URL exists in pack.json). 41 URLs, all in pack
- PASS: C:tx:headline (headline numbers match plan.mjs). 56 months (55.8), July 2031, facility $889M-$2.3B (889-2330), opex $125M-$195M (125.3-195.3), racks $2.5B-$3.7B, water 16 Mgal (16.2); 37 months after target (56-19)
- PASS: C:tx:emdash (no U+2014 in PDF text). 0 em dashes (pdftotext); 0 in report.tex (the '---' in the tex are comments and one PJM URL)
- PASS: C:va:citations (every superscript citation resolves to an appendix entry). 49 cited, 49 entries
- PASS: C:va:appendix_urls (every appendix URL exists in pack.json). 46 URLs, all in pack
- PASS: C:va:headline (headline numbers match plan.mjs). 56 months (55.96), July 2031, full grid power May 2032 (66), facility $2.9B-$7.4B (2886-7412), opex $474M-$684M (473.8-683.8), gas $34M (34.3), water 49 Mgal (48.6)
- PASS: C:va:emdash (no U+2014 in PDF text). 0 em dashes (pdftotext); 0 in report.tex (the '---' in the tex are comments and one PJM URL)
- PASS: C:ia:citations (every superscript citation resolves to an appendix entry). 47 cited, 47 entries
- PASS: C:ia:appendix_urls (every appendix URL exists in pack.json). 44 URLs, all in pack
- PASS: C:ia:headline (headline numbers match plan.mjs). 65 months (65.1), April 2032, facility $10.4B-$26.1B (10353-26110), opex $929M-$1.6B (928.8-1628.8), gas $229M (228.8), water 162 Mgal (162.0)
- PASS: C:ia:emdash (no U+2014 in PDF text). 0 em dashes (pdftotext); 0 in report.tex (the '---' in the tex are comments and one PJM URL)
- FAIL: C:tx:publishers (first mention of each publisher carries a description). Described: FERC, EIA, LBNL, Grid Strategies. Not described at first mention: Cushman & Wakefield (exec summary), ERCOT ('in the ERCOT footprint', described only two sentences later), JLL ('(JLL 2026)' inside a pasted note), Dominion and PJM ('a Dominion example in PJM filings'), Prince William County and TCEQ (inside pasted notes), JLARC, Crusoe, Uptime Institute (section 9), Vertiv (mitigation). make_report.py only calls C.who() in a few sentences; the WHO table has descriptions that never reach the text.
- FAIL: C:va:publishers (first mention of each publisher carries a description). Described: FERC, EIA, LBNL, PJM (on second mention), Grid Strategies, Siemens Energy (after a pasted note already named it). Not described: Cushman & Wakefield, Dominion ('This is the Dominion zone'), Brattle, GE Vernova, Prince William County, Loudoun, JLARC, Crusoe, Uptime Institute, Vertiv.
- FAIL: C:ia:publishers (first mention of each publisher carries a description). Not described: MISO ('in the MISO footprint'; 'MISO; ERAS fast track' fragment), Cushman & Wakefield, JLL, Dominion/PJM, Prince William County, Generator Source, 'Utility Dive quoting Siemens Energy earnings call' used as a subject, GE Vernova, JLARC, Crusoe, Uptime Institute, Vertiv.
- FAIL: C:va:numbers (numbers in the VA text vs pack). Section 7: 'Staff, maintenance and other opex is 0 to 1 $M per MW-year' should read 0.70 to 1.40 (Table 4 and the appendix say 1.4; TX and IA texts say 0.70 to 1.40). Section 4: 'a full impact statement a median of 2 years' should be 2.5 years (TX and IA say 2.5). Cause: make_report.py Cites.val() formats any value whose unit contains 'year' with str(int(q)), truncating 0.7, 1.4 and 2.5. The VA PDF (14:45) was built after TX/IA (14:43) with a different make_report.py, so the three samples are not from the same code.
- FAIL: C:all:text_vs_table (durations quoted in the text vs the task table). VA and IA: section 3 says 'install and connection 6 months' and section 6 lists 'foundations 2 months; steel and roof 4 months; electrical fit-out 6 months ...' while Table 2 shows the size-scaled figures (VA 7.9 / 2.6 / 5.3 / 7.9; IA 10.7 / 3.6 / 7.1 / 10.7) with no statement that the text figures are the unscaled 100 MW values.
- FAIL: C:va:float (float column vs model). Table 2 prints float 0.0 for the interconnection study, large power transformers, substation and utility energization (model floats -10.0, -10.0, -4.6, -10.0, clipped by max(0, float) in make_report.py line 528) while those rows are not bold/critical and the critical path in section 1 omits them; a reader sees zero-float tasks that are not on the critical path.
- FAIL: C:all:prose (sentences that read wrong or unclear). See the prose list in data_audit.md (pasted pack notes with trailing full stops and '/ 30.44' arithmetic, 'a 24 months build', 'bring-up 1 months', '1 months slower', 'The strongest lever is to first token on a first phase of racks', 'fiscal 2,028', 'E = 7, 665 GWh', double-colon risk sentence, lever labels capitalised mid-sentence, raw ids 'liquid_tower'/'2n'/'tier4' in Table 5, tables splitting sentences, 'Grid region, Texas = 0 [sourced]' in the appendix, two LBNL entries for one report).

### Sentences that read wrong or unclear to an industry reader

- TX, VA, IA section 1: 'built up from the Cushman & Wakefield 2026 all-in cost of 0.6 to 1.6[1], 1.5 to 4.0[1], 1.9 to 4.9[1], 3.5 to 9.1[1] and 1.4 to 3.7[1] $M per MW for site, shell, power, mechanical and contingency' (TX, IA): five ranges with the unit after the list and five identical superscripts. VA uses a cleaner sentence, so the three studies were not built from the same code.
- TX section 1: 'The risk to watch is transformer slip: 24%: 57% of projects late x 42% equipment-driven, and 9 months on the plan if it lands[5].' Two colons; the derivation string from the pack is pasted as prose. IA has the same shape ('permit challenge: 11%: 57% late x 20% permitting-driven').
- IA section 1: 'The strongest lever is to first token on a first phase of racks' (lever label dropped into 'is to ...'). VA: 'The strongest lever is First token on a first phase of racks' (capital F mid-sentence).
- TX section 2: 'ERCOT large-load process; SB6 (2025) applies above 75 MW.' and IA: 'MISO; ERAS fast track for ready projects.' are sentence fragments (the states[].note field printed as a sentence).
- TX and IA section 2 and 4: pack notes pasted in parentheses with their trailing full stop and arithmetic: '(ERCOT Batch Zero study, 9 months; batches run about every 6 months.)', '(TCEQ standard permit with notice, 150 target days / 30.44.)', '(MISO ERAS 90-day target to an interconnection agreement / 30.44.)', '(Permits and approvals phase. Industry guide (secondary).)'. VA strips the full stops but keeps the content.
- TX section 2: 'LBNL, a US Department of Energy laboratory that studies the grid and data center energy use reports a median of 55 months' (missing comma; VA has it). 'ERCOT, the operator of the Texas grid has 410 GW' and 'Grid Strategies, a grid consultancy projects' (same). VA section 7: 'Lawrence Berkeley National Laboratory, puts the US fleet' (stray comma on the second mention, and the name switches from LBNL to the full name).
- TX and IA section 3: 'The substation is a 24 months[15] build' (VA: '24-month build'); 'the large power transformers lead 18.4 to 48.3 months' ('lead' as a verb).
- IA section 3: 'Turbine supply is tight: Utility Dive quoting Siemens Energy earnings call quotes three or more years and is booked to fiscal 2,028[19]' (publisher string used as the subject; thousands separator in a year). VA fixed this to 'Siemens Energy, a turbine maker ... fiscal 2028'.
- IA section 3: 'sized at 1,750 MW: 1,000 MW of IT at 1.75 kW of generation per kW of IT (1,750 kW of generation per MW of IT: IT x PUE plus a 20 to 25% buffer (Generator Source).)' nested parentheses, the note repeats the sentence.
- VA and IA section 3: 'A gas turbine or engine fleet at this scale is a major source under the Clean Air Act, so the permit is on the plan's critical path for the onsite works.' Table 2 gives the air permit 0.4 months of float and it is not on the critical path.
- VA and IA section 3 and 6: 'the install and connection 6 months', 'foundations 2 months; steel and roof 4 months; electrical fit-out 6 months' while Table 2 shows 7.9 / 2.6 / 5.3 / 7.9 (VA) and 10.7 / 3.6 / 7.1 / 10.7 (IA). The text does not say these are the unscaled 100 MW figures.
- All three, section 6: 'bring-up 1 months', 'commissioning L1 to L4 0.80 months plus 2 months'; IA section 8: '2N redundancy: 1 months slower'.
- All three, section 6: 'design to permit release 6 to 12 months' while the plan uses 6 (the low end), which Table 2 shows.
- All three, section 7: 'Costs are rising: all-in build cost is' is split from 'up 21 % since late 2024' by Table 3 (and in TX by a page break), and 'Water:' is split from 'W = ...' by Table 4. The equation E = 2, 300 GWh (VA) and E = 7, 665 GWh (IA) has a space after the thousands comma (math mode).
- TX and IA section 7: 'Staff, maintenance and other opex is 0.70 to 1.40 $M per MW-year (Colocation all-in rate ... our assumption.)' pastes the whole note; VA prints '0 to 1 $M per MW-year', which is wrong (see C:va:numbers).
- All three, Table 5: raw input ids 'Cooling: liquid_tower', 'Redundancy: 2n', 'Redundancy: tier4'.
- All three, section 8: 'Next come hybrid: part onsite, part grid (6 months), first token on a first phase of racks (2 months).' (TX) and 'gpu allocation delay' lower-case in the stress list.
- All three, Table 6: the labour row's likelihood cell reads '46% report difficulty hiring (Uptime)' while every other row is a bare percentage.
- All three, Table 2 (VA especially): zero float printed on tasks that are not bold (not critical): study, transformers, substation, utility energization in VA.
- Appendix entry 6 in every study: 'Grid region, Texas = 0 [sourced]' (a text label printed as a value of 0). Entries 3 and 4 (TX numbering) are the same LBNL report under two URLs.
- VA section 4: 'a full impact statement a median of 2 years' should be 2.5 (truncation bug).
- Section 5 'Design basis' in VA: the heading is followed by the liquid-cooling paragraph and the section 6 heading before Table 1 floats in on the next page, so the design-basis table appears inside section 6.
- Cover: 'Prepared by Time to First Token, an open planning tool by Aarya (builtbyaarya)' and the recommendation 'take the first lever (add onsite bridge power) and lock the long-lead orders in the first quarter' are fine; but 'Re-run this study when the utility returns its study results' is printed even in the IA bridge-power case, where the utility study has 17 months of float and does not drive the date.

### Other Task C observations
- FAIL: the samples are stale. The three PDFs (14:43 and 14:45) were built on the model before the 15:39-15:43 revision. On the current model.js and pack.json the headline results differ: VA first token 51.2 months (PDF 56) with opex $359M-$569M (PDF $474M-$684M); IA first token 61.9 months (PDF 65) with opex $1,414M-$2,114M (PDF $929M-$1,629M); TX unchanged at 55.8 months. The task lists also differ (accelerator order, gas supply and remaining-racks tasks are new). The headline check above passed only against the plan.mjs output as it stood when the PDFs were built; the samples need rebuilding.
- The three PDFs were not built from the same make_report.py: VA (14:45) has the comma, full-stop and 'X-month build' fixes and the int-truncation bug; TX and IA (14:43) have the older prose but the correct 0.70 to 1.40 and 2.5 years. Rebuilding all three from one version is needed before comparing them.
- Headline numbers, citation resolution, appendix URLs and the em-dash check pass in all three.

## Fetch log
24 model-driving URLs fetched once each (2 needed an offset continuation); 33 further URLs fetched for the research inputs and ctx values; curl to climate.mit.edu was refused by the proxy, so the LBNL PDF was read through WebFetch with offsets. Not fetched: the 29 ctx-only URLs that do not feed a model value and were not needed for the spot checks listed above (e.g. ERCOT monthly overview, Greenberg Traurig, PJM Inside Lines, Dominion LAS slides, EPA pages, eCFR, TechCrunch, Turner & Townsend, Uptime Field 181, NVIDIA, DCD Crusoe, Georgia Power, APS, NV Energy, Vertiv x2, APC, Queued Up 2024, S&P Siemens).
