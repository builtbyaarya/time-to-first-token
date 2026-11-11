# Methodology

How Time to First Token turns the inputs and the data pack into a plan. Every id in backticks is a value in `data/pack.json`, where its source, publisher, read date and note live.

## 1. Inputs

Location (state and nearest metro, which fixes the grid region through `iso__<state>`), IT load in MW (critical IT load, not facility load), power strategy (grid only, onsite bridge, hybrid) and the onsite plant type, redundancy (N+1, 2N, or 2N with Uptime Tier IV certification), cooling (direct liquid with dry coolers, direct liquid with towers, air), accelerator generation and rack density, project start and target go-live. Two levers can be switched on: order the transformers at project start, and serve the first token from a first phase of racks.

Input rules, applied by `normalizeInputs` in `js/model.js` before every plan (so old share links and study requests are brought inside them, with a note on screen and in the study):

- Rack density stays inside the published range of the chosen rack, `gpu_<gpu>` low to high (GB200 NVL72 120 to 132 kW, GB300 NVL72 135 to 155 kW, Vera Rubin NVL144 120 to 130 kW).
- Air cooling can be chosen only when the rack is at or under `air_cooling_max_kw_per_rack` (50 kW, Uptime Institute) and is not sold liquid-only. Every rack in the pack is liquid-only (`liquid_only__<gpu>`, from NVIDIA's own product pages for GB200 and GB300, and a trade report of NVIDIA's OCP talk for Vera Rubin), so air is shown but switched off, with the reason. A plan that asks for air is switched to liquid with dry coolers.

Power is grid, onsite gas, fuel cells or solar with batteries. Wind is not offered: it is not firm power, so it cannot carry a data center on its own.

## 2. Tasks and the critical path

The plan is a critical-path calculation (CPM) over the tasks below, in the order a site is really built. Each task has a duration from the pack and predecessors; a predecessor written as (task, f) means the task may start once that predecessor is a fraction f done, which is how the fit-outs overlap the shell and the white space overlaps the fit-outs.

| Task | Duration (pack id) | After |
|---|---|---|
| Survey, geotech and planning | `survey_geotech_months` | start |
| Design and engineering to permit and order release | `design_months` | (survey, 0.5) |
| Zoning and site plan approval | `zoning_months` (or `zoning_months__<state>`) | start |
| Building permit | `site_plan_building_permit_months` | zoning, design |
| Air permit | `air_permit_minor_months` (standby generators) or `air_permit_major_months` (onsite turbines or engines), state-scoped where the pack has it | design |
| Cooling-water discharge permit (towers only) | `water_permit_months` | design |
| Load interconnection study (the ISO's where it runs one: ERCOT, MISO, SPP; otherwise the utility's) | `large_load_study_months` (or `__<ISO>`) | start |
| Large power transformers | `lead_lpt_months` | study (or start, with the lever) |
| Substation civil, structures and switchyard | `substation_build_months` | study |
| Utility energization | the later of the works finishing and `utility_energization_wait_months` (or `__<state>`) from project start | substation, transformers |
| Onsite plant, order and lead time | `lead_<plant>_months` | start |
| Gas supply: lateral and supply agreement (turbines and engines) | `gas_supply_months` (assumption) | (design, 0.5) |
| Onsite plant, install and connect | `install_<plant>_months` x size scale | plant order, foundations, air permit, gas supply |
| Grading, fence and road | `grading_civil_months` x size scale | survey, zoning |
| Foundations | `foundations_months` x size scale | grading, building permit |
| Steel, roof and walls | `shell_steel_roof_months` x size scale | foundations |
| Switchgear and UPS, order | max(`lead_switchgear_months`, `lead_ups_months`) | (design, 0.5) |
| Standby generators, order | `lead_genset_months` | (design, 0.5) |
| Cooling equipment, order | `lead_chiller_months` (or `lead_crah_months` for air); CDUs `lead_cdu_months` | (design, 0.5) |
| Fan walls for the air-side heat, order (liquid halls) | `lead_crah_months` | (design, 0.5) |
| Accelerator order and allocation | `lead_accelerator_months` (assumption) | (design, 0.5) |
| Electrical fit-out | `electrical_fitout_months` x size scale (x `redundancy_2n_electrical_time_factor` for 2N) | (shell, 0.67), switchgear |
| Mechanical fit-out | `mechanical_fitout_months` x size scale | (shell, 0.67), cooling equipment, fan walls |
| White space | `whitespace_fitout_months` x size scale | (electrical, 0.5), (mechanical, 0.5) |
| Cx L1 to L2 (factory witness, receipt) | `cx_l1_l2_months` | (switchgear, 0.8), (cooling equipment, 0.8) |
| Cx L3 to L4 | `cx_l3_l4_months` x size scale | L1 to L2, white space, standby generators, air permit |
| Cx L5, integrated systems test | `cx_l5_ist_months` (or `_air`) x size scale, plus `tier4_cx_extra_months` for Tier IV | L3 to L4, power (onsite plant, or utility energization), water permit |
| GPU racks installed, first tranche | `gpu_install_months_per_100mw` x size scale x the tranche share (`lever_first_phase_share` with the lever; `hybrid_onsite_share` for hybrid; otherwise 1) | L5, accelerator order |
| Cluster bring-up and burn-in | `cluster_bringup_months` | first tranche |
| GPU racks installed, remaining | the rest of the install | first tranche, and utility energization for hybrid |

Size scale: construction durations are multiplied by (MW / 100) ^ `construction_scale_exponent`, so a 1 GW campus phased across buildings takes about 1.8 times as long per task as 100 MW. The exponent is an assumption and is labelled as one.

Time to first token is the end of bring-up on the first tranche. Full power is the later of utility energization and the last rack: in a hybrid plan the onsite share of racks serves the first token and the rest wait for the grid. Float is computed against first token, so a task on the critical path has zero float; the utility energization in a bridge-power plan can finish after first token and then carries no criticality.

Stage dates on the rail are the end of each stage's last task; the Power stage ends when the power that feeds the integrated systems test is available.

## 3. Stress tests

Each stress test adds `stress_<kind>_months` to one task: transformer slip to the transformer lead time, interconnection study delay to the study, permit challenge to zoning, turbine lead-time extension to the onsite plant lead time, utility energization delay to the wait, GPU allocation delay to the accelerator order, labour shortage to the electrical fit-out. The slip is waited out first (the site stands still) and the work then runs. The impact in the risk register is the change in first token when the stress is replayed; a zero means the task has float.

## 4. Risk likelihoods

`risk_<kind>_likelihood` = share of projects late by three or more months (JLL 2026) x share of delays caused by equipment, power availability or permitting (Uptime Institute 2025). The labour likelihood is the share of operators reporting difficulty hiring (Uptime). These are stated as derived values and the arithmetic is in each note.

## 5. Capex

Construction capex per MW is Turner & Townsend's 2026-27 range for the most advanced US AI facilities, $14 to $16 per watt (`capex_ai_construction_usd_per_w` in the research file), which is newer and much tighter than the Cushman & Wakefield 2026 all-in range of $8.9M to $23.3M per MW it replaces for construction. It is split into shell and core, power infrastructure, mechanical and fit-out and fees, and contingency by Cushman & Wakefield's published cost shares, renormalised over the construction part. Land is outside the Turner & Townsend index, so `capex_site_per_mw` keeps Cushman & Wakefield's share of its wider range. The UI and the study show low, mid and high for every line. Multiplied by MW and by:

- redundancy factor: 1 for N+1; `redundancy_2n_capex_factor` for 2N (one plus the power-infrastructure share times the UPS doubling Schneider reports); `redundancy_tier4_capex_factor` for Tier IV (the 2N factor times the Tier IV premium over Tier III);
- cooling factor: 1 for liquid; `capex_air_cooling_factor` for air (the JLL liquid-cooling premium removed);

Onsite plant: served kW x `onsite_oversize_factor` (kW of generation per kW of IT) x `capex_<plant>_per_kw`, or for solar with batteries `solar_bess_pv_ratio` kW of PV per kW served at `capex_solar_per_kw` plus `solar_bess_hours` of battery at `capex_bess_per_kwh`. Hybrid serves `hybrid_onsite_share` of the load onsite.

Accelerator racks: `compute_capex_per_mw__<gpu>` x MW. This is the tenant's cost, not the developer's (see section 5a), so it sits outside the headline build cost.

## 5a. Landlord view

Developers such as Hut 8 build and own the land, building, power and cooling, and lease the finished hall on a 15-year triple-net lease; the tenant pays the running costs and brings its own GPUs (`lease_tenant_brings_compute`). So the headline cost is the developer's build cost (facility and power), and the GPUs are a separate "tenant's cost" line.

- Rent per year = MW x `rent_per_mw_year`. The value is Hut 8's River Bend lease, $7.0B over 15 years for 245 MW = $1.905M per MW-year (3% escalator included in the total); the low end is Beacon Point, $9.8B over 15 years for 352 MW = $1.856M.
- Rent as a share of build cost = rent per year / midpoint build cost.
- Rent lost per month of delay = rent per year / 12. Months late against the target times that figure is the rent the plan loses.
- Check case: River Bend's $3.25B of construction notes, which fully fund the 245 MW building and its substation (`check_river_bend_build_busd`), against $0.467B of rent a year is 14.4% a year (`check_river_bend_rent_share`). The model's own build cost for 245 MW in Texas is $3.6B to $4.3B, so it gives 11.8%; the notes also cover reserves and a $184M equity return, so Hut 8's real build cost is a little under $3.25B.

## 6. Energy, water, opex

E = MW x `it_utilization` x 8760 h x PUE, with PUE from `pue__<cooling>`. PUE and WUE are for each exact design, read from Figure 4.4 of LBNL's 2024 United States Data Center Energy Usage Report (median and middle half of LBNL's simulated sites, read to about 0.01): liquid cooling with dry coolers (large-scale class) PUE 1.09 (1.08 to 1.11), WUE 0; liquid cooling with towers, a waterside economizer and water-cooled chillers (large-scale) PUE 1.13 (1.11 to 1.15), WUE 1.96 (1.85 to 2.11) L/kWh; air cooling on air-cooled chillers with dry-cooler free cooling (midsize class, the closest LBNL row) PUE 1.59 (1.51 to 1.68), WUE about 0.05. These replace the earlier fleet averages (LBNL's 2028 US projection, the AWS fleet, the Uptime survey).

Air side: a liquid rack still sends `liquid_air_heat_share` of its heat to air (about 10%, Lenovo's GB300 guide; 15% in Vertiv's GB300 datasheet as the high end). That heat is taken by fan walls of `fan_wall_unit_kw` (500 kW, Vertiv CoolLoop Thermal Wall CA80): units = MW x share x 1000 / 500, before any spares. The fan walls are ordered with the other cooling equipment and gate the mechanical fit-out. An air hall sends all its heat to air. Electricity cost = E x `industrial_price_c_per_kwh__<state>` (EIA, industrial, latest month). Water = MW x utilization x 8760 x `wue__<cooling>` litres, shown in million US gallons. Staff, maintenance and other opex = `opex_staff_maint_per_mw_year` x MW. Hybrid plans buy grid electricity for the grid share only and burn gas for the onsite share, at `heat_rate_<plant>_btu_per_kwh` x `gas_price_usd_per_mmbtu` (a Henry Hub price with no basis or transport adder, an assumption). Bridge plans are shown at steady state on the grid with the plant as backup, plus a separate figure for the gas burned per year while on bridge power.

## 7. Levers

Each lever re-runs the plan with one change and reports the difference in first token (months), the developer's build cost (midpoint), opex (midpoint) and the rent those months are worth. The page lists only the levers that save time, ranked by months saved, as "saves X months for $Y". The "build in another state" lever is the fastest state in the pack for the same inputs.

## 8. The study

`scripts/make_report.py` runs the same model through `scripts/plan.mjs` and writes the LaTeX study from the result and the pack. Every figure carries a source number that resolves in the appendix; derived and assumed values say so; the first mention of a company, agency or programme says in a few words what it is. The study is built with a fixed preamble so every study looks the same.

## 9. What the model does not do

It does not know your queue position, your utility's tariff, your county's board or your vendor's slot. It does not model phased energization in detail, demand response, or the time value of money. It uses national or state averages where the pack has nothing closer. It is a planning model; re-run it as the real figures come in, and verify every figure against its source before relying on it.
