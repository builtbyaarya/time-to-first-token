// Run the planner model from the command line (the same code the page runs), so the emailed study and the
// page never disagree.   node scripts/plan.mjs '{"state":"TX","mw":100,...}'   -> JSON on stdout
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Pack, DEFAULT_INPUTS, plan, levers, risks, STAGES, STRESSES, coolingModel } from "../js/model.js";

const here = dirname(fileURLToPath(import.meta.url));
const pack = new Pack(JSON.parse(readFileSync(join(here, "..", "data", "pack.json"), "utf8")));
const inp = { ...DEFAULT_INPUTS, ...(pack.json.defaults || {}), ...JSON.parse(process.argv[2] || "{}") };
inp.mw = Number(inp.mw); inp.density = Number(inp.density); if (!inp.levers) inp.levers = {};
for (const k of ["ts", "ta"]) inp[k] = inp[k] == null || inp[k] === "" ? null : Number(inp[k]);
const R = plan(pack, inp);
Object.assign(inp, R.inputs); // the study describes the inputs as the model used them (old requests may carry air cooling or an out-of-range density)
R.levers = levers(pack, inp, R); R.risks = risks(pack, inp, R);
// stress runs, so the study can show each scenario's effect
R.stress = {};
for (const s of STRESSES) { if (s.onsiteOnly && inp.power === "grid") continue; try { const r = plan(pack, { ...inp, stress: s.id }); R.stress[s.id] = { label: s.label, firstToken: r.firstToken, liveDate: r.liveDate, slip: pack.v(`stress_${s.id}_months`) }; } catch (e) { } }
// sensitivities: one-at-a-time changes
const sens = [];
const tryS = (label, change) => { try { const r = plan(pack, { ...inp, ...change, levers: { ...inp.levers, ...(change.levers || {}) } }); sens.push({ label, firstToken: r.firstToken, capex: r.costs.site, opex: r.energy.opex }); } catch (e) { } };
tryS("IT load +50%", { mw: Math.round(inp.mw * 1.5) }); tryS("IT load -50%", { mw: Math.max(10, Math.round(inp.mw * 0.5)) });
for (const p of ["grid", "bridge", "hybrid"]) if (p !== inp.power) tryS(`Power: ${p}`, { power: p });
for (const c of ["liquid", "liquid_tower", "air"]) if (c !== inp.cool) { if (c !== "air" || R.rules.airAllowed) tryS(`Cooling: ${c}`, { cool: c }); }
for (const r of ["n1", "2n", "tier4"]) if (r !== inp.redund) tryS(`Redundancy: ${r}`, { redund: r });
tryS("Transformers ordered at start", { levers: { lptEarly: !inp.levers.lptEarly } });
tryS("First token on a first phase", { levers: { phase: !inp.levers.phase } });
R.sensitivities = sens;
// the same state under each cooling type, at each type's default temperatures (and the chosen ones for the chosen type)
R.coolingCompare = ["liquid", "liquid_tower", "air"].map(c => coolingModel(pack, inp, { cool: c }));
R.inputs = inp; R.missing = [...pack.missing]; R.stages = STAGES;
process.stdout.write(JSON.stringify(R));
