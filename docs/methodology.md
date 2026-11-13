# Methodology

How Time to First Token turns the inputs and the data pack into a plan. Every id in backticks is a value in `data/pack.json`, where its source, publisher, read date and note live.

## 1. Inputs

Location (state and nearest metro, which fixes the grid region through `iso__<state>`), IT load in MW (critical IT load, not facility load), power strategy (grid only, onsite bridge, hybrid) and the onsite plant type, redundancy (N+1, 2N, or 2N with Uptime Tier IV certification), cooling (direct liquid with dry coolers, direct liquid with towers, air), accelerator generation and rack density, project start and target go-live. Two levers can be switched on: order the transformers at project start, and serve the first token from a first phase of racks.

Input rules, applied by `normalizeInputs` in `js/model.js` before every plan (so old share links and study requests are brought inside them, with a note on screen and in the study):

- Rack density stays inside the published range of the chosen rack, `gpu_<gpu>` low to high (GB200 NVL72 120 to 132 kW, GB300 NVL72 135 to 155 kW, Vera Rubin NVL144 120 to 130 kW).
- Air cooling can be chosen only when the rack is at or under `air_cooling_max_kw_per_rack` (50 kW, Uptime Institute) and is not sold liquid-only. GB200, GB300 and Vera Rubin are liquid-only (`liquid_only__<gpu>`, from NVIDIA's own product pages for GB200 and GB300, and a trade report of NVIDIA's OCP talk for Vera Rubin). The DGX B200, NVIDIA's air-cooled eight-GPU system (14.3 kW each, NVIDIA), is in the pack at 2 to 4 systems a rack (28.6 to 57.2 kW), so air can be picked at 50 kW or less. A plan that asks for air on a liquid-only rack is switched to liquid with dry coolers.
- Vera Rubin rack power is marked uncertain. NVIDIA's own Vera Rubin page gives no rack figure; second-hand reports run from 120 kW (Introl, from GTC 2025) to 190 to 230 kW (Hashrate Index). The pack uses 190 kW with the full 120 to 230 kW range.

Power is grid, onsite gas, fuel cells or solar with batteries. Wind is not offered: it is not firm power, so it cannot carry a data center on its own.

## 2. Tasks and the critical path

Cooling lead times are per equipment type, from Terrapin Construction Group's November 2026 planning figures (order to shipment): air-cooled chillers 24 to 40 weeks, water-cooled centrifugal chillers 30 to 52, dry coolers 20 to 30, cooling towers 14 to 26, CDUs 16 to 26, fan walls and CRAH units 11 to 20. These replace the single 42-week US average used before.

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
| Chillers, order | `lead_chiller_air_months` (air-cooled, for dry-cooler and air plants) or `lead_chiller_water_months` (water-cooled, for towers) | (design, 0.5) |
| Dry coolers or towers, order | `lead_drycooler_months` or `lead_tower_months` | (design, 0.5) |
| CDUs, order (liquid halls) | `lead_cdu_months` | (design, 0.5) |
| Fan walls, order | `lead_crah_months` | (design, 0.5) |
| Accelerator order and allocation | `lead_accelerator_months` (assumption) | (design, 0.5) |
| Electrical fit-out | `electrical_fitout_months` x size scale (x `redundancy_2n_electrical_time_factor` for 2N) | (shell, 0.67), switchgear |
| Mechanical fit-out | `mechanical_fitout_months` x size scale | (shell, 0.67), chillers, dry coolers or towers, CDUs, fan walls |
| White space | `whitespace_fitout_months` x size scale | (electrical, 0.5), (mechanical, 0.5) |
| Cx L1 to L2 (factory witness, receipt) | `cx_l1_l2_months` | (switchgear, 0.8), (chillers, 0.8) |
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
- cooling factor: 1 for liquid; `capex_air_cooling_factor` for air (the JLL liquid-cooling premium removed); towers add `capex_tower_plant_extra_per_mw` to the mechanical line (Terrapin Construction Group, a design-build contractor: an installed water-cooled plant with towers costs $2,800 to $4,800 a ton against $2,200 to $3,600 for an air-cooled plant, which stands in for the dry-cooler plant);

Onsite plant: served kW x `onsite_oversize_factor` (kW of generation per kW of IT) x `capex_<plant>_per_kw`, or for solar with batteries `solar_bess_pv_ratio` kW of PV per kW served at `capex_solar_per_kw` plus `solar_bess_hours` of battery at `capex_bess_per_kwh`. Hybrid serves `hybrid_onsite_share` of the load onsite.

Accelerator racks: `compute_capex_per_mw__<gpu>` x MW. This is the tenant's cost, not the developer's (see section 5a), so it sits outside the headline build cost.

## 5a. Landlord view

Developers such as Hut 8 build and own the land, building, power and cooling, and lease the finished hall on a 15-year triple-net lease; the tenant pays the running costs and brings its own GPUs (`lease_tenant_brings_compute`). So the headline cost is the developer's build cost (facility and power), and the GPUs are a separate "tenant's cost" line.

- Rent per year = MW x `rent_per_mw_year`. The value is Hut 8's River Bend lease, $7.0B over 15 years for 245 MW = $1.905M per MW-year (3% escalator included in the total); the low end is Beacon Point, $9.8B over 15 years for 352 MW = $1.856M.
- Rent as a share of build cost = rent per year / midpoint build cost.
- Rent lost per month of delay = rent per year / 12. Months late against the target times that figure is the rent the plan loses.
- Check case: River Bend's $3.25B of construction notes, which fully fund the 245 MW building and its substation (`check_river_bend_build_busd`), against $0.467B of rent a year is 14.4% a year (`check_river_bend_rent_share`). The model's own build cost for 245 MW in Texas is $3.6B to $4.3B, so it gives 11.8%; the notes also cover reserves and a $184M equity return, so Hut 8's real build cost is a little under $3.25B.

## 6. Energy, water, opex

E = MW x `it_utilization` x 8760 h x PUE, where PUE is the annual value from the climate model in 6a. Electricity cost = E x `industrial_price_c_per_kwh__<state>` (EIA, industrial, latest month). Water = MW x utilization x 8760 x WUE litres, shown in million US gallons.

## 6a. Climate-aware cooling

Cooling energy depends on the weather, so PUE and WUE are worked out hour by hour for each state instead of read from one national figure.

Weather. Each state uses one station from NREL's TMY3 data set (NREL is the US national renewable energy lab; TMY3 is a typical meteorological year of 8,760 hourly readings), downloaded from the EnergyPlus weather mirror of the US Department of Energy (`climate_tmy3__<state>`). Where the pack's metro has no TMY3 station the nearest one is used: Ephrata for Quincy, Aberdeen (South Dakota) for Ellendale, Tulsa for Pryor, South Bend for New Carlisle, Ann Arbor for Saline. `scripts/build_climate.py` reads dry-bulb, dew point and pressure, computes wet-bulb with the psychrometer equation, and counts hours in 1 C bins. Dry-bulb drives dry coolers and air-cooled chillers; wet-bulb drives towers.

Heat path. Rack loop > CDU > facility loop > plant (chiller plus a plate exchanger for free cooling) > dry cooler or tower. The temperatures:

| Step | Default | Range | Source |
|---|---|---|---|
| Facility water supply, liquid halls (input) | 32 C | 17 to 45 C | Vertiv's 2.3 MW CDU rating point, ASHRAE class W32; bounds are ASHRAE's W17 and W45 classes |
| CDU approach | 4 K | | Vertiv CoolChip CDU 2300 datasheet |
| Plate exchanger approach | 2 K | | API Heat Transfer, a heat exchanger maker |
| Dry cooler approach to dry-bulb (input) | 10 K | 4 to 15 K | median of makers' data, Wenzel et al. 2023 (University of Stuttgart) |
| Tower approach to wet-bulb (input) | 5 K | 3 to 10 K | same study |
| Fan-wall water (air share, and the supply for air halls) | 20 C | 14 to 26 C | Airedale by Modine, a cooling maker |

The input bounds for the approaches are our choice.

Chiller hours. For each hour, the outdoor device can make water at T_out + approach; the plate exchanger adds its approach. If that is above the supply temperature, the chiller runs that hour; otherwise only fans and pumps run. A liquid hall has two loops: the liquid share (90%, `liquid_air_heat_share`) at the facility supply temperature, and the air share at the fan-wall water temperature. The chiller hours shown are those of the main loop; the air loop's are shown in the hint.

Annual PUE = 1 + e + f x (1 + c) + pumps + w x air share + c, where
- e = `cool_elec_overhead` = 0.04: UPS at 97% (Mitsubishi Electric) is 0.031, plus about 0.01 for transformers, distribution and lighting (our assumption);
- f = fan power per kW rejected: dry coolers 0.0199 (Kelvion datasheet: 10.25 kW of fans for 516 kW), towers 0.0165 (midpoint of 0.012 to 0.021, Wenzel et al.); fans run all year at full power, which leans high;
- pumps: CDU 0.0208 per kW of liquid heat (Vertiv: 47.8 kW for 2,300 kW), facility pumps 0.0125 (ASHRAE 90.1 Appendix G, 22 W per gpm at a 12 F rise), condenser pumps 0.013 for towers only (19 W per gpm at a 10 F range);
- w = fan walls 0.051 per kW (Vertiv CoolLoop CA80: 25.5 kW for 500 kW);
- c = compressor energy averaged over the year: in each chiller hour, the loop's heat / COP. COP is the code minimum at full load: 2.96 for air-cooled chillers (dry-cooler and air plants), 6.28 for water-cooled centrifugal chillers (tower plants), from ASHRAE 90.1 Table 6.8.1-3 as reprinted in the Washington State Energy Code. With warm water the lift is smaller and real chillers do better, so this leans high.

WUE. Dry coolers and air-cooled chillers evaporate nothing: WUE 0. Towers: evaporation is 0.85% of the circulating flow per 10 F of range (Delta Cooling Towers, a tower maker), which is 1.316 L per kWh of heat; blowdown at 5 cycles of concentration adds a quarter (POWER magazine); the heat rejected is the IT load plus the cooling energy. WUE scales with the heat rejected; the share of heat that leaves by evaporation is held fixed, so cold-weather sensible cooling is not credited (WUE leans high in winter).

Calibration check. At the default 32 C, dry coolers come out at 1.15 to 1.32 and towers at 1.11 to 1.12 across the 18 states, with WUE 1.76 to 1.78 for towers. LBNL's Figure 4.4 gives 1.09 for dry coolers and 1.13 for towers. LBNL's dry-cooler case assumes warm water (ASHRAE W45); at 45 C the model gives 1.11 to 1.13 at the mild sites (Oregon, Ohio, Pennsylvania, Michigan), within 0.03 of LBNL without any tuning. The rest of the gap is the conservative choices above. Air halls at 20 C water come out at 1.29 to 1.45, under LBNL's 1.59, which is for the midsize class; the model has no midsize penalty and uses modern 20 C chilled water.

What it means. Towers always save power, because wet-bulb is lower than dry-bulb; dry coolers always save water. The gap is widest in hot or humid states: at 32 C, Arizona 0.21, Texas 0.16, Tennessee 0.14, Georgia 0.14; in the coolest states (Wyoming, Oregon) it is about 0.05.

Air side: a liquid rack still sends `liquid_air_heat_share` of its heat to air (about 10%, Lenovo's GB300 guide; 15% in Vertiv's GB300 datasheet as the high end). That heat is taken by fan walls of `fan_wall_unit_kw` (500 kW, Vertiv CoolLoop Thermal Wall CA80): units = MW x share x 1000 / 500, before any spares. The fan walls are ordered with the other cooling equipment and gate the mechanical fit-out. An air hall sends all its heat to air. Staff, maintenance and other opex = `opex_staff_maint_per_mw_year` x MW. Hybrid plans buy grid electricity for the grid share only and burn gas for the onsite share, at `heat_rate_<plant>_btu_per_kwh` x `gas_price_usd_per_mmbtu` (a Henry Hub price with no basis or transport adder, an assumption). Bridge plans are shown at steady state on the grid with the plant as backup, plus a separate figure for the gas burned per year while on bridge power.

## 7. Levers

Each lever re-runs the plan with one change and reports the difference in first token (months), the developer's build cost (midpoint), opex (midpoint) and the rent those months are worth. The page lists only the levers that save time, ranked by months saved, as "saves X months for $Y". The "build in another state" lever is the fastest state in the pack for the same inputs.

## 8. The study

`scripts/make_report.py` runs the same model through `scripts/plan.mjs` and writes the LaTeX study from the result and the pack. Every figure carries a source number that resolves in the appendix; derived and assumed values say so; the first mention of a company, agency or programme says in a few words what it is. The study is built with a fixed preamble so every study looks the same.

## 9. What the model does not do

It does not know your queue position, your utility's tariff, your county's board or your vendor's slot. It does not model phased energization in detail, demand response, or the time value of money. It uses national or state averages where the pack has nothing closer. It is a planning model; re-run it as the real figures come in, and verify every figure against its source before relying on it.
