// Time to First Token: the planning model.
// Every number comes from the data pack (data/pack.json). Nothing is typed in here.
// The model is a small critical-path calculation (CPM) over the tasks a data center build really has,
// plus cost, energy and water arithmetic on top. Each function says which pack ids it reads.

export const STAGES = [
  { id: "land", name: "Land", short: "Land", blurb: "Survey, geotech, grading, fence, access road" },
  { id: "permits", name: "Permits", short: "Permits", blurb: "Zoning, air, water, building permit" },
  { id: "power", name: "Power", short: "Power", blurb: "Interconnection, substation, transformers, onsite generation" },
  { id: "shell", name: "Shell", short: "Shell", blurb: "Foundations, steel, roof, walls" },
  { id: "electrical", name: "Electrical", short: "Electrical", blurb: "Switchgear, UPS, generators, busway" },
  { id: "cooling", name: "Cooling", short: "Cooling", blurb: "Chillers or dry coolers, towers, CDUs, liquid loops" },
  { id: "whitespace", name: "White space", short: "White space", blurb: "Rows, containment, empty racks" },
  { id: "compute", name: "Compute", short: "Compute", blurb: "GPU racks filling in" },
  { id: "commissioning", name: "Commissioning", short: "Cx L1 to L5", blurb: "Level 1 factory tests to Level 5 integrated systems test" },
  { id: "live", name: "First token", short: "Live", blurb: "Racks light up, coolers run, the first token is served" },
];

export class Pack {
  constructor(json) {
    this.json = json; this.byId = new Map(); this.missing = new Set();
    for (const v of json.values) this.byId.set(v.id, v);
  }
  has(id) { return this.byId.has(id); }
  get(id) { const v = this.byId.get(id); if (!v) { this.missing.add(id); return null; } return v; }
  // central value
  v(id) { const x = this.get(id); return x ? x.value : NaN; }
  lo(id) { const x = this.get(id); return x ? (x.low ?? x.value) : NaN; }
  hi(id) { const x = this.get(id); return x ? (x.high ?? x.value) : NaN; }
  // scoped lookup: "<id>__<scope>" first, then "<id>"
  vs(id, scope) { return this.has(`${id}__${scope}`) ? this.v(`${id}__${scope}`) : this.v(id); }
  getScoped(id, scope) { return this.has(`${id}__${scope}`) ? this.get(`${id}__${scope}`) : this.get(id); }
}

export const DEFAULT_INPUTS = {
  state: "TX", mw: 100, power: "grid", bridge: "gas_turbine", redund: "n1", cool: "liquid",
  gpu: "gb200", density: 120, start: "2026-11", target: "2028-06", stress: null, levers: {},
};

export function monthsBetween(a, b) { // "YYYY-MM" strings
  const [ay, am] = a.split("-").map(Number), [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}
export function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number); const t = y * 12 + (m - 1) + Math.round(n);
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export function fmtMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

// ---------------------------------------------------------------------------------------------------------
// the plan
// ---------------------------------------------------------------------------------------------------------
export function plan(pack, inp) {
  const P = pack; const iso = P.get(`iso__${inp.state}`)?.text?.split(" ")[0].split("/")[0] || "US"; const mw = inp.mw;
  const lev = inp.levers || {};
  const onsite = inp.power !== "grid";
  const onsiteKind = inp.bridge;
  const bigGen = onsite && (onsiteKind === "gas_turbine" || onsiteKind === "recip");
  // scaling: durations of the building work grow with size; published builds are the anchors (see pack: construction_scale_exponent)
  const sizeScale = Math.pow(mw / 100, P.v("construction_scale_exponent"));
  const phaseFactor = lev.phase ? P.v("lever_first_phase_share") : 1;

  // --- durations in months, from the pack (scoped by state or ISO where the pack has it) ---
  const d = {
    survey: P.v("survey_geotech_months"),
    design: P.v("design_months"),
    zoning: P.vs("zoning_months", inp.state),
    siteplan: P.vs("site_plan_building_permit_months", inp.state),
    air: bigGen ? P.vs("air_permit_major_months", inp.state) : P.vs("air_permit_minor_months", inp.state),
    water: inp.cool === "liquid_tower" ? P.v("water_permit_months") : 0,
    study: P.vs("large_load_study_months", iso),
    utilityWait: P.vs("utility_energization_wait_months", inp.state),
    lpt: P.v("lead_lpt_months"),
    substation: P.v("substation_build_months"),
    transmission: P.v("transmission_build_months"),
    genLead: onsite ? P.v(`lead_${onsiteKind}_months`) : 0,
    genInstall: onsite ? P.v(`install_${onsiteKind}_months`) * sizeScale : 0,
    grading: P.v("grading_civil_months") * sizeScale,
    foundations: P.v("foundations_months") * sizeScale,
    shell: P.v("shell_steel_roof_months") * sizeScale,
    electrical: P.v("electrical_fitout_months") * sizeScale,
    mechanical: P.v("mechanical_fitout_months") * sizeScale * (inp.cool === "air" ? P.v("air_cooling_fitout_factor") : 1),
    whitespace: P.v("whitespace_fitout_months") * sizeScale,
    compute: P.v("gpu_install_months_per_100mw") * sizeScale * phaseFactor,
    bringup: P.v("cluster_bringup_months"),
    cx12: P.v("cx_l1_l2_months"),
    cx34: P.v("cx_l3_l4_months") * sizeScale,
    cx5: (inp.cool === "air" ? P.v("cx_l5_ist_months_air") : P.v("cx_l5_ist_months")) * sizeScale,
    switchgear: P.v("lead_switchgear_months"),
    ups: P.v("lead_ups_months"),
    genset: P.v("lead_genset_months"),
    chiller: inp.cool === "air" ? P.v("lead_crah_months") : P.v("lead_chiller_months"),
    cdu: inp.cool === "air" ? 0 : P.v("lead_cdu_months"),
  };
  if (inp.redund === "2n" || inp.redund === "tier4") { d.electrical *= P.v("redundancy_2n_electrical_time_factor"); }
  if (inp.redund === "tier4") { d.cx5 += P.v("tier4_cx_extra_months"); }

  // --- stress test slips (months) applied to one task each ---
  const S = {};
  const st = inp.stress;
  if (st) {
    const slip = P.v(`stress_${st}_months`);
    ({ transformer: () => S.lpt = slip, interconnection: () => S.study = slip, permit: () => S.zoning = slip,
       turbine: () => S.genLead = slip, gpu: () => S.compute = slip, utility: () => S.utilityWait = slip,
       labour: () => S.electrical = slip })[st]?.();
  }
  const dur = (k) => d[k] + (S[k] || 0);

  // --- tasks: id, label, stage, duration, predecessors. Order and gating follow how a site is really built. ---
  const T = [];
  const add = (id, label, stage, months, pred = [], opts = {}) => T.push({ id, label, stage, months: Math.max(0, months), pred, ...opts });
  add("survey", "Survey, geotech and planning", "land", dur("survey"));
  add("design", "Design and engineering", "shell", dur("design"), ["survey"]);
  add("zoning", "Zoning and site plan approval", "permits", dur("zoning"), [], { gate: true });
  add("siteplan", "Building permit", "permits", dur("siteplan"), ["zoning", "design"], { gate: true });
  add("air", bigGen ? "Air permit, major source (PSD and Title V)" : "Air permit, minor source (standby generators)", "permits", dur("air"), ["design"], { gate: true });
  if (d.water) add("water", "Cooling-water discharge permit", "permits", dur("water"), ["design"], { gate: true });
  add("study", `Large-load interconnection study, ${iso}`, "power", dur("study"));
  const lptPred = lev.lptEarly ? [] : ["study"];
  add("lpt", lev.lptEarly ? "Large power transformers, ordered at risk" : "Large power transformers", "power", dur("lpt"), lptPred, { lead: true });
  if (d.transmission) add("transmission", "Transmission works", "power", dur("transmission"), ["study"]);
  add("substation", "Substation civil, structures and switchyard", "power", dur("substation"), d.transmission ? ["transmission"] : ["study"]);
  // energization happens when the substation and the transformers are both done, and never before the utility's own wait
  add("utility", "Utility energization (wait for the utility)", "power", 0, ["substation", "lpt"], { wait: true });
  if (onsite) {
    add("genlead", `${genLabel(onsiteKind)}, order and lead time`, "power", dur("genLead"), [], { lead: true });
    add("geninst", `${genLabel(onsiteKind)}, install and connect`, "power", dur("genInstall"), ["genlead", "foundations", "air"]);
  }
  add("grading", "Grading, fence and road", "land", dur("grading"), ["survey", "zoning"]);
  add("foundations", "Foundations", "shell", dur("foundations"), ["grading", "siteplan"]);
  add("shell", "Steel, roof and walls", "shell", dur("shell"), ["foundations"]);
  add("switchgear", "Switchgear and UPS, order and lead time", "electrical", Math.max(dur("switchgear"), dur("ups")), ["design"], { lead: true });
  add("genset", "Standby generators, order and lead time", "electrical", dur("genset"), ["design"], { lead: true });
  add("chiller", inp.cool === "air" ? "CRAH units, order and lead time" : "Chillers or dry coolers, order and lead time", "cooling", dur("chiller"), ["design"], { lead: true });
  if (d.cdu) add("cdu", "CDUs and loop parts, order and lead time", "cooling", dur("cdu"), ["design"], { lead: true });
  // fit-out starts once the shell is weather-tight (about two thirds through), white space once the fit-outs are half done
  add("electrical", "Electrical fit-out: switchgear, UPS, generators, busway", "electrical", dur("electrical"), [["shell", 0.67], "switchgear", "genset", "air"]);
  add("mechanical", inp.cool === "air" ? "Mechanical fit-out: chillers, CRAH" : "Mechanical fit-out: coolers, CDUs, liquid loop", "cooling", dur("mechanical"), [["shell", 0.67], "chiller", ...(d.cdu ? ["cdu"] : [])]);
  add("whitespace", "White space: rows, containment, racks", "whitespace", dur("whitespace"), [["electrical", 0.5], ["mechanical", 0.5]]);
  add("cx12", "Cx L1 to L2: factory and site acceptance", "commissioning", dur("cx12"), [["electrical", 0.6], ["mechanical", 0.6]]);
  add("cx34", "Cx L3 to L4: start-up and functional tests", "commissioning", dur("cx34"), ["cx12", "whitespace"]);
  const powerForIst = onsite ? ["geninst"] : ["utility"];
  add("cx5", "Cx L5: integrated systems test", "commissioning", dur("cx5"), ["cx34", ...powerForIst, ...(d.water ? ["water"] : [])]);
  add("compute", `GPU racks installed, ${lev.phase ? "first phase" : "all"}`, "compute", dur("compute"), ["cx5"]);
  add("bringup", "Cluster bring-up and burn-in", "live", dur("bringup"), ["compute"]);

  // --- CPM forward pass ---
  const byId = new Map(T.map(t => [t.id, t]));
  const es = {}, ef = {};
  const order = [];
  const visit = (t, seen = new Set()) => { if (ef[t.id] != null) return; if (seen.has(t.id)) throw new Error("cycle"); seen.add(t.id);
    let s = 0; for (const pr of t.pred) { const [p, frac] = Array.isArray(pr) ? pr : [pr, 1]; const pt = byId.get(p); if (!pt) continue; visit(pt, seen); s = Math.max(s, es[p] + frac * pt.months); }
    es[t.id] = s; ef[t.id] = s + t.months; order.push(t.id); };
  for (const t of T) visit(t);
  // second pass: the utility wait is measured from project start, so its task length depends on when the works finish
  const ut = byId.get("utility"); ut.months = Math.max(0, dur("utilityWait") - es["utility"]);
  for (const k of Object.keys(ef)) delete ef[k]; order.length = 0;
  for (const t of T) visit(t);
  const end = ef.bringup;
  // backward pass against first token (the utility energization after first token has float by definition)
  const lf = {}, ls = {};
  for (const tid of [...order].reverse()) { const t = byId.get(tid);
    const succ = T.filter(x => x.pred.some(pr => (Array.isArray(pr) ? pr[0] : pr) === t.id));
    // latest start so that no successor is late: a successor that starts when this task is frac done gives ls = succ.ls - frac*months
    ls[t.id] = succ.length ? Math.min(...succ.map(x => { const pr = x.pred.find(pr => (Array.isArray(pr) ? pr[0] : pr) === t.id); const frac = Array.isArray(pr) ? pr[1] : 1; return ls[x.id] - frac * t.months; })) : end - t.months;
    lf[t.id] = ls[t.id] + t.months;
  }
  const tasks = T.map(t => ({ ...t, es: es[t.id], ef: ef[t.id], float: ls[t.id] - es[t.id], critical: Math.abs(ls[t.id] - es[t.id]) < 0.05 && t.months > 0, slip: S[slipKey(t.id)] || 0 }))
    .sort((a, b) => a.es - b.es || T.indexOf(byId.get(a.id)) - T.indexOf(byId.get(b.id)));

  // --- key dates ---
  const firstToken = ef.bringup;
  const fullPower = onsite ? Math.max(ef.utility, ef.bringup) : ef.bringup;
  const stageEnd = {}; for (const s of STAGES) stageEnd[s.id] = Math.max(0, ...tasks.filter(t => t.stage === s.id).map(t => t.ef));
  stageEnd.power = onsite ? ef.geninst : ef.utility;
  stageEnd.live = firstToken;
  const stageStart = {}; for (const s of STAGES) stageStart[s.id] = Math.min(end, ...tasks.filter(t => t.stage === s.id).map(t => t.es));
  stageStart.live = ef.compute;
  const heldStage = st ? stageOfStress(st, onsite) : null;
  const taskTimes = {}; for (const t of tasks) taskTimes[t.id] = [t.es, t.ef];

  // --- costs ---
  const costs = costModel(pack, inp, iso);
  const energy = energyModel(pack, inp);
  const racks = Math.ceil(mw * 1000 / inp.density);
  const airWarning = inp.cool === "air" && inp.density > P.v("air_cooling_max_kw_per_rack") ? `Air cooling is impractical above ${P.v("air_cooling_max_kw_per_rack")} kW per rack (Uptime); ${inp.density} kW racks need liquid cooling.` : "";
  const targetMonths = monthsBetween(inp.start, inp.target);
  return { tasks, taskTimes, end, firstToken, fullPower, stageEnd, stageStart, heldStage, iso, d, costs, energy, racks, airWarning,
    targetMonths, vsTarget: targetMonths - firstToken, liveDate: addMonths(inp.start, firstToken), fullDate: addMonths(inp.start, fullPower) };
}

function slipKey(id) { return { lpt: "lpt", study: "study", zoning: "zoning", genlead: "genLead", compute: "compute", utility: "utilityWait", shell: "shell", electrical: "electrical" }[id] || id; }
function stageOfStress(st, onsite) { return { transformer: "power", interconnection: "power", permit: "permits", turbine: "power", gpu: "compute", utility: onsite ? "live" : "power", labour: "electrical" }[st]; }
export function genLabel(k) { return { gas_turbine: "Gas turbines", recip: "Reciprocating engines", fuel_cell: "Fuel cells", solar_bess: "Solar plus batteries" }[k]; }

// ---------------------------------------------------------------------------------------------------------
// costs: $M
// ---------------------------------------------------------------------------------------------------------
export function costModel(pack, inp, iso) {
  const P = pack, mw = inp.mw;
  const redundF = { n1: 1, "2n": P.v("redundancy_2n_capex_factor"), tier4: P.v("redundancy_tier4_capex_factor") }[inp.redund];
  const coolF = inp.cool === "air" ? P.v("capex_air_cooling_factor") : 1;
  const metroF = P.has(`capex_metro_index__${inp.state}`) ? P.v(`capex_metro_index__${inp.state}`) / P.v("capex_metro_index_base") : 1;
  const lines = [];
  const line = (label, id, lo, hi, tag) => lines.push({ label, id, lo, hi, tag });
  const fac = (id) => [P.lo(id) * mw * redundF * coolF * metroF, P.hi(id) * mw * redundF * coolF * metroF];
  for (const l of (pack.json.capex_lines || [])) line(l.label, l.id, ...fac(l.id), "range");
  const facTotal = lines.reduce((a, l) => [a[0] + l.lo, a[1] + l.hi], [0, 0]);
  if (inp.power !== "grid") {
    const k = inp.bridge; const share = inp.power === "bridge" ? 1 : P.v("hybrid_onsite_share");
    const kw = mw * 1000 * share * P.v("onsite_oversize_factor");
    if (k === "solar_bess") {
      const pvkw = kw * P.v("solar_bess_pv_ratio"), bkwh = kw * P.v("solar_bess_hours");
      line("Onsite solar", "capex_solar_per_kw", P.lo("capex_solar_per_kw") * pvkw / 1e6, P.hi("capex_solar_per_kw") * pvkw / 1e6, "range");
      line("Onsite batteries", "capex_bess_per_kwh", P.lo("capex_bess_per_kwh") * bkwh / 1e6, P.hi("capex_bess_per_kwh") * bkwh / 1e6, "range");
    } else {
      line(`Onsite ${genLabel(k).toLowerCase()}`, `capex_${k}_per_kw`, P.lo(`capex_${k}_per_kw`) * kw / 1e6, P.hi(`capex_${k}_per_kw`) * kw / 1e6, "range");
    }
  }
  const gpu = P.get(`gpu_${inp.gpu}`);
  const computeLo = P.lo(`compute_capex_per_mw__${inp.gpu}`) * mw, computeHi = P.hi(`compute_capex_per_mw__${inp.gpu}`) * mw;
  const withSite = lines.reduce((a, l) => [a[0] + l.lo, a[1] + l.hi], [0, 0]);
  const total = [withSite[0] + computeLo, withSite[1] + computeHi];
  return { lines, facility: facTotal, site: withSite, compute: [computeLo, computeHi], total, gpu, redundF, coolF, metroF };
}

// ---------------------------------------------------------------------------------------------------------
// energy, PUE, water, opex ($M per year)
// ---------------------------------------------------------------------------------------------------------
export function energyModel(pack, inp) {
  const P = pack, mw = inp.mw;
  const pue = P.v(`pue__${inp.cool}`), wue = P.v(`wue__${inp.cool}`);
  const util = P.v("it_utilization");
  const priceC = P.vs("industrial_price_c_per_kwh", inp.state); // cents per kWh
  const mwhYear = mw * util * 8760 * pue;
  const elecM = mwhYear * 1000 * priceC / 100 / 1e6;
  const waterL = mw * util * 8760 * 1000 * wue; // litres per year, from WUE (L per kWh of IT)
  const waterMgal = waterL / 3.78541 / 1e6;
  const staffLo = P.lo("opex_staff_maint_per_mw_year") * mw, staffHi = P.hi("opex_staff_maint_per_mw_year") * mw;
  const fuel = inp.power === "grid" ? 0 : onsiteFuel(pack, inp, mwhYear);
  return { pue, wue, util, priceC, mwhYear, elecM, waterMgal, staff: [staffLo, staffHi], fuel,
    opex: [elecM * (inp.power === "bridge" ? 0 : 1) + staffLo + fuel, elecM * (inp.power === "bridge" ? 0 : 1) + staffHi + fuel] };
}
function onsiteFuel(P, inp, mwhYear) {
  if (inp.bridge === "solar_bess") return 0;
  const share = inp.power === "bridge" ? 1 : P.v("hybrid_onsite_share");
  const hr = P.v(`heat_rate_${inp.bridge}_btu_per_kwh`); const gas = P.v("gas_price_usd_per_mmbtu");
  return mwhYear * share * 1000 * hr / 1e6 * gas / 1e6;
}

// ---------------------------------------------------------------------------------------------------------
// levers: recompute with one change, report months and $M saved (positive = faster / cheaper)
// ---------------------------------------------------------------------------------------------------------
export function levers(pack, inp, base) {
  const out = [];
  const tryIt = (label, desc, change) => {
    const alt = { ...inp, levers: { ...(inp.levers || {}) }, ...change.inp }; if (change.lever) alt.levers[change.lever] = !alt.levers[change.lever];
    let r; try { r = plan(pack, alt); } catch (e) { return; }
    out.push({ label, desc, months: base.firstToken - r.firstToken, cost: mid(base.costs.total) - mid(r.costs.total), opex: mid(base.energy.opex) - mid(r.energy.opex), change });
  };
  tryIt(inp.levers?.lptEarly ? "Order transformers after the study" : "Order transformers at project start", "Place the large transformer order before the interconnection study ends, at risk of a spec change.", { lever: "lptEarly" });
  if (inp.power === "grid") tryIt("Add onsite bridge power", `Run the first phase on ${genLabel(inp.bridge).toLowerCase()} while the grid connection catches up.`, { inp: { power: "bridge" } });
  else tryIt("Grid only, no onsite generation", "Drop the onsite plant and wait for the utility.", { inp: { power: "grid" } });
  if (inp.power === "grid") tryIt("Hybrid: part onsite, part grid", "A smaller onsite plant covers the first racks; the grid serves the rest.", { inp: { power: "hybrid" } });
  tryIt(inp.levers?.phase ? "Install all racks before first token" : "First token on a first phase of racks", "Serve the first token from a first tranche of racks, then keep installing.", { lever: "phase" });
  if (inp.cool === "liquid_tower") tryIt("Dry coolers instead of towers", "No cooling-water permit and far less water, at a PUE cost.", { inp: { cool: "liquid" } });
  if (inp.cool === "liquid") tryIt("Cooling towers instead of dry coolers", "Lower PUE, but a water permit and a water bill.", { inp: { cool: "liquid_tower" } });
  if (inp.redund !== "n1") tryIt("N+1 instead of full redundancy", "Most AI training halls accept N+1.", { inp: { redund: "n1" } });
  else tryIt("2N redundancy", "Concurrently maintainable power paths.", { inp: { redund: "2n" } });
  if (inp.power !== "grid" && inp.bridge !== "recip") tryIt("Reciprocating engines instead", "Shorter lead time than turbines, in smaller units.", { inp: { bridge: "recip" } });
  if (inp.power !== "grid" && inp.bridge !== "solar_bess") tryIt("Solar plus batteries instead", "No air permit fight, but a much larger site and limited hours.", { inp: { bridge: "solar_bess" } });
  // fastest state alternative
  const states = pack.json.states || [];
  let best = null;
  for (const s of states) { if (s.code === inp.state) continue; let r; try { r = plan(pack, { ...inp, state: s.code }); } catch (e) { continue; }
    if (!best || r.firstToken < best.r.firstToken) best = { s, r }; }
  if (best && best.r.firstToken < base.firstToken) out.push({ label: `Build in ${best.s.name} instead`, desc: `${best.s.metro}, ${pack.get(`iso__${best.s.code}`)?.text}: the fastest region in the pack for this load.`, months: base.firstToken - best.r.firstToken, cost: mid(base.costs.total) - mid(best.r.costs.total), opex: mid(base.energy.opex) - mid(best.r.energy.opex), change: { inp: { state: best.s.code } } });
  return out.sort((a, b) => b.months - a.months);
}
export function mid(r) { return (r[0] + r[1]) / 2; }

// ---------------------------------------------------------------------------------------------------------
// risks
// ---------------------------------------------------------------------------------------------------------
export const STRESSES = [
  { id: "transformer", label: "Transformer slip", desc: "The large power transformers arrive late." },
  { id: "interconnection", label: "Interconnection study delay", desc: "The ISO or utility study cluster runs long." },
  { id: "permit", label: "Permit challenge", desc: "A rezoning appeal or lawsuit holds the site plan." },
  { id: "turbine", label: "Turbine lead-time extension", desc: "The gas turbine slot moves out.", onsiteOnly: true },
  { id: "utility", label: "Utility energization delay", desc: "The utility pushes the energization date." },
  { id: "gpu", label: "GPU allocation delay", desc: "The accelerator order ships later than quoted." },
  { id: "labour", label: "Labour shortage", desc: "Electrical and structural crews are short; those tasks run long." },
];
export function risks(pack, inp, base) {
  const out = [];
  for (const s of STRESSES) {
    if (s.onsiteOnly && inp.power === "grid") continue;
    const like = pack.get(`risk_${s.id}_likelihood`), slip = pack.get(`stress_${s.id}_months`);
    if (!like || !slip) continue;
    let r; try { r = plan(pack, { ...inp, stress: s.id }); } catch (e) { continue; }
    const impact = r.firstToken - base.firstToken;
    out.push({ ...s, likelihood: like.value, likelihoodLabel: like.text || `${Math.round(like.value * 100)}%`, slipMonths: slip.value, impact, mitigation: pack.get(`risk_${s.id}_mitigation`)?.text || "" });
  }
  return out.sort((a, b) => b.likelihood * b.impact - a.likelihood * a.impact);
}

// ---------------------------------------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------------------------------------
export function exportRows(pack, inp, r) {
  const rows = [];
  rows.push(["section", "key", "value", "low", "high", "unit", "kind", "source", "url"]);
  for (const [k, v] of Object.entries(inp)) if (k !== "levers" && k !== "stress") rows.push(["input", k, v, "", "", "", "", "", ""]);
  rows.push(["input", "levers", JSON.stringify(inp.levers || {}), "", "", "", "", "", ""]);
  rows.push(["input", "stress", inp.stress || "", "", "", "", "", "", ""]);
  rows.push(["result", "time_to_first_token_months", r.firstToken.toFixed(1), "", "", "months", "derived", "", ""]);
  rows.push(["result", "first_token_date", r.liveDate, "", "", "month", "derived", "", ""]);
  rows.push(["result", "full_power_date", r.fullDate, "", "", "month", "derived", "", ""]);
  rows.push(["result", "capex_total_musd", mid(r.costs.total).toFixed(0), r.costs.total[0].toFixed(0), r.costs.total[1].toFixed(0), "USD million", "derived", "", ""]);
  rows.push(["result", "capex_facility_musd", mid(r.costs.facility).toFixed(0), r.costs.facility[0].toFixed(0), r.costs.facility[1].toFixed(0), "USD million", "derived", "", ""]);
  rows.push(["result", "opex_musd_per_year", mid(r.energy.opex).toFixed(0), r.energy.opex[0].toFixed(0), r.energy.opex[1].toFixed(0), "USD million per year", "derived", "", ""]);
  rows.push(["result", "pue", r.energy.pue, "", "", "", "sourced", "", ""]);
  rows.push(["result", "water_mgal_per_year", r.energy.waterMgal.toFixed(1), "", "", "million US gallons per year", "derived", "", ""]);
  for (const t of r.tasks) rows.push(["task", t.id, t.label, t.es.toFixed(1), t.ef.toFixed(1), "months from start", t.critical ? "critical" : "float", "", ""]);
  for (const v of pack.json.values) rows.push(["assumption", v.id, v.value ?? v.text ?? "", v.low ?? "", v.high ?? "", v.unit || "", v.kind, v.publisher, v.source_url]);
  return rows;
}
