# notes_cost.md: capex / opex / cooling / compute pack (accessed 2026-10-24)

Output: data/pack_cost.json, 101 values (93 sourced, 8 derived; 0 assumptions). All numbers read off pages fetched today; curl is blocked by the proxy so every source went through WebFetch.

## What I looked for and found

Capex
- Cushman & Wakefield 2026 Data Center Development Cost Guide (via CRE Daily, 2026-08-27, and IREI): all-in greenfield $8.9M-$23.3M per MW US/Canada excl. GPUs, +21% per MW since Q4 2024, cost shares (power infra 21%, core/shell 17%, contingency 16%, site 7%), component inflation Dec 2021-2026 (switchgear 60%, copper 46%, generators 33%, cooling 32%, transformers 29%), lead times (pad transformers 68-113 wk, generators 60-100 wk, MV switchgear 38-63 wk).
- JLL forecast (via Datacentres.com, 2026-05-12): global avg $11.3M/MW 2026, +6% YoY, +47% vs 2020, premium markets >$15M/MW, liquid cooling +$1-2M/MW, AI shell/core uplift 15-25%, modular saves 10-15% cost and 30-40% time.
- Turner & Townsend: 2025-26 index press release (AI premium 7-10% US, 2025 inflation 5.5%, Silicon Valley $13.3/W, New Jersey $12.9/W, 83% say supply chains not ready, 48% power is top obstacle); 2026 US index cost-trends page (Chicago $13.28/W, Tokyo $18.28/W, NA cost/W +13% YoY, 20% of respondents >15% inflation); IREI (2024 index 9.0%).
- Schneider WP282 (2020): $7.02/W air vs $6.98/W liquid at 10 kW/rack, $6.33 at 20 kW, $6.02 at 40 kW; 2026 Schneider byline restates 10%/14% savings and $0.14/W UPS/switchgear saving.
- Filings: Core Scientific Q1 2025 8-K ($1.5M/MW tenant-funded build credit, ~590 MW); Applied Digital Q1 FY26 ($3B / 300 MW Polaris Forge 2, derived $10M/MW); CoreWeave 10-K FY2025 (850 MW active, 3.1 GW contracted; capex dollars sit in MD&A section not reached in fetch); OpenAI/WSJ ~$50B per GW all-in incl. chips.

Compute
- NVIDIA pages: H100 SXM 700 W TDP; DGX H100 10.2 kW max, 8U; SuperPOD H100 rack "exceeds 40 kW"; GB200 NVL72 72 GPUs / 36 CPUs liquid-cooled (no kW on NVIDIA page; 120 kW from The Register, 132 kW from Vertiv reference design).
- Lenovo LP2357: GB300 NVL72 135 kW TDP / 155 kW peak, 72 GPUs, 45 C inlet, ~90% heat to liquid.
- Vera Rubin NVL144 120-130 kW is from a secondary source (Introl) because nvidia.com/vera-rubin-nvl144 returned a client error. Rubin Ultra NVL576 600 kW from The Register's GTC 2025 coverage.
- LBNL: rated 8-GPU server power (A100 6.5, H100 10.2, B100 12.2 kW), 60-80% operating fraction, measured H100 node 7.9 kW.
- Prices: GB200 rack ~$3M ($2.8-3.5M), GB300 ~$5.0M (purchase orders) to $6.5M (media), via Wing VC Aug 2026; Oracle $40B for ~400k GB200 at Abilene. Derived GPU cost per MW IT: ~$25M (GB200) to ~$37M (GB300).

PUE / WUE / cooling
- Uptime 2025 survey PDF: PUE 1.54 (1.48 post-2020 builds, 1.44 at 20 MW+), modal rack density ~9 kW, 82% have no racks >30 kW, power = 45% of outages, 46% hiring difficulty.
- Uptime Cooling Survey 2025 (Report 181): DLC used by 22% of operators, most say DLC needed above 20 kW/rack.
- LBNL: US PUE 1.4 (2023), WUE 0.36 L/kWh, hyperscale 0.1-0.3 L/kWh, 176 TWh 2023, 325-580 TWh 2028.
- Hyperscalers: Google PUE 1.09 (2025); AWS PUE 1.14, WUE 0.12 (2025); Microsoft WUE 0.27 (2025), zero-water design from 2024; Meta PUE 1.08, WUE 0.18 (2023, via DCD).
- Thresholds: Chatsworth (evaluate at 30 kW, 40-50 kW liquid attractive); DCK quoting Uptime (air impractical >50 kW) and Schneider (cold plates 100-150 kW).
- ASHRAE 5th ed. classes W17/W27/W32/W40/W45/W+ via Upsite summary.
- Vertiv: CoolChip CDU 2300 kW and 350 kW; 7 MW GB200 reference design up to 132 kW/rack, 20% lower cooling cost claim, 50% faster prefab claim.
- Water per MW-year derived from WUE (1.05-3.15 ML); Schneider's 43 L/min/MW evaporative figure included separately.

Opex / energy
- EIA STEO Oct 2026 Table 7c: industrial 8.62 c (2025), 9.05 c (2026), 9.15 c (2027); commercial 13.41/14.00/14.21. Electricity per MW-year derived at PUE 1.54, 1.2, 1.1.
- Uptime Spending Survey Dec 2025: 42% cite power as top unit-cost rise, 23% staffing, 32% capacity expansion.
- Colocation: $196/kW/month H2 2025 (Encor), CBRE outlook $200+/kW/month, vacancy 1.6%.

Redundancy
- Schneider WP75 Rev 4: cost per rack N $13.5-18k, Tier II $18-24k, Tier III $24-30k, 2N $36-42k; availability 99.92% (N) to 99.99997% (2N). Derived 2N/N ratio ~2.5.
- Schneider WP108: UPS costs "nearly double" for 2N.
- Generator Source guide: size = IT x PUE + 20-25% buffer; N+1 / 2N definitions; derived 1,750 kW genset per MW IT.

## What I could not find (today, from public pages)
- Capex split into shell / electrical / mechanical in $/MW for AI vs conventional. C&W gives only percentage shares of total; T&T's AI-focus and methodology pages render as navigation only. No public primary source gives a liquid-cooled vs air-cooled absolute $/MW breakdown newer than Schneider WP282 (2020).
- Full T&T cost-per-watt table for US metros (Northern Virginia, Phoenix, Dallas, Atlanta, Columbus, Portland): only Silicon Valley, New Jersey and Chicago appear on public pages; Statista masks the rest.
- LBNL PUE by data center type and WUE by cooling type: in figures 4.4-4.6, not in the PDF text layer.
- Uptime PUE by region/age/size breakdown (Update 420) is behind login; only the headline numbers in the free survey PDF.
- Cooling equipment lead times (chillers, CDUs, dry coolers) in weeks: Linesight and T&T only say "extending"; no numeric chiller/CDU lead time found. Electrical gear lead times are covered.
- Staffing and maintenance opex in $/MW-year: Statista masks the maintenance-per-30 MW figure; Uptime spending survey gives only shares of respondents. The only $/rack-year opex is an author estimate (Wing VC), flagged as indicative.
- CoreWeave 2025 capex dollars and any per-MW statement (MD&A not reached within the fetch limit); Meta/Microsoft design PUE for new AI sites; xAI Colossus cost per MW.
- Official NVIDIA kW ratings for GB200 NVL72 and Vera Rubin NVL144 (NVIDIA pages do not state power; Lenovo states GB300).
- EIA Electric Power Monthly Table 5.6.A (state-level prices) returned a server error; STEO national averages used instead. State-level tariffs are therefore absent from this pack.
