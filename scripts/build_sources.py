#!/usr/bin/env python3
"""Write docs/sources.md from data/pack.json: one entry per source, with the values drawn from it."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
P = json.load(open(ROOT / "data" / "pack.json"))
by = {}
for v in P["values"]:
    key = v.get("source_url") or ("assumption:" + v["id"])
    by.setdefault(key, []).append(v)
out = [f"# Sources\n", f"Data pack {P['version']}, every value read on {P['accessed']}. {len(P['values'])} values from {sum(1 for k in by if not k.startswith('assumption:'))} sources. "
       "Each value in `data/pack.json` carries `kind`: `sourced` (read off the page), `derived` (arithmetic on sourced values; the note says the arithmetic) or `assumption` (ours, no public figure).\n",
       "| # | Publisher | Title | Published | Values |", "|---|---|---|---|---|"]
n = 0
for key, vals in sorted(by.items(), key=lambda kv: (kv[0].startswith("assumption:"), kv[1][0]["publisher"])):
    n += 1; v0 = vals[0]
    ids = ", ".join(f"`{v['id']}`" for v in vals)
    if key.startswith("assumption:"):
        out.append(f"| {n} | Time to First Token (assumption) | {v0['label']} | {P['version']} | {ids} |")
    else:
        out.append(f"| {n} | {v0['publisher']} | [{v0['source_title']}]({v0['source_url']}) | {v0.get('published', '')} | {ids} |")
out.append("\n## Assumptions\n")
for v in P["values"]:
    if v["kind"] == "assumption":
        out.append(f"- `{v['id']}`: {v['value']} {v.get('unit', '')}. {v['note']}")
out.append("\n## Research files\n\nThe raw research behind the pack, with every fetched page, is in `data/research/` (three files, one per topic, plus notes on what could not be found). `scripts/build_pack.py` turns them into the pack and records every conversion and derivation.\n")
(ROOT / "docs" / "sources.md").write_text("\n".join(out) + "\n")
print("docs/sources.md:", n, "sources")
