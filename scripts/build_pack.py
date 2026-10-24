#!/usr/bin/env python3
"""Assemble data/pack.json, the one data pack the planner and the report read.

Inputs: the three research files in data/research/ (every value in them was read from the cited page on the
date in `accessed`). This script picks the values the model needs, converts units (weeks to months, $/kW to
$M/MW), derives the few numbers that are arithmetic on sourced values, and labels the handful of assumptions
that have no public source. Nothing is typed in here without one of those three labels:

  sourced     read straight off the cited page (unit conversion only)
  derived     arithmetic on sourced values; the note says the arithmetic
  assumption  ours; no public figure was found; shown as "assumption" in the UI and the report

Run: python3 scripts/build_pack.py   (writes data/pack.json; prints the id list and any missing research ids)
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "data" / "research"
VERSION = "2026.10.24"
ACCESSED = "2026-10-24"

research = {}
for f in ["pack_power.json", "pack_schedule.json", "pack_cost.json"]:
    for v in json.load(open(RES / f))["values"]:
        research[v["id"]] = v

OUT = []
IDS = set()
W2M = 12 / 52.1775  # weeks to months


def src(rid):
    v = research.get(rid)
    if not v:
        print("MISSING research id:", rid, file=sys.stderr); sys.exit(1)
    return v


def put(id, label, category, value, unit, kind, scope="US", from_ids=(), low=None, high=None, note="", text=None, **over):
    """One pack value. Source fields are copied from the first research id in from_ids."""
    if id in IDS:
        raise SystemExit(f"duplicate id {id}")
    IDS.add(id)
    d = {"id": id, "label": label, "category": category, "value": value, "unit": unit, "kind": kind, "scope": scope}
    if low is not None: d["low"] = low
    if high is not None: d["high"] = high
    if text is not None: d["text"] = text
    if from_ids:
        s = src(from_ids[0])
        for k in ["source_title", "source_url", "publisher", "published", "accessed", "quote"]:
            d[k] = s.get(k, "")
        if len(from_ids) > 1:
            d["also_from"] = [src(x)["source_url"] for x in from_ids[1:]]
    else:
        d.update({"source_title": "", "source_url": "", "publisher": "Time to First Token (assumption)", "published": VERSION, "accessed": ACCESSED, "quote": ""})
    d["note"] = note
    d.update(over)
    OUT.append(d)
    return d


def wk(rid, lo=None, hi=None):
    v = src(rid)
    return round(v["value"] * W2M, 1), (round(v["low"] * W2M, 1) if v.get("low") is not None else None), (round(v["high"] * W2M, 1) if v.get("high") is not None else None)


# ---------------------------------------------------------------------------------------------------------
# states, grid regions, prices
# ---------------------------------------------------------------------------------------------------------
STATES = [
    ("TX", "Texas", "Dallas-Fort Worth", "ERCOT", "Large loads go through the ERCOT batch process, and Texas SB6 (2025) applies above 75 MW."),
    ("VA", "Virginia", "Northern Virginia", "PJM", "This is the Dominion zone: the deepest market and the longest utility waits."),
    ("OH", "Ohio", "Columbus", "PJM", "AEP Ohio territory, where a data-center tariff is in force."),
    ("GA", "Georgia", "Atlanta", "SERC (Georgia Power)", "Georgia Power is a vertically integrated utility with a large-load pipeline over 50 GW."),
    ("AZ", "Arizona", "Phoenix", "WECC (APS/SRP)", "Air permits run through Maricopa County, and APS has 4.5 GW of committed load."),
    ("NV", "Nevada", "Reno", "WECC (NV Energy)", "NV Energy holds about 6 GW of large-load agreements."),
    ("IL", "Illinois", "Chicago", "PJM (ComEd)", "The ComEd zone of PJM."),
    ("PA", "Pennsylvania", "Pittsburgh", "PJM", "Pennsylvania DEP publishes its air permit timelines."),
    ("OR", "Oregon", "Hillsboro", "WECC (PGE)", "Outside any ISO, served by Portland General Electric."),
    ("WA", "Washington", "Quincy", "WECC (BPA/Grant PUD)", "Outside any ISO, with one of the lowest industrial power prices."),
    ("IA", "Iowa", "Des Moines", "MISO (SPP in the west)", "Des Moines is in MISO, which runs the ERAS fast track for ready projects; western Iowa is in SPP."),
    ("WY", "Wyoming", "Cheyenne", "WECC (PacifiCorp)", "Outside any ISO, served by PacifiCorp."),
    ("ND", "North Dakota", "Ellendale", "MISO/SPP", "A mixed footprint; Ellendale is in MISO."),
    ("NC", "North Carolina", "Charlotte", "SERC (Duke)", "Duke Energy is a vertically integrated utility."),
    ("TN", "Tennessee", "Memphis", "TVA", "TVA is a federal utility, and Tennessee has the lowest industrial price in the pack."),
    ("OK", "Oklahoma", "Pryor", "SPP", "SPP runs the HILL study process for large loads."),
    ("IN", "Indiana", "New Carlisle", "MISO/PJM", "A mixed footprint; New Carlisle is in MISO."),
    ("MI", "Michigan", "Saline", "MISO", "Served through MISO."),
]
ISO_OF = {}
for code, name, metro, iso, note in STATES:
    ISO_OF[code] = iso.split(" ")[0].split("/")[0]
    put(f"iso__{code}", f"Grid region, {name}", "interconnection", 0, "", "sourced", code, (f"grid_region_{code.lower()}",), text=iso, note=f"Balancing authority or ISO for {metro}. {note}")
    put(f"industrial_price_c_per_kwh__{code}", f"Industrial electricity price, {name}", "energy", src(f"elec_price_industrial_cents_kwh_{code.lower()}")["value"], "cents per kWh", "sourced", code, (f"elec_price_industrial_cents_kwh_{code.lower()}",), note="EIA Electric Power Monthly, August 2026, preliminary.")
put("industrial_price_c_per_kwh", "Industrial electricity price, US average", "energy", src("elec_price_industrial_cents_kwh_us")["value"], "cents per kWh", "sourced", "US", ("elec_price_industrial_cents_kwh_us",), note="EIA Electric Power Monthly, August 2026, preliminary.")

# ---------------------------------------------------------------------------------------------------------
# land and permits
# ---------------------------------------------------------------------------------------------------------
v = src("phase_planning_feasibility_months")
put("survey_geotech_months", "Survey, geotech and planning", "permit", v["value"], "months", "sourced", "US", ("phase_planning_feasibility_months",), v["low"], v["high"], note="Planning and feasibility phase, which carries the survey and geotechnical work. Industry guide (secondary).")
v = src("phase_design_months")
put("design_months", "Design and engineering to permit and order release", "construction", v["low"], "months", "derived", "US", ("phase_design_months",), v["low"], v["high"], note="Low end of the 6 to 12 month design phase (industry guide, secondary): early design packages release the building permit and the long-lead orders; design continues alongside construction.")
v = src("phase_permits_approvals_months")
put("zoning_months", "Zoning and approvals", "permit", v["value"], "months", "sourced", "US", ("phase_permits_approvals_months",), v["low"], v["high"], note="Permits and approvals phase. Industry guide (secondary).")
v = src("site_plan_pwc_total_elapsed_months")
put("zoning_months__VA", "Zoning and site plan, Virginia", "permit", round(v["value"], 1), "months", "derived", "VA", ("site_plan_pwc_total_elapsed_months", "zoning_loudoun_byright_eliminated"), note="Prince William County, in Northern Virginia, FY26 elapsed site-plan time; neighbouring Loudoun ended by-right data centers in March 2025, so a rezoning case is the norm")
v = src("building_permit_pwc_major_new_construction_days")
put("site_plan_building_permit_months", "Building permit", "permit", round(v["value"] / 30.44, 1), "months", "derived", "US", ("building_permit_pwc_major_new_construction_days",), note="152 county review days for major new construction in Prince William County, Northern Virginia, in months, used as the US default")
v = src("air_permit_va_synthetic_minor_months")
put("air_permit_minor_months", "Air permit, minor source", "permit", v["value"], "months", "sourced", "US", ("air_permit_va_synthetic_minor_months",), v["low"], v["high"], note="synthetic minor permit, Virginia DEQ timeline as reported by a permitting consultancy, used as the US default; standby generators alone usually stay minor.")
v = src("air_permit_va_psd_titlev_months")
put("air_permit_major_months", "Air permit, major source (PSD and Title V)", "permit", v["value"], "months", "sourced", "US", ("air_permit_va_psd_titlev_months", "air_psd_major_source_other_tpy"), v["low"], v["high"], note="PSD plus Title V, Virginia timeline, used as the US default; onsite gas turbines or engine fleets at data-center scale are usually major sources.")
put("air_permit_minor_months__TX", "Air permit, minor source, Texas", "permit", round(src("air_permit_tceq_standard_permit_notice_days")["value"] / 30.44, 1), "months", "derived", "TX", ("air_permit_tceq_standard_permit_notice_days",), note="TCEQ standard permit with notice, 150 target days / 30.44.")
put("air_permit_major_months__TX", "Air permit, major source, Texas", "permit", round(src("air_permit_tceq_federal_nsr_psd_days")["value"] / 30.44, 1), "months", "derived", "TX", ("air_permit_tceq_federal_nsr_psd_days",), note="TCEQ federal NSR (PSD) target 330 days / 30.44.")
v = src("air_permit_maricopa_titlev_final_action_months")
put("air_permit_major_months__AZ", "Air permit, major source, Arizona", "permit", v["value"], "months", "sourced", "AZ", ("air_permit_maricopa_titlev_final_action_months",), v["low"], v["high"], note="Maricopa County Title V final action.")
v = src("air_permit_maricopa_nontitlev_final_action_days")
put("air_permit_minor_months__AZ", "Air permit, minor source, Arizona", "permit", round((v["low"] + v["high"]) / 2 / 30.44, 1), "months", "derived", "AZ", ("air_permit_maricopa_nontitlev_final_action_days",), round(v["low"] / 30.44, 1), round(v["high"] / 30.44, 1), note="Maricopa non-Title V final action 90 to 270 days; midpoint / 30.44.")
v = src("air_permit_pa_minor_source_months"); put("air_permit_minor_months__PA", "Air permit, minor source, Pennsylvania", "permit", v["value"], "months", "sourced", "PA", ("air_permit_pa_minor_source_months",), v["low"], v["high"])
v = src("air_permit_pa_major_source_months"); put("air_permit_major_months__PA", "Air permit, major source, Pennsylvania", "permit", v["value"], "months", "sourced", "PA", ("air_permit_pa_major_source_months",), v["low"], v["high"])
v = src("npdes_individual_permit_wa_receipt_to_complete_days")
put("water_permit_months", "Water supply agreement and discharge approval (proxy)", "permit", round((v["value"] + 36) / 30.44, 1), "months", "derived", "US", ("npdes_individual_permit_wa_receipt_to_complete_days",), note="Washington individual NPDES, 210 days receipt-to-complete plus 36 days public notice, in months, used as the US default for tower cooling")

# ---------------------------------------------------------------------------------------------------------
# power: interconnection, utility, transformers, onsite
# ---------------------------------------------------------------------------------------------------------
v = src("interconnection_emt_study_months")
put("large_load_study_months", "Large-load interconnection study", "interconnection", v["value"], "months", "sourced", "US", ("interconnection_emt_study_months", "ferc_o2023_cluster_study_days"), v["low"], v["high"], note="EMT study duration for large loads, from the Brattle Group, an economic consultancy; in PJM the utility, not the ISO, runs the load study")
put("large_load_study_months__ERCOT", "Large-load study, ERCOT", "interconnection", src("interconnection_ercot_batch_zero_study_months")["value"], "months", "sourced", "ERCOT", ("interconnection_ercot_batch_zero_study_months", "ercot_ll_batch_cadence_months"), note="ERCOT, the Texas grid operator: Batch Zero study of 9 months, with batches about every 6 months")
put("large_load_study_months__MISO", "Large-load study, MISO (ERAS)", "interconnection", round(src("miso_eras_ia_target_days")["value"] / 30.44, 1), "months", "derived", "MISO", ("miso_eras_ia_target_days",), note="MISO ERAS 90-day target to an interconnection agreement / 30.44.")
put("large_load_study_months__SPP", "Large-load study, SPP (HILL)", "interconnection", round(src("spp_hill_study_days")["value"] / 30.44, 1), "months", "derived", "SPP", ("spp_hill_study_days",), note="SPP HILL 90-day study / 30.44.")
v = src("dc_power_wait_national_avg_years")
put("utility_energization_wait_months", "Utility energization wait, request to power", "interconnection", v["value"] * 12, "months", "derived", "US", ("dc_power_wait_national_avg_years", "interconnection_median_request_to_cod_years"), note="national average wait for data-center power, 4 years per JLL, a commercial real estate firm (2026), in months; LBNL's generator median is 5 years request-to-COD")
v = src("interconnection_dominion_large_load_wait_years")
put("utility_energization_wait_months__VA", "Utility energization wait, Virginia (Dominion)", "interconnection", v["value"] * 12, "months", "derived", "VA", ("interconnection_dominion_large_load_wait_years", "dominion_dc_contracted_gw"), v["low"] * 12, v["high"] * 12, note="a letter from Dominion Energy, the Virginia utility: 4 to 7 years for new large loads, in months; 54 GW contracted against a 4.8 GW billing peak")
m, lo, hi = wk("lead_lpt_weeks"); m2, lo2, hi2 = wk("lead_lpt_range_weeks_2024")
put("lead_lpt_months", "Large power transformer lead time", "lead_time", m, "months", "derived", "US", ("lead_lpt_weeks", "lead_lpt_range_weeks_2024", "lead_gsu_weeks"), lo2, hi2, note="128 weeks average (Wood Mackenzie with American Clean Power, 2025), with the 80 to 210 week range from Wood Mackenzie's 2024 survey, in months; GSU transformers run 143 weeks")
put("substation_build_months", "Substation, need to in-service", "construction", src("substation_need_to_inservice_months")["value"], "months", "sourced", "US", ("substation_need_to_inservice_months",), note="an example from Dominion Energy, the Virginia utility, in PJM filings, used as the US default")
put("gas_supply_months", "Gas supply: pipeline lateral and supply agreement", "construction", 18, "months", "assumption", "US", (), 12, 30, note="No public figure found for a data-center-scale lateral and firm supply agreement; 18 months (12 to 30) is our assumption. It gates the onsite plant's connection.")
put("lead_accelerator_months", "Accelerator order to delivery", "lead_time", 9, "months", "assumption", "US", (), 6, 12, note="No public allocation lead time for NVL72-class racks; 9 months (6 to 12) is our assumption, released from the basis of design.")
put("transmission_build_months", "Transmission and line works", "construction", 0, "months", "assumption", "US", note="Utility line works are counted inside the energization wait above rather than as a separate task; a dedicated 345 kV line would add years (Grid Strategies: 6 to 10 years for large builds).")
put("lead_gas_turbine_months", "Gas turbine lead time", "lead_time", src("lead_gas_turbine_years")["value"] * 12, "months", "derived", "US", ("lead_gas_turbine_years", "eia_lead_time_ct_years", "siemens_gas_turbine_booked_out_fy"), src("eia_lead_time_ct_years")["value"] * 12, src("lead_gas_turbine_years")["value"] * 12, note="Siemens Energy, a turbine maker: 3 or more years for new turbines, where EIA's pre-shortage assumption was 2 years; Siemens is booked out to FY2028")
m, lo, hi = wk("lead_generator_weeks")
put("lead_recip_months", "Reciprocating engine lead time", "lead_time", m, "months", "derived", "US", ("lead_generator_weeks",), lo, hi, note="generator sets are reciprocating engines: 60 to 100 weeks per Cushman & Wakefield, a commercial real estate firm, in months")
put("lead_fuel_cell_months", "Fuel cell lead time", "lead_time", round(src("lead_fuel_cell_bloom_days")["value"] / 30.44, 1), "months", "derived", "US", ("lead_fuel_cell_bloom_days",), note="Bloom Energy, a fuel cell maker: 90 days, a vendor claim, in months")
m, lo, hi = wk("equipment_lead_time_us_average_weeks")
put("lead_solar_bess_months", "Solar and battery equipment lead time", "lead_time", m, "months", "derived", "US", ("equipment_lead_time_us_average_weeks",), note="no solar or battery specific lead time found; the US average equipment lead time of 42 weeks from JLL, a commercial real estate firm, is used")
pi = src("stage_power_infrastructure_months")["value"]
for k in ["gas_turbine", "recip", "fuel_cell", "solar_bess"]:
    put(f"install_{k}_months", f"Onsite plant install, {k.replace('_', ' ')}", "construction", pi, "months", "sourced", "US", ("stage_power_infrastructure_months",), note="power infrastructure stage duration from an industry build guide (secondary), used for the onsite plant install")

# ---------------------------------------------------------------------------------------------------------
# construction and commissioning
# ---------------------------------------------------------------------------------------------------------
put("grading_civil_months", "Grading, fence and road", "construction", 3, "months", "assumption", "US", (), 2, 4, note="No public duration found for the civil package alone; 3 months (2 to 4) is our assumption, inside the industry guide's construction phase.")
fs = src("stage_foundation_and_shell_months")["value"]
put("foundations_months", "Foundations", "construction", round(fs / 3, 1), "months", "derived", "US", ("stage_foundation_and_shell_months",), note="One third of the 6-month foundation-and-shell stage (industry guide, secondary).")
put("shell_steel_roof_months", "Steel, roof and walls", "construction", round(fs * 2 / 3, 1), "months", "derived", "US", ("stage_foundation_and_shell_months", "construction_building_months_jlarc"), note="Two thirds of the 6-month foundation-and-shell stage. JLARC puts a whole building at 12 to 18 months.")
put("electrical_fitout_months", "Electrical fit-out", "construction", src("stage_power_infrastructure_months")["value"], "months", "sourced", "US", ("stage_power_infrastructure_months",), note="Power infrastructure stage (industry guide, secondary).")
put("mechanical_fitout_months", "Mechanical fit-out", "construction", src("stage_cooling_systems_months")["value"], "months", "sourced", "US", ("stage_cooling_systems_months",), note="Cooling systems stage (industry guide, secondary).")
put("air_cooling_fitout_factor", "Mechanical time factor, air cooling", "construction", 1.0, "ratio", "assumption", "US", note="No evidence that air-cooled fit-out is faster or slower; factor 1.")
put("whitespace_fitout_months", "White space fit-out", "construction", src("stage_it_white_space_fitout_months")["value"], "months", "sourced", "US", ("stage_it_white_space_fitout_months",), note="IT and white space stage (industry guide, secondary).")
put("gpu_install_months_per_100mw", "GPU rack install per 100 MW", "construction", round(src("benchmark_xai_colossus_build_days")["value"] / 30.44, 1), "months", "derived", "US", ("benchmark_xai_colossus_build_days",), note="xAI Colossus: 122 days from start to the first training run for about 100,000 GPUs in an existing shell; / 30.44 and treated as the rack install and bring-up of roughly 100 MW. A benchmark, not a standard.")
put("cluster_bringup_months", "Cluster bring-up and burn-in", "commissioning", 1, "months", "assumption", "US", note="No public figure; one month is our assumption for burn-in after the racks are powered.")
put("lever_first_phase_share", "First phase share of racks", "construction", 0.5, "ratio", "derived", "US", ("benchmark_applied_digital_polaris_forge_1_building1_mw",), note="Applied Digital brought a 100 MW building to ready-for-service in two 50 MW steps: 0.5.")
m, lo, hi = wk("commissioning_l1_l5_total_weeks")
put("cx_l1_l2_months", "Commissioning L1 to L2", "commissioning", round(m * 0.3, 1), "months", "derived", "US", ("commissioning_l1_l5_total_weeks",), note="30% of the 10 to 14 week L1 to L5 window (secondary); that window is for a conventional build and already includes its own short IST, so L1 to L4 are taken from it and the L5 figure for a liquid-cooled AI hall is added separately, which is conservative by up to a month")
put("cx_l3_l4_months", "Commissioning L3 to L4", "commissioning", round(m * 0.7, 1), "months", "derived", "US", ("commissioning_l1_l5_total_weeks",), note="70% of the 10 to 14 week L1 to L5 window (secondary).")
m, lo, hi = wk("commissioning_ist_liquid_cooled_ai_weeks")
put("cx_l5_ist_months", "Commissioning L5, integrated systems test", "commissioning", m, "months", "derived", "US", ("commissioning_ist_liquid_cooled_ai_weeks", "commissioning_ist_air_cooled_weeks"), lo, hi, note="IST for a liquid-cooled AI hall, 10 to 14 weeks (secondary); air-cooled halls run 4 to 6 weeks.")
m, lo, hi = wk("commissioning_ist_air_cooled_weeks")
put("cx_l5_ist_months_air", "Commissioning L5, integrated systems test, air-cooled", "commissioning", m, "months", "derived", "US", ("commissioning_ist_air_cooled_weeks",), lo, hi, note="IST for an air-cooled hall, 4 to 6 weeks (secondary) x 12/52.18.")
put("tier4_cx_extra_months", "Tier IV certification visit after L5", "commissioning", src("uptime_tccf_lag_after_construction_months")["value"], "months", "sourced", "US", ("uptime_tccf_lag_after_construction_months", "uptime_tccf_site_visit_days"), note="Uptime Tier Certification of Constructed Facility: site visit after commissioning.")
put("redundancy_2n_electrical_time_factor", "Electrical fit-out time factor, 2N", "construction", 1.1, "ratio", "assumption", "US", note="A second full power path adds equipment and testing; 10% more fit-out time is our assumption.")
put("construction_scale_exponent", "Duration scaling with load", "construction", 0.25, "exponent", "assumption", "US", note="Construction durations scale as (MW/100)^0.25, so 1 GW takes about 1.8x as long as 100 MW per task with the work phased across buildings. Our assumption, calibrated against the JLARC 12 to 18 month building and the 5-year Meta Hyperion campus.")
m, lo, hi = wk("lead_mv_switchgear_weeks")
put("lead_switchgear_months", "MV switchgear lead time", "lead_time", m, "months", "derived", "US", ("lead_mv_switchgear_weeks", "lead_switchgear_weeks"), lo, hi, note="38 to 63 weeks (Cushman & Wakefield) x 12/52.18; Wood Mackenzie reports 44 weeks.")
m, lo, hi = wk("lead_ups_weeks")
put("lead_ups_months", "UPS lead time", "lead_time", m, "months", "derived", "US", ("lead_ups_weeks",), lo, hi, note="30 to 48 weeks (contractor survey, secondary) x 12/52.18.")
m, lo, hi = wk("lead_generator_weeks")
put("lead_genset_months", "Standby generator lead time", "lead_time", m, "months", "derived", "US", ("lead_generator_weeks", "lead_diesel_genset_weeks"), lo, hi, note="60 to 100 weeks (Cushman & Wakefield) x 12/52.18.")
m, lo, hi = wk("equipment_lead_time_us_average_weeks")
for k, lbl in [("chiller", "Chiller and dry cooler lead time"), ("cdu", "CDU lead time"), ("crah", "CRAH unit lead time")]:
    put(f"lead_{k}_months", lbl, "lead_time", m, "months", "derived", "US", ("equipment_lead_time_us_average_weeks", "capex_cooling_equipment_price_rise_pct"), note="No numeric cooling lead time found; the JLL US average equipment lead time of 42 weeks is used. Cooling equipment prices rose 32% (Cushman & Wakefield).")

# ---------------------------------------------------------------------------------------------------------
# stress tests and risks
# ---------------------------------------------------------------------------------------------------------
v = src("lead_lpt_range_weeks_2024"); v1 = src("lead_lpt_weeks")
put("stress_transformer_months", "Transformer slip", "risk", round((v["high"] - v1["value"]) * W2M, 1), "months", "derived", "US", ("lead_lpt_range_weeks_2024", "lead_lpt_weeks"), note="Top of Wood Mackenzie's 2024 range (210 weeks) less the 2025 average (128): 82 weeks, in months")
put("stress_interconnection_months", "Interconnection study delay", "risk", src("ercot_ll_batch_cadence_months")["value"], "months", "sourced", "US", ("ercot_ll_batch_cadence_months",), note="Missing one ERCOT large-load batch costs a full cadence, about 6 months.")
put("stress_permit_months", "Permit challenge", "risk", src("permit_lawsuit_pw_digital_gateway_months")["value"], "months", "derived", "US", ("permit_lawsuit_pw_digital_gateway_months",), note="Prince William Digital Gateway: rezoning voided by a court 20 months after approval.")
put("stress_turbine_months", "Turbine lead-time extension", "risk", (src("lead_gas_turbine_years")["value"] - src("eia_lead_time_ct_years")["value"]) * 12, "months", "derived", "US", ("lead_gas_turbine_years", "eia_lead_time_ct_years"), note="Three or more years today against EIA's two-year planning assumption: 12 months.")
put("stress_utility_months", "Utility energization delay", "risk", src("grid_energisation_added_months_virginia")["value"], "months", "sourced", "US", ("grid_energisation_added_months_virginia",), note="Added grid energization time reported for Virginia (secondary).")
put("stress_gpu_months", "GPU allocation delay", "risk", 3, "months", "assumption", "US", note="No public allocation statistic; one quarter is our assumption.")
put("stress_labour_months", "Labour shortage", "risk", 3, "months", "derived", "US", ("delay_share_projects_late_3mo_2025",), note="JLL: 57% of 2025 projects ran 3 or more months late; the 3-month floor is applied to the electrical fit-out.")
late = src("delay_share_projects_late_3mo_2025")["value"] / 100
eq = src("delay_driver_equipment_pct")["value"] / 100; pw = src("delay_driver_power_availability_pct")["value"] / 100; pm = src("delay_driver_permitting_legislation_pct")["value"] / 100
def lk(id, label, val, ids, note, text):
    put(f"risk_{id}_likelihood", label, "risk", round(val, 2), "probability", "derived", "US", ids, text=text, note=note)
lk("transformer", "Likelihood, transformer slip", late * eq, ("delay_share_projects_late_3mo_2025", "delay_driver_equipment_pct"), "57% of projects late (JLL) x 42% of delays driven by equipment (Uptime).", "24%: 57% of projects late x 42% equipment-driven")
lk("interconnection", "Likelihood, interconnection delay", late * pw, ("delay_share_projects_late_3mo_2025", "delay_driver_power_availability_pct"), "57% late x 25% power-availability driven.", "14%: 57% late x 25% power-driven")
lk("utility", "Likelihood, utility delay", late * pw, ("delay_share_projects_late_3mo_2025", "delay_driver_power_availability_pct"), "57% late x 25% power-availability driven.", "14%: 57% late x 25% power-driven")
lk("permit", "Likelihood, permit challenge", late * pm, ("delay_share_projects_late_3mo_2025", "delay_driver_permitting_legislation_pct"), "57% late x 20% permitting-driven.", "11%: 57% late x 20% permitting-driven")
lk("turbine", "Likelihood, turbine slip", late * eq, ("delay_share_projects_late_3mo_2025", "delay_driver_equipment_pct"), "57% late x 42% equipment-driven.", "24%: 57% late x 42% equipment-driven")
lk("gpu", "Likelihood, GPU delay", late * eq, ("delay_share_projects_late_3mo_2025", "delay_driver_equipment_pct"), "57% late x 42% equipment-driven; the best public proxy.", "24%: equipment-driven delay share")
put("risk_labour_likelihood", "Likelihood, labour shortage", "risk", src("opex_staff_hiring_difficulty_pct")["value"] / 100, "probability", "sourced", "US", ("opex_staff_hiring_difficulty_pct",), text="46%: share of operators reporting difficulty hiring (Uptime)", note="Share of operators reporting difficulty finding staff, used as the likelihood of a labour-driven slip.")
MIT = {
    "transformer": "Order at project start, buy a reserved slot, or design around smaller units in parallel.",
    "interconnection": "File in the earliest batch, pay the security early, and keep the load profile flexible.",
    "permit": "Choose by-right zoning where it exists and front-load community engagement.",
    "turbine": "Reserve slots now, or pivot to reciprocating engines or fuel cells with shorter lead times.",
    "utility": "Bridge with onsite power and sign a phased energization schedule.",
    "gpu": "Place the accelerator order with the shell contract and keep a second vendor qualified.",
    "labour": "Prefabricate electrical rooms and skids offsite; Vertiv reports about 50% time saved on prefab cooling.",
}
for k, t in MIT.items():
    put(f"risk_{k}_mitigation", f"Mitigation, {k}", "risk", 0, "", "assumption", "US", text=t, note="Mitigation wording is ours; the figures it cites are in the pack.")

# ---------------------------------------------------------------------------------------------------------
# capex
# ---------------------------------------------------------------------------------------------------------
tot = src("capex_total_per_mw_us")
shares = [("capex_site_per_mw", "Site and land", "capex_share_site_acq_pct"), ("capex_shell_per_mw", "Shell and core", "capex_share_core_shell_pct"),
          ("capex_electrical_per_mw", "Power infrastructure", "capex_share_power_infra_pct"), ("capex_contingency_per_mw", "Contingency", "capex_share_contingency_pct")]
rest = 100 - sum(src(s)["value"] for _, _, s in shares)
for id, label, s in shares:
    sh = src(s)["value"] / 100
    put(id, f"{label}, per MW", "capex", round(tot["value"] * sh, 2), "USD million per MW IT", "derived", "US", ("capex_total_per_mw_us", s), round(tot["low"] * sh, 2), round(tot["high"] * sh, 2), note=f"{src(s)['value']}% of the Cushman & Wakefield 2026 all-in build cost of $8.9M to $23.3M per MW (excluding GPUs).")
put("capex_mechanical_per_mw", "Mechanical, fit-out and fees, per MW", "capex", round(tot["value"] * rest / 100, 2), "USD million per MW IT", "derived", "US", ("capex_total_per_mw_us", "capex_share_core_shell_pct"), round(tot["low"] * rest / 100, 2), round(tot["high"] * rest / 100, 2), note=f"The remaining {rest}% of the all-in cost after site, shell, power and contingency: mechanical, fit-out, fees and other.")
CAPEX_LINES = [{"id": "capex_site_per_mw", "label": "Site and land"}, {"id": "capex_shell_per_mw", "label": "Shell and core"}, {"id": "capex_electrical_per_mw", "label": "Power infrastructure"}, {"id": "capex_mechanical_per_mw", "label": "Mechanical, fit-out and fees"}, {"id": "capex_contingency_per_mw", "label": "Contingency"}]
lp = src("capex_liquid_cooling_premium_per_mw")
put("capex_air_cooling_factor", "Capex factor, air cooling", "capex", round((tot["value"] - lp["value"]) / tot["value"], 3), "ratio", "derived", "US", ("capex_liquid_cooling_premium_per_mw", "capex_total_per_mw_us"), note="JLL: liquid cooling adds $1M to $2M per MW. (16.1 - 1.5) / 16.1.")
sp = src("capex_share_power_infra_pct")["value"] / 100; ups2 = src("redundancy_2n_ups_cost_doubling")["value"]
put("redundancy_2n_capex_factor", "Capex factor, 2N", "capex", round(1 + sp * (ups2 - 1), 3), "ratio", "derived", "US", ("redundancy_2n_ups_cost_doubling", "capex_share_power_infra_pct"), note="Schneider: the UPS system nearly doubles for 2N; applied to the 21% power-infrastructure share: 1 + 0.21 x 1.0.")
t4 = src("tier_iv_premium_over_tier_iii_pct")["value"] / 100
put("redundancy_tier4_capex_factor", "Capex factor, Tier IV", "capex", round((1 + sp * (ups2 - 1)) * (1 + t4), 3), "ratio", "derived", "US", ("tier_iv_premium_over_tier_iii_pct", "redundancy_2n_ups_cost_doubling"), note="The 2N factor times the 10% Tier IV over Tier III premium (Uptime survey via DCD).")
put("hybrid_onsite_share", "Onsite share of load, hybrid", "capex", 0.5, "ratio", "derived", "US", ("benchmark_applied_digital_polaris_forge_1_building1_mw",), note="Half the load onsite, matching the 50 MW first step of a 100 MW building.")
put("onsite_oversize_factor", "Generation sizing, kW per kW IT", "capex", src("generator_kw_per_mw_it")["value"] / 1000, "ratio", "derived", "US", ("generator_kw_per_mw_it",), note="1,750 kW of generation per MW of IT: IT times PUE plus a 20 to 25% buffer, per Generator Source, a generator supplier")
put("solar_bess_pv_ratio", "PV capacity per kW of served load", "capex", 3, "ratio", "assumption", "US", note="Three kW of PV per kW served, our assumption for a daytime-plus-storage plant.")
put("solar_bess_hours", "Battery hours per kW of served load", "capex", 4, "hours", "sourced", "US", ("capex_bess_usd_per_kwh",), note="EIA's reference battery is 150 MW / 600 MWh, four hours.")
put("capex_solar_per_kw", "Solar PV, overnight capital cost", "capex", src("capex_solar_pv_usd_per_kw")["value"], "USD per kW", "sourced", "US", ("capex_solar_pv_usd_per_kw",), note="EIA/Sargent & Lundy 2025, single-axis tracking, 2023 dollars.")
put("capex_bess_per_kwh", "Battery storage, overnight capital cost", "capex", src("capex_bess_usd_per_kwh")["value"], "USD per kWh", "sourced", "US", ("capex_bess_usd_per_kwh", "capex_bess_nrel_usd_per_kwh"), src("capex_bess_nrel_usd_per_kwh")["value"], src("capex_bess_usd_per_kwh")["value"], note="EIA $436/kWh (2023$); NREL ATB 2025 $334/kWh as the low end.")
put("capex_gas_turbine_per_kw", "Gas turbine, overnight capital cost", "capex", src("capex_ct_aero_usd_per_kw")["value"], "USD per kW", "sourced", "US", ("capex_ct_aero_usd_per_kw", "capex_ct_frame_h_usd_per_kw"), src("capex_ct_frame_h_usd_per_kw")["value"], src("capex_ct_aero_usd_per_kw")["value"], note="EIA aeroderivative $1,606/kW (the usual bridge-power unit); H-class frame $836/kW as the low end. 2023 dollars.")
put("capex_recip_per_kw", "Reciprocating engines, overnight capital cost", "capex", 1810, "USD per kW", "sourced", "US", note="EIA/Sargent & Lundy 2020 study, Case 4 internal combustion engines, 4 x 5.6 MW, $1,810/kW in 2019 dollars, not escalated to the 2023 dollars of the turbine figure.", source_title="Capital Cost and Performance Characteristic Estimates for Utility Scale Electric Power Generating Technologies (AEO2020)", source_url="https://www.eia.gov/analysis/studies/powerplants/capitalcost/pdf/capital_cost_AEO2020.pdf", publisher="U.S. Energy Information Administration", published="2020-02", accessed=ACCESSED, quote="Internal Combustion Engines ... $1810 ... 8295")
put("capex_fuel_cell_per_kw", "Fuel cells, overnight capital cost", "capex", src("capex_fuel_cell_usd_per_kw")["value"], "USD per kW", "sourced", "US", ("capex_fuel_cell_usd_per_kw",), note="EIA generic fuel cell; Bloom pricing is not public.")
put("heat_rate_gas_turbine_btu_per_kwh", "Heat rate, aeroderivative gas turbine", "energy", 9447, "Btu per kWh", "sourced", "US", ("capex_ct_aero_usd_per_kw",), note="EIA/Sargent & Lundy 2025, Case 3.")
put("heat_rate_recip_btu_per_kwh", "Heat rate, reciprocating engines", "energy", 8295, "Btu per kWh", "sourced", "US", note="EIA/Sargent & Lundy 2020 study, Case 4.", source_title="Capital Cost and Performance Characteristic Estimates for Utility Scale Electric Power Generating Technologies (AEO2020)", source_url="https://www.eia.gov/analysis/studies/powerplants/capitalcost/pdf/capital_cost_AEO2020.pdf", publisher="U.S. Energy Information Administration", published="2020-02", accessed=ACCESSED, quote="Internal Combustion Engines ... 8295")
put("heat_rate_fuel_cell_btu_per_kwh", "Heat rate, fuel cells", "energy", 6469, "Btu per kWh", "sourced", "US", ("capex_fuel_cell_usd_per_kw",), note="EIA AEO assumptions Table 1, fuel cells.")
put("gas_price_usd_per_mmbtu", "Henry Hub natural gas price, 2027", "energy", 3.16, "USD per MMBtu", "sourced", "US", note="EIA Short-Term Energy Outlook, October 2026: 2027 average forecast; 2026 is $3.48. A hub price: basis and transport to the site are not added, which is an assumption.", source_title="Short-Term Energy Outlook, Natural Gas", source_url="https://www.eia.gov/outlooks/steo/report/natgas.php", publisher="U.S. Energy Information Administration", published="2026-10-06", accessed=ACCESSED, quote="Henry Hub spot price will average $3.16 per million British thermal units")

# ---------------------------------------------------------------------------------------------------------
# compute
# ---------------------------------------------------------------------------------------------------------
GPUS = [("gb200", "GB200 NVL72", "rack_gb200_nvl72_kw", "72 GPUs per rack, liquid cooled, 120 to 132 kW"), ("gb300", "GB300 NVL72", "rack_gb300_nvl72_kw", "72 GPUs per rack, liquid cooled, 135 to 155 kW"), ("rubin", "Vera Rubin NVL144", "rack_vera_rubin_nvl144_kw", "144 GPU dies per rack, liquid cooled, 120 to 130 kW (secondary source)")]
for id, name, rid, text in GPUS:
    v = src(rid)
    put(f"gpu_{id}", f"Rack power, {name}", "compute", v["value"], "kW per rack", "sourced", "Global", (rid,), v.get("low"), v.get("high"), text=text)
v = src("gpu_cost_per_mw_gb200")
put("compute_capex_per_mw__gb200", "GPU racks per MW, GB200 NVL72", "compute", v["value"], "USD million per MW IT", "derived", "Global", ("gpu_cost_per_mw_gb200", "gpu_rack_gb200_price_usd"), v["low"], v["high"], note="About $3M per rack (secondary estimate) x 8.3 racks per MW.")
p3 = src("gpu_rack_gb300_price_usd"); k3 = src("rack_gb300_nvl72_kw")
put("compute_capex_per_mw__gb300", "GPU racks per MW, GB300 NVL72", "compute", round(p3["value"] * 1000 / k3["high"], 1), "USD million per MW IT", "derived", "Global", ("gpu_rack_gb300_price_usd", "rack_gb300_nvl72_kw"), round(p3["low"] * 1000 / k3["high"], 1), round(p3["high"] * 1000 / k3["value"], 1), note="$5M to $6.5M per rack (secondary estimate) x 1000 kW / 135 to 155 kW per rack.")
put("compute_capex_per_mw__rubin", "GPU racks per MW, Vera Rubin NVL144", "compute", round(p3["value"] * 1000 / k3["high"], 1), "USD million per MW IT", "assumption", "Global", (), round(p3["low"] * 1000 / k3["high"], 1), round(p3["high"] * 1000 / k3["value"], 1), note="No public Rubin pricing; the GB300 figure per MW is carried over as an assumption.")
put("air_cooling_max_kw_per_rack", "Air cooling practical ceiling", "cooling", src("liquid_threshold_air_impractical_kw")["value"], "kW per rack", "sourced", "Global", ("liquid_threshold_air_impractical_kw", "liquid_threshold_dlc_needed_kw"), note="Air cooling is impractical above about 50 kW per rack; direct liquid cooling is needed above 20 kW (Uptime).")

# ---------------------------------------------------------------------------------------------------------
# PUE, WUE, utilization, opex
# ---------------------------------------------------------------------------------------------------------
v = src("pue_us_average_2028")
put("pue__liquid", "Design PUE, liquid cooling with dry coolers", "energy", v["value"], "ratio", "sourced", "US", ("pue_us_average_2028",), v["low"], v["high"], note="LBNL's 2028 projection for new US capacity (1.15 to 1.35); dry coolers sit at the upper end of hyperscale practice.")
put("pue__liquid_tower", "Design PUE, liquid cooling with towers", "energy", src("pue_hyperscale_aws_2025")["value"], "ratio", "sourced", "Global", ("pue_hyperscale_aws_2025", "pue_hyperscale_google_2025"), src("pue_hyperscale_google_2025")["value"], src("pue_hyperscale_aws_2025")["value"], note="A fleet proxy: evaporative cooling as run by AWS (1.14) and Google (1.09); the AWS fleet figure is used.")
put("pue__air", "Design PUE, air cooling", "energy", src("pue_large_20mw_plus")["value"], "ratio", "sourced", "Global", ("pue_large_20mw_plus", "pue_industry_avg_2025"), note="Uptime 2025 survey, sites of 20 MW and above (1.44); industry average 1.54.")
v = src("wue_hyperscale_range_lbnl")
put("wue__liquid", "WUE, liquid cooling with dry coolers", "energy", v["low"], "L per kWh IT", "sourced", "US", ("wue_hyperscale_range_lbnl", "wue_aws_2025"), note="Low end of LBNL's hyperscale range (0.1 L/kWh): a closed loop with dry coolers consumes little water beyond make-up.")
v2 = src("wue_us_average_2028_l_per_kwh")
put("wue__liquid_tower", "WUE, liquid cooling with towers", "energy", v2["value"], "L per kWh IT", "sourced", "US", ("wue_us_average_2028_l_per_kwh",), v2["low"], v2["high"], note="LBNL's 2028 projection for the US fleet (0.45 to 0.48 L/kWh), which it attributes to the shift to liquid cooling with evaporative heat rejection; a fleet proxy for tower cooling.")
put("wue__air", "WUE, air cooling", "energy", src("wue_us_national_2023_lbnl")["value"], "L per kWh IT", "sourced", "US", ("wue_us_national_2023_lbnl",), note="LBNL US fleet average for 2023, a fleet of mostly air-cooled halls; air-cooled chillers themselves use no water, so this is a fleet proxy that includes evaporative heat rejection.")
v = src("server_h100_operating_fraction")
put("it_utilization", "Average IT power as a share of rated", "energy", v["value"], "ratio", "sourced", "US", ("server_h100_operating_fraction",), v["low"], v["high"], note="LBNL: AI servers run at 60 to 80% of rated power on average.")
colo = src("opex_colocation_rate_kw_month")["value"] * 1000 * 12 / 1e6
elec12 = src("opex_electricity_per_mw_year_pue12")["value"]
put("opex_staff_maint_per_mw_year", "Staff, maintenance and other opex per MW-year", "opex", round(colo - elec12, 2), "USD million per MW IT per year", "derived", "US", ("opex_colocation_rate_kw_month", "opex_electricity_per_mw_year_pue12"), round((colo - elec12) * 0.5, 2), round(colo - elec12, 2), note="Colocation all-in rate $196/kW/month = $2.35M per MW-year, less electricity at PUE 1.2 ($0.95M): an upper bound that includes the operator's margin. The low end is half of that, our assumption.")

# ---------------------------------------------------------------------------------------------------------
# context values carried through for the report (not used in arithmetic)
# ---------------------------------------------------------------------------------------------------------
CTX = ["ic_gen_request_to_cod_months", "ic_gen_completion_rate_capacity_pct", "ic_queue_total_gw_us", "ercot_large_load_requests_gw", "ercot_large_load_dc_share_pct", "ercot_ll_approved_to_energize_mw", "ercot_ll_operational_peak_mw", "tx_sb6_large_load_threshold_mw", "ercot_ll_security_usd_per_mw", "pjm_peak_growth_2024_2030_gw", "dominion_dc_contracted_gw", "dominion_dc_billing_peak_gw", "georgia_power_ll_pipeline_gw", "aps_committed_large_load_gw", "nv_energy_ll_agreements_gw", "us_peak_growth_2025_2030_gw", "transmission_large_build_years", "gev_gas_backlog_and_slots_gw", "siemens_gas_turbine_booked_out_fy", "air_major_source_threshold_tpy", "air_psd_major_source_other_tpy", "epa_emergency_generator_pte_default_hours", "nox_nsps_kkkka_high_util_lb_per_mmbtu", "xai_memphis_permitted_turbine_mw", "xai_memphis_permit_nox_tpy", "nepa_ea_mean_months", "nepa_eis_median_years", "dc_electricity_us_2023_twh", "dc_electricity_us_2028_twh", "delay_share_projects_late_3mo_2025", "delay_driver_equipment_pct", "delay_driver_power_availability_pct", "delay_driver_permitting_legislation_pct", "capex_inflation_since_2024_pct", "capex_switchgear_price_rise_pct", "capex_global_avg_per_mw_2026", "capex_ai_premium_us_pct", "capex_modular_cost_saving_pct", "cooling_vertiv_prefab_time_saving_pct", "liquid_threshold_dlc_needed_kw", "liquid_cold_plate_capacity_kw", "cooling_cdu_large_capacity_kw", "rack_gb200_nvl72_gpus", "rack_density_avg_2025_kw", "dlc_adoption_2025_pct", "pue_industry_avg_2025", "pue_us_national_2023_lbnl", "outage_cause_power_pct", "supply_chain_not_ready_pct", "benchmark_crusoe_abilene_phase1_months", "construction_building_months_jlarc", "development_cycle_total_years", "redundancy_availability_n_pct", "commissioning_ist_air_cooled_weeks", "interconnection_median_request_to_cod_years"]
for rid in CTX:
    v = dict(src(rid)); v["id"] = "ctx_" + rid; v["category"] = "context"
    if v["id"] in IDS: continue
    IDS.add(v["id"]); OUT.append(v)

pack = {
    "version": VERSION, "accessed": ACCESSED,
    "about": "Data pack for Time to First Token. Every value carries its source. kind = sourced (read off the page), derived (arithmetic on sourced values, see note) or assumption (ours, no public figure). Licence CC BY 4.0.",
    "defaults": {"state": "TX", "mw": 100, "gpu": "gb200", "density": 120, "start": "2026-11", "target": "2028-06"},
    "states": [{"code": c, "name": n, "metro": m, "note": note} for c, n, m, iso, note in STATES],
    "gpus": [{"id": id, "name": name} for id, name, rid, text in GPUS],
    "capex_lines": CAPEX_LINES,
    "values": OUT,
}
json.dump(pack, open(ROOT / "data" / "pack.json", "w"), indent=1)
print(f"wrote data/pack.json: {len(OUT)} values ({sum(1 for v in OUT if v['kind']=='sourced')} sourced, {sum(1 for v in OUT if v['kind']=='derived')} derived, {sum(1 for v in OUT if v['kind']=='assumption')} assumptions)")
