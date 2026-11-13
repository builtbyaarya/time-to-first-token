// Time to First Token: the page. Welcome > guided planner > Build it > results, plus the Data & Sources tab.
import { Pack, STAGES, STRESSES, DEFAULT_INPUTS, plan, levers, risks, exportRows, mid, addMonths, fmtMonth, genLabel, densityRange, coolingRules, coolingModel, coolingBounds } from "./model.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const debug = new URLSearchParams(location.search).get("debug") === "1";
const REPORT_FORM = "https://docs.google.com/forms/d/e/1FAIpQLSeVCVO7KwCtnVYKx85-GTwhld0cpOQGqnhj6VXOQdrDbmH1MQ/formResponse";
const REPORT_FIELDS = { email: "entry.2022754142", run: "entry.1374242536" };
const URLKEYS = { s: "state", mw: "mw", p: "power", b: "bridge", r: "redund", c: "cool", g: "gpu", d: "density", t: "target", st: "start", x: "stress", ts: "ts", ta: "ta" };
const ISO_WHO = { ERCOT: "ERCOT, the Texas grid operator", PJM: "PJM, the grid operator for the mid-Atlantic and parts of the Midwest", MISO: "MISO, the grid operator for the central US", SPP: "SPP, the grid operator for the central plains", SERC: "SERC, the reliability region for the Southeast", WECC: "WECC, the reliability region for the West", NYISO: "NYISO, the New York grid operator", ISO: "the regional grid operator" };
const COOL = { liquid: "Liquid, dry coolers", liquid_tower: "Liquid, cooling towers", air: "Air" };
const POWER = { grid: "Grid only", bridge: "Onsite bridge", hybrid: "Hybrid" };
const REDUND = { n1: "N+1, Tier III", "2n": "2N, Tier IV design", tier4: "2N, Tier IV certified" };
const STEP_ORDER = ["location", "load", "power", "redund", "cooling", "compute", "schedule"];

let stickyNotes = [];
let pack, inp, R, site, mode = "beginner", built = false, playing = false, playRaf = 0, holdUntil = 0, tNow = 0, lastNotes = "";

// ---------------------------------------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------------------------------------
async function boot() {
  const res = await fetch("data/pack.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("data pack missing");
  pack = new Pack(await res.json());
  const q = new URLSearchParams(location.search);
  const hasPlan = Object.keys(URLKEYS).some(k => q.has(k)) || q.has("l");
  mode = q.get("m") === "e" ? "engineer" : q.get("m") === "b" ? "beginner" : (store("ttft-mode") || "beginner");
  inp = readUrl({ ...DEFAULT_INPUTS, ...(pack.json.defaults || {}) });
  fillInputs(); bindChrome(); bindOutputs(); renderData();
  setMode(mode, true);
  recompute();
  if (hasPlan) { await enterApp(); build(false); }
  else { $("#welcome").hidden = false; bindWelcome(); }
}
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

function bindWelcome() {
  for (const c of $$(".w-card")) c.addEventListener("click", () => {
    for (const o of $$(".w-card")) o.setAttribute("aria-checked", String(o === c));
    setMode(c.dataset.mode);
    $("#welcome").classList.add("leaving");
    setTimeout(() => enterApp(), 380);
  });
}
async function enterApp() {
  $("#welcome").hidden = true; document.body.classList.remove("is-welcome"); $("#app").hidden = false;
  if (!site) await startScene();
  recompute();
  if (!built) openStep("location");
}

function setMode(m, quiet) {
  mode = m === "engineer" ? "engineer" : "beginner"; store("ttft-mode", mode);
  document.body.classList.toggle("mode-engineer", mode === "engineer"); document.body.classList.toggle("mode-beginner", mode === "beginner");
  for (const b of $$("#mode button")) b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  if (!quiet && R) { writeUrl(); if (built) renderResults(); }
}

// ---------------------------------------------------------------------------------------------------------
// inputs and steps
// ---------------------------------------------------------------------------------------------------------
function fillInputs() {
  const st = $("#in-state");
  for (const s of pack.json.states) { const o = document.createElement("option"); o.value = s.code; o.textContent = `${s.name}, ${s.metro}`; st.appendChild(o); }
  const gp = $("#in-gpu");
  for (const g of pack.json.gpus) { const o = document.createElement("option"); o.value = g.id; o.textContent = g.name; gp.appendChild(o); }
  syncInputs();
  st.addEventListener("change", () => { inp.state = st.value; recompute(); advance("location"); });
  gp.addEventListener("change", () => { inp.gpu = gp.value; inp.density = pack.get(`gpu_${inp.gpu}`)?.value || inp.density; recompute(); });
  $("#in-mw").addEventListener("change", () => { inp.mw = clampNum($("#in-mw"), 10, 2000); recompute(); advance("load"); });
  for (const b of $$("#mw-chips button")) b.addEventListener("click", () => { inp.mw = Number(b.dataset.mw); recompute(); advance("load"); });
  const setDensity = (v) => { const [lo, hi] = densityRange(pack, inp.gpu); inp.density = Math.max(lo, Math.min(hi, Math.round(Number(v) || lo))); recompute(); };
  $("#in-density").addEventListener("change", () => setDensity($("#in-density").value));
  $("#in-density-range").addEventListener("input", () => { $("#in-density").value = $("#in-density-range").value; });
  $("#in-density-range").addEventListener("change", () => setDensity($("#in-density-range").value));
  $("#in-target").addEventListener("change", () => { const v = monthVal($("#in-target"), inp.target); if (v) { inp.target = v; recompute(); } });
  $("#in-start").addEventListener("change", () => { const v = monthVal($("#in-start"), inp.start); if (v) { inp.start = v; recompute(); } });
  $("#in-bridge").addEventListener("change", () => { inp.bridge = $("#in-bridge").value; recompute(); advance("power"); });
  // grid only needs no plant, so it moves on; an onsite strategy waits for the plant choice
  $("#in-power").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; inp.power = b.dataset.v; recompute(); if (inp.power === "grid") advance("power"); });
  for (const [sel, key, step] of [["#in-redund", "redund", "redund"], ["#in-cool", "cool", "cooling"]]) $(sel).addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (key === "cool" && inp.cool !== b.dataset.v) { inp.ts = null; inp.ta = null; } inp[key] = b.dataset.v; recompute(); if (!(key === "cool" && mode === "engineer")) advance(step); });
  // engineer inputs: coolant supply temperature and the outdoor approach; blank goes back to the sourced default
  for (const [id, key] of [["#in-ts", "ts"], ["#in-ta", "ta"]]) $(id).addEventListener("change", () => { const el = $(id); const v = el.value.trim();
    const b = coolingBounds(pack, inp.cool)[key]; if (v === "") inp[key] = null; else { let x = Number(v); if (!isFinite(x)) x = b[2]; x = Math.max(b[0], Math.min(b[1], x)); inp[key] = x === b[2] ? null : x; } recompute(); });
  for (const li of $$(".step")) {
    li.querySelector(".step-h").addEventListener("click", () => li.classList.contains("open") ? closeStep(li) : openStep(li.dataset.step));
    li.querySelector(".next").addEventListener("click", () => { li.classList.add("done"); const i = STEP_ORDER.indexOf(li.dataset.step); if (i < STEP_ORDER.length - 1) openStep(STEP_ORDER[i + 1]); else { closeStep(li); $("#b-build").focus({ preventScroll: true }); $("#b-build").scrollIntoView({ block: "nearest", behavior: "smooth" }); } });
  }
}
// Apple-style flow: a finished choice closes its step and opens the next one. After the first build, a change just closes the step.
let advT = 0;
function advance(id) {
  clearTimeout(advT);
  advT = setTimeout(() => {
    const li = $(`.step[data-step="${id}"]`); if (!li || !li.classList.contains("open")) return;
    li.classList.add("done"); const i = STEP_ORDER.indexOf(id);
    if (built || i === STEP_ORDER.length - 1) closeStep(li); else openStep(STEP_ORDER[i + 1]);
  }, 260);
}
function openStep(id) {
  for (const li of $$(".step")) { const on = li.dataset.step === id; li.classList.toggle("open", on); li.querySelector(".step-h").setAttribute("aria-expanded", String(on)); }
  const li = $(`.step[data-step="${id}"]`); if (li && document.body.contains(li) && li.getBoundingClientRect().top < 60) li.scrollIntoView({ block: "start", behavior: "smooth" });
}
function closeStep(li) { li.classList.remove("open"); li.querySelector(".step-h").setAttribute("aria-expanded", "false"); }
function monthVal(el, prev) { const v = (el.value || "").trim(); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) { el.value = prev; return null; } return v; }
function clampNum(el, lo, hi) { let v = Number(el.value); if (!isFinite(v)) v = lo; v = Math.max(lo, Math.min(hi, v)); el.value = v; return v; }
function setSeg(sel, v) { for (const b of $$(`${sel} button`)) { const on = b.dataset.v === v; b.setAttribute(b.getAttribute("role") === "radio" ? "aria-checked" : "aria-pressed", String(on)); } }

function syncInputs() {
  $("#in-state").value = inp.state; $("#in-gpu").value = inp.gpu; $("#in-mw").value = inp.mw; $("#in-target").value = inp.target; $("#in-start").value = inp.start; $("#in-bridge").value = inp.bridge;
  const [lo, hi] = densityRange(pack, inp.gpu);
  const dr = $("#in-density-range"); dr.min = lo; dr.max = hi; dr.step = 1; dr.value = inp.density; dr.disabled = lo === hi;
  const dn = $("#in-density"); dn.min = lo; dn.max = hi; dn.step = 1; dn.value = inp.density;
  for (const b of $$("#mw-chips button")) b.setAttribute("aria-pressed", String(Number(b.dataset.mw) === inp.mw));
  setSeg("#in-power", inp.power); setSeg("#in-redund", inp.redund); setSeg("#in-cool", inp.cool);
  const cb = coolingBounds(pack, inp.cool);
  for (const [id, key] of [["#in-ts", "ts"], ["#in-ta", "ta"]]) { const el = $(id); el.min = cb[key][0]; el.max = cb[key][1]; el.value = inp[key] ?? cb[key][2]; }
}

function renderSteps() {
  const s = pack.json.states.find(x => x.code === inp.state); const isoTxt = pack.get(`iso__${inp.state}`)?.text || R.iso;
  const isoKey = Object.keys(ISO_WHO).find(k => isoTxt.startsWith(k));
  $("#in-iso-hint").textContent = `Grid: ${isoKey ? isoTxt.replace(isoKey, ISO_WHO[isoKey]) : isoTxt}. ${s?.note || ""}`.trim();
  $("#in-power-hint").textContent = { grid: "Wait for the utility to connect the site. The only air permit is the small one for the standby generators.", bridge: "An onsite plant runs the site until the utility connects it, then stays as backup.", hybrid: `An onsite plant carries ${Math.round(pack.v("hybrid_onsite_share") * 100)}% of the load for good, so first output comes from that share of racks; the grid takes the rest once connected.` }[inp.power];
  $("#f-bridge").hidden = inp.power === "grid";
  // cooling: live PUE and WUE per option; air is off when the rack is liquid-only or too dense
  // each option shows its annual PUE and WUE for this state's weather (at that option's default temperatures)
  for (const k of ["liquid", "liquid_tower", "air"]) { const c = k === inp.cool ? R.energy.cool : coolingModel(pack, inp, { cool: k }); $(`[data-metrics="${k}"]`).textContent = `PUE ${c.pue.toFixed(2)} · WUE ${fmtW(c.wue)}`; }
  const rules = R.rules; const air = $('#in-cool [data-v="air"]'); air.disabled = !rules.airAllowed;
  $("#air-od").textContent = rules.airAllowed ? `Air-cooled chillers and fan walls. Works up to about ${rules.airMax} kW per rack.` : `Not available: ${rules.reason}`;
  const e = R.energy;
  $("#live-pue").textContent = e.pue.toFixed(2); $("#live-wue").textContent = fmtW(e.wue); $("#live-air").textContent = `${Math.round(R.airSide.share * 100)}%`;
  const sn = s?.name || inp.state; const ck = e.cool;
  const airNote = rules.airAllowed ? "" : (pack.json.gpus.some(x => !pack.has(`liquid_only__${x.id}`)) ? " To compare air, pick the DGX B200, NVIDIA's air-cooled system, in Compute." : " No air-coolable rack is in the pack, so air cannot be picked.");
  $("#in-cool-hint").textContent = (inp.cool === "air" ? `All the heat goes to air: about ${R.airSide.units} fan walls of ${R.airSide.unitKw} kW.`
    : `Liquid racks still send about ${Math.round(R.airSide.share * 100)} to ${Math.round(R.airSide.shareHi * 100)}% of their heat to air (${R.airSide.mw.toFixed(0)} MW here), so the hall also needs about ${R.airSide.units} fan walls of ${R.airSide.unitKw} kW.`)
    + ` PUE and water use are worked out hour by hour from a typical year of ${sn} weather (NREL, the US national renewable energy lab, TMY3 data): towers work off the wet-bulb, which is lower, so they use less power; dry coolers use no water.` + airNote;
  // engineer readouts
  $("#live-chh").textContent = ck.chillerHours.toLocaleString("en-US"); $("#live-chh-s").textContent = `of 8,760, ${Math.round(ck.chillerHours / 87.6)}%`;
  $("#live-pue-e").textContent = ck.pue.toFixed(2); $("#live-pue-s").textContent = `LBNL design value ${ck.lbnl.pue.toFixed(2)}`;
  $("#live-wue-e").textContent = fmtW(ck.wue);
  const b = ck.bounds; const dev = inp.cool === "liquid_tower" ? "tower" : "dry cooler";
  $("#ta-what").textContent = dev;
  $("#ts-hint").textContent = inp.cool === "air" ? `Chilled water to the fan walls. Default ${b.ts[2]} °C (Airedale, a cooling maker); ${b.ts[0]} to ${b.ts[1]}.` : `Facility water to the CDUs. Default ${b.ts[2]} °C, ASHRAE class W32; ${b.ts[0]} (W17) to ${b.ts[1]} (W45).`;
  $("#ta-hint").textContent = `Water leaves the ${dev} this far above outdoor ${ck.outdoor}. Default ${b.ta[2]} K, the median of makers' data (University of Stuttgart study); ${b.ta[0]} to ${b.ta[1]}.`;
  $("#climate-hint").textContent = `Heat path: ${inp.cool === "air" ? "fan walls" : `rack loop at ${ck.rackInlet} °C, CDU (${ck.cdu} K approach),`} facility loop at ${ck.supply} °C, plate exchanger (${ck.hx} K), ${dev} (${ck.approach} K). Free cooling while outdoor ${ck.outdoor} is below ${ck.freeBelow.toFixed(0)} °C; above that the ${inp.cool === "liquid_tower" ? "water-cooled" : "air-cooled"} chiller runs at COP ${ck.cop.toFixed(2)}, the code minimum.${inp.cool === "air" ? "" : ` The air-side share needs ${pack.v("cool_supply_air_c")} °C water, so the chiller runs for it ${ck.airLoopHours.toLocaleString("en-US")} hours a year.`} Weather: ${ck.station}, typical year.`;
  const g = pack.get(`gpu_${inp.gpu}`); const [lo, hi] = densityRange(pack, inp.gpu); const lq = pack.get(`liquid_only__${inp.gpu}`);
  $("#in-density-hint").textContent = `${g?.text || ""}. ${lq ? "NVIDIA, the GPU maker, sells this rack liquid cooled only. " : ""}Density stays inside the ${g?.uncertain ? "reported" : "published"} ${lo} to ${hi} kW for this rack.`;
  // summaries
  const sum = { location: `${s?.name || inp.state}, ${isoTxt.split(" ")[0]}`, load: `${inp.mw.toLocaleString("en-US")} MW`, power: inp.power === "grid" ? POWER.grid : `${POWER[inp.power]}, ${genLabel(inp.bridge).toLowerCase()}`, redund: REDUND[inp.redund],
    cooling: `${COOL[inp.cool]}, PUE ${e.pue.toFixed(2)}`, compute: `${(pack.json.gpus.find(x => x.id === inp.gpu) || {}).name}, ${inp.density} kW`, schedule: `${fmtMonth(inp.start)} to ${fmtMonth(inp.target)}` };
  for (const li of $$(".step")) li.querySelector("[data-sum]").textContent = sum[li.dataset.step];
}
function fmtW(w) { return w === 0 ? "0" : w < 0.1 ? w.toFixed(2) : w.toFixed(2).replace(/0$/, ""); }

// ---------------------------------------------------------------------------------------------------------
// compute
// ---------------------------------------------------------------------------------------------------------
function recompute() {
  R = plan(pack, inp);
  // the model brings old or out-of-range inputs inside the rules; keep the page in step with what it used
  const keep = { levers: inp.levers || {}, stress: inp.stress || null };
  inp = { ...R.inputs, ...keep };
  if (inp.stress) { const t = R.tasks.find(t => t.slip > 0); if (t) R.holdAt = t.es; }
  R.levers = levers(pack, inp, R); R.risks = risks(pack, inp, R);
  // notes about inputs the model had to correct (old links) stay on screen until the user builds again
  if ((R.inputNotes || []).length) stickyNotes = R.inputNotes; R.inputNotes = stickyNotes;
  const notes = (R.inputNotes || []).join(" ");
  if (notes && notes !== lastNotes) toast(R.inputNotes[R.inputNotes.length - 1], 4200);
  lastNotes = notes;
  syncInputs(); renderSteps(); writeUrl();
  if (built) renderResults();
  if (site) site.setPlan(R, { ...inp, phaseShare: R.phaseShare });
  renderRail();
  if (R) setTime(Math.min(curTime(), R.end), true);
  if (pack.missing.size && debug) console.warn("missing pack ids", [...pack.missing]);
}

function build(scroll = true) {
  if (scroll && built) { stickyNotes = []; R.inputNotes = []; }
  built = true; $("#results-empty").hidden = true; $("#results-body").hidden = false; $("#b-build-t").textContent = "Build it again";
  for (const li of $$(".step")) { li.classList.add("done"); closeStep(li); }
  renderResults();
  if (scroll && innerWidth < 1040) $(".scene-card").scrollIntoView({ block: "start", behavior: "smooth" });
  stopPlay(); setTime(0, true); play();
}

// ---------------------------------------------------------------------------------------------------------
// results
// ---------------------------------------------------------------------------------------------------------
function renderResults() { renderSummary(); if (mode === "engineer") { renderGantt(); renderCosts(); renderDev(); renderLevers(); renderStress(); renderRisks(); buildIndex(); renderAsk(); } }

function renderSummary() {
  $("#k-live").textContent = fmtMonth(R.liveDate);
  $("#k-ttft").textContent = `${R.firstToken.toFixed(0)} months from a ${fmtMonth(inp.start)} start`;
  const d = R.vsTarget, tg = $("#k-target");
  tg.textContent = Math.abs(d) < 0.5 ? `On the ${fmtMonth(inp.target)} target` : d > 0 ? `${d.toFixed(0)} months ahead of target` : `${(-d).toFixed(0)} months behind target`;
  tg.classList.toggle("late", d <= -0.5);
  $("#k-build").textContent = musd(mid(R.costs.site));
  $("#k-build-r").textContent = mode === "engineer" ? `Range ${musd(R.costs.site[0])} to ${musd(R.costs.site[1])}. Land, building, power, cooling` : `Land, building, power and cooling. The tenant's GPUs, about ${musd(mid(R.costs.compute))}, are extra.`;
  $("#k-tenant").textContent = musd(mid(R.costs.compute));
  $("#k-rent").textContent = musd(R.lease.rentYear);
  $("#k-rent-s").textContent = `${(R.lease.share * 100).toFixed(1)}% of build cost, ${R.lease.termYears}-year lease`;
  $("#k-rentm").textContent = musd(R.lease.perMonth);
  $("#k-rentm-s").textContent = R.lease.lateMonths >= 0.5 ? `${musd(R.lease.lostVsTarget)} lost at this date` : "On or ahead of target";
  $("#sum-why").textContent = whatSetsDate();
  const n = $("#sum-notes"); n.hidden = !(R.inputNotes || []).length; n.textContent = (R.inputNotes || []).join(" ");
}
function fmtGal(m) { return m < 0.05 ? "No water" : m < 1 ? `${(m * 1000).toFixed(0)} thousand gallons` : `${m.toFixed(0)} million gallons`; }

// one plain sentence on what sets the date
function whatSetsDate() {
  const t = (id) => R.tasks.find(x => x.id === id); const onsite = inp.power !== "grid";
  const bldg = t("cx34")?.ef ?? 0; const gpu = t("gpulead"); const at = (m) => fmtMonth(addMonths(inp.start, m));
  if (onsite) {
    const p = t("geninst"); const permit = t("air");
    if (p && p.critical && p.ef > bldg - 0.5) {
      const why = permit && permit.critical ? "the air permit and the onsite plant" : `the ${genLabel(inp.bridge).toLowerCase()}, which have to arrive and be installed`;
      return `The onsite power plant sets the date. The building is ready for its final tests around ${at(bldg)}, but ${why} hold first output until ${fmtMonth(R.liveDate)}.`;
    }
  } else {
    const u = t("utility"); const power = u?.ef ?? 0;
    if (power > bldg + 0.5) {
      const wait = u.months > 0.5; const lpt = t("lpt"); const what = wait ? "the utility's own queue to connect large loads" : lpt?.critical ? "the large power transformers" : "the grid study and the substation";
      return `Power sets the date, not the building. The building could be ready around ${at(bldg)}, but ${what} keeps the site waiting until ${at(power)}, about ${Math.round(power - bldg)} months later.`;
    }
  }
  if (gpu && gpu.critical) return `The GPUs set the date: the racks ship around ${at(gpu.ef)}, after the building and power are ready.`;
  return `Construction sets the date. Power is in place in time; the building, its fit-out and testing run until ${at(R.firstToken - (t("bringup")?.months || 0))}.`;
}

function renderDev() {
  const L = R.lease, P = pack;
  $("#dev-sub").textContent = `A developer such as Hut 8, which builds AI data centers and leases them out, owns the land, building, power and cooling. The tenant signs a ${L.termYears}-year triple-net lease, pays the running costs and brings its own GPUs.`;
  const cell = (k, v, e) => `<div><span>${k}</span><b>${v}</b><em>${e}</em></div>`;
  $("#dev-grid").innerHTML = cell("Build cost", musd(L.buildMid), `${musd(L.build[0])} to ${musd(L.build[1])}`) + cell("Rent per year", musd(L.rentYear), `${musd(L.rentRange[0])} to ${musd(L.rentRange[1])}`)
    + cell("Rent as a share of build", `${(L.share * 100).toFixed(1)}%`, `a year; River Bend about ${(P.v("check_river_bend_rent_share") * 100).toFixed(1)}%`) + cell("Rent lost per month late", musd(L.perMonth), L.lateMonths >= 0.5 ? `${L.lateMonths.toFixed(0)} months late: ${musd(L.lostVsTarget)}` : "On or ahead of target");
  $("#dev-note").textContent = `Rent is ${musd(P.v("rent_per_mw_year"))} per MW a year, from Hut 8's own lease releases for River Bend in Louisiana and Beacon Point in Texas. Check case: River Bend's $${P.v("check_river_bend_build_busd").toFixed(2)}B of construction notes against about ${musd(P.v("check_river_bend_rent_busd_year") * 1000)} of rent a year. The tenant's ${R.costs.gpu?.label?.replace("Rack power, ", "") || "GPU"} racks, ${musd(R.costs.compute[0])} to ${musd(R.costs.compute[1])}, sit outside the build cost.`;
}

function renderGantt() {
  const svg = $("#gantt"); const W = Math.max(300, svg.clientWidth || svg.parentElement.clientWidth - 40 || 640);
  const tasks = R.tasks.filter(t => t.months > 0.05);
  const phone = W < 620; const font = phone ? 12 : 12.5;
  const ctx = (renderGantt.c ||= document.createElement("canvas").getContext("2d")); ctx.font = `500 ${font}px "IBM Plex Sans", sans-serif`;
  const labW = phone ? 0 : Math.min(W * 0.46, Math.max(...tasks.map(t => ctx.measureText(t.label).width)) + 16);
  const rowH = phone ? 40 : 24, top = 30, valW = 70;
  const H = top + tasks.length * rowH + 12; const L = labW;
  const span = Math.max(R.end, R.targetMonths) + 2; const x = (m) => L + (m / span) * (W - L - valW);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("height", H);
  let s = "";
  const [sy, sm] = inp.start.split("-").map(Number);
  for (let m = 0; m <= span; m++) { const abs = sy * 12 + (sm - 1) + m; if (abs % 12 === 0) s += `<line x1="${x(m)}" y1="${top - 10}" x2="${x(m)}" y2="${H - 6}" stroke="#E3DFD5"/>`; }
  for (let yr = sy; yr * 12 - (sy * 12 + sm - 1) <= span; yr++) {
    const m0 = Math.max(0, yr * 12 - (sy * 12 + sm - 1)), m1 = Math.min(span, (yr + 1) * 12 - (sy * 12 + sm - 1));
    if (x(m1) - x(m0) < 34) continue;
    s += `<text x="${((x(m0) + x(m1)) / 2).toFixed(1)}" y="${top - 14}" font-size="11" fill="#75746E" text-anchor="middle">${yr}</text>`;
  }
  // the target and first-output lines sit under the labels and bars
  s += `<line x1="${x(R.targetMonths)}" y1="${top - 8}" x2="${x(R.targetMonths)}" y2="${H - 6}" stroke="#2F9A7E" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  s += `<line x1="${x(R.firstToken)}" y1="${top - 8}" x2="${x(R.firstToken)}" y2="${H - 6}" stroke="#17181B" stroke-width="1"/>`;
  tasks.forEach((t, i) => {
    const y = top + i * rowH; const by = phone ? y + 20 : y + 5;
    const col = t.critical ? "#17181B" : "#75746E";
    s += `<text x="${phone ? x(0) : 0}" y="${phone ? y + 13 : y + 16}" font-size="${font}" fill="${col}" stroke="#FBFAF7" stroke-width="3" paint-order="stroke" font-weight="${t.critical ? 600 : 400}">${esc(t.label)}</text>`;
    const x0 = x(t.es), x1 = x(t.ef), xs = x(t.ef - t.slip);
    s += `<rect x="${x0}" y="${by}" width="${Math.max(2, (t.slip ? xs : x1) - x0)}" height="13" rx="3" fill="${t.critical ? "#17181B" : "#CFCABD"}"/>`;
    if (t.slip) s += `<rect x="${xs}" y="${by}" width="${Math.max(2, x1 - xs)}" height="13" rx="3" fill="#B4471B"/>`;
    if (t.lead) s += `<rect x="${x0}" y="${by}" width="${Math.max(2, (t.slip ? xs : x1) - x0)}" height="13" rx="3" fill="url(#lead)" opacity=".45"/>`;
    s += `<text x="${x1 + 6}" y="${by + 11}" font-size="11" fill="#75746E">${t.wait ? "wait" : t.months.toFixed(0) + " mo"}${t.beyond ? ", after" : ""}</text>`;
  });
  svg.innerHTML = `<defs><pattern id="lead" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" stroke-width="2"/></pattern></defs>` + s;
}
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

function renderLevers() {
  const el = $("#lever-list"); el.innerHTML = "";
  const good = R.levers.filter(l => l.months >= 0.5).sort((a, b) => b.months - a.months || b.cost - a.cost).slice(0, 6);
  for (const l of good) {
    const li = document.createElement("li");
    const c = l.cost; const cost = c <= -1 ? `for ${musd(-c)} more` : c >= 1 ? `and ${musd(c)} less` : "at about the same cost";
    li.innerHTML = `<span class="lt">${esc(l.label)}</span><span class="lv">Saves ${l.months.toFixed(0)} mo ${cost}</span><span class="ld">${esc(l.desc)} Worth about ${musd(l.rent)} of rent to the developer.</span>`;
    li.title = "Apply this lever"; li.tabIndex = 0;
    const apply = () => { if (l.change.lever) { inp.levers = { ...(inp.levers || {}) }; inp.levers[l.change.lever] = !inp.levers[l.change.lever]; } if (l.change.inp) Object.assign(inp, l.change.inp); recompute(); toast(`Applied: ${l.label}`); };
    li.addEventListener("click", apply); li.addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); });
    el.appendChild(li);
  }
  $("#lever-none").textContent = good.length ? "Tap a lever to apply it. Each one is tested on its own against this plan." : "Nothing in the pack moves the date for this setup.";
}

function renderStress() {
  const el = $("#stress-list"); el.innerHTML = "";
  for (const s of STRESSES) {
    if (s.onsiteOnly && inp.power === "grid") continue;
    const v = pack.get(`stress_${s.id}_months`); if (!v) continue;
    const b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-pressed", String(inp.stress === s.id));
    b.innerHTML = `<b>${esc(s.label)}</b><em>+${Math.round(v.value)} mo</em><span>${esc(s.desc)}</span>`;
    b.addEventListener("click", () => { inp.stress = inp.stress === s.id ? null : s.id; recompute(); if (inp.stress) { setTime(0, true); play(); } });
    el.appendChild(b);
  }
}

function renderRisks() {
  const el = $("#risk-list"); el.innerHTML = "";
  for (const r of R.risks) {
    const row = document.createElement("div"); row.className = "risk";
    const lk = Math.max(1, Math.round(r.likelihood * 5)), im = Math.min(5, Math.max(1, Math.round(r.impactMax / 3)));
    const imF = r.impactFull > r.impact + 0.5 ? `, full power ${r.impactFull.toFixed(0)} months` : "";
    row.innerHTML = `<b>${esc(r.label)}</b><div class="sc"><span>Likelihood</span>${dots(lk)}<span>Impact</span>${dots(im)}</div><div class="d">Likelihood ${esc(r.likelihoodLabel.split(":")[0])}. ${r.impact >= 0.5 ? `If it hits, first output slips ${r.impact.toFixed(0)} months${imF}.` : `If it hits, first output does not move; the plan has float there${imF}.`} ${esc(r.mitigation)}</div>`;
    el.appendChild(row);
  }
  if (!R.risks.length) el.innerHTML = `<p class="muted small">No risk values in the pack for this setup.</p>`;
}
function dots(n) { return `<span class="dots" aria-label="${n} of 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`; }

const MIX = ["#1E5C4F", "#2F9A7E", "#8CC2AF", "#C9A66B", "#B4471B", "#6B7A8F", "#D9B8A0"];
function renderCosts() {
  const L = R.lease, e = R.energy; let run = 0; const ph = innerWidth < 640; // phones: item, mid and running total; the range goes under the item
  const C5 = ph ? 3 : 5;
  const money = (x) => `$${fmtM(x)}M`;
  const head = (t) => `<tr class="grp"><td colspan="${C5}">${t}</td></tr>`;
  const row = (label, lo, hi, opt = {}) => { const m = (lo + hi) / 2; if (opt.add) run += m; const dot = opt.dot ? `<i class="dot" style="background:${opt.dot}"></i>` : ""; const rn = `<td class="r run">${opt.add || opt.showRun ? fmtM(run) : ""}</td>`;
    return ph ? `<tr class="${opt.cls || ""}"><td>${dot}${label}<span class="rg">${fmtM(lo)} to ${fmtM(hi)}</span></td><td class="r mid">${fmtM(m)}</td>${rn}</tr>` : `<tr class="${opt.cls || ""}"><td>${dot}${label}</td><td class="r">${fmtM(lo)}</td><td class="r mid">${fmtM(m)}</td><td class="r">${fmtM(hi)}</td>${rn}</tr>`; };
  const one = (label, v, cls = "") => `<tr class="${cls}"><td>${label}</td><td class="r" colspan="${ph ? 2 : 3}">${v}</td>${ph ? "" : `<td class="r run"></td>`}</tr>`;
  let s = ph ? `<thead><tr><th>$ million</th><th class="r mid">Mid</th><th class="r run">Running</th></tr></thead><tbody>` : `<thead><tr><th>$ million</th><th class="r">Low</th><th class="r mid">Mid</th><th class="r">High</th><th class="r run">Running total</th></tr></thead><tbody>`;
  s += head("What the developer builds");
  R.costs.lines.forEach((l, i) => { s += row(`${esc(l.label)}${kindTag(l.id)}`, l.lo, l.hi, { add: true, dot: MIX[i % MIX.length] }); });
  s += row("Build cost", R.costs.site[0], R.costs.site[1], { cls: "tot", showRun: true });
  s += head("What the developer earns");
  s += row(`Rent a year${kindTag("rent_per_mw_year")}`, L.rentRange[0], L.rentRange[1]);
  s += row(`Rent over the ${L.termYears}-year lease${tipTag("derived", `Rent a year times the ${L.termYears}-year base term. The 3% yearly escalator is already inside Hut 8's contract values, so this is the average year times ${L.termYears}.`)}`, L.rentRange[0] * L.termYears, L.rentRange[1] * L.termYears);
  s += one(`Rent as a share of build cost${tipTag("derived", `Mid rent a year divided by mid build cost. Check case: Hut 8's River Bend earns about ${(pack.v("check_river_bend_rent_share") * 100).toFixed(1)}% a year on its $3.25B of construction notes.`)}`, `${(L.share * 100).toFixed(1)}% a year`);
  s += one(`Simple payback${tipTag("derived", "Mid build cost divided by mid rent a year, before financing, taxes or the escalator.")}`, `${(L.buildMid / L.rentYear).toFixed(1)} years`);
  s += one(`Rent lost per month late${tipTag("derived", "Rent a year divided by 12. Every month the site misses its date, the developer goes without this.")}`, money(L.perMonth));
  run = mid(R.costs.site);
  s += head("What the tenant pays");
  s += row(`GPU racks, brought by the tenant${kindTag(`compute_capex_per_mw__${inp.gpu}`)}`, R.costs.compute[0], R.costs.compute[1], { add: true, dot: "#17181B" });
  s += row("All-in to first token, developer plus tenant", R.costs.total[0], R.costs.total[1], { cls: "tot", showRun: true });
  s += row(`Running costs a year, paid by the tenant under triple net${tipTag("derived", "Electricity, any onsite gas, and staff and maintenance. A triple-net tenant pays these on top of rent.")}`, e.opex[0], e.opex[1]);
  s += `<tr><td colspan="${C5}" class="muted small">Construction at Turner &amp; Townsend's $14 to $16 per watt for the most advanced US AI facilities (Turner &amp; Townsend is a construction cost consultancy); land from Cushman &amp; Wakefield, a real estate firm; rent from Hut 8, a developer that builds AI data centers and leases them. Multipliers: redundancy ${R.costs.redundF.toFixed(2)}, cooling ${R.costs.coolF.toFixed(2)}.</td></tr></tbody>`;
  $("#cost-table").innerHTML = s;
  // composition bar of the build cost, same colours as the dots
  const tot = mid(R.costs.site);
  $("#cost-mix").innerHTML = `<div class="mix-bar">${R.costs.lines.map((l, i) => `<span style="width:${(((l.lo + l.hi) / 2) / tot * 100).toFixed(2)}%;background:${MIX[i % MIX.length]}" title="${esc(l.label)}"></span>`).join("")}</div><div class="mix-leg">${R.costs.lines.map((l, i) => `<span><i style="background:${MIX[i % MIX.length]}"></i>${esc(l.label)} ${Math.round((l.lo + l.hi) / 2 / tot * 100)}%</span>`).join("")}</div>`;
  const one4 = (label, v) => ph ? `<tr><td>${label}</td><td class="r" colspan="2">${v}</td></tr>` : `<tr><td>${label}</td><td class="r" colspan="3">${v}</td><td class="r run"></td></tr>`;
  const r4 = (label, lo, m, hi) => ph ? `<tr><td>${label}<span class="rg">${lo} to ${hi}</span></td><td class="r mid">${m}</td><td class="r run"></td></tr>` : `<tr><td>${label}</td><td class="r">${lo}</td><td class="r mid">${m}</td><td class="r">${hi}</td><td class="r run"></td></tr>`;
  let t = ph ? `<thead><tr><th>Energy and water, a year</th><th class="r mid">Mid</th><th class="r run"></th></tr></thead><tbody>` : `<thead><tr><th>Energy and water, a year</th><th class="r">Low</th><th class="r mid">Mid</th><th class="r">High</th><th class="r run"></th></tr></thead><tbody>`;
  const pl = pack.get(`pue__${inp.cool}`), ut = pack.get("it_utilization"), ck = e.cool;
  t += one4(`Annual PUE, ${COOL[inp.cool].toLowerCase()}, ${esc(ck.station)} weather${tipTag("derived", "Hour by hour over a typical year: non-cooling overhead, fans and pumps all year, and the chiller in the hours the outdoor air cannot do the job.")}`, ck.pue.toFixed(2));
  t += one4(`Chiller hours a year, at ${ck.supply} °C supply and ${ck.approach} K approach`, `${ck.chillerHours.toLocaleString("en-US")} of 8,760`);
  t += one4(`WUE, litres per kWh of IT${tipTag("derived", "Towers: evaporation of 0.85% of the flow per 10 F of range, plus blowdown at 5 cycles, on all the heat rejected. Dry coolers and air-cooled chillers evaporate nothing.")}`, fmtW(ck.wue));
  t += one4(`For comparison, LBNL design PUE for this design${kindTag(`pue__${inp.cool}`, true)}`, `${(pl.low ?? pl.value).toFixed(2)} to ${(pl.high ?? pl.value).toFixed(2)}`);
  t += r4(`Average IT load, share of rated${kindTag("it_utilization", true)}`, (ut.low ?? ut.value).toFixed(2), ut.value.toFixed(2), (ut.high ?? ut.value).toFixed(2));
  t += one4("Energy used", `${fmtM(e.mwhYear / 1000)} GWh`);
  t += one4(`Electricity${e.onsiteShare ? `, grid share ${Math.round((1 - e.onsiteShare) * 100)}%` : ""}, ${e.priceC.toFixed(2)} c/kWh`, money(e.elecGrid));
  if (e.fuel) t += one4(`Gas for the onsite share, Henry Hub price${tag("assumption")}`, money(e.fuel));
  if (e.bridgeFuelYear) t += one4(`Gas while on bridge power, until the grid connects${tag("assumption")}`, money(e.bridgeFuelYear));
  t += r4("Staff and maintenance, $M", fmtM(e.staff[0]), fmtM((e.staff[0] + e.staff[1]) / 2), fmtM(e.staff[1]));
  t += r4("Running costs, $M", fmtM(e.opex[0]), fmtM((e.opex[0] + e.opex[1]) / 2), fmtM(e.opex[1])).replace("<tr>", '<tr class="tot">');
  t += one4("Water", fmtGal(e.waterMgal));
  t += one4(`Heat to air, fan walls${kindTag("liquid_air_heat_share", true)}`, `${R.airSide.mw.toFixed(0)} MW, about ${R.airSide.units} units`);
  t += one4("Racks", `${R.racks.toLocaleString("en-US")} at ${inp.density} kW`);
  t += `<tr><td colspan="${C5}" class="muted small">Annual PUE and WUE come from a typical year of hourly weather for this state (NREL TMY3) run through the heat path: rack loop, CDU, facility loop, chiller with a free-cooling plate exchanger, and dry coolers or towers. LBNL, the US national lab that studies data center energy, gives the design values it is checked against.</td></tr></tbody>`;
  $("#energy-table").innerHTML = t;
}
// a small tag that opens a box with how a value was worked out
function tipTag(kind, text) { return ` <button type="button" class="tag ${kind} has-tip" data-tip="${esc(text)}">${kind}</button>`; }
function kindTag(id, always) {
  const v = pack.get(id); if (!v) return "";
  if (v.kind === "sourced" && !always) return "";
  const src = v.source_url ? `Source: ${v.publisher}, ${v.published}.` : "Our assumption; no public figure was found.";
  const how = (v.note || "").length > 230 ? v.note.slice(0, 228).replace(/\s+\S*$/, "") + "..." : (v.note || "");
  return ` <button type="button" class="tag ${v.kind} has-tip" data-tip="${esc(`${how} ${src}`.trim())}">${v.kind}</button>`;
}
function tag(k) { return k ? ` <span class="tag ${k}">${k}</span>` : ""; }
function fmtM(x) { return x.toLocaleString("en-US", { maximumFractionDigits: 0 }); }
export function musd(x) { return x >= 1000 ? `$${(x / 1000).toFixed(x >= 10000 ? 0 : 1)}B` : x >= 10 ? `$${x.toFixed(0)}M` : `$${x.toFixed(1)}M`; }

// ---------------------------------------------------------------------------------------------------------
// scene, time, play
// ---------------------------------------------------------------------------------------------------------
async function startScene() {
  const canvas = $("#scene");
  try {
    const mod = await import("./scene.js");
    site = new mod.Site(canvas, { onFrame });
    if (!site.ok) throw new Error("no webgl");
    window.__drawFallback = mod.drawFallback;
  } catch (e) {
    site = null; canvas.style.display = "none"; $("#fallback").style.display = "block";
    try { const mod = await import("./scene.js"); window.__drawFallback = mod.drawFallback; } catch (e2) { window.__drawFallback = flatOnly; }
  }
}
function flatOnly(canvas, plan, time) { const x = canvas.getContext("2d"); x.clearRect(0, 0, canvas.width, canvas.height); x.fillStyle = "#75746E"; x.font = "14px sans-serif"; x.fillText(`Build month ${time.toFixed(0)} of ${plan.end.toFixed(0)}`, 20, 40); }

function renderRail() {
  const el = $("#rail"); el.innerHTML = "";
  for (const s of STAGES) {
    const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "tab"); b.dataset.stage = s.id; b.title = s.blurb;
    b.innerHTML = `<b>${esc(s.short)}</b><span>${fmtMonth(addMonths(inp.start, R.stageEnd[s.id]))}</span>`;
    b.addEventListener("click", () => { stopPlay(); setTime(s.id === "live" ? R.end : Math.max(0, R.stageEnd[s.id] - 0.01)); });
    el.appendChild(b);
  }
  $("#scrub-start").textContent = fmtMonth(inp.start); $("#scrub-end").textContent = fmtMonth(R.liveDate);
}
function curTime() { return R ? Math.max(0, Math.min(R.end, tNow)) : 0; }
function setTime(m, quiet) {
  m = Math.max(0, Math.min(R.end, m)); tNow = m;
  $("#scrub").value = Math.round((m / R.end) * 1000);
  if (site) site.setTime(m); else if (window.__drawFallback) window.__drawFallback($("#fallback-canvas"), R, m, inp);
  let cur = STAGES[STAGES.length - 1];
  for (const s of STAGES) if (m < R.stageEnd[s.id] - 0.001) { cur = s; break; }
  $("#hud-stage").textContent = m >= R.end - 0.01 ? "First output served" : m < 0.01 && !built ? "Bare land" : cur.name;
  $("#hud-date").textContent = `${fmtMonth(addMonths(inp.start, m))}, month ${Math.floor(m)} of ${R.end.toFixed(0)}`;
  for (const b of $("#rail").children) { const id = b.dataset.stage; b.className = (m >= R.stageEnd[id] - 0.01 ? "done " : "") + (id === cur.id ? "now " : "") + (inp.stress && R.heldStage === id ? "held" : ""); }
  const slip = R.tasks.find(t => t.slip > 0);
  const held = inp.stress && R.holdAt != null && slip && m >= R.holdAt - 0.01 && m < R.holdAt + slip.slip;
  $("#hold-tag").classList.toggle("on", !!held);
  if (held) $("#hold-tag").textContent = `Held: ${STRESSES.find(s => s.id === inp.stress).label}, +${slip.slip.toFixed(0)} months`;
  if (!quiet) stopPlay();
}
function play() {
  if (playing) { stopPlay(); return; }
  if (curTime() >= R.end - 0.05) setTime(0, true);
  playing = true; if (site) site.drift = true; $("#play-icon").setAttribute("d", "M2 2h3.5v10H2zM8.5 2H12v10H8.5z"); $("#b-play").setAttribute("aria-pressed", "true");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const secs = reduced ? 0.01 : Math.min(26, Math.max(10, R.end * 0.45)); const rate = R.end / secs; let last = performance.now(); let heldOnce = false;
  const step = (now) => {
    if (!playing) return;
    const dt = (now - last) / 1000; last = now;
    let t = curTime();
    if (inp.stress && R.holdAt != null && !heldOnce && t >= R.holdAt - 0.01) { heldOnce = true; holdUntil = now + 1500; }
    if (now < holdUntil) { playRaf = requestAnimationFrame(step); return; }
    t += dt * rate;
    if (t >= R.end) { setTime(R.end, true); stopPlay(); return; }
    setTime(t, true); playRaf = requestAnimationFrame(step);
  };
  playRaf = requestAnimationFrame(step);
}
function stopPlay() { playing = false; if (site) site.drift = false; cancelAnimationFrame(playRaf); $("#play-icon").setAttribute("d", "M3 2l9 5-9 5z"); $("#b-play").setAttribute("aria-pressed", "false"); }
let fpsT = 0, fpsF = 0, fpsVal = 0;
function onFrame(t) { fpsF++; if (t - fpsT > 1000) { fpsVal = Math.round(fpsF * 1000 / (t - fpsT)); fpsT = t; fpsF = 0; if (debug) $("#fps").textContent = `${fpsVal} fps, ${site?.triangles | 0} tris`; } }

// ---------------------------------------------------------------------------------------------------------
// chrome: tabs, mode, share menu, scene buttons
// ---------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------
// Explore: look anything up in this plan
// ---------------------------------------------------------------------------------------------------------
let ITEMS = [];
const SYN = { money: "cost", price: "cost", spend: "cost", income: "rent", lease: "rent", landlord: "rent developer", when: "date token", date: "token date", grid: "power utility", electricity: "power energy", heat: "cooling air", chip: "gpu", chips: "gpu", nvidia: "gpu", delay: "late stress risk", slip: "stress risk", fast: "lever", faster: "lever", sooner: "lever", tier: "redundancy tier", uptime: "tier" };
function buildIndex() {
  const at = (m) => fmtMonth(addMonths(inp.start, m)); const L = R.lease, e = R.energy; const I = [];
  const add = (t, v, d, k, go) => I.push({ t, v, d, k: `${t} ${d} ${k || ""}`.toLowerCase(), go });
  add("First token", fmtMonth(R.liveDate), `${R.firstToken.toFixed(0)} months from the start. ${whatSetsDate()}`, "first output date token live when", "summary");
  if (R.fullPower > R.firstToken + 0.5) add("Full power", fmtMonth(R.fullDate), "When the whole site runs, after first token.", "full power date grid", "summary");
  add("Versus target", R.vsTarget >= 0 ? `${R.vsTarget.toFixed(0)} months ahead` : `${(-R.vsTarget).toFixed(0)} months behind`, `Target ${fmtMonth(inp.target)}.`, "target late behind ahead date", "summary");
  add("Build cost", musd(L.buildMid), `${musd(L.build[0])} to ${musd(L.build[1])}: land, building, power and cooling, paid by the developer.`, "cost capex build developer total", "costs");
  for (const l of R.costs.lines) add(l.label, musd((l.lo + l.hi) / 2), `${musd(l.lo)} to ${musd(l.hi)}, part of the build cost.`, "cost capex line", "costs");
  add("Tenant's GPUs", musd(mid(R.costs.compute)), `${musd(R.costs.compute[0])} to ${musd(R.costs.compute[1])}, brought and paid for by the tenant.`, "gpu racks tenant cost compute nvidia", "costs");
  add("All-in to first token", musd(mid(R.costs.total)), "Build cost plus the tenant's GPUs.", "cost total all-in", "costs");
  add("Rent a year", musd(L.rentYear), `${(L.share * 100).toFixed(1)}% of build cost each year, on a ${L.termYears}-year triple-net lease, at Hut 8's River Bend rent.`, "rent income developer lease landlord", "dev");
  add("Rent lost per month late", musd(L.perMonth), L.lateMonths >= 0.5 ? `${L.lateMonths.toFixed(0)} months late at this date: about ${musd(L.lostVsTarget)} of rent.` : "The plan is on or ahead of its target.", "rent delay late lost developer", "dev");
  add("Simple payback", `${(L.buildMid / L.rentYear).toFixed(1)} years`, "Build cost divided by rent a year, before financing.", "payback rent return developer", "costs");
  add("Running costs a year", musd(mid(e.opex)), "Electricity and staff, paid by the tenant under triple net.", "opex running cost electricity staff", "costs");
  add("Electricity bill", musd(e.elecGrid), `${fmtM(e.mwhYear / 1000)} GWh a year at ${e.priceC.toFixed(2)} cents per kWh.`, "electricity power energy bill price", "costs");
  add("PUE", e.pue.toFixed(2), `Annual value for ${COOL[inp.cool].toLowerCase()} in this state's weather.`, "pue efficiency cooling energy climate weather", "costs");
  add("Chiller hours", e.cool.chillerHours.toLocaleString("en-US"), `Hours a year the chiller runs at ${e.cool.supply} °C supply; free cooling the rest.`, "chiller hours free cooling climate weather supply temperature approach", "costs");
  add("Water", fmtGal(e.waterMgal), `WUE ${fmtW(e.wue)} litres per kWh of IT.`, "water wue cooling towers", "costs");
  add("Fan walls", `${R.airSide.units} units`, `${R.airSide.mw.toFixed(0)} MW of heat still goes to air, at ${R.airSide.unitKw} kW per fan wall.`, "fan walls air heat cooling crah", "costs");
  add("Racks", R.racks.toLocaleString("en-US"), `${inp.density} kW each.`, "racks density gpu", "costs");
  add("Redundancy", REDUND[inp.redund], "Set in step 4.", "redundancy tier uptime n+1 2n", null);
  for (const t of R.tasks) add(t.label, `${at(t.es)} to ${at(t.ef)}`, `${t.wait ? "Waiting on the utility" : t.months.toFixed(0) + " months"}${t.critical ? ", on the critical path" : ", has float"}.`, "task schedule date critical", "schedule");
  for (const l of R.levers) add(l.label, l.months >= 0.5 ? `Saves ${l.months.toFixed(0)} months` : l.months <= -0.5 ? `Adds ${(-l.months).toFixed(0)} months` : "Same date", l.desc, "lever faster", "levers");
  for (const r of R.risks) add(r.label, `${r.impact.toFixed(0)} months if it hits`, `Likelihood ${r.likelihoodLabel.split(":")[0]}. ${r.mitigation}`, "risk delay stress", "risks");
  ITEMS = I;
}
function renderAsk() {
  const chips = ["Rent", "Payback", "Transformers", "Water", "Fan walls", "GPU", "Full power", "Tier"];
  $("#ask-chips").innerHTML = chips.map(c => `<button type="button">${c}</button>`).join("");
  const q = ($("#ask").value || "").trim().toLowerCase(); const out = $("#ask-out");
  if (!q) { out.innerHTML = ""; return; }
  const words = q.split(/\s+/).flatMap(w => [w, ...(SYN[w] || "").split(" ").filter(Boolean)]);
  const score = (it) => q.split(/\s+/).reduce((a, w) => a + ([w, ...(SYN[w] || "").split(" ")].some(x => x && it.k.includes(x)) ? 1 : 0), 0) + (it.t.toLowerCase().includes(q) ? 2 : 0);
  const hits = ITEMS.map(it => ({ it, s: score(it) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6);
  out.innerHTML = hits.length ? hits.map(({ it }, i) => `<li data-i="${ITEMS.indexOf(it)}"><b>${esc(it.t)}</b><span class="av">${esc(it.v)}</span><span class="ad">${esc(it.d)}</span></li>`).join("") : `<li class="none">Nothing in this plan matches. Try a word like rent, water, transformers or payback, or search every source in the Data &amp; Sources tab.</li>`;
}
function goTo(sec) {
  if (["levers", "stress", "risks", "dev"].includes(sec)) { showMore(sec); $("#more-tabs").scrollIntoView({ block: "start", behavior: "smooth" }); }
  else if (sec) $(`#${sec}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
}
function showMore(t) { for (const b of $$("#more-tabs button")) b.setAttribute("aria-pressed", String(b.dataset.t === t)); for (const p of $$(".more-p")) p.hidden = p.dataset.p !== t; }

// one floating box for every tag that explains how a value was worked out
function bindTips() {
  const tip = $("#tip"); let pinned = null, anchor = null;
  const show = (el) => { anchor = el; tip.textContent = el.dataset.tip; tip.hidden = false; const r = el.getBoundingClientRect(); const w = Math.min(300, innerWidth - 24); tip.style.width = w + "px";
    let x = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), innerWidth - w - 12); let y = r.bottom + 8; tip.style.left = x + "px"; tip.style.top = y + "px";
    const h = tip.offsetHeight; if (y + h > innerHeight - 12) tip.style.top = (r.top - h - 8) + "px"; };
  const hide = () => { tip.hidden = true; pinned = null; };
  document.addEventListener("mouseover", (e) => { const el = e.target.closest(".has-tip"); if (el && !pinned) show(el); });
  document.addEventListener("mouseout", (e) => { const el = e.target.closest(".has-tip"); if (el && !pinned) tip.hidden = true; });
  document.addEventListener("focusin", (e) => { const el = e.target.closest(".has-tip"); if (el) show(el); });
  document.addEventListener("focusout", (e) => { if (e.target.closest(".has-tip") && !pinned) tip.hidden = true; });
  document.addEventListener("click", (e) => { const el = e.target.closest(".has-tip"); if (el) { e.stopPropagation(); if (pinned === el) hide(); else { show(el); pinned = el; } } else if (pinned) hide(); });
  addEventListener("scroll", () => { if (!tip.hidden && anchor) { const r = anchor.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) hide(); else show(anchor); } }, { passive: true });
}

function bindChrome() {
  for (const b of $$("#mode button")) b.addEventListener("click", () => setMode(b.dataset.mode));
  for (const b of $$(".tabs button")) b.addEventListener("click", () => showTab(b.dataset.tab));
  $("#b-build").addEventListener("click", () => build(true));
  $("#scrub").addEventListener("input", () => { stopPlay(); setTime((Number($("#scrub").value) / 1000) * R.end, true); });
  $("#b-play").addEventListener("click", () => play());
  $("#b-reset").addEventListener("click", () => { stopPlay(); inp.stress = null; inp.levers = {}; recompute(); setTime(0, true); if (site) site.setView("overview"); });
  $("#b-cut").addEventListener("click", () => { const on = $("#b-cut").getAttribute("aria-pressed") !== "true"; $("#b-cut").setAttribute("aria-pressed", String(on)); if (site) { site.setCut(on); if (on && !site.userMoved) site.setView("inside"); } });
  const menu = $("#share-menu"), btn = $("#b-share");
  const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", (e) => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; btn.setAttribute("aria-expanded", String(open)); if (open) menu.querySelector("button").focus(); });
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { close(); btn.focus(); } });
  for (const b of menu.querySelectorAll("button")) b.addEventListener("click", close);
  for (const b of $$("#more-tabs button")) b.addEventListener("click", () => showMore(b.dataset.t));
  $("#ask").addEventListener("input", renderAsk);
  $("#ask-chips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; $("#ask").value = b.textContent; renderAsk(); });
  $("#ask-out").addEventListener("click", (e) => { const li = e.target.closest("li[data-i]"); if (li) goTo(ITEMS[Number(li.dataset.i)].go); });
  bindTips();
  let rz = 0; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (built && mode === "engineer") { renderGantt(); renderCosts(); } }, 120); });
}
function showTab(tab) {
  for (const b of $$(".tabs button")) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
  $("#view-planner").hidden = tab !== "planner"; $("#view-data").hidden = tab !== "data";
  if (tab === "planner" && built && mode === "engineer") renderGantt();
  scrollTo({ top: 0 });
}

// ---------------------------------------------------------------------------------------------------------
// share: link, CSV, JSON, card, study
// ---------------------------------------------------------------------------------------------------------
function bindOutputs() {
  $("#b-csv").addEventListener("click", () => { const rows = exportRows(pack, inp, R); download("time-to-first-token.csv", rows.map(r => r.map(csvCell).join(",")).join("\n"), "text/csv"); });
  $("#b-json").addEventListener("click", () => { download("time-to-first-token.json", JSON.stringify({ inputs: inp, results: { firstTokenMonths: R.firstToken, firstToken: R.liveDate, fullPower: R.fullDate, buildCostMusd: R.costs.site, tenantGpuMusd: R.costs.compute, rentMusdYear: R.lease.rentRange, rentShareOfBuild: R.lease.share, rentLostPerMonthMusd: R.lease.perMonth, opexMusdYear: R.energy.opex, pue: R.energy.pue, wue: R.energy.wue, chillerHours: R.energy.cool.chillerHours, coolantSupplyC: R.energy.cool.supply, approachK: R.energy.cool.approach, weatherStation: R.energy.cool.station, waterMgalYear: R.energy.waterMgal, airSideMw: R.airSide.mw, fanWalls: R.airSide.units, inputNotes: R.inputNotes, tasks: R.tasks.map(t => ({ id: t.id, label: t.label, start: t.es, end: t.ef, critical: t.critical, slip: t.slip })) }, pack: pack.json }, null, 2), "application/json"); });
  $("#b-card").addEventListener("click", () => {
    const c = shareCard(); if (!c) { toast("The card needs the site view"); return; }
    c.toBlob((b) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "time-to-first-token-card.png"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast("Share card downloaded"); }, "image/png");
  });
  $("#b-link").addEventListener("click", async () => { try { await navigator.clipboard.writeText(location.href); toast("Link copied"); } catch (e) { toast(location.href); } });
  $("#b-study").addEventListener("click", () => { const d = $("#study-dlg"); if (d.showModal) d.showModal(); else d.setAttribute("open", ""); setTimeout(() => $("#f-email").focus(), 50); });
  $("#report-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const el = $("#f-email"), btn = $("#b-report"), sent = $("#report-sent"); const email = el.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { el.classList.add("bad"); el.focus(); return; }
    el.classList.remove("bad"); btn.disabled = true; btn.textContent = "Sending";
    const body = new URLSearchParams(); body.set(REPORT_FIELDS.email, email); body.set(REPORT_FIELDS.run, requestText());
    let ok = false;
    if (REPORT_FORM.startsWith("https://")) { try { await fetch(REPORT_FORM, { method: "POST", mode: "no-cors", body, keepalive: true }); ok = true; } catch (err) { ok = false; } }
    if (ok) { btn.textContent = "Sent"; sent.textContent = "On its way. The study is built once a day, so it arrives within 24 hours; check spam if it does not."; }
    else { btn.disabled = false; btn.textContent = "Email me the study"; sent.textContent = "That did not go through. Please try again in a minute; the link in the address bar keeps your inputs."; }
    sent.hidden = false;
  });
}
export function requestText() {
  const lines = [`TTFT request v1`, `Link: ${location.href}`];
  for (const [k, v] of Object.entries(inp)) lines.push(`${k}: ${k === "levers" ? JSON.stringify(v || {}) : (v ?? "")}`);
  lines.push(`pack: ${pack.json.version}`);
  lines.push(`result: first_token_months=${R.firstToken.toFixed(1)}; first_token=${R.liveDate}; full_power=${R.fullDate}; capex_site_musd=${R.costs.site[0].toFixed(0)}-${R.costs.site[1].toFixed(0)}; capex_total_musd=${R.costs.total[0].toFixed(0)}-${R.costs.total[1].toFixed(0)}; opex_musd=${R.energy.opex[0].toFixed(0)}-${R.energy.opex[1].toFixed(0)}; pue=${R.energy.pue.toFixed(3)}; wue=${R.energy.wue.toFixed(2)}; chiller_hours=${R.energy.cool.chillerHours}; water_mgal=${R.energy.waterMgal.toFixed(1)}`);
  return lines.join("\n");
}

// share card: a still of the finished site with the headline numbers, 1200 x 630
const CARD_SANS = '"IBM Plex Sans", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const CARD_SERIF = '"Instrument Serif", Georgia, serif';
export function shareCard() {
  const W = 1200, H = 630, PW = 460, X = W - PW + 40, RW = PW - 80;
  let still = null;
  if (site && site.ok) still = site.still(W - PW, H, R.end);
  else if (window.__drawFallback) { still = document.createElement("canvas"); still.width = W - PW; still.height = H; window.__drawFallback(still, R, R.end, inp); }
  if (!still) return null;
  const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  x.fillStyle = "#F7F5F0"; x.fillRect(0, 0, W, H); x.drawImage(still, 0, 0);
  x.fillStyle = "#FBFAF7"; x.fillRect(W - PW, 0, PW, H); x.fillStyle = "#E3DFD5"; x.fillRect(W - PW, 0, 1, H);
  const ls = (v) => { try { x.letterSpacing = v; } catch (e) { } };
  const txt = (t, f, color, y, sp = "0px") => { x.font = f; x.fillStyle = color; ls(sp); x.fillText(t, X, y); ls("0px"); };
  const wrap = (t, f, color, y, lh) => { x.font = f; x.fillStyle = color; const words = t.split(" "); let line = ""; for (const w of words) { const test = line ? line + " " + w : w; if (x.measureText(test).width > RW && line) { x.fillText(line, X, y); y += lh; line = w; } else line = test; } if (line) { x.fillText(line, X, y); y += lh; } return y; };
  const stateName = pack.json.states.find(s => s.code === inp.state)?.name || inp.state;
  txt("TIME TO FIRST TOKEN", `500 11px ${CARD_SANS}`, "#75746E", 62, "0.14em");
  txt(fmtMonth(R.liveDate), `400 76px ${CARD_SERIF}`, "#17181B", 140);
  txt(`First output, ${R.firstToken.toFixed(0)} months from a ${fmtMonth(inp.start)} start`, `400 15px ${CARD_SANS}`, "#45474D", 174);
  x.fillStyle = "#E3DFD5"; x.fillRect(X, 204, RW, 1);
  const cell = (label, value, col, row) => { const cx = X + col * (RW / 2), cy = 240 + row * 82; x.font = `500 11px ${CARD_SANS}`; x.fillStyle = "#75746E"; ls("0.08em"); x.fillText(label.toUpperCase(), cx, cy); ls("0px"); x.font = `500 22px ${CARD_SANS}`; x.fillStyle = "#17181B"; x.fillText(value, cx, cy + 30); };
  cell("Build cost", `${musd(mid(R.costs.site))}`, 0, 0);
  cell("Rent lost per month late", musd(R.lease.perMonth), 1, 0);
  cell("Annual PUE", R.energy.pue.toFixed(2), 0, 1);
  cell("Water per year", R.energy.waterMgal < 0.05 ? "None" : `${R.energy.waterMgal < 1 ? R.energy.waterMgal.toFixed(2) : R.energy.waterMgal.toFixed(0)}M gal`, 1, 1);
  x.fillStyle = "#E3DFD5"; x.fillRect(X, 398, RW, 1);
  let y = wrap(`${inp.mw} MW in ${stateName} on ${R.iso}, ${POWER[inp.power].toLowerCase()}, ${REDUND[inp.redund]}, ${COOL[inp.cool].toLowerCase()}, ${R.racks.toLocaleString("en-US")} racks at ${inp.density} kW.`, `400 14px ${CARD_SANS}`, "#17181B", 428, 21);
  y = wrap(whatSetsDate(), `400 13px ${CARD_SANS}`, "#45474D", y + 6, 19);
  wrap(`Data pack ${pack.json.version}, ${pack.json.values.length} values, each with its source. A planning model, not a quote.`, `400 11px ${CARD_SANS}`, "#75746E", H - 62, 16);
  txt("builtbyaarya.github.io/time-to-first-token", `500 11px ${CARD_SANS}`, "#1E5C4F", H - 30);
  const stamp = `Site at first output, ${fmtMonth(R.liveDate)}`; x.font = `500 12px ${CARD_SANS}`; const sw = x.measureText(stamp).width + 24;
  x.fillStyle = "rgba(251,250,247,0.94)"; rrect(x, 24, H - 54, sw, 30, 15); x.fill(); x.fillStyle = "#17181B"; x.fillText(stamp, 36, H - 34);
  return c;
}
function rrect(x, px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
function csvCell(v) { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function download(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast(`${name} downloaded`); }
let toastT = 0; function toast(msg, ms = 2200) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), ms); }

// ---------------------------------------------------------------------------------------------------------
// Data & Sources
// ---------------------------------------------------------------------------------------------------------
let kindF = "";
function renderData() {
  const vals = pack.json.values; const kinds = vals.reduce((a, v) => (a[v.kind] = (a[v.kind] || 0) + 1, a), {});
  $("#pack-meta").textContent = `Version ${pack.json.version}: ${vals.length} values. ${kinds.sourced || 0} read straight off a source, ${kinds.derived || 0} worked out from sourced values (the note says how), ${kinds.assumption || 0} our own assumptions, labelled. Each value carries its source, publisher and the date it was read.`;
  const q = $("#q"); q.addEventListener("input", drawRows);
  for (const b of $$("#kind-filter button")) b.addEventListener("click", () => { kindF = b.dataset.k; for (const o of $$("#kind-filter button")) o.setAttribute("aria-pressed", String(o === b)); drawRows(); });
  $("#pack-table").addEventListener("click", (e) => { const n = e.target.closest(".nt"); if (n) n.classList.toggle("open"); });
  drawRows();
  const groups = new Map();
  for (const v of vals) { if (!v.source_url) continue; if (!groups.has(v.source_url)) groups.set(v.source_url, { ...v, n: 0 }); groups.get(v.source_url).n++; }
  $("#sources").innerHTML = [...groups.values()].sort((a, b) => a.publisher.localeCompare(b.publisher)).map(g => `<li>${esc(g.publisher)}, <a href="${esc(g.source_url)}" rel="noopener" target="_blank">${esc(g.source_title)}</a> (${esc(String(g.published || ""))}; read ${esc(g.accessed)}). <span class="muted">${g.n} value${g.n > 1 ? "s" : ""}.</span></li>`).join("");
}
function drawRows() {
  const q = ($("#q").value || "").trim().toLowerCase(); const vals = pack.json.values;
  const hit = vals.filter(v => (!kindF || v.kind === kindF) && (!q || [v.id, v.label, v.publisher, v.source_title, v.note, v.text, v.category, v.scope].join(" ").toLowerCase().includes(q)));
  const n = (x) => x == null ? "" : typeof x === "number" ? (Math.abs(x) >= 1000 ? x.toLocaleString("en-US") : String(+x.toFixed(3))) : esc(x);
  let s = `<div class="pr ph" role="row"><span>Value</span><span>Number</span><span>Kind</span><span>Source</span><span>Dates</span></div>`;
  for (let v of hit) {
    const num = v.text && (v.unit === "" || v.unit === "flag" || v.value === 0) ? `<span class="v">${esc(v.text)}</span>` : `<span class="v">${n(v.value)} ${esc(v.unit || "")}</span>${v.low != null || v.high != null ? `<span class="rg">range ${n(v.low ?? v.value)} to ${n(v.high ?? v.value)}</span>` : ""}`;
    if (v.db_hours) v = { ...v, text: undefined }; // climate rows: show the annual mean, not the hourly bins
    const src = v.source_url ? `<a href="${esc(v.source_url)}" target="_blank" rel="noopener">${esc(v.publisher)}</a><span>${esc(v.source_title || "")}</span>` : `<b>${esc(v.publisher)}</b>`;
    s += `<div class="pr" role="row"><div class="c-lab"><b>${esc(v.label)}</b><span class="id">${esc(v.id)}</span>${v.note ? `<span class="nt">${esc(v.note)}</span>` : ""}</div><div class="c-num">${num}</div><div class="c-kind"><span class="tag ${v.kind === "sourced" ? "" : v.kind}${v.kind !== "sourced" && v.note ? " has-tip" : ""}"${v.kind !== "sourced" && v.note ? ` tabindex="0" data-tip="${esc(v.note)}"` : ""}>${esc(v.kind)}</span>${v.uncertain ? ` <span class="tag assumption">uncertain</span>` : ""}</div><div class="c-src src">${src}${v.context_url ? `<a href="${esc(v.context_url)}" target="_blank" rel="noopener">Context page</a>` : ""}</div><div class="c-dt dt">${esc(String(v.published || ""))}<span>read ${esc(v.accessed || "")}</span></div></div>`;
  }
  $("#pack-table").innerHTML = s; $("#q-count").textContent = `${hit.length} of ${vals.length}`;
}

// ---------------------------------------------------------------------------------------------------------
// url state
// ---------------------------------------------------------------------------------------------------------
function readUrl(base) {
  const q = new URLSearchParams(location.search); const o = { ...base, levers: {} };
  for (const [k, key] of Object.entries(URLKEYS)) if (q.has(k)) o[key] = (key === "mw" || key === "density" || key === "ts" || key === "ta") ? Number(q.get(k)) : q.get(k);
  if (q.has("l")) for (const l of q.get("l").split(",")) if (l) o.levers[l] = true;
  if (!o.stress) o.stress = null;
  return o;
}
function writeUrl() {
  if (!built && !$("#welcome").hidden) return;
  const q = new URLSearchParams();
  for (const [k, key] of Object.entries(URLKEYS)) if (inp[key] != null && inp[key] !== "" && inp[key] !== DEFAULT_INPUTS[key]) q.set(k, inp[key]);
  const l = Object.entries(inp.levers || {}).filter(([k, v]) => v).map(([k]) => k).join(","); if (l) q.set("l", l);
  if (mode === "engineer") q.set("m", "e");
  if (debug) q.set("debug", "1");
  history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : ""));
}

// test hooks
window.TTFT = { get plan() { return R; }, get inputs() { return inp; }, get pack() { return pack; }, get mode() { return mode; }, get built() { return built; }, setTime: (m) => setTime(m, true), play, stopPlay, build, setMode, showTab, get site() { return site; }, get fps() { return fpsVal; }, recompute, set: (o) => { Object.assign(inp, o); recompute(); }, requestText, shareCard };
boot().then(() => { window.TTFT.ready = true; document.dispatchEvent(new Event("ttft:ready")); }).catch((e) => { console.error(e); document.body.insertAdjacentHTML("afterbegin", `<p style="padding:16px">The data pack could not be loaded (${esc(e.message)}).</p>`); });
