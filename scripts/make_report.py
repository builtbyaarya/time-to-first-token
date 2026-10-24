#!/usr/bin/env python3
"""Build the feasibility study (PDF) for one Time to First Token request.

    python3 scripts/make_report.py request.txt out/        -> out/report.tex, out/report.pdf

Input: the request text the page writes (a "TTFT request v1" block: one "key: value" line per input), or a
JSON object of inputs. The plan is computed by the page's own model (scripts/plan.mjs, node) so the study and
the page never disagree. Every figure in the study comes from data/pack.json and carries a source number that
resolves in the appendix. No figure is typed in here. No em dashes anywhere.

Needs: node (for the model), xelatex with the TeX Gyre Pagella fonts (falls back to pdflatex with Palatino
if the fonts are missing), tikz. Nothing is fetched from the web.
"""
import json, os, re, shutil, subprocess, sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK = json.load(open(ROOT / "data" / "pack.json"))
V = {v["id"]: v for v in PACK["values"]}

# first-mention descriptions of publishers, agencies and programmes
WHO = {
    "U.S. Energy Information Administration": "the EIA, the US government's energy statistics agency",
    "Lawrence Berkeley National Laboratory": "LBNL, a US Department of Energy laboratory that studies the grid and data center energy use",
    "ERCOT": "ERCOT, the operator of the Texas grid",
    "PJM Interconnection": "PJM, the grid operator for the mid-Atlantic and parts of the Midwest",
    "Uptime Institute": "the Uptime Institute, the industry body that defines data center tiers and runs the annual operator survey",
    "Uptime Institute Intelligence": "Uptime Institute Intelligence, the research arm of the industry body that defines data center tiers",
    "Uptime Institute Journal": "the Uptime Institute Journal, published by the industry body that defines data center tiers",
    "Cushman & Wakefield": "Cushman & Wakefield, a commercial real estate firm that publishes a data center cost guide",
    "CRE Daily (citing Cushman & Wakefield)": "Cushman & Wakefield, a commercial real estate firm, via CRE Daily",
    "Datacentres.com Research (citing JLL)": "JLL, a commercial real estate firm, via Datacentres.com",
    "Wood Smith Henning & Berman (citing JLL)": "JLL, a commercial real estate firm, via a construction law note",
    "Construction Owners Club citing JLL 2026 Global Data Center Outlook": "JLL, a commercial real estate firm, via Construction Owners Club",
    "Wood Mackenzie with American Clean Power": "Wood Mackenzie, an energy research firm, with the American Clean Power trade group",
    "Wood Mackenzie": "Wood Mackenzie, an energy research firm",
    "Wood Mackenzie / American Clean Power": "Wood Mackenzie, an energy research firm, with the American Clean Power trade group",
    "Giga Energy (citing Wood Mackenzie survey)": "Wood Mackenzie, an energy research firm, via Giga Energy",
    "U.S. Environmental Protection Agency": "the EPA, the US federal environmental regulator",
    "eCFR (U.S. Government Publishing Office)": "the Code of Federal Regulations",
    "Council on Environmental Quality": "the Council on Environmental Quality, the White House office that oversees NEPA",
    "Texas Commission on Environmental Quality": "the TCEQ, the Texas state environmental agency",
    "Maricopa County Air Quality Department": "the Maricopa County Air Quality Department, the air regulator for the Phoenix area",
    "ALL4 (air permitting consultancy)": "ALL4, an air permitting consultancy",
    "Prince William County, Virginia": "Prince William County, a Northern Virginia county with a large data center pipeline",
    "Holland & Knight": "Holland & Knight, a law firm",
    "Virginia Joint Legislative Audit and Review Commission (JLARC)": "JLARC, the Virginia legislature's audit office",
    "The Brattle Group": "the Brattle Group, an economic consultancy",
    "Grid Strategies": "Grid Strategies, a grid consultancy",
    "Dominion Energy via PJM": "Dominion Energy, the Virginia utility, in PJM filings",
    "Data Center Knowledge (Bloomberg) quoting Dominion letter": "Dominion Energy, the Virginia utility, via Data Center Knowledge",
    "Data Center Knowledge (citing Dominion Energy)": "Dominion Energy, the Virginia utility, via Data Center Knowledge",
    "Federal Energy Regulatory Commission": "FERC, the US federal energy regulator",
    "Southwest Power Pool": "SPP, the grid operator for the central plains",
    "S&P Global Commodity Insights quoting MISO": "MISO, the Midwest grid operator, via S&P Global",
    "S&P Global Commodity Insights quoting Siemens Energy": "Siemens Energy, a turbine maker, via S&P Global",
    "Utility Dive quoting Siemens Energy earnings": "Siemens Energy, a turbine maker, via Utility Dive",
    "NVIDIA": "NVIDIA, the accelerator maker",
    "The Register": "The Register, a technology news site",
    "Lenovo Press": "Lenovo, a server maker",
    "Wing Venture Capital": "Wing Venture Capital, an investor whose estimate is a secondary source",
    "Schneider Electric": "Schneider Electric, a power and cooling equipment maker",
    "Schneider Electric / APC": "Schneider Electric, a power and cooling equipment maker",
    "Generator Source": "Generator Source, a generator supplier",
    "Terrapin Construction Group (contractor data)": "Terrapin Construction Group, a contractor",
    "Archdesk": "Archdesk, a construction software firm",
    "Opendock": "Opendock, a logistics software firm whose build guide is a secondary source",
    "Mastt": "Mastt, a construction software firm whose guide is a secondary source",
    "Electrical Contractor Magazine": "Electrical Contractor Magazine",
    "Latitude Media (citing JLL 2026 Global Data Center Outlook)": "JLL, a commercial real estate firm, via Latitude Media",
    "Applied Digital (press release)": "Applied Digital, a data center developer",
    "Wikipedia": "Wikipedia (the dated figure is corroborated by the company's own statements)",
    "Data Center Dynamics": "Data Center Dynamics, a trade publication",
    "Data Center Dynamics (citing Uptime Institute)": "Data Center Dynamics, a trade publication, citing the Uptime Institute",
    "Data Center Knowledge (citing Uptime Institute)": "Data Center Knowledge, a trade publication, citing the Uptime Institute",
    "Northern Virginia Magazine": "Northern Virginia Magazine",
    "Washington Governor's Office for Regulatory Innovation and Assistance": "the Washington state regulatory assistance office",
    "Amazon": "Amazon, in its AWS sustainability reporting",
    "Google": "Google, in its data center efficiency reporting",
    "POWER Magazine quoting Bloom Energy press release": "Bloom Energy, a fuel cell maker, via POWER Magazine",
    "National Renewable Energy Laboratory": "NREL, a US Department of Energy laboratory",
    "Encor Advisors": "Encor Advisors, a colocation brokerage",
    "Time to First Token (assumption)": "this study's own assumption",
}

# ----------------------------------------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------------------------------------
def tex(s):
    s = str(s)
    for a, b in [("\\", r"\textbackslash{}"), ("&", r"\&"), ("%", r"\%"), ("$", r"\$"), ("#", r"\#"), ("_", r"\_"), ("{", r"\{"), ("}", r"\}"), ("~", r"\textasciitilde{}"), ("^", r"\textasciicircum{}")]:
        s = s.replace(a, b)
    return s.replace("—", ", ").replace("–", " to ")


def num(x, dp=0):
    return f"{x:,.{dp}f}"


def musd(x):
    return (f"\\${x / 1000:,.1f} billion" if x >= 1000 else f"\\${x:,.0f} million")


def ym(s):
    y, m = s.split("-")
    return date(int(y), int(m), 1).strftime("%B %Y")


def Math(share):
    return f"{share * 100:.0f}\\%"


def note(vid):
    """A pack note as a parenthetical: no trailing full stop, first letter lower-case unless it is a name."""
    n = V[vid].get("note", "").strip().rstrip(".")
    if n and n[0].isupper() and not n.split(" ")[0].isupper() and n.split(" ")[0] not in ("Dominion", "Prince", "Siemens", "Washington", "Loudoun", "EMT", "ERCOT", "Virginia", "TCEQ", "Maricopa", "Bloom", "Generator", "JLL", "Uptime", "LBNL", "EIA", "Half", "No", "Top", "Missing", "ERCOT", "Three", "Added", "IST"):
        n = n[0].lower() + n[1:]
    return tex(n)


def plural(n, w):
    return f"{n} {w}" + ("" if n == 1 else "s")


class Cites:
    """Numbered sources. cite(id) returns a superscript marker and records the pack value and its source."""
    def __init__(self):
        self.order = []; self.index = {}; self.used = {}; self.introduced = set()

    def n(self, vid):
        v = V.get(vid)
        if not v:
            raise KeyError(vid)
        key = v["source_url"] or ("assumption:" + v["id"])
        if key not in self.index:
            self.index[key] = len(self.order) + 1; self.order.append(key); self.used[key] = []
        if vid not in self.used[key]:
            self.used[key].append(vid)
        return self.index[key]

    def c(self, *vids):
        ns = sorted({self.n(v) for v in vids})
        return "\\textsuperscript{[" + ",".join(str(n) for n in ns) + "]}"

    def who(self, vid):
        """Publisher name with its description the first time it appears."""
        v = V[vid]; p = v["publisher"]
        base = p.split(" (")[0].split(" via ")[0].split(" quoting ")[0].split(" citing ")[0]
        if base in self.introduced:
            return tex(base)
        self.introduced.add(base)
        return tex(WHO.get(p, WHO.get(base, p)))

    def val(self, vid, dp=None, unit=True):
        """A value with its citation, formatted."""
        v = V[vid]; x = v["value"]
        lo, hi = v.get("low"), v.get("high")
        if dp is None:
            allint = all(float(q).is_integer() for q in [x, lo if lo is not None else x, hi if hi is not None else x])
            dp = 0 if allint or abs(x) >= 100 else (1 if abs(x) >= 1 else 2)
            if lo is not None and hi is not None and all(float(q).is_integer() for q in [lo, hi]) and lo != hi: dp = 0
        year = "year" in str(v.get("unit", "")).lower()
        fmt = (lambda q: str(int(q))) if year else (lambda q: num(q, dp))
        s = fmt(x)
        if lo is not None and hi is not None and (lo != x or hi != x):
            s = f"{fmt(lo)} to {fmt(hi)}" if lo != hi else s
        u = tex(v["unit"]) if unit and v.get("unit") else ""
        u = u.replace("USD per", "\\$ per").replace("USD million", "\\$ million").replace("USD/", "\\$/").replace("USD million per MW IT", "\\$M per MW").replace("fiscal year", "").replace("tons/year", "tons a year").replace("hours/year", "hours a year")
        if year and not unit: u = ""
        if u == "months" and s == "1": u = "month"
        return s + (" " + u if u else "") + self.c(vid)


# ----------------------------------------------------------------------------------------------------------
# request parsing
# ----------------------------------------------------------------------------------------------------------
KEYS = ["state", "mw", "power", "bridge", "redund", "cool", "gpu", "density", "start", "target", "levers", "stress"]


def parse_request(text):
    text = text.strip()
    if text.startswith("{"):
        return json.loads(text)
    inp = {}
    for raw in text.splitlines():
        l = re.sub(r"^(>\s?)+", "", raw.strip())
        m = re.match(r"^(\w+):\s*(.*)$", l)
        if not m:
            continue
        k, val = m.group(1), m.group(2).strip()
        if k in KEYS:
            if k == "levers":
                try: inp[k] = json.loads(val or "{}")
                except Exception: inp[k] = {}
            elif k in ("mw", "density"):
                try: inp[k] = float(val)
                except Exception: pass
            elif k == "stress":
                inp[k] = val if val and val != "null" else None
            else:
                inp[k] = val
    if "mw" not in inp:
        raise SystemExit("request has no mw line; the page writes one")
    return inp


def run_model(inp):
    r = subprocess.run(["node", str(ROOT / "scripts" / "plan.mjs"), json.dumps(inp)], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit("model failed: " + r.stderr[-2000:])
    return json.loads(r.stdout)


# ----------------------------------------------------------------------------------------------------------
# LaTeX
# ----------------------------------------------------------------------------------------------------------
PREAMBLE_FONTS_XE = r"""
\usepackage{fontspec}
\usepackage{unicode-math}
\setmainfont{TeX Gyre Pagella}
\setmathfont{TeX Gyre Pagella Math}
\setmonofont[Scale=0.86,Ligatures=NoCommon]{TeX Gyre Cursor}
"""
PREAMBLE_FONTS_PDF = r"""
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{mathpazo}
"""
PREAMBLE = r"""\documentclass[11pt]{article}

% ---- page ----
\usepackage[letterpaper,margin=1in,headheight=15pt,headsep=18pt,footskip=28pt]{geometry}

% ---- fonts ----
%%FONTS%%
\usepackage{microtype}

% ---- maths and units ----
\usepackage{amsmath}
\usepackage{mathtools}
\usepackage{siunitx}
\sisetup{separate-uncertainty=true, per-mode=symbol, range-phrase={ to }}

% ---- tables, lists, floats ----
\usepackage{booktabs}
\usepackage{tabularx}
\usepackage{array}
\usepackage{enumitem}
\usepackage{graphicx}
\usepackage{float}
\usepackage{needspace}
\renewcommand{\arraystretch}{1.24}
\setlength{\tabcolsep}{6pt}

% ---- captions: figures below, tables above ----
\usepackage{caption}
\captionsetup{font=small, labelfont=bf, labelsep=period,
              justification=justified, singlelinecheck=false, skip=7pt}
\captionsetup[table]{skip=5pt}

% ---- the one box ----
\usepackage{xcolor}
\usepackage[most]{tcolorbox}
\definecolor{boxrule}{HTML}{1F2328}
\definecolor{boxtint}{HTML}{F4F5F3}
\newtcolorbox{keyresult}{
  enhanced, breakable=false, sharp corners, arc=0pt,
  halign=flush center,
  colback=boxtint, colframe=boxrule, boxrule=0.7pt,
  left=11pt, right=11pt, top=11pt, bottom=11pt,
  before skip=11pt, after skip=11pt,
  before upper={\setlength{\abovedisplayskip}{0pt}%
                \setlength{\belowdisplayskip}{0pt}%
                \setlength{\abovedisplayshortskip}{0pt}%
                \setlength{\belowdisplayshortskip}{0pt}%
                \setlength{\parskip}{0pt}}}
\newcommand{\ansgap}{\par\vspace{6pt}}
\newcommand{\eqrow}{\\[6pt]}

% ---- headings ----
\usepackage{titlesec}
\titleformat{\section}
  {\normalfont\large\bfseries}{\thesection}{0.8em}{}
  [\vspace{2pt}{\titlerule[0.9pt]}]
\titlespacing*{\section}{0pt}{24pt}{14pt}
\titleformat{\subsection}
  {\normalfont\normalsize\bfseries}{\thesubsection}{0.7em}{}
\titlespacing*{\subsection}{0pt}{20pt}{8pt}
\titleformat{\subsubsection}
  {\normalfont\small\bfseries}{\thesubsubsection}{0.7em}{}
\titlespacing*{\subsubsection}{0pt}{16pt}{6pt}

% ---- paragraphs and page breaking ----
\usepackage{parskip}
\setlength{\parskip}{6pt}
\linespread{1.03}
\widowpenalty=10000
\clubpenalty=10000
\displaywidowpenalty=10000
\setlength{\emergencystretch}{3em}
\setlength{\abovedisplayskip}{6pt}
\setlength{\belowdisplayskip}{6pt}
\setlength{\abovedisplayshortskip}{5pt}
\setlength{\belowdisplayshortskip}{5pt}
\setlength{\intextsep}{10pt}
\raggedbottom

% ---- code ----
\usepackage{listings}
\lstset{basicstyle=\ttfamily\fontsize{8.4}{10}\selectfont,
        columns=fullflexible, keepspaces=true, showstringspaces=false,
        breaklines=false, frame=none, xleftmargin=0pt,
        aboveskip=6pt, belowskip=0pt}

\usepackage[hidelinks]{hyperref}

% ---- study layer: running head, tikz for the schedule chart, long tables ----
\usepackage{fancyhdr}
\usepackage{lastpage}
\usepackage{tikz}
\usepackage{longtable}
\usepackage{xurl}
\pagestyle{fancy}
\fancyhf{}
\lhead{\small Time to First Token: feasibility study}
\rhead{\small %%HEAD%%}
\cfoot{\small Page \thepage\ of \pageref{LastPage}}
\renewcommand{\headrulewidth}{0.4pt}
\setcounter{secnumdepth}{2}
\renewcommand{\topfraction}{0.9}\renewcommand{\bottomfraction}{0.9}\renewcommand{\textfraction}{0.05}\renewcommand{\floatpagefraction}{0.75}
"""


def gantt_tikz(R, inp):
    tasks = [t for t in R["tasks"] if t["months"] > 0.05]
    span = max(R["end"], R["targetMonths"]) + 2
    W = 8.4; L = 5.9; rowh = 0.34; H = rowh * len(tasks)
    x = lambda m: L + (m / span) * W
    out = [r"\begin{tikzpicture}[x=1cm,y=1cm,font=\scriptsize]"]
    sy, sm = map(int, inp["start"].split("-"))
    for m in range(0, int(span) + 1):
        ab = sy * 12 + (sm - 1) + m
        if ab % 12 == 0:
            out.append(f"\\draw[gray!40] ({x(m):.3f},0.15) -- ({x(m):.3f},{-H:.3f}); \\node[anchor=south, gray] at ({x(m):.3f},0.15) {{{ab // 12}}};")
        elif ab % 6 == 0:
            out.append(f"\\draw[gray!20] ({x(m):.3f},0.1) -- ({x(m):.3f},{-H:.3f});")
    for i, t in enumerate(tasks):
        y = -(i + 0.5) * rowh
        out.append(f"\\node[anchor=east, inner sep=1pt] at ({L - 0.15:.3f},{y:.3f}) {{{tex(short(t['label'], 36))}}};")
        col = "black" if t["critical"] else "gray!45"
        x0, x1, xs = x(t["es"]), x(t["ef"]), x(t["ef"] - t.get("slip", 0))
        out.append(f"\\fill[{col}, rounded corners=1pt] ({x0:.3f},{y - 0.11:.3f}) rectangle ({max(x0 + 0.03, xs):.3f},{y + 0.11:.3f});")
        if t.get("slip"):
            out.append(f"\\fill[orange!80!black, rounded corners=1pt] ({xs:.3f},{y - 0.11:.3f}) rectangle ({x1:.3f},{y + 0.11:.3f});")
        out.append(f"\\node[anchor=west, inner sep=2pt, gray] at ({x1:.3f},{y:.3f}) {{{t['months']:.0f}}};")
    out.append(f"\\draw[blue!70!black, dashed, thick] ({x(R['targetMonths']):.3f},0.15) -- ({x(R['targetMonths']):.3f},{-H:.3f}) node[anchor=north, blue!70!black] {{target}};")
    out.append(f"\\draw[black, thick] ({x(R['firstToken']):.3f},0.15) -- ({x(R['firstToken']):.3f},{-H:.3f}) node[anchor=north] {{first token}};")
    out.append(r"\end{tikzpicture}")
    return "\n".join(out)


def short(s, n):
    return s if len(s) <= n else s[: n - 1] + "…"


POWER_LABEL = {"grid": "grid only", "bridge": "onsite bridge power", "hybrid": "hybrid onsite and grid power"}
COOL_LABEL = {"liquid": "direct liquid cooling with dry coolers", "liquid_tower": "direct liquid cooling with cooling towers", "air": "air cooling"}
RED_LABEL = {"n1": "N+1", "2n": "2N", "tier4": "Tier IV"}
GEN_LABEL = {"gas_turbine": "gas turbines", "recip": "reciprocating gas engines", "fuel_cell": "fuel cells", "solar_bess": "solar with batteries"}
GPU_NAME = {g["id"]: g["name"] for g in PACK["gpus"]}
STATE = {s["code"]: s for s in PACK["states"]}


def build_tex(R, inp, pdflatex=False):
    C = Cites()
    st = STATE[inp["state"]]; mw = inp["mw"]; onsite = inp["power"] != "grid"; iso = R["iso"]
    t = {x["id"]: x for x in R["tasks"]}
    crit = [x for x in R["tasks"] if x["critical"]]
    cap = R["costs"]; en = R["energy"]
    first = R["firstToken"]; live = ym(R["liveDate"]); full = ym(R["fullDate"]); target = ym(inp["target"]); start = ym(inp["start"])
    vs = R["vsTarget"]
    gpu = GPU_NAME[inp["gpu"]]; racks = R["racks"]
    gen = GEN_LABEL[inp["bridge"]]
    s = []
    A = s.append

    # ---------------------------------------------------------------- title
    A(r"\begin{titlepage}")
    A(r"\vspace*{1.2in}")
    A(r"{\Large\bfseries Time to First Token}\par\vspace{4pt}")
    A(r"{\large Feasibility study}\par\vspace{18pt}")
    A(f"{{\\Large\\bfseries {num(mw)} MW AI data center, {tex(st['metro'])}, {tex(st['name'])}}}\\par\\vspace{{6pt}}")
    A(f"{tex(POWER_LABEL[inp['power']].capitalize())}{', ' + tex(gen) if onsite else ''}; { {"n1": "N+1", "2n": "2N", "tier4": "2N, Tier IV certified"}[inp['redund']] }; {tex(COOL_LABEL[inp['cool']])}; {tex(gpu)} racks at {num(inp['density'])} kW.\\par\\vspace{{24pt}}")
    A(r"\begin{tabular}{@{}ll@{}}")
    A(f"Prepared & {date.today().strftime('%d %B %Y')} \\\\")
    A(f"Data pack & {tex(PACK['version'])}, every value read {tex(PACK['accessed'])} \\\\")
    A(f"Project start & {start} \\\\")
    A(f"Target go-live & {target} \\\\")
    A(f"Prepared by & Time to First Token, an open planning tool by Aarya (builtbyaarya) \\\\")
    A(r"\end{tabular}")
    A(r"\vfill")
    A(r"\begin{keyresult}")
    A(r"This is a planning study, not a quote. Every figure carries a source number; verify it against that source before relying on it. Nothing here is engineering, legal or investment advice.")
    A(r"\end{keyresult}")
    A(r"\end{titlepage}")

    # ---------------------------------------------------------------- 1 executive summary
    A(r"\section{Executive summary and recommendation}")
    seen = []; [seen.append(n) for n in (x["label"].split(":")[0].split(",")[0] for x in crit) if n not in seen]
    critical_names = " > ".join(tex(n) for n in seen)
    longest = max(R["tasks"], key=lambda x: x["months"])
    A(f"The project reaches its first token {first:.0f} months after a {start} start, in {live}, "
      + (f"{abs(vs):.0f} months ahead of the {target} target." if vs >= 0.5 else f"{abs(vs):.0f} months after the {target} target." if vs <= -0.5 else f"on the {target} target.")
      + (f" The first token comes from the {Math(R['phaseShare'])} of racks the onsite plant carries; the remaining racks follow utility energization, and full power is {full}." if inp['power'] == 'hybrid' and R['fullPower'] > first + 0.5 else f" Full grid power follows in {full}; until then the site runs on the onsite plant." if onsite and R['fullPower'] > first + 0.5 else f" The remaining racks follow in {full}." if R['fullPower'] > first + 0.5 else ""))
    A(f"The critical path runs through {critical_names}; the longest single item is {tex(longest['label'].lower())} at {longest['months']:.0f} months.")
    A(f"The facility, land and power works cost {musd(cap['site'][0])} to {musd(cap['site'][1])} before accelerators, built from the 2026 all-in build cost published by Cushman \\& Wakefield, a commercial real estate firm, of \\$8.9 million to \\$23.3 million per MW{C.c('capex_shell_per_mw')} split by its published shares and scaled by the redundancy and cooling factors in Section 7; the {tex(gpu)} racks add {musd(cap['compute'][0])} to {musd(cap['compute'][1])}{C.c('compute_capex_per_mw__' + inp['gpu'])}. "
      f"Steady-state opex runs {musd(en['opex'][0])} to {musd(en['opex'][1])} a year at a design PUE of {en['pue']:.2f}{C.c('pue__' + inp['cool'])} and {en['waterMgal']:.{0 if en['waterMgal'] >= 1 else 2}f} million gallons of water a year{C.c('wue__' + inp['cool'])}.")
    # recommendation logic
    lev = sorted(R["levers"], key=lambda l: -l["months"])
    best = [l for l in lev if l["months"] >= 1]
    rec = []
    if best:
        rec.append(f"The strongest lever is \\emph{{{tex(best[0]['label'])}}}, which brings first token forward by {best[0]['months']:.0f} months" + (f" and costs about {musd(-best[0]['cost'])} more." if best[0]['cost'] < -1 else f" and saves about {musd(best[0]['cost'])}." if best[0]['cost'] > 1 else "."))
    if len(best) > 1:
        rec.append("Next come " + ", ".join(f"\\emph{{{tex(l['label'])}}} ({l['months']:.0f} months)" for l in best[1:3]) + ".")
    top_risk = R["risks"][0] if R["risks"] else None
    if top_risk:
        rec.append(f"The risk to watch is {tex(top_risk['label'].lower())}: a likelihood of {tex(top_risk['likelihoodLabel'].split(':')[0])}{C.c('risk_' + top_risk['id'] + '_likelihood')}, and {top_risk['impact']:.0f} months on the plan if it lands.")
    A(" ".join(rec) if rec else "No single lever moves the date by a month or more; the plan is bound by the construction sequence itself.")
    A(r"\begin{keyresult}")
    A(f"Time to first token: {first:.0f} months ({live}). Facility and power capex {musd(cap['site'][0])} to {musd(cap['site'][1])}; steady-state opex {musd(en['opex'][0])} to {musd(en['opex'][1])} a year.")
    A(r"\end{keyresult}")
    A(r"\textbf{Recommendation.} " + ("Proceed with the plan as set up; " if vs >= 0 else "The target date does not hold as set up; ") + (f"take the first lever (\\emph{{{tex(best[0]['label'])}}}) and lock the long-lead orders in the first quarter." if best else "lock the long-lead orders in the first quarter.") + (" Re-run this study when the utility returns its study results, since the energization date is the figure most likely to move." if inp['power'] != 'bridge' else " Re-run this study once the turbine slot and the gas supply agreement are confirmed, since those two dates set the plan."))

    # ---------------------------------------------------------------- 2 site and grid
    A(r"\section{Site and grid}")
    isov = V[f"iso__{inp['state']}"]
    ISO_DESC = {"ERCOT": "ERCOT, the Texas grid operator", "PJM": "PJM, the grid operator for the mid-Atlantic and parts of the Midwest", "MISO": "MISO, the Midwest grid operator", "SPP": "SPP, the grid operator for the central plains", "WECC": "the Western grid (WECC), outside any ISO", "SERC": "the Southeast (SERC), served by a vertically integrated utility", "TVA": "TVA, the federal Tennessee Valley Authority"}
    isod = ISO_DESC.get(iso, tex(isov['text']))
    A(f"The site is in {tex(st['metro'])}, {tex(st['name'])}, in the footprint of {isod} ({tex(isov['text'])}) according to {C.who('iso__' + inp['state'])}{C.c('iso__' + inp['state'])}. {tex(st['note'])}")
    price_id = f"industrial_price_c_per_kwh__{inp['state']}" if f"industrial_price_c_per_kwh__{inp['state']}" in V else "industrial_price_c_per_kwh"
    A(f"Industrial electricity in {tex(st['name'])} cost {C.val(price_id, 2)} in August 2026, preliminary, as reported by {C.who(price_id)}{C.c(price_id)}; the US average is {C.val('industrial_price_c_per_kwh', 2)}.")
    wait_id = f"utility_energization_wait_months__{inp['state']}" if f"utility_energization_wait_months__{inp['state']}" in V else "utility_energization_wait_months"
    study_id = f"large_load_study_months__{iso}" if f"large_load_study_months__{iso}" in V else "large_load_study_months"
    A(f"Two grid figures set the pace of the plan. The large-load study takes {C.val(study_id)} ({note(study_id)}), and the wait from request to energization is {C.val(wait_id)} ({note(wait_id)}). "
      f"For context, {C.who('ctx_ic_gen_request_to_cod_months')}, reports a median of {C.val('ctx_ic_gen_request_to_cod_months')} from request to commercial operation for generators, and only {C.val('ctx_ic_gen_completion_rate_capacity_pct', unit=False)}\\% of queued capacity ever completes.")
    ctx = []
    if iso == "ERCOT":
        ctx.append(f"{C.who('ctx_ercot_large_load_requests_gw')} has {C.val('ctx_ercot_large_load_requests_gw')} of large-load requests, {C.val('ctx_ercot_large_load_dc_share_pct')} of them data centers, against {C.val('ctx_ercot_ll_approved_to_energize_mw')} approved to energize and {C.val('ctx_ercot_ll_operational_peak_mw')} operating at peak. Texas SB6 applies to loads above {C.val('ctx_tx_sb6_large_load_threshold_mw')} with a security of {C.val('ctx_ercot_ll_security_usd_per_mw')}.")
    if inp["state"] == "VA":
        ctx.append(f"Dominion reports {C.val('ctx_dominion_dc_contracted_gw')} of contracted data center load against a {C.val('ctx_dominion_dc_billing_peak_gw')} billing peak, and {C.who('ctx_pjm_peak_growth_2024_2030_gw')}, expects {C.val('ctx_pjm_peak_growth_2024_2030_gw')} of peak growth by 2030.")
    if inp["state"] == "GA":
        ctx.append(f"Georgia Power's large-load pipeline stands at {C.val('ctx_georgia_power_ll_pipeline_gw')}.")
    if inp["state"] == "AZ":
        ctx.append(f"Arizona Public Service has {C.val('ctx_aps_committed_large_load_gw')} of committed large load.")
    if inp["state"] == "NV":
        ctx.append(f"NV Energy has about {C.val('ctx_nv_energy_ll_agreements_gw')} of large-load agreements.")
    ctx.append(f"Nationally, {C.who('ctx_us_peak_growth_2025_2030_gw')}, projects {C.val('ctx_us_peak_growth_2025_2030_gw')} of peak growth from 2025 to 2030 and puts large transmission builds at {C.val('ctx_transmission_large_build_years')}.")
    A(" ".join(ctx))

    # ---------------------------------------------------------------- 3 power strategy
    A(r"\section{Power strategy}")
    A(f"The plan is {tex(POWER_LABEL[inp['power']])}. The substation is a {num(V['substation_build_months']['value'])}-month build{C.c('substation_build_months')} ({note('substation_build_months')}), and the large power transformers lead {C.val('lead_lpt_months')} ({note('lead_lpt_months')}); energization is taken as the later of the works finishing and the utility wait above. "
      + (f"Transformer slots are reserved at project start (customer-side units, or a funded reservation of the utility's), at risk of a specification change after the study." if inp.get('levers', {}).get('lptEarly') else "The transformer order is released when the study ends; for a utility-served load the utility procures the substation units and the developer its own customer-side units, so the lead time applies on both sides of the fence. Reserving slots at project start is one of the levers in Section 8."))
    if onsite:
        share = 1 if inp["power"] == "bridge" else V["hybrid_onsite_share"]["value"]
        kw = mw * 1000 * share * V["onsite_oversize_factor"]["value"]
        A(f"The onsite plant is {tex(gen)} with a net site rating of about {num(kw / 1000, 0)} MW: {num(mw * share)} MW of IT at {C.val('onsite_oversize_factor', 2, unit=False)} kW of generation per kW of IT, which is IT times PUE plus a 20 to 25\\% buffer; the unit count and N+1 arrangement are a design decision outside this study. "
          + (f"The plant carries {Math(share)} of the load for good, so the first token comes from that tranche of racks and the rest wait for the grid. " if inp['power'] == 'hybrid' else "The plant carries the whole site until the utility energizes it, then stays as backup. ")
          + f"Lead time is {C.val('lead_' + inp['bridge'] + '_months')} ({note('lead_' + inp['bridge'] + '_months')}) and the install and connection {t['geninst']['months']:.1f} months on this plan (the pack's {C.val('install_' + inp['bridge'] + '_months')} before size scaling).")
        if inp["bridge"] in ("gas_turbine", "recip"):
            hr = V[f"heat_rate_{inp['bridge']}_btu_per_kwh"]
            A(f"Gas supply is its own task: a pipeline lateral and a firm supply agreement, {C.val('gas_supply_months')} ({note('gas_supply_months')}), gating the plant's connection. Fuel: at a heat rate of {C.val('heat_rate_' + inp['bridge'] + '_btu_per_kwh')} and a Henry Hub price of {C.val('gas_price_usd_per_mmbtu', 2)} with no basis or transport adder (an assumption), the plant burns {musd(en['fuel'] or en['bridgeFuelYear'])} of gas a year at the modelled load{' while on bridge power' if inp['power'] == 'bridge' else ''}. "
              f"Turbine supply is tight: Siemens Energy, a turbine maker, quotes three or more years{C.c('lead_gas_turbine_months')} and is booked to fiscal {C.val('ctx_siemens_gas_turbine_booked_out_fy', unit=False)}, and GE Vernova, the other large turbine maker, reports {C.val('ctx_gev_gas_backlog_and_slots_gw')} of backlog and reserved slots.")
        if inp["bridge"] == "solar_bess":
            A(f"The plant is sized at {C.val('solar_bess_pv_ratio', 0, unit=False)} kW of PV per kW served and {C.val('solar_bess_hours', 0)} of battery, the pack's own assumption and EIA's reference battery; it cannot carry the load through the night without the grid, so this option is a daytime bridge.")
        A(f"The plant is also an air permit question (Section 4). " + ("A gas turbine or engine fleet at this scale is a major source under the Clean Air Act, so the permit gates the plant's installation." if inp["bridge"] in ("gas_turbine", "recip") else "Fuel cells and batteries are not combustion sources, so the air permit stays a minor one for the standby generators."))
    else:
        A(f"With no onsite plant, the only generation on site is the standby fleet of diesel generators, sized at {C.val('onsite_oversize_factor', 2, unit=False)} kW per kW of IT; their lead time is {C.val('lead_genset_months')} and their air permit is a minor-source one.")
        if "bridge" in [x["label"] for x in []]:
            pass
        br = [l for l in R["levers"] if "bridge" in l["label"].lower()]
        if br:
            A(f"Adding onsite bridge power would move first token by {br[0]['months']:.0f} months at a capex change of {musd(abs(br[0]['cost']))} (Section 8).")

    # ---------------------------------------------------------------- 4 permitting
    A(r"\section{Permitting path}")
    big = onsite and inp["bridge"] in ("gas_turbine", "recip")
    zid = f"zoning_months__{inp['state']}" if f"zoning_months__{inp['state']}" in V else "zoning_months"
    aid = (f"air_permit_major_months__{inp['state']}" if big else f"air_permit_minor_months__{inp['state']}")
    if aid not in V:
        aid = "air_permit_major_months" if big else "air_permit_minor_months"
    A(f"Four approvals gate the build. Zoning and site plan approval takes {C.val(zid)} ({note(zid)}). The building permit follows at {C.val('site_plan_building_permit_months')} ({note('site_plan_building_permit_months')}). "
      f"The air permit is a {'major-source' if big else 'minor-source'} one at {C.val(aid)} ({note(aid)}); the major-source thresholds are {C.val('ctx_air_major_source_threshold_tpy')} for Title V and {C.val('ctx_air_psd_major_source_other_tpy')} for PSD, and standby generators are assessed at {C.val('ctx_epa_emergency_generator_pte_default_hours')} of potential operation.")
    if inp["cool"] == "liquid_tower":
        A(f"Cooling towers need a water supply agreement and a discharge approval; the pack carries {C.val('water_permit_months')} as a proxy ({note('water_permit_months')}), and it must be in hand before the integrated systems test.")
    else:
        A("Dry coolers run a closed loop, so no cooling-water discharge permit is on the path." if inp["cool"] == "liquid" else "Air cooling has no cooling-water permit on the path.")
    A(f"No federal action is assumed, so NEPA is not on the path; if one appears (federal land, a federal loan, an Army Corps permit), an environmental assessment averages {C.val('ctx_nepa_ea_mean_months')} and a full impact statement a median of {C.val('ctx_nepa_eis_median_years')}. "
      f"The permit-challenge stress test in Section 9 uses the {C.val('stress_permit_months')} that a court took to void the Prince William Digital Gateway rezoning.")

    # ---------------------------------------------------------------- 5 design basis
    A(r"\section{Design basis}")
    A(r"\begin{table}[!htb]\caption{Design basis for the plan.}\centering\small\begin{tabularx}{\textwidth}{@{}lXl@{}}\toprule Item & Basis & Source \\\midrule")
    g = V[f"gpu_{inp['gpu']}"]
    rows = [
        ("IT load", f"{num(mw)} MW critical", "input"),
        ("Accelerator racks", f"{tex(gpu)}, {tex(g['text'])}", C.c('gpu_' + inp['gpu'])),
        ("Rack density", f"{num(inp['density'])} kW per rack, {num(racks)} racks", "input; count derived"),
        ("Cooling", tex(COOL_LABEL[inp['cool']]) + (f"; air cooling is impractical above {C.val('air_cooling_max_kw_per_rack', unit=False)} kW per rack" if inp['cool'] == 'air' else ""), C.c('air_cooling_max_kw_per_rack')),
        ("Design PUE", f"{en['pue']:.2f}", C.c('pue__' + inp['cool'])),
        ("WUE", f"{en['wue']} L per kWh of IT", C.c('wue__' + inp['cool'])),
        ("IT utilization", f"{C.val('it_utilization', 2, unit=False)} of rated", ""),
        ("Redundancy", {"n1": "N+1", "2n": "2N, fault tolerant", "tier4": "2N with Uptime Tier IV certification"}[inp['redund']] + (f", capex factor {cap['redundF']:.2f}" if cap['redundF'] != 1 else ""), C.c('redundancy_2n_capex_factor', 'redundancy_tier4_capex_factor') if inp['redund'] != 'n1' else ""),
        ("Generation sizing", f"{C.val('onsite_oversize_factor', 2, unit=False)} kW per kW IT, applied to the onsite plant; standby generators per the redundancy choice", ""),
        ("Commissioning", "Level 1 to Level 5, integrated systems test last" + (f"; Tier IV site visit adds {C.val('tier4_cx_extra_months')}" if inp['redund'] == 'tier4' else ""), C.c('cx_l5_ist_months')),
    ]
    for a, b, c in rows:
        A(f"{a} & {b} & {c} \\\\")
    A(r"\bottomrule\end{tabularx}\end{table}")
    if R.get("airWarning"):
        A(r"\textbf{Note.} " + tex(R["airWarning"]))
    A(f"Liquid cooling is the industry's direction for these densities: direct liquid cooling is needed above about {C.val('ctx_liquid_threshold_dlc_needed_kw', unit=False)} kW per rack and cold plates carry {C.val('ctx_liquid_cold_plate_capacity_kw', unit=False)} kW, while the survey average rack today is {C.val('ctx_rack_density_avg_2025_kw', unit=False)} kW and {C.val('ctx_dlc_adoption_2025_pct', unit=False)}\\% of operators have adopted it.")

    # ---------------------------------------------------------------- 6 schedule
    A(r"\section{Schedule and critical path}")
    A(f"The schedule is a critical-path calculation over {len(R['tasks'])} tasks in the order a site is really built: land and approvals first, long-lead orders released from the design package, the shell, then the electrical and mechanical fit-outs, white space, commissioning Level 1 to Level 5, the racks, and bring-up. Construction durations are scaled by $(P/100\\,\\mathrm{{MW}})^{{{V['construction_scale_exponent']['value']}}}$, the pack's own assumption, so that a 1 GW campus phased across buildings takes about 1.8 times as long per task as 100 MW{C.c('construction_scale_exponent')}.")
    A(r"\begin{figure}[!htb]\centering")
    A(gantt_tikz(R, inp))
    A(f"\\caption{{Plan from {start}. Dark bars are on the critical path, grey bars have float; the number after each bar is its duration in months. The dashed line is the {target} target and the solid line is first token in {live}.}}")
    A(r"\end{figure}")
    A(r"\begin{longtable}{@{}p{3.6in}rrrr@{}}\caption{Tasks, months from project start. Float is measured against first token; tasks that finish after it are marked.}\\\toprule Task & Start & End & Months & Float \\\midrule\endfirsthead\toprule Task & Start & End & Months & Float \\\midrule\endhead\bottomrule\endfoot")
    for x in R["tasks"]:
        if x["months"] < 0.05:
            continue
        A(f"{'\\textbf{' + tex(x['label']) + '}' if x['critical'] else tex(x['label'])} & {x['es']:.1f} & {x['ef']:.1f} & {x['months']:.1f} & {'after first token' if x.get('beyond') else f'{x[chr(102)+chr(108)+chr(111)+chr(97)+chr(116)]:.1f}'} \\\\")
    A(r"\end{longtable}")
    A("The durations come from the pack, quoted here before the size scaling that Table 2 applies: " + "; ".join([
        f"survey and planning {C.val('survey_geotech_months')}", f"design to permit release {C.val('design_months')}", f"foundations {C.val('foundations_months')}", f"steel and roof {C.val('shell_steel_roof_months')}",
        f"electrical fit-out {C.val('electrical_fitout_months')}", f"mechanical fit-out {C.val('mechanical_fitout_months')}", f"white space {C.val('whitespace_fitout_months')}",
        f"commissioning L1 to L4 {C.val('cx_l1_l2_months')} plus {C.val('cx_l3_l4_months')}", f"L5 integrated systems test {C.val('cx_l5_ist_months' if inp['cool'] != 'air' else 'cx_l5_ist_months_air')}",
        f"rack install {C.val('gpu_install_months_per_100mw')} per 100 MW", f"bring-up {C.val('cluster_bringup_months')}"]) + ". "
      + f"Long-lead orders: switchgear {C.val('lead_switchgear_months')}, UPS {C.val('lead_ups_months')}, standby generators {C.val('lead_genset_months')}, cooling equipment {C.val('lead_chiller_months')}. "
      + f"For comparison, JLARC puts one building at {C.val('ctx_construction_building_months_jlarc')} and the full development cycle runs {C.val('ctx_development_cycle_total_years')}; Crusoe's Abilene first phase went from start to 200 MW live in {C.val('ctx_benchmark_crusoe_abilene_phase1_months')}.")

    # ---------------------------------------------------------------- 7 capex and opex
    A(r"\section{Capex and opex}")
    A(f"Facility capex is built from Cushman \\& Wakefield's 2026 US all-in range of \\$8.9 million to \\$23.3 million per MW excluding accelerators{C.c('capex_shell_per_mw')}, split by its published cost shares, then scaled:")
    A(r"\begin{equation}C_{\mathrm{fac}} = P_{\mathrm{IT}} \sum_i c_i \; f_{\mathrm{red}} \, f_{\mathrm{cool}}\end{equation}")
    A(f"with $P_{{\\mathrm{{IT}}}} = {num(mw)}$ MW, $f_{{\\mathrm{{red}}}} = {cap['redundF']:.2f}$ and $f_{{\\mathrm{{cool}}}} = {cap['coolF']:.3f}$; no metro index is applied, since the pack has none yet. "
      + (f"The 2N factor is one plus the {C.val('ctx_capex_share_power_infra_pct' if 'ctx_capex_share_power_infra_pct' in V else 'capex_electrical_per_mw', unit=False)}\\% power share times the UPS doubling that Schneider reports for 2N{C.c('redundancy_2n_capex_factor')}. " if inp['redund'] != 'n1' else "")
      + (f"Air cooling removes JLL's liquid-cooling premium of \\$1 million to \\$2 million per MW{C.c('capex_air_cooling_factor')}. " if inp['cool'] == 'air' else ""))
    A(r"\begin{table}[!htb]\caption{Capex, \$ million.}\centering\small\begin{tabular}{@{}lrrl@{}}\toprule Item & Low & High & Source \\\midrule")
    for l in cap["lines"]:
        A(f"{tex(l['label'])} & {num(l['lo'])} & {num(l['hi'])} & {C.c(l['id'])} \\\\")
    A(f"\\textbf{{Facility, land and power}} & \\textbf{{{num(cap['site'][0])}}} & \\textbf{{{num(cap['site'][1])}}} & \\\\")
    A(f"{tex(gpu)} racks & {num(cap['compute'][0])} & {num(cap['compute'][1])} & {C.c('compute_capex_per_mw__' + inp['gpu'])} \\\\")
    A(f"\\textbf{{All-in}} & \\textbf{{{num(cap['total'][0])}}} & \\textbf{{{num(cap['total'][1])}}} & \\\\")
    A(r"\bottomrule\end{tabular}\end{table}")
    A(f"Costs are rising: all-in build cost is up {C.val('ctx_capex_inflation_since_2024_pct', unit=False)}\\% since late 2024 and switchgear {C.val('ctx_capex_switchgear_price_rise_pct', unit=False)}\\%; JLL's global average is {C.val('ctx_capex_global_avg_per_mw_2026', unit=False)} \\$M per MW with a {C.val('ctx_capex_ai_premium_us_pct', unit=False)}\\% AI premium in the US.")
    A("Electricity is the first line of opex:")
    A(r"\begin{equation}E = P_{\mathrm{IT}} \, u \, \mathrm{PUE} \times 8760\,\mathrm{h}, \qquad \mathrm{Opex}_{\mathrm{elec}} = E \, p\end{equation}")
    A(f"With $u = {en['util']}$, $\\mathrm{{PUE}} = {en['pue']}$ and $p = {en['priceC']:.2f}$ cents per kWh, $E = {en['mwhYear'] / 1000:.0f}$ GWh a year" + (f", of which the grid serves {Math(1 - en['onsiteShare'])}, so the bill is {musd(en['elecGrid'])} and the onsite share burns {musd(en['fuel'])} of gas" if inp['power'] == 'hybrid' else f" and the bill is {musd(en['elecGrid'])}" + (f" at steady state; while on bridge power the plant burns about {musd(en['bridgeFuelYear'])} of gas a year instead" if inp['power'] == 'bridge' else "")) + ". "
      f"Staff, maintenance and other opex is \\$M {V['opex_staff_maint_per_mw_year']['low']:.1f} to {V['opex_staff_maint_per_mw_year']['high']:.1f} per MW-year{C.c('opex_staff_maint_per_mw_year')} ({note('opex_staff_maint_per_mw_year')}). The utilization and PUE carry published ranges (0.6 to 0.8; 1.15 to 1.35); the electricity line uses the central values.")
    A(r"\begin{table}[!htb]\caption{Opex, \$ million a year, steady state.}\centering\small\begin{tabular}{@{}lrr@{}}\toprule Item & Low & High \\\midrule")
    A(f"Electricity{', grid share' if en['onsiteShare'] else ''} & {num(en['elecGrid'])} & {num(en['elecGrid'])} \\\\")
    if en["fuel"]:
        A(f"Natural gas, onsite share, hub price & {num(en['fuel'])} & {num(en['fuel'])} \\\\")
    if en["bridgeFuelYear"]:
        A(f"(Gas per year while on bridge power, not in the total) & {num(en['bridgeFuelYear'])} & {num(en['bridgeFuelYear'])} \\\\")
    A(f"Staff, maintenance and other & {num(en['staff'][0])} & {num(en['staff'][1])} \\\\")
    A(f"\\textbf{{Total}} & \\textbf{{{num(en['opex'][0])}}} & \\textbf{{{num(en['opex'][1])}}} \\\\")
    A(r"\bottomrule\end{tabular}\end{table}")
    A(f"Water: $W = P_{{\\mathrm{{IT}}}}\\, u \\times 8760 \\times \\mathrm{{WUE}}$ gives {en['waterMgal']:.{0 if en['waterMgal'] >= 1 else 2}f} million US gallons a year at a WUE of {en['wue']} L per kWh{C.c('wue__' + inp['cool'])}; {C.who('ctx_pue_us_national_2023_lbnl')}, puts the US fleet at a PUE of {C.val('ctx_pue_us_national_2023_lbnl', 2, unit=False)}.")

    # ---------------------------------------------------------------- 8 sensitivities
    A(r"\section{Sensitivities}")
    A("Each line changes one input and re-runs the plan. Months are first token from project start; capex and opex are the midpoints of the ranges." + (f" Air cooling is left out because it is impractical above {V['air_cooling_max_kw_per_rack']['value']:.0f} kW per rack." if inp['density'] > V['air_cooling_max_kw_per_rack']['value'] else ""))
    A(r"\begin{table}[!htb]\caption{One-at-a-time sensitivities against the base case.}\centering\small\begin{tabular}{@{}lrrr@{}}\toprule Case & First token, months & Capex, \$M mid & Opex, \$M a year mid \\\midrule")
    A(f"\\textbf{{Base case}} & \\textbf{{{first:.0f}}} & \\textbf{{{num((cap['total'][0] + cap['total'][1]) / 2)}}} & \\textbf{{{num((en['opex'][0] + en['opex'][1]) / 2)}}} \\\\")
    for sdef in R["sensitivities"]:
        if sdef['label'] == 'Cooling: air' and inp['density'] > V['air_cooling_max_kw_per_rack']['value']:
            continue
        lab = sdef['label'].replace('liquid_tower', 'liquid, towers').replace('Cooling: liquid', 'Cooling: liquid, dry coolers').replace('Cooling: liquid, dry coolers, towers', 'Cooling: liquid, towers').replace('Redundancy: n1', 'Redundancy: N+1').replace('Redundancy: 2n', 'Redundancy: 2N').replace('Redundancy: tier4', 'Redundancy: 2N, Tier IV certified').replace('Power: grid', 'Power: grid only').replace('Power: bridge', 'Power: onsite bridge').replace('Power: hybrid', 'Power: hybrid')
        A(f"{tex(lab)} & {sdef['firstToken']:.0f} & {num((sdef['capex'][0] + sdef['capex'][1]) / 2)} & {num((sdef['opex'][0] + sdef['opex'][1]) / 2)} \\\\")
    A(r"\bottomrule\end{tabular}\end{table}")
    A(r"\textbf{Speed-to-market levers.} " + " ".join(f"{tex(l['label'])}: {('%.0f months faster' % l['months']) if l['months'] >= 0.5 else ('%.0f months slower' % -l['months']) if l['months'] <= -0.5 else 'same time'}, {('saves ' + musd(l['cost'])) if l['cost'] >= 1 else ('costs ' + musd(-l['cost'])) if l['cost'] <= -1 else 'about the same cost'}." for l in R["levers"]))

    # ---------------------------------------------------------------- 9 risks
    A(r"\section{Risks and mitigations}")
    A(f"Likelihoods are built from JLL's finding that {C.val('ctx_delay_share_projects_late_3mo_2025', unit=False)}\\% of 2025 projects ran three or more months late and the Uptime Institute's split of delay drivers: equipment {C.val('ctx_delay_driver_equipment_pct', unit=False)}\\%, power availability {C.val('ctx_delay_driver_power_availability_pct', unit=False)}\\%, permitting {C.val('ctx_delay_driver_permitting_legislation_pct', unit=False)}\\%. Impact is the slip in first token when the stress is replayed on this plan, and in full power where that differs; a zero means the task has float against that date.")
    A(r"\begin{longtable}{@{}p{1.4in}p{0.75in}>{\raggedleft\arraybackslash}p{0.55in}>{\raggedleft\arraybackslash}p{0.55in}p{2.25in}@{}}\caption{Risk register. Impact in months on first token and on full power.}\\\toprule Risk & Likelihood & First token & Full power & Mitigation \\\midrule\endfirsthead\toprule Risk & Likelihood & First token & Full power & Mitigation \\\midrule\endhead\bottomrule\endfoot")
    for r in R["risks"]:
        A(f"{tex(r['label'])}{C.c('stress_' + r['id'] + '_months', 'risk_' + r['id'] + '_likelihood')} & {tex(r['likelihoodLabel'].split(':')[0])} & {r['impact']:.0f} & {r['impactFull']:.0f} & {tex(r['mitigation'])} \\\\")
    A(r"\end{longtable}")
    A("Stress tests replayed on the plan: " + "; ".join(f"{tex(v['label'].lower())} (+{v['slip']:.0f} months on the task) moves first token to {ym(v['liveDate'])}" for v in R["stress"].values()) + ".")

    # ---------------------------------------------------------------- 10 appendix
    A(r"\section{Source appendix}")
    A(f"Every figure above carries a number from this list. The data pack is version {tex(PACK['version'])}; each value was read from the cited page on {tex(PACK['accessed'])}. Values marked derived are arithmetic on sourced values and say so; values marked assumption have no public source and are this study's own.")
    A(r"\begin{enumerate}[leftmargin=2.2em, itemsep=4pt]")
    for key in C.order:
        vids = C.used[key]; v0 = V[vids[0]]
        if key.startswith("assumption:"):
            A(f"\\item \\textbf{{Assumption.}} " + "; ".join(f"{tex(V[x]['label'])}: {tex(str(V[x]['value']))} {tex(V[x].get('unit', ''))} ({tex(V[x]['note'])})" for x in vids))
            continue
        vals = "; ".join(f"{tex(V[x]['label'])} = {tex(str(V[x].get('text') if V[x].get('text') and not V[x].get('unit') else V[x]['value']))}{' ' + tex(V[x]['unit']).replace('USD', chr(92) + '$') if V[x].get('unit') else ''} [{V[x]['kind']}]" for x in vids)
        A(f"\\item {tex(v0['publisher'])}, \\emph{{{tex(v0['source_title'])}}} ({tex(str(v0.get('published', '')))}). \\url{{{v0['source_url']}}} Read {tex(v0['accessed'])}. {vals}.")
    A(r"\end{enumerate}")
    A(r"\begin{keyresult}")
    A("Not a quote. Verify every figure against its source before relying on it.")
    A(r"\end{keyresult}")

    head = f"{num(mw)} MW, {tex(st['name'])}"
    pre = PREAMBLE.replace("%%FONTS%%", PREAMBLE_FONTS_PDF if pdflatex else PREAMBLE_FONTS_XE).replace("%%HEAD%%", head)
    body = "\n".join(s)
    body = body.replace("—", ", ").replace("–", " to ")
    return pre + "\n\\begin{document}\n" + body + "\n\\end{document}\n"


def build_pdf(texsrc_fn, outdir):
    outdir = Path(outdir); outdir.mkdir(parents=True, exist_ok=True)
    have_fonts = subprocess.run(["fc-list"], capture_output=True, text=True).stdout.lower().count("pagella math") > 0 and shutil.which("xelatex")
    engine = "xelatex" if have_fonts else "pdflatex"
    texsrc = texsrc_fn(engine == "pdflatex")
    (outdir / "report.tex").write_text(texsrc)
    log = ""
    for _ in range(3):  # three passes: longtable, lastpage, references
        r = subprocess.run([engine, "-interaction=nonstopmode", "-halt-on-error", "report.tex"], cwd=outdir, capture_output=True, text=True)
        log = r.stdout
        if r.returncode != 0:
            (outdir / "build.log").write_text(log)
            raise SystemExit(f"{engine} failed; see {outdir / 'build.log'}\n" + "\n".join(l for l in log.splitlines() if l.startswith("!"))[:1500])
    (outdir / "build.log").write_text(log)
    for ext in ["aux", "out", "toc"]:
        p = outdir / f"report.{ext}"
        if p.exists():
            p.unlink()
    return outdir / "report.pdf", engine


def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    text = Path(sys.argv[1]).read_text() if os.path.exists(sys.argv[1]) else sys.argv[1]
    inp = parse_request(text)
    R = run_model(inp)
    inp = R["inputs"]
    if R.get("missing"):
        raise SystemExit("pack is missing ids: " + ", ".join(R["missing"]))
    pdf, engine = build_pdf(lambda pdflatex: build_tex(R, inp, pdflatex), sys.argv[2])
    print(f"{pdf} ({engine}); first token {R['firstToken']:.1f} months, {R['liveDate']}")


if __name__ == "__main__":
    main()
