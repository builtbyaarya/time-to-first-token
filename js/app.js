// Time to First Token: wiring. Inputs -> model -> page and site.
import { Pack, STAGES, STRESSES, DEFAULT_INPUTS, plan, levers, risks, exportRows, mid, addMonths, fmtMonth, monthsBetween, genLabel } from "./model.js";

const $ = (s) => document.querySelector(s);
const debug = new URLSearchParams(location.search).get("debug") === "1";
const REPORT_FORM = "https://docs.google.com/forms/d/e/1FAIpQLSeVCVO7KwCtnVYKx85-GTwhld0cpOQGqnhj6VXOQdrDbmH1MQ/formResponse";
const REPORT_FIELDS = { email: "entry.2022754142", run: "entry.1374242536" };

let pack, inp, R, site, playing = false, playRaf = 0, holdUntil = 0;

// ---------------------------------------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------------------------------------
async function boot() {
  const res = await fetch("data/pack.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("data pack missing");
  pack = new Pack(await res.json());
  $("#tb-pack").textContent = `v${pack.json.version}`;
  const kinds = pack.json.values.reduce((a, v) => (a[v.kind] = (a[v.kind] || 0) + 1, a), {});
  $("#pack-meta").textContent = `Data pack ${pack.json.version}, ${pack.json.values.length} values (${kinds.sourced || 0} sourced, ${kinds.derived || 0} derived from sourced values, ${kinds.assumption || 0} assumptions, ${kinds.context || 0} context), accessed ${pack.json.accessed}. Each value carries its source, publisher and the date it was read. Values marked assumption are ours.`;
  inp = readUrl({ ...DEFAULT_INPUTS, ...(pack.json.defaults || {}) });
  fillInputs();
  await startScene();
  recompute();
  bindOutputs();
  renderSources();
  if (!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) setTimeout(() => play(), 900);
}

function fillInputs() {
  const st = $("#in-state");
  for (const s of pack.json.states) { const o = document.createElement("option"); o.value = s.code; o.textContent = `${s.name}, ${s.metro}`; st.appendChild(o); }
  st.value = inp.state;
  const gp = $("#in-gpu");
  for (const g of pack.json.gpus) { const o = document.createElement("option"); o.value = g.id; o.textContent = g.name; gp.appendChild(o); }
  gp.value = inp.gpu;
  $("#in-mw").value = inp.mw; $("#in-density").value = inp.density; $("#in-target").value = inp.target; $("#in-start").value = inp.start; $("#in-bridge").value = inp.bridge;
  setSeg("#in-power", inp.power); setSeg("#in-redund", inp.redund); setSeg("#in-cool", inp.cool);
  st.addEventListener("change", () => { inp.state = st.value; recompute(); });
  gp.addEventListener("change", () => { inp.gpu = gp.value; inp.density = pack.get(`gpu_${inp.gpu}`)?.value || inp.density; $("#in-density").value = inp.density; recompute(); });
  $("#in-mw").addEventListener("change", () => { inp.mw = clampNum($("#in-mw"), 10, 2000); recompute(); });
  $("#in-density").addEventListener("change", () => { inp.density = clampNum($("#in-density"), 10, 250); recompute(); });
  $("#in-target").addEventListener("change", () => { if ($("#in-target").value) { inp.target = $("#in-target").value; recompute(); } });
  $("#in-start").addEventListener("change", () => { if ($("#in-start").value) { inp.start = $("#in-start").value; recompute(); } });
  $("#in-bridge").addEventListener("change", () => { inp.bridge = $("#in-bridge").value; recompute(); });
  for (const [sel, key] of [["#in-power", "power"], ["#in-redund", "redund"], ["#in-cool", "cool"]]) {
    $(sel).addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; inp[key] = b.dataset.v; setSeg(sel, inp[key]); recompute(); });
  }
}
function clampNum(el, lo, hi) { let v = Number(el.value); if (!isFinite(v)) v = lo; v = Math.max(lo, Math.min(hi, v)); el.value = v; return v; }
function setSeg(sel, v) { for (const b of $(sel).querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.v === v)); }

async function startScene() {
  const canvas = $("#scene");
  try {
    const mod = await import("./scene.js");
    site = new mod.Site(canvas, { onFrame: onFrame });
    if (!site.ok) throw new Error("no webgl");
    window.__drawFallback = mod.drawFallback;
  } catch (e) {
    site = null; canvas.style.display = "none"; $("#fallback").style.display = "block";
    try { const mod = await import("./scene.js"); window.__drawFallback = mod.drawFallback; } catch (e2) { /* three.js did not load either: the flat view still works without it */ window.__drawFallback = flatOnly; }
  }
}
function flatOnly(canvas, plan, time) { const x = canvas.getContext("2d"); x.clearRect(0, 0, canvas.width, canvas.height); x.fillStyle = "#7a7d85"; x.font = "14px system-ui"; x.fillText(`Build month ${time.toFixed(0)} of ${plan.end.toFixed(0)}`, 20, 40); }

// ---------------------------------------------------------------------------------------------------------
// compute and render everything
// ---------------------------------------------------------------------------------------------------------
function recompute() {
  R = plan(pack, inp);
  if (inp.stress) { const t = R.tasks.find(t => t.slip > 0); if (t) R.holdAt = t.es; }
  R.levers = levers(pack, inp, R); R.risks = risks(pack, inp, R);
  writeUrl();
  renderHints(); renderSummary(); renderGantt(); renderLevers(); renderCosts(); renderRisks(); renderStress(); renderRail();
  if (site) site.setPlan(R, { ...inp, phaseShare: R.phaseShare });
  setTime(Math.min(curTime(), R.end), true);
  $("#tb-status").textContent = R.vsTarget >= 0 ? "on target" : "late";
  if (pack.missing.size && debug) console.warn("missing pack ids", [...pack.missing]);
}

function renderHints() {
  const iso = pack.get(`iso__${inp.state}`); const s = pack.json.states.find(x => x.code === inp.state);
  $("#in-iso-hint").textContent = iso ? `${iso.text}. ${s?.note || ""}`.trim() : "";
  $("#in-power-hint").textContent = { grid: "Wait for the utility; the only air permit is the minor-source one for the standby generators.", bridge: "Onsite plant carries the site until the utility energizes it, then stays as backup.", hybrid: `Onsite plant carries ${Math.round(pack.v("hybrid_onsite_share") * 100)}% of the load for good, so first token comes from that tranche of racks; the grid serves the rest once energized.` }[inp.power];
  $("#f-bridge").style.display = inp.power === "grid" ? "none" : "";
  $("#in-cool-hint").textContent = (R && R.airWarning ? R.airWarning + " " : "") + { liquid: `PUE ${pack.v("pue__liquid")}, WUE ${pack.v("wue__liquid")} L/kWh. Closed loop, no cooling-water permit.`, liquid_tower: `PUE ${pack.v("pue__liquid_tower")}, WUE ${pack.v("wue__liquid_tower")} L/kWh. Needs a water permit.`, air: `PUE ${pack.v("pue__air")}. Air cooling tops out near ${pack.v("air_cooling_max_kw_per_rack")} kW per rack.` }[inp.cool];
  const g = pack.get(`gpu_${inp.gpu}`); $("#in-density-hint").textContent = g ? g.text : ""; $("#in-target-hint").textContent = "Versus target is the gap between this month and first token.";
}

function renderSummary() {
  const m = R.firstToken;
  $("#k-ttft").textContent = `${m.toFixed(0)} mo`;
  $("#k-live").textContent = fmtMonth(R.liveDate);
  const d = R.vsTarget; $("#k-target").textContent = `${d >= 0 ? "+" : ""}${d.toFixed(0)} mo`; $("#k-target").className = "v " + (d >= 0 ? "pos" : "neg");
  $("#k-capex").textContent = `${musd(R.costs.site[0])} to ${musd(R.costs.site[1])}`;
  $("#k-opex").textContent = `${musd(R.energy.opex[0])} to ${musd(R.energy.opex[1])}`;
  $("#k-pue").textContent = R.energy.pue.toFixed(2);
  $("#k-water").textContent = R.energy.waterMgal < 1 ? R.energy.waterMgal.toFixed(2) : R.energy.waterMgal.toFixed(0);
  const crit = R.tasks.filter(t => t.critical).map(t => t.label);
  const longest = [...R.tasks].sort((a, b) => b.months - a.months)[0];
  const onsite = inp.power !== "grid";
  $("#summary-line").textContent = `${inp.mw} MW in ${pack.json.states.find(s => s.code === inp.state)?.name} on ${R.iso}, ${{ grid: "grid only", bridge: "onsite bridge power", hybrid: "hybrid power" }[inp.power]}${onsite ? ` (${genLabel(inp.bridge).toLowerCase()})` : ""}, ${inp.redund.toUpperCase().replace("TIER4", "Tier IV").replace("N1", "N+1")}, ${{ liquid: "liquid cooling with dry coolers", liquid_tower: "liquid cooling with towers", air: "air cooling" }[inp.cool]}. First token ${fmtMonth(R.liveDate)}${onsite && R.fullPower > R.firstToken ? `, full grid power ${fmtMonth(R.fullDate)}` : ""}.`;
  $("#summary-cp").textContent = `${R.racks.toLocaleString("en-US")} racks at ${inp.density} kW. Critical path: ${crit.map(c => c.split(":")[0].split(",")[0]).join(" > ")}. Longest single item: ${longest.label.toLowerCase()}, ${longest.months.toFixed(0)} months. GPU racks on top of the facility: ${musd(R.costs.compute[0])} to ${musd(R.costs.compute[1])}.${R.airWarning ? " " + R.airWarning : ""}`;
}
export function musd(x) { return x >= 1000 ? `$${(x / 1000).toFixed(x >= 10000 ? 0 : 1)}B` : `$${x.toFixed(0)}M`; }

function renderGantt() {
  const svg = $("#gantt"); const W = Math.max(320, svg.clientWidth || svg.parentElement.clientWidth - 32 || 640);
  const phone = W < 520; const L = phone ? 118 : 200, rowH = 22, top = 26;
  const tasks = R.tasks.filter(t => t.months > 0.05); const H = top + tasks.length * rowH + 14;
  const span = Math.max(R.end, R.targetMonths) + 3; const x = (m) => L + (m / span) * (W - L - 12);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("height", H);
  let s = "";
  // year grid
  const [sy, sm] = inp.start.split("-").map(Number);
  for (let m = 0; m <= span; m++) { const abs = sy * 12 + (sm - 1) + m; if (abs % 12 === 0) { s += `<line x1="${x(m)}" y1="${top - 8}" x2="${x(m)}" y2="${H - 10}" stroke="#E2E2DE"/><text x="${x(m) + 3}" y="${top - 12}" font-size="11" fill="#7A7D85">${abs / 12}</text>`; } else if (abs % 6 === 0) s += `<line x1="${x(m)}" y1="${top - 4}" x2="${x(m)}" y2="${H - 10}" stroke="#EFEFEC"/>`; }
  tasks.forEach((t, i) => {
    const y = top + i * rowH; const label = phone ? short(t.label, 17) : short(t.label, 30);
    s += `<text x="0" y="${y + 14}" font-size="${phone ? 11 : 12}" fill="${t.critical ? "#16181C" : "#7A7D85"}" font-weight="${t.critical ? 600 : 400}">${esc(label)}</text>`;
    const x0 = x(t.es), x1 = x(t.ef), xs = x(t.ef - t.slip);
    s += `<rect x="${x0}" y="${y + 4}" width="${Math.max(2, (t.slip ? xs : x1) - x0)}" height="13" rx="3" fill="${t.critical ? "#16181C" : "#C9CDD6"}"/>`;
    if (t.slip) s += `<rect x="${xs}" y="${y + 4}" width="${Math.max(2, x1 - xs)}" height="13" rx="3" fill="#B4540A"/>`;
    if (t.lead) s += `<rect x="${x0}" y="${y + 4}" width="${Math.max(2, (t.slip ? xs : x1) - x0)}" height="13" rx="3" fill="url(#lead)" opacity=".5"/>`;
    s += `<text x="${x1 + 5}" y="${y + 14}" font-size="11" fill="#7A7D85">${t.wait ? "wait" : t.months.toFixed(0)}${t.beyond ? ", after first token" : ""}</text>`;
  });
  s += `<line x1="${x(R.targetMonths)}" y1="${top - 8}" x2="${x(R.targetMonths)}" y2="${H - 10}" stroke="#2D5BFF" stroke-width="1.5" stroke-dasharray="3 3"/>`;
  s += `<line x1="${x(R.firstToken)}" y1="${top - 8}" x2="${x(R.firstToken)}" y2="${H - 10}" stroke="#16181C" stroke-width="1"/>`;
  svg.innerHTML = `<defs><pattern id="lead" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" stroke-width="2"/></pattern></defs>` + s;
}
function short(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

function renderLevers() {
  const el = $("#lever-list"); el.innerHTML = "";
  for (const l of R.levers) {
    const row = document.createElement("div"); row.className = "lever";
    const m = l.months, c = l.cost;
    row.innerHTML = `<div>${esc(l.label)}</div><div class="m ${m > 0.4 ? "pos" : m < -0.4 ? "neg" : "muted"}">${m >= 0 ? "" : "+"}${Math.abs(m) < 0.5 ? "0" : (-m).toFixed(0).replace("-0", "0")} mo</div><div class="c ${c > 1 ? "pos" : c < -1 ? "neg" : "muted"}">${c >= 0 ? "" : "+"}${c < 0 ? musd(-c) : "-" + musd(c)}</div><div class="d">${esc(l.desc)}</div>`;
    row.querySelector(".m").textContent = m >= 0.5 ? `${m.toFixed(0)} mo faster` : m <= -0.5 ? `${(-m).toFixed(0)} mo slower` : "same time";
    row.querySelector(".c").textContent = c >= 1 ? `saves ${musd(c)}` : c <= -1 ? `costs ${musd(-c)}` : "about the same";
    row.style.cursor = "pointer"; row.title = "Apply this lever";
    row.addEventListener("click", () => { if (l.change.lever) { inp.levers = inp.levers || {}; inp.levers[l.change.lever] = !inp.levers[l.change.lever]; } if (l.change.inp) { Object.assign(inp, l.change.inp); fillSegsFromInp(); } recompute(); toast(`Applied: ${l.label}`); });
    el.appendChild(row);
  }
}
function fillSegsFromInp() { setSeg("#in-power", inp.power); setSeg("#in-redund", inp.redund); setSeg("#in-cool", inp.cool); $("#in-bridge").value = inp.bridge; $("#in-state").value = inp.state; }

function renderCosts() {
  const t = $("#cost-table"); let s = `<tr><th>Item</th><th class="r">Low, $M</th><th class="r">High, $M</th></tr>`;
  for (const l of R.costs.lines) s += `<tr><td>${esc(l.label)} <span class="tag ${l.tag}">${l.tag}</span></td><td class="r">${fmtM(l.lo)}</td><td class="r">${fmtM(l.hi)}</td></tr>`;
  s += `<tr><td><b>Facility and power</b></td><td class="r"><b>${fmtM(R.costs.site[0])}</b></td><td class="r"><b>${fmtM(R.costs.site[1])}</b></td></tr>`;
  s += `<tr><td>GPU racks, ${esc(R.costs.gpu?.text || inp.gpu)} <span class="tag range">range</span></td><td class="r">${fmtM(R.costs.compute[0])}</td><td class="r">${fmtM(R.costs.compute[1])}</td></tr>`;
  s += `<tr><td><b>All-in capex</b></td><td class="r"><b>${fmtM(R.costs.total[0])}</b></td><td class="r"><b>${fmtM(R.costs.total[1])}</b></td></tr>`;
  const e = R.energy;
  s += `<tr><td>Electricity per year${e.onsiteShare ? `, grid share ${Math.round((1 - e.onsiteShare) * 100)}%` : ""}, PUE ${e.pue.toFixed(2)}, ${e.priceC.toFixed(2)} c/kWh</td><td class="r" colspan="2">${fmtM(e.elecGrid)}</td></tr>`;
  if (e.fuel) s += `<tr><td>Gas for the onsite share, Henry Hub price, no delivery adder <span class="tag assump">assumption</span></td><td class="r" colspan="2">${fmtM(e.fuel)}</td></tr>`;
  if (e.bridgeFuelYear) s += `<tr><td>Gas while on bridge power, per year until energization, Henry Hub price <span class="tag assump">assumption</span></td><td class="r" colspan="2">${fmtM(e.bridgeFuelYear)}</td></tr>`;
  s += `<tr><td>Staff and maintenance per year <span class="tag range">range</span></td><td class="r">${fmtM(e.staff[0])}</td><td class="r">${fmtM(e.staff[1])}</td></tr>`;
  s += `<tr><td><b>Opex per year, steady state</b></td><td class="r"><b>${fmtM(e.opex[0])}</b></td><td class="r"><b>${fmtM(e.opex[1])}</b></td></tr>`;
  s += `<tr><td>Water per year, WUE ${e.wue} L/kWh</td><td class="r" colspan="2">${e.waterMgal.toFixed(e.waterMgal < 1 ? 2 : 0)} million gal</td></tr>`;
  s += `<tr><td class="muted" colspan="3">Multipliers applied: redundancy ${R.costs.redundF.toFixed(2)}, cooling ${R.costs.coolF.toFixed(2)}; IT utilization ${e.util} of rated (LBNL range 0.6 to 0.8). Sources in the data pack below.</td></tr>`;
  t.innerHTML = s;
}
function fmtM(x) { return x.toLocaleString("en-US", { maximumFractionDigits: 0 }); }

function renderRisks() {
  const el = $("#risk-list"); el.innerHTML = "";
  for (const r of R.risks) {
    const row = document.createElement("div"); row.className = "risk";
    const lk = Math.round(r.likelihood * 5), im = Math.min(5, Math.max(1, Math.round(r.impact / 3)));
    const imF = r.impactFull > r.impact + 0.5 ? `, full power ${r.impactFull.toFixed(0)} months` : "";
    row.innerHTML = `<div><b>${esc(r.label)}</b></div><div class="small num">${dots(lk)} ${dots(Math.min(5, Math.max(1, Math.round(r.impactMax / 3))))}</div><div class="d">Likelihood ${esc(r.likelihoodLabel.split(":")[0])}; slips first token ${r.impact.toFixed(0)} months${imF} if it hits. ${esc(r.mitigation)}</div>`;
    el.appendChild(row);
  }
  if (!R.risks.length) el.innerHTML = `<p class="muted small">No risk values in the pack for this setup.</p>`;
}
function dots(n) { return `<span class="dots" aria-label="${n} of 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`; }

function renderStress() {
  const el = $("#stress-list"); el.innerHTML = "";
  for (const s of STRESSES) {
    if (s.onsiteOnly && inp.power === "grid") continue;
    const v = pack.get(`stress_${s.id}_months`); if (!v) continue;
    const b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-pressed", String(inp.stress === s.id));
    b.innerHTML = `<b>${esc(s.label)}</b><span>${esc(s.desc)}</span><em>+${v.value} mo</em>`;
    b.addEventListener("click", () => { inp.stress = inp.stress === s.id ? null : s.id; recompute(); if (inp.stress) { setTime(0, true); play(); } });
    el.appendChild(b);
  }
}

function renderRail() {
  const el = $("#rail"); el.innerHTML = "";
  for (const s of STAGES) {
    const b = document.createElement("button"); b.type = "button"; b.role = "tab"; b.dataset.stage = s.id;
    const end = R.stageEnd[s.id];
    b.innerHTML = `<b>${esc(s.short)}</b><span>${fmtMonth(addMonths(inp.start, end))}</span>`;
    b.title = s.blurb;
    b.addEventListener("click", () => { stopPlay(); setTime(s.id === "live" ? R.end : Math.max(0, R.stageEnd[s.id] - 0.01)); });
    el.appendChild(b);
  }
  $("#scrub-start").textContent = fmtMonth(inp.start); $("#scrub-end").textContent = fmtMonth(R.liveDate);
}

// ---------------------------------------------------------------------------------------------------------
// time, play, HUD
// ---------------------------------------------------------------------------------------------------------
function curTime() { return (Number($("#scrub").value) / 1000) * (R ? R.end : 1); }
function setTime(m, quiet) {
  m = Math.max(0, Math.min(R.end, m));
  $("#scrub").value = Math.round((m / R.end) * 1000);
  if (site) site.setTime(m); else if (window.__drawFallback) window.__drawFallback($("#fallback-canvas"), R, m, inp);
  // HUD
  let cur = STAGES[STAGES.length - 1];
  for (const s of STAGES) if (m < R.stageEnd[s.id] - 0.001) { cur = s; break; }
  $("#hud-stage").textContent = m >= R.end - 0.01 ? "First token served" : cur.name;
  $("#hud-date").textContent = `${fmtMonth(addMonths(inp.start, m))}, month ${Math.floor(m)} of ${R.end.toFixed(0)}`;
  for (const b of $("#rail").children) { const id = b.dataset.stage; b.className = (m >= R.stageEnd[id] - 0.01 ? "done " : "") + (id === cur.id ? "now " : "") + (inp.stress && R.heldStage === id ? "held" : ""); }
  const held = inp.stress && R.holdAt != null && m >= R.holdAt - 0.01 && m < R.holdAt + (R.tasks.find(t => t.slip)?.slip || 0);
  const tag = $("#hold-tag"); tag.classList.toggle("on", !!held);
  if (held) { const t = R.tasks.find(t => t.slip > 0); tag.textContent = `Held: ${STRESSES.find(s => s.id === inp.stress).label}, +${t.slip.toFixed(0)} months`; }
  if (!quiet) stopPlay();
}
$("#scrub").addEventListener("input", () => { stopPlay(); setTime(curTime(), true); });
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
$("#b-play").addEventListener("click", play);
$("#b-reset").addEventListener("click", () => { stopPlay(); inp.stress = null; inp.levers = {}; recompute(); setTime(0, true); if (site) site.setView("overview"); });
$("#b-cut").addEventListener("click", () => { const on = $("#b-cut").getAttribute("aria-pressed") !== "true"; $("#b-cut").setAttribute("aria-pressed", String(on)); if (site) { site.setCut(on); if (on && !site.userMoved) site.setView("inside"); } });

let fpsT = 0, fpsF = 0, fpsVal = 0;
function onFrame(t) { fpsF++; if (t - fpsT > 1000) { fpsVal = Math.round(fpsF * 1000 / (t - fpsT)); fpsT = t; fpsF = 0; if (debug) $("#fps").textContent = `${fpsVal} fps, ${site?.triangles | 0} tris`; } }

// ---------------------------------------------------------------------------------------------------------
// export, link, report request
// ---------------------------------------------------------------------------------------------------------
function bindOutputs() {
  $("#b-csv").addEventListener("click", () => { const rows = exportRows(pack, inp, R); download("time-to-first-token.csv", rows.map(r => r.map(csvCell).join(",")).join("\n"), "text/csv"); });
  $("#b-json").addEventListener("click", () => { download("time-to-first-token.json", JSON.stringify({ inputs: inp, results: { firstTokenMonths: R.firstToken, firstToken: R.liveDate, fullPower: R.fullDate, capexMusd: R.costs.total, facilityMusd: R.costs.site, opexMusdYear: R.energy.opex, pue: R.energy.pue, waterMgalYear: R.energy.waterMgal, tasks: R.tasks.map(t => ({ id: t.id, label: t.label, start: t.es, end: t.ef, critical: t.critical, slip: t.slip })) }, pack: pack.json }, null, 2), "application/json"); });
  $("#b-card").addEventListener("click", async () => {
    const c = shareCard(); if (!c) { toast("The card needs the site view"); return; }
    $("#card-preview").src = c.toDataURL("image/png"); $("#card-preview").hidden = false;
    c.toBlob((b) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "time-to-first-token-card.png"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast("Share card downloaded"); }, "image/png");
  });
  $("#b-link").addEventListener("click", async () => { try { await navigator.clipboard.writeText(location.href); toast("Link copied"); } catch (e) { toast(location.href); } });
  $("#report-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const inpEl = $("#f-email"), btn = $("#b-report"), sent = $("#report-sent");
    const email = inpEl.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { inpEl.classList.add("bad"); inpEl.focus(); return; }
    inpEl.classList.remove("bad"); btn.disabled = true; btn.textContent = "Sending";
    const body = new URLSearchParams(); body.set(REPORT_FIELDS.email, email); body.set(REPORT_FIELDS.run, requestText());
    let ok = false;
    if (REPORT_FORM.startsWith("https://")) { try { await fetch(REPORT_FORM, { method: "POST", mode: "no-cors", body, keepalive: true }); ok = true; } catch (err) { ok = false; } }
    if (ok) { btn.textContent = "Sent"; sent.textContent = "On its way. The study is generated once a day, so it arrives within 24 hours; check spam if it does not."; sent.hidden = false; }
    else { btn.disabled = false; btn.textContent = "Email me the study"; sent.textContent = "That did not go through. Please try again in a minute; the link in the address bar keeps your inputs."; sent.hidden = false; }
  });
}
export function requestText() {
  const lines = [`TTFT request v1`, `Link: ${location.href}`];
  for (const [k, v] of Object.entries(inp)) lines.push(`${k}: ${k === "levers" ? JSON.stringify(v || {}) : (v ?? "")}`);
  lines.push(`pack: ${pack.json.version}`);
  lines.push(`result: first_token_months=${R.firstToken.toFixed(1)}; first_token=${R.liveDate}; full_power=${R.fullDate}; capex_site_musd=${R.costs.site[0].toFixed(0)}-${R.costs.site[1].toFixed(0)}; capex_total_musd=${R.costs.total[0].toFixed(0)}-${R.costs.total[1].toFixed(0)}; opex_musd=${R.energy.opex[0].toFixed(0)}-${R.energy.opex[1].toFixed(0)}; pue=${R.energy.pue}; water_mgal=${R.energy.waterMgal.toFixed(1)}`);
  return lines.join("\n");
}
// ---------------------------------------------------------------------------------------------------------
// share card: a still of the finished site with the headline numbers, 1200 x 630
// ---------------------------------------------------------------------------------------------------------
const CARD_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Inter, Helvetica, Arial, sans-serif';
export function shareCard() {
  const W = 1200, H = 630, PW = 440, X = W - PW + 40, RW = PW - 80;
  // the site, finished, from the overview under the same sun
  let still = null;
  if (site && site.ok) still = site.still(W - PW, H, R.end);
  else if (window.__drawFallback) { still = document.createElement("canvas"); still.width = W - PW; still.height = H; window.__drawFallback(still, R, R.end, inp); }
  if (!still) return null;
  const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  x.fillStyle = "#F3F3F1"; x.fillRect(0, 0, W, H);
  x.drawImage(still, 0, 0);
  x.fillStyle = "#FFFFFF"; x.fillRect(W - PW, 0, PW, H);
  x.fillStyle = "#E2E2DE"; x.fillRect(W - PW, 0, 1, H);
  const font = (px, wt = 400) => { x.font = `${wt} ${px}px ${CARD_FONT}`; try { x.letterSpacing = "0px"; } catch (e) { } };
  const txt = (t, px, wt, color, y, ls) => { font(px, wt); x.fillStyle = color; try { x.letterSpacing = ls || "0px"; } catch (e) { } x.fillText(t, X, y); };
  const wrap = (t, px, wt, color, y, lh) => { font(px, wt); x.fillStyle = color; try { x.letterSpacing = "0px"; } catch (e) { } const words = t.split(" "); let line = ""; for (const w of words) { const test = line ? line + " " + w : w; if (x.measureText(test).width > RW && line) { x.fillText(line, X, y); y += lh; line = w; } else line = test; } if (line) { x.fillText(line, X, y); y += lh; } return y; };
  const stateName = pack.json.states.find(s => s.code === inp.state)?.name || inp.state;
  const powerLabel = { grid: "grid only", bridge: `onsite bridge power (${genLabel(inp.bridge).toLowerCase()})`, hybrid: `hybrid power (${genLabel(inp.bridge).toLowerCase()})` }[inp.power];
  const coolLabel = { liquid: "liquid cooling, dry coolers", liquid_tower: "liquid cooling, towers", air: "air cooling" }[inp.cool];
  const redundLabel = inp.redund.toUpperCase().replace("TIER4", "Tier IV").replace("N1", "N+1");
  // title block
  txt("TIME TO FIRST TOKEN", 11, 600, "#7A7D85", 64, "0.12em");
  font(84, 700); x.fillStyle = "#2D5BFF"; x.fillText(`${R.firstToken.toFixed(0)}`, X, 150);
  const nw = x.measureText(`${R.firstToken.toFixed(0)}`).width;
  font(18, 500); x.fillStyle = "#4A4D55"; x.fillText("months", X + nw + 12, 150);
  txt(`First token ${fmtMonth(R.liveDate)}${inp.power !== "grid" && R.fullPower > R.firstToken + 0.5 ? `, full grid power ${fmtMonth(R.fullDate)}` : ""}`, 15, 400, "#4A4D55", 184);
  x.fillStyle = "#E2E2DE"; x.fillRect(X, 212, RW, 1);
  // four figures, two columns on one grid
  const cell = (label, value, col, row) => { const cx = X + col * (RW / 2), cy = 252 + row * 84; font(11, 600); x.fillStyle = "#7A7D85"; try { x.letterSpacing = "0.08em"; } catch (e) { } x.fillText(label.toUpperCase(), cx, cy); try { x.letterSpacing = "0px"; } catch (e) { } font(22, 600); x.fillStyle = "#16181C"; x.fillText(value, cx, cy + 30); };
  cell("Facility and power", `${musd(R.costs.site[0])} to ${musd(R.costs.site[1])}`, 0, 0);
  cell("Opex per year", `${musd(R.energy.opex[0])} to ${musd(R.energy.opex[1])}`, 1, 0);
  cell("Design PUE", R.energy.pue.toFixed(2), 0, 1);
  cell("Water per year", `${R.energy.waterMgal < 1 ? R.energy.waterMgal.toFixed(2) : R.energy.waterMgal.toFixed(0)}M gal`, 1, 1);
  x.fillStyle = "#E2E2DE"; x.fillRect(X, 408, RW, 1);
  // the plan in words
  let y = wrap(`${inp.mw} MW in ${stateName} on ${R.iso}, ${powerLabel}, ${redundLabel}, ${coolLabel}, ${R.racks.toLocaleString("en-US")} racks at ${inp.density} kW.`, 14, 400, "#16181C", 438, 21);
  const crit = R.tasks.filter(t => t.critical).map(t => t.label.split(":")[0].split(",")[0]).filter((l, i, a) => l !== a[i - 1]);
  y = wrap(`Critical path: ${crit.join(", ")}.`, 13, 400, "#4A4D55", y + 6, 19);
  // footer
  wrap(`Data pack ${pack.json.version}, ${pack.json.values.length} values, each with its source. A planning model, not a quote.`, 11, 400, "#7A7D85", H - 68, 16);
  txt("github.com/builtbyaarya/time-to-first-token", 11, 500, "#16181C", H - 32);
  // a small stamp on the site image
  const stamp = `Site at first token, ${fmtMonth(R.liveDate)}`; font(12, 500); const sw = x.measureText(stamp).width + 24;
  x.fillStyle = "rgba(255,255,255,0.92)"; rrect(x, 24, H - 24 - 30, sw, 30, 15); x.fill();
  x.fillStyle = "#16181C"; x.fillText(stamp, 36, H - 24 - 10);
  return c;
}
function rrect(x, px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }

function csvCell(v) { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function download(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast(`${name} downloaded`); }
let toastT = 0; function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2200); }

function renderSources() {
  const groups = new Map();
  for (const v of pack.json.values) { if (!v.source_url) continue; const k = v.source_url; if (!groups.has(k)) groups.set(k, { ...v, ids: [] }); groups.get(k).ids.push(v.id); }
  const ol = $("#sources"); ol.innerHTML = "";
  for (const g of [...groups.values()].sort((a, b) => a.publisher.localeCompare(b.publisher))) {
    const li = document.createElement("li");
    li.innerHTML = `${esc(g.publisher)}, <a href="${esc(g.source_url)}" rel="noopener" target="_blank">${esc(g.source_title)}</a> (${esc(String(g.published || ""))}; read ${esc(g.accessed)}). <span class="muted">${g.ids.length} value${g.ids.length > 1 ? "s" : ""}.</span>`;
    ol.appendChild(li);
  }
  const assum = pack.json.values.filter(v => v.kind === "assumption");
  if (assum.length) { const li = document.createElement("li"); li.innerHTML = `<b>Assumptions, ours, no public figure:</b> ${assum.map(v => `${esc(v.label)} (${esc(String(v.value))} ${esc(v.unit || "")})`).join("; ")}.`; ol.appendChild(li); }
}

// ---------------------------------------------------------------------------------------------------------
// url state
// ---------------------------------------------------------------------------------------------------------
const URLKEYS = { s: "state", mw: "mw", p: "power", b: "bridge", r: "redund", c: "cool", g: "gpu", d: "density", t: "target", st: "start", x: "stress" };
function readUrl(base) {
  const q = new URLSearchParams(location.search); const o = { ...base, levers: {} };
  for (const [k, key] of Object.entries(URLKEYS)) if (q.has(k)) o[key] = (key === "mw" || key === "density") ? Number(q.get(k)) : q.get(k);
  if (q.has("l")) for (const l of q.get("l").split(",")) if (l) o.levers[l] = true;
  if (!o.stress) o.stress = null;
  return o;
}
function writeUrl() {
  const q = new URLSearchParams();
  for (const [k, key] of Object.entries(URLKEYS)) if (inp[key] != null && inp[key] !== "" && inp[key] !== DEFAULT_INPUTS[key]) q.set(k, inp[key]);
  const l = Object.entries(inp.levers || {}).filter(([k, v]) => v).map(([k]) => k).join(","); if (l) q.set("l", l);
  if (debug) q.set("debug", "1");
  history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : ""));
}

// test hooks
window.TTFT = { get plan() { return R; }, get inputs() { return inp; }, get pack() { return pack; }, setTime: (m) => setTime(m, true), play, stopPlay, get site() { return site; }, get fps() { return fpsVal; }, recompute, set: (o) => { Object.assign(inp, o); fillSegsFromInp(); recompute(); }, requestText, shareCard };
boot().then(() => { window.TTFT.ready = true; document.dispatchEvent(new Event("ttft:ready")); }).catch((e) => { console.error(e); $("#summary-line").textContent = `The data pack could not be loaded (${e.message}).`; });
