# Methodology

How Time to First Token turns the inputs and the data pack into a plan. Every id in backticks is a value in `data/pack.json`, where its source, publisher, read date and note live.

## 1. Inputs

Location (state and nearest metro, which fixes the grid region through `iso__<state>`), IT load in MW (critical IT load, not facility load), power strategy (grid only, onsite bridge, hybrid) and the onsite plant type, redundancy (N+1, 2N, Tier IV), cooling (direct liquid with dry coolers, direct liquid with towers, air), accelerator generation and rack density, project start and target go-live. Two levers can be switched on: order the transformers at project start, and serve the first token from a first phase of racks.

## 2. Tasks and the critical path

The plan is a critical-path calculation (CPM) over the tasks below, in the order a site is really built. Each task has a duration from the pack and predecessors; a predecessor written as (task, f) means the task may start once that predecessor is a fraction f done, which is how the fit-outs overlap the shell and the white space overlaps the fit-outs.

| Task | Duration (pack id) | After |
|---|---|---|
| Survey, geotech and planning | `survey_geotech_months` | start |
| Design and engineering to permit and order release | `design_months` | survey |
| Zoning and site plan approval | `zoning_months` (or `zoning_months__<state>`) | start |
| Building permit | `site_plan_building_permit_months` | zoning, design |
| Air permit | `air_permit_minor_months` (standby generators) or `air_permit_major_months` (onsite turbines or engines), state-scoped where the pack has it | design |
| Cooling-water discharge permit (towers only) | `water_permit_months` | design |
| Large-load interconnection study | `large_load_study_months` (or `__<ISO>`) | start |
| Large power transformers | `lead_lpt_months` | study (or start, with the lever) |
| Substation civil, structures and switchyard | `substation_build_months` | study |
| Utility energization | the later of the works finishing and `utility_energization_wait_months` (or `__<state>`) from project start | substation, transformers |
| Onsite plant, order and lead time | `lead_<plant>_months` | start |
| Onsite plant, install and connect | `install_<plant>_months` x size scale | plant order, foundations, air permit |
| Grading, fence and road | `grading_civil_months` x size scale | survey, zoning |
| Foundations | `foundations_months` x size scale | grading, building permit |
| Steel, roof and walls | `shell_steel_roof_months` x size scale | foundations |
| Switchgear and UPS, order | max(`lead_switchgear_months`, `lead_ups_months`) | design |
| Standby generators, order | `lead_genset_months` | design |
| Cooling equipment, order | `lead_chiller_months` (or `lead_crah_months` for air); CDUs `lead_cdu_months` | design |
| Electrical fit-out | `electrical_fitout_months` x size scale (x `redundancy_2n_electrical_time_factor` for 2N and Tier IV) | (shell, 0.67), switchgear, generators, air permit |
| Mechanical fit-out | `mechanical_fitout_months` x size scale | (shell, 0.67), cooling equipment |
| White space | `whitespace_fitout_months` x size scale | (electrical, 0.5), (mechanical, 0.5) |
| Cx L1 to L2 | `cx_l1_l2_months` | (electrical, 0.6), (mechanical, 0.6) |
| Cx L3 to L4 | `cx_l3_l4_months` x size scale | L1 to L2, white space |
| Cx L5, integrated systems test | `cx_l5_ist_months` (or `_air`) x size scale, plus `tier4_cx_extra_months` for Tier IV | L3 to L4, power (onsite plant, or utility energization), water permit |
| GPU racks installed | `gpu_install_months_per_100mw` x size scale (x `lever_first_phase_share` with the first-phase lever) | L5 |
| Cluster bring-up and burn-in | `cluster_bringup_months` | racks |

Size scale: construction durations are multiplied by (MW / 100) ^ `construction_scale_exponent`, so a 1 GW campus phased across buildings takes about 1.8 times as long per task as 100 MW. The exponent is an assumption and is labelled as one.

Time to first token is the end of bring-up. Full grid power is the utility energization when the plan runs on onsite power first. Float is computed against first token, so a task on the critical path has zero float; the utility energization in a bridge-power plan can finish after first token and then carries no criticality.

Stage dates on the rail are the end of each stage's last task; the Power stage ends when the power that feeds the integrated systems test is available.

## 3. Stress tests

Each stress test adds `stress_<kind>_months` to one task: transformer slip to the transformer lead time, interconnection study delay to the study, permit challenge to zoning, turbine lead-time extension to the onsite plant lead time, utility energization delay to the wait, GPU allocation delay to the rack install, labour shortage to the electrical fit-out. The slip is waited out first (the site stands still) and the work then runs. The impact in the risk register is the change in first token when the stress is replayed; a zero means the task has float.

## 4. Risk likelihoods

`risk_<kind>_likelihood` = share of projects late by three or more months (JLL 2026) x share of delays driven by equipment, power availability or permitting (Uptime Institute 2025). The labour likelihood is the share of operators reporting difficulty hiring (Uptime). These are stated as derived values and the arithmetic is in each note.

## 5. Capex

Facility capex per MW is the Cushman & Wakefield 2026 US all-in range (excluding accelerators) split by its published cost shares into site, shell and core, power infrastructure, mechanical and fit-out and fees, and contingency (`capex_*_per_mw`, each with low and high). Multiplied by MW and by:

- redundancy factor: 1 for N+1; `redundancy_2n_capex_factor` for 2N (one plus the power-infrastructure share times the UPS doubling Schneider reports); `redundancy_tier4_capex_factor` for Tier IV (the 2N factor times the Tier IV premium over Tier III);
- cooling factor: 1 for liquid; `capex_air_cooling_factor` for air (the JLL liquid-cooling premium removed);
- metro factor: `capex_metro_index__<state>` / `capex_metro_index_base` where the pack has a city index, otherwise 1.

Onsite plant: served kW x `onsite_oversize_factor` (kW of generation per kW of IT) x `capex_<plant>_per_kw`, or for solar with batteries `solar_bess_pv_ratio` kW of PV per kW served at `capex_solar_per_kw` plus `solar_bess_hours` of battery at `capex_bess_per_kwh`. Hybrid serves `hybrid_onsite_share` of the load onsite.

Accelerator racks: `compute_capex_per_mw__<gpu>` x MW, kept as a separate line because the facility benchmarks exclude it.

## 6. Energy, water, opex

E = MW x `it_utilization` x 8760 h x PUE, with PUE from `pue__<cooling>`. Electricity cost = E x `industrial_price_c_per_kwh__<state>` (EIA, industrial, latest month). Water = MW x utilization x 8760 x `wue__<cooling>` litres, shown in million US gallons. Staff, maintenance and other opex = `opex_staff_maint_per_mw_year` x MW. Onsite gas plants burn fuel at `heat_rate_<plant>_btu_per_kwh` x `gas_price_usd_per_mmbtu` for the share of load they serve; on bridge power the electricity line is replaced by the fuel line until energization.

## 7. Levers

Each lever re-runs the plan with one change and reports the difference in first token (months), all-in capex (midpoint) and opex (midpoint). The "build in another state" lever is the fastest state in the pack for the same inputs.

## 8. The study

`scripts/make_report.py` runs the same model through `scripts/plan.mjs` and writes the LaTeX study from the result and the pack. Every figure carries a source number that resolves in the appendix; derived and assumed values say so; the first mention of a company, agency or programme says in a few words what it is. The study is built with a fixed preamble so every study looks the same.

## 9. What the model does not do

It does not know your queue position, your utility's tariff, your county's board or your vendor's slot. It does not model phased energization in detail, demand response, or the time value of money. It uses national or state averages where the pack has nothing closer. It is a planning model; re-run it as the real figures come in, and verify every figure against its source before relying on it.
