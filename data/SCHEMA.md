# Data pack schema (data/pack.json)

Every number the planner or the report uses lives here. No value without a source.

{
  "version": "2026.10.24",
  "accessed": "2026-10-24",
  "values": [
    {
      "id": "lead_lpt_months",                 // snake_case, unique
      "label": "Large power transformer lead time",
      "category": "lead_time | interconnection | permit | construction | commissioning | capex | opex | energy | cooling | compute | risk",
      "value": 30,                             // central value used in calculations (number)
      "low": 24, "high": 48,                   // optional range; if given, UI shows "range"
      "unit": "months",
      "kind": "sourced | derived | assumption", // sourced = read off the source; derived = arithmetic on sourced values (say how in note); assumption = ours, labelled in UI
      "scope": "US",                           // or ISO/state code, e.g. "ERCOT", "VA"
      "source_title": "...",
      "source_url": "https://...",             // the exact page/PDF; must resolve
      "publisher": "U.S. Department of Energy",
      "published": "2025-04",                  // YYYY or YYYY-MM or YYYY-MM-DD
      "accessed": "2026-10-24",
      "quote": "<= 15 words from the source showing the number",
      "note": "how the value was read or derived"
    }
  ]
}
