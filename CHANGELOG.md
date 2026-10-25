# Changelog

## 1.1.0, 25 October 2026

Share card. A new Export button renders a 1200 x 630 PNG of the finished site under the same fixed sun, with the headline numbers beside it: months to first token, the first-token and full-power dates, facility and power capex, opex, PUE, water, the plan in one line and the critical path. The still is rendered on the page canvas inside one frame, so tone mapping and shadows match the screen, and the scene, camera and time are put back exactly afterwards; without WebGL the card uses the flat site. Three new Playwright checks per viewport and one for the no-WebGL path. The data pack and the model are unchanged (2026.10.24).

## 1.0.0, 24 October 2026

First release. The planner (location, load, power strategy, redundancy, cooling, accelerator generation, dates), the 3D site that builds itself stage by stage under one fixed sun with a section view, the critical-path schedule, speed-to-market levers, capex and opex ranges with PUE and water, the risk register, seven stress tests, CSV and JSON export, the emailed feasibility study built by `scripts/make_report.py`, and data pack 2026.10.24 with 203 values from 92 sources (133 sourced, 54 derived, 16 labelled assumptions).
