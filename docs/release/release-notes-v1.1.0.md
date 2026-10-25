# Time to First Token 1.1.0

First public release. A speed-to-market planner for AI data centers: set the location, the IT load, the power strategy, the redundancy, the cooling and the accelerator generation; the site builds itself in 3D stage by stage, and you get the months to first token, the critical path, the levers in months and dollars, capex and opex ranges, PUE and water, a risk register and seven stress tests. Ask for the feasibility study and a PDF for your exact inputs arrives within a day.

## What is in it

- The planner and the 3D site under one fixed sun, with a section view, a phone layout and a flat fallback without WebGL.
- The critical-path model: `docs/methodology.md` explains every task, gate and formula.
- Data pack 2026.10.24: 205 values from 77 source pages, 133 read off the source, 54 derived with the arithmetic recorded, 18 labelled assumptions. Every value carries its URL, publisher, date published and date read.
- The emailed feasibility study, built by `scripts/make_report.py` from the same pack and model as the page.
- New in 1.1.0: the share card, a 1200 x 630 PNG of the finished site with the headline numbers, from the Export panel.
- CSV and JSON export; a link that carries the inputs.

## Trust

Before 1.0.0 shipped, an independent data audit ran 252 checks against the sources and an industry review raised 25 items in the role of a data center development director. The blockers and the failing checks were fixed; both reports are in `docs/audit/` as written. The verification certificate for the 24 October 2026 audit is attached to this release.

## Attached

- `Verification certificate 2026-10-24.pdf`
- Three sample studies: `sample-va.pdf` (300 MW, Northern Virginia, hybrid), `sample-tx.pdf` (100 MW, Dallas-Fort Worth, grid), `sample-ia.pdf` (1,000 MW, Des Moines, bridge)

## Licence

Code MIT. Data pack snapshot CC BY 4.0. The weekly refreshed pack, custom studies, the hosted workspace and the enterprise data licence are sold separately; see `LICENSE-DATA.md` and the README's "Commercial use".

A planning tool, not a quote and not engineering, legal or investment advice. Verify every figure against its source before relying on it.
