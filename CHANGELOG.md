# Changelog

## 2.0.0, 11 November 2026

A new page and three model fixes. Data pack 2026.11.11: 216 values (141 sourced, 57 derived, 18 assumptions).

The page. A welcome screen where you pick Beginner or Engineer; a slim top bar with the mode switch, Planner and Data & Sources tabs, and a Share menu (copy link, CSV, JSON, share card, and the feasibility study request). The planner is a guided flow of seven steps that each close to a one-line summary, then a Build it button that runs the plan and plays the 3D build. Beginner sees the first-output date, the months, the build cost and one sentence on what sets the date; Engineer adds the developer view, the full critical path with complete task names, stress tests, a ranked list of levers, the risk register and the cost, energy and water tables with low, mid and high. Data & Sources is now a searchable page of every value with its source. New look: warm paper, one spruce accent, Instrument Serif with IBM Plex Sans and Mono served from the site. Old share links still work; inputs outside the new rules are brought inside them with a note.

Landlord view. GPUs moved out of the headline cost into a tenant's line. New developer view: build cost, rent per year, rent as a share of build cost and rent lost per month of delay, with rent from Hut 8's River Bend and Beacon Point lease releases ($1.86M to $1.91M per MW a year) and River Bend's $3.25B construction notes as the check case (14.4% a year).

Rack density sets the cooling. Density is bounded to each rack's published range; air cooling is off above the Uptime Institute's 50 kW ceiling and for racks NVIDIA sells liquid cooled only (all three in the pack). Liquid halls send about 10% of heat to air (Lenovo; 15% in Vertiv's datasheet), sized as 500 kW fan walls (Vertiv), with their own order in the schedule.

Cooling numbers. PUE and WUE now come from LBNL's 2024 report, Figure 4.4, for each exact design: liquid with dry coolers 1.09 and no water; liquid with towers 1.13 and 1.96 L/kWh; air on air-cooled chillers 1.59 and about 0.05 L/kWh. Construction capex now uses Turner & Townsend's 2026-27 range for advanced US AI facilities, $14 to $16 per watt, in place of the wider $8.9M to $23.3M per MW for construction (land keeps the old source). First-output dates are unchanged (the default 100 MW Texas plan is still 55.8 months); build cost, PUE and water change. The feasibility study generator (`scripts/make_report.py`) uses the new model and describes the landlord split.

## 1.1.0 release fixes, 26 October 2026

Play now builds the site on every screen. On 120 Hz displays (recent MacBook Pros and iPhones) the build stayed at month 0 after pressing Play, because each frame's step was smaller than one notch of the timeline slider and was rounded away; time is now kept exactly and the slider only shows it. A tap on Play in the first second no longer gets cancelled by the autoplay. The year labels on the schedule chart sit in the middle of their own year instead of beside the January line. three.js is now served from the site itself (js/vendor/three, MIT), so the 3D scene also works on networks that block outside script CDNs, and the month boxes accept only YYYY-MM on browsers that show them as plain text. Four new Playwright checks (53 in all). The data pack, the model and the three sample studies are unchanged (VA 51.2, TX 55.8, IA 61.9 months).

## 1.1.0, 25 October 2026

Share card. A new Export button renders a 1200 x 630 PNG of the finished site under the same fixed sun, with the headline numbers beside it: months to first token, the first-token and full-power dates, facility and power capex, opex, PUE, water, the plan in one line and the critical path. The still is rendered on the page canvas inside one frame, so tone mapping and shadows match the screen, and the scene, camera and time are put back exactly afterwards; without WebGL the card uses the flat site. Three new Playwright checks per viewport and one for the no-WebGL path. The data pack and the model are unchanged (2026.10.24).

## 1.0.0, 24 October 2026

First release. The planner (location, load, power strategy, redundancy, cooling, accelerator generation, dates), the 3D site that builds itself stage by stage under one fixed sun with a section view, the critical-path schedule, speed-to-market levers, capex and opex ranges with PUE and water, the risk register, seven stress tests, CSV and JSON export, the emailed feasibility study built by `scripts/make_report.py`, and data pack 2026.10.24 with 203 values from 92 sources (133 sourced, 54 derived, 16 labelled assumptions).
