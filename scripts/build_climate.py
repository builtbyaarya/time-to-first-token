#!/usr/bin/env python3
"""Turn NREL TMY3 hourly weather files (EnergyPlus EPW format) into the climate bins the cooling model reads.

For each state in the pack we use one TMY3 station near the pack's metro. Each file has 8,760 hourly rows.
We read dry-bulb, dew point and pressure, compute wet-bulb with the standard psychrometric relations
(ASHRAE Fundamentals, Chapter 1: Magnus-type saturation pressure and the psychrometer equation, solved by
bisection), and count hours in 1 degree C bins. Dry-bulb drives dry coolers and air-cooled chillers; wet-bulb
drives cooling towers.

Run: python3 scripts/build_climate.py <folder with one subfolder per state code holding its .epw>
Writes data/research/pack_climate.json.
"""
import json, math, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BIN_LO, BIN_HI = -45, 50  # degrees C, 1 degree bins; hour at t goes in floor(t)
MIRROR = "https://energyplus-weather.s3.amazonaws.com/north_and_central_america_wmo_region_4/USA/"

STATIONS = {  # state: (EPW folder path under the mirror, plain-English station name, note)
    "TX": ("TX/USA_TX_Dallas-Fort.Worth.Intl.AP.722590_TMY3", "Dallas-Fort Worth International Airport", ""),
    "VA": ("VA/USA_VA_Sterling-Washington.Dulles.Intl.AP.724030_TMY3", "Washington Dulles International Airport", ""),
    "OH": ("OH/USA_OH_Columbus-Port.Columbus.Intl.AP.724280_TMY3", "Port Columbus International Airport", ""),
    "GA": ("GA/USA_GA_Atlanta-Hartsfield-Jackson.Intl.AP.722190_TMY3", "Atlanta Hartsfield-Jackson Airport", ""),
    "AZ": ("AZ/USA_AZ_Phoenix-Sky.Harbor.Intl.AP.722780_TMY3", "Phoenix Sky Harbor Airport", ""),
    "NV": ("NV/USA_NV_Reno-Tahoe.Intl.AP.724880_TMY3", "Reno-Tahoe International Airport", ""),
    "IL": ("IL/USA_IL_Chicago-OHare.Intl.AP.725300_TMY3", "Chicago O'Hare Airport", ""),
    "PA": ("PA/USA_PA_Pittsburgh.Intl.AP.725200_TMY3", "Pittsburgh International Airport", ""),
    "OR": ("OR/USA_OR_Portland-Hillsboro.AP.726986_TMY3", "Portland-Hillsboro Airport", ""),
    "WA": ("WA/USA_WA_Ephrata.Muni.AP.727826_TMY3", "Ephrata Municipal Airport", "nearest TMY3 station to Quincy, about 20 km away"),
    "IA": ("IA/USA_IA_Des.Moines.Intl.AP.725460_TMY3", "Des Moines International Airport", ""),
    "WY": ("WY/USA_WY_Cheyenne.Muni.AP.725640_TMY3", "Cheyenne Municipal Airport", ""),
    "ND": ("SD/USA_SD_Aberdeen.Rgnl.AP.726590_TMY3", "Aberdeen Regional Airport, South Dakota", "nearest TMY3 station to Ellendale, North Dakota, about 60 km south"),
    "NC": ("NC/USA_NC_Charlotte-Douglas.Intl.AP.723140_TMY3", "Charlotte Douglas International Airport", ""),
    "TN": ("TN/USA_TN_Memphis.Intl.AP.723340_TMY3", "Memphis International Airport", ""),
    "OK": ("OK/USA_OK_Tulsa.Intl.AP.723560_TMY3", "Tulsa International Airport", "nearest TMY3 station to Pryor, about 60 km away"),
    "IN": ("IN/USA_IN_South.Bend-Michiana.Rgnl.AP.725350_TMY3", "South Bend Regional Airport", "nearest TMY3 station to New Carlisle, about 20 km away"),
    "MI": ("MI/USA_MI_Ann.Arbor.Muni.AP.725374_TMY3", "Ann Arbor Municipal Airport", "nearest TMY3 station to Saline, about 15 km away"),
}


def psat(t):  # saturation vapour pressure over water, Pa (Magnus form, Alduchov and Eskridge 1996)
    return 610.94 * math.exp(17.625 * t / (t + 243.04))


def wet_bulb(tdb, tdp, p):
    pw = psat(tdp)
    lo, hi = min(tdp, tdb) - 1, tdb
    for _ in range(40):  # psychrometer equation: pw = psat(twb) - A*p*(tdb - twb), A = 6.6e-4 per K
        m = (lo + hi) / 2
        f = psat(m) - 6.6e-4 * p * (tdb - m) - pw
        if f > 0: hi = m
        else: lo = m
    return (lo + hi) / 2


def bins(vals):
    h = [0] * (BIN_HI - BIN_LO + 1)
    for v in vals:
        i = min(max(math.floor(v) - BIN_LO, 0), len(h) - 1)
        h[i] += 1
    return h


def main(folder):
    out = []
    for st, (path, name, note) in STATIONS.items():
        epw = next(Path(folder, st).glob("*.epw"))
        db, wb = [], []
        for line in open(epw, encoding="latin-1").read().splitlines()[8:]:
            f = line.split(",")
            if len(f) < 10: continue
            t, d, p = float(f[6]), float(f[7]), float(f[9])
            if p > 900000 or p < 50000: p = 101325
            db.append(t); wb.append(wet_bulb(t, min(d, t), p))
        assert len(db) == 8760, (st, len(db))
        srt_db, srt_wb = sorted(db), sorted(wb)
        out.append({"state": st, "station": name, "note": note, "epw": epw.name, "url": MIRROR + path + "/" + Path(path).name + ".zip",
                    "hours": len(db), "bin_lo": BIN_LO, "db_hours": bins(db), "wb_hours": bins(wb),
                    "db_mean": round(sum(db) / len(db), 1), "wb_mean": round(sum(wb) / len(wb), 1),
                    "db_99_6": round(srt_db[int(0.996 * 8760)], 1), "wb_99_6": round(srt_wb[int(0.996 * 8760)], 1), "db_max": max(db), "wb_max": round(max(wb), 1)})
        print(st, out[-1]["db_mean"], out[-1]["wb_mean"], out[-1]["db_99_6"], out[-1]["wb_99_6"])
    json.dump({"about": "Hourly typical-year weather from NREL's TMY3 data set (National Solar Radiation Database 1991-2005 update), read from the EnergyPlus weather mirror of the US Department of Energy, binned to 1 degree C. Wet-bulb computed from dry-bulb, dew point and pressure.",
               "source_title": "Users Manual for TMY3 Data Sets (NREL/TP-581-43156)", "source_url": "https://www.nrel.gov/docs/fy08osti/43156.pdf", "publisher": "National Renewable Energy Laboratory",
               "published": "2008-04", "accessed": "2026-11-13", "stations": out}, open(ROOT / "data/research/pack_climate.json", "w"), indent=0)


if __name__ == "__main__":
    main(sys.argv[1])
