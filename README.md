# Time to First Token

A speed-to-market planner for AI data centers. In AI, time to first token is how long a model takes to start answering. Here it is how long a site takes to go from bare land to a data center serving its first token.

Set the location, the IT load, the power strategy, the redundancy, the cooling and the accelerator generation. The site builds itself in 3D as the plan moves: land, permits, power, shell, electrical, cooling, white space, compute, commissioning Level 1 to Level 5, first token. The planner gives the critical-path schedule, the levers that save or cost months and dollars, capex and opex ranges, PUE and water, and a risk register. A stress test replays real kinds of delay on the plan. At the end you can ask for a full feasibility study for your exact inputs, emailed as a PDF.

Every number comes from a dated, versioned data pack in `data/` with its source, publisher and the date it was read. Nothing is typed in from memory. Assumptions are labelled as assumptions, in the UI and in the study.

![The site building up stage by stage](docs/assets/build.gif)

| Phone, first token | Section view | Desktop |
|---|---|---|
| ![Phone](docs/assets/phone-live.png) | ![Section](docs/assets/section.png) | ![Desktop](docs/assets/desktop.png) |

## What it answers

- How many months from project start to first token, and to full grid power, for this site and this power strategy.
- What is on the critical path: the interconnection study, the large power transformers, the utility wait, the air permit, the shell, the long-lead switchgear and generators, commissioning, the racks.
- What each choice does: onsite bridge power, hybrid, ordering transformers at risk, a first phase of racks, dry coolers against towers, 2N against N+1, engines against turbines, a different state.
- Capex and opex ranges, design PUE, water use, and the risks with likelihood and impact on this plan.
- What a transformer slip, an interconnection study delay, a permit challenge, a turbine lead-time extension, a utility energization delay, a GPU allocation delay or a labour shortage does to the date.

## How it is built

- `index.html`, `css/style.css`, `js/app.js`: the page. No framework, no build step; system fonts; one accent colour.
- `js/scene.js`: the 3D site in three.js (loaded from a CDN as an ES module). One fixed sun; the camera moves, the light never does, so every shadow lands in the same place from the first stage to the last. Soft shadows, a section view that cuts the building open, racks that light up as they are commissioned, heat haze over the coolers when the site goes live. Render-on-demand, instanced racks and fence posts, a flat 2D fallback without WebGL, and no animation under `prefers-reduced-motion`.
- `js/model.js`: the planner. A critical-path calculation over the tasks a build really has, with lagged starts where fit-outs overlap, plus the cost, energy and water arithmetic. `docs/methodology.md` explains every formula.
- `data/pack.json`: the data pack. `scripts/build_pack.py` assembles it from the research files in `data/research/` and records every unit conversion and derivation. `docs/sources.md` lists the sources.
- `scripts/plan.mjs` runs the same model from the command line; `scripts/make_report.py` turns a request into the LaTeX feasibility study (executive summary and recommendation, site and grid, power strategy, permitting path, design basis, schedule and critical path, capex and opex, sensitivities, risks and mitigations, source appendix). Every figure in it carries a source number.

## Running it

Open `index.html` through any static server (the page fetches `data/pack.json`, which a `file://` URL cannot do). For example `python3 -m http.server` in the folder, then `http://localhost:8000/`.

A link carries the inputs (`?s=VA&mw=300&p=hybrid&b=gas_turbine&r=n1&c=liquid&g=gb200&d=120&t=2028-06&st=2026-11`), so two people can look at the same plan.

To build a study: `python3 scripts/make_report.py request.txt out/` where `request.txt` is the text the page writes when you ask for the study (or a JSON object of inputs). It needs `node`, and `xelatex` with the TeX Gyre Pagella fonts (it falls back to `pdflatex` with Palatino).

## The feasibility study

The page posts the email address and the inputs to a form; a scheduled job reads the new rows once a day, builds the PDF from the data pack and the inputs with `scripts/make_report.py`, and emails it. If the post fails the page says so and keeps the inputs in the link, so the request can be sent again. No fresh research is done per request, so the study and the page always agree. The address is used once and is not kept. The study is not a quote; every figure says where it came from, and the reader is asked to verify it before relying on it.

## What is real and what is a model

The pack holds 200-odd values from the Lawrence Berkeley National Laboratory, the US Energy Information Administration, the EPA, ERCOT, PJM, MISO, SPP, FERC, Dominion, state and county permitting pages, the Uptime Institute, Cushman & Wakefield, JLL, Wood Mackenzie, NVIDIA and vendor spec sheets, company filings and the trade press. Where a figure exists only in a secondary source, the pack says so. Where no public figure exists at all (sixteen values: a civil-works duration, a bring-up month, the construction scaling exponent, a GPU allocation delay and a few sizing ratios), the pack labels it an assumption and the UI shows the label.

The model is a planning model. It does not know your utility's queue position, your county's board, or your turbine slot. It is meant to show what drives the date and the money, and to be re-run as the real figures come in.

## Roadmap

See `ROADMAP.md`. `CHANGELOG.md` records what shipped.

## Licence

Code MIT (`LICENSE`). Data pack CC BY 4.0 (`data/LICENSE`). Sibling project: [Solar Factory: Survive to 2030](https://github.com/builtbyaarya/solar-factory-game).

Built by Aarya.
