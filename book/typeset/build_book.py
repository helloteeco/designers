#!/usr/bin/env python3
"""Typeset AirBNB Anywhere: manuscript.md -> 6x9 print PDF via WeasyPrint.
Two-pass: render, harvest anchor page numbers, inject real TOC numbers, re-render."""
import re, subprocess, sys, os

BOOK = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BOOK, "..", "manuscript.md")
OUT_HTML = os.path.join(BOOK, "book.html")
OUT_PDF = os.environ.get("OUT_PDF") or os.path.join(BOOK, "AirBNB Anywhere - Print Interior 6x9.pdf")
TITLE_HTML = os.environ.get("TITLE_HTML", "Airbnb<br/>Anywhere")
RH_TEXT = os.environ.get("RH_TEXT", "AIRBNB ANYWHERE")
SUBTITLE_OVERRIDE = os.environ.get("SUBTITLE_OVERRIDE", "")

NUMWORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
            "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
            "Sixteen", "Seventeen", "Eighteen"]

md = open(SRC).read()
contents_i = md.find("## Contents")
intro_i = md.find("## Introduction")
front_md = md[:contents_i]
body_md = md[intro_i:]

ded = re.search(r"^\*For (.+)\*$", front_md, re.M)
dedication = ("For " + ded.group(1)) if ded else ""
dedication = dedication.replace("'There", "‘There").replace("this.'", "this.’").replace("who's", "who’s")
subtitle_m = re.search(r"^\*\*(.+?)\*\*$", front_md, re.M)
subtitle = SUBTITLE_OVERRIDE or (subtitle_m.group(1) if subtitle_m else "")
disclaimer_m = re.search(r"\*\*Disclaimer\.\*\*(.+?)$", front_md, re.M | re.S)
disclaimer = disclaimer_m.group(1).strip().split("\n")[0] if disclaimer_m else ""

lines = body_md.split("\n")
segs, cur = [], None
for ln in lines:
    m1 = re.match(r"^# (.+)$", ln)
    m2 = re.match(r"^## (.+)$", ln)
    if m1:
        if cur: segs.append(cur)
        cur = ("part", m1.group(1).strip(), [])
    elif m2:
        if cur: segs.append(cur)
        t = m2.group(1).strip()
        cur = ("chapter" if t.startswith("Chapter ") else "special", t, [])
    else:
        if cur is None: cur = ("special", "PREAMBLE", [])
        cur[2].append(ln)
if cur: segs.append(cur)

def pandoc(mdtext):
    p = subprocess.run(["pandoc", "-f", "markdown+smart", "-t", "html"],
                       input=mdtext, capture_output=True, text=True)
    if p.returncode: sys.exit(p.stderr)
    h = p.stdout.strip()
    h = re.sub(r"^<hr ?/?>\s*", "", h)
    h = re.sub(r"\s*<hr ?/?>\s*$", "", h)
    h = re.sub(r'<h3 id="[^"]*chapter-summary[^"]*">Chapter Summary</h3>',
               '<h3 class="summary-h">Chapter Summary</h3>', h)
    h = h.replace('<li><label><input type="checkbox" />', '<li class="check"><span class="cbox"></span><label>')
    return h

html_parts, toc = [], []
chapnum = partnum = secn = 0

for kind, title, body in segs:
    body_html = pandoc("\n".join(body))
    if kind == "part":
        partnum += 1
        pid = f"part{partnum}"
        m = re.match(r"Part (\d+) — (.+)$", title)
        eyebrow = f"Part {NUMWORDS[int(m.group(1))]}" if m else title
        big = m.group(2) if m else ""
        html_parts.append(
            f'<section class="part" id="{pid}">'
            f'<div class="part-eyebrow">{eyebrow}</div>'
            f'<h1 class="part-title">{big}</h1>'
            f'<div class="part-intro">{body_html}</div></section>')
        toc.append(("part", f"{eyebrow} · {big}", pid))
    elif kind == "chapter":
        chapnum += 1; secn += 1
        cid = f"ch{chapnum}"
        m = re.match(r"Chapter (\d+): (.+)$", title)
        ctitle = m.group(2) if m else title
        side = "a" if secn % 2 else "b"
        html_parts.append(
            f'<section class="chapter side-{side}" id="{cid}">'
            f'<header class="ch-open"><div class="ch-num">Chapter {NUMWORDS[chapnum]}</div>'
            f'<h1 class="ch-title" data-rh="{ctitle}">{ctitle}</h1></header>'
            f'{body_html}</section>')
        toc.append(("ch", f'<span class="toc-n">{chapnum}</span>{ctitle}', cid))
    else:
        secn += 1
        side = "a" if secn % 2 else "b"
        sid = re.sub(r"[^a-z]+", "-", title.lower()).strip("-")
        if ": " in title:
            main, sub = title.split(": ", 1)
            head = f"{main}<br/><span class='sp-sub'>{sub}</span>"
            label = main
        else:
            head, label = title, title
        html_parts.append(
            f'<section class="chapter special side-{side}" id="{sid}">'
            f'<header class="ch-open"><h1 class="ch-title sp-title" data-rh="{label}">{head}</h1></header>'
            f'{body_html}</section>')
        toc.append(("sp", label, sid))

def toc_block(pg):
    out = []
    for lvl, lbl, tgt in toc:
        attr = f' data-pg="{pg(tgt)}"' if pg else ' data-pg="888"' 
        cls = {"part": "toc-part", "ch": "toc-ch", "sp": "toc-sp"}[lvl]
        out.append(f'<div class="{cls}"><a href="#{tgt}"{attr}>{lbl}</a></div>')
    return "".join(out)

def document(toc_html):
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>Airbnb Anywhere</title>
<link rel="stylesheet" href="book.css">
<style>@page :left {{ @top-center {{ content: "{RH_TEXT}"; font-family: "Bitstream Charter"; font-size: 8pt; letter-spacing: 0.18em; color: #333; }} }}</style></head><body>
<section class="halftitle page-plain"><div class="ht-title">{TITLE_HTML}</div></section>
<section class="titlepage page-plain">
  <div class="tp-title">{TITLE_HTML}</div>
  <div class="tp-rule"></div>
  <div class="tp-sub">{subtitle}</div>
  <div class="tp-author">Dr. Jeff Chheuy</div>
  <div class="tp-pub">TEECO</div>
</section>
<section class="copyright">
  <p>Copyright © 2026 Jeff Chheuy. All rights reserved.</p>
  <p>No part of this book may be reproduced without written permission from the author.</p>
  <p><strong>Disclaimer.</strong> {disclaimer}</p>
  <p>Airbnb is a trademark of Airbnb, Inc. All other product and company names are trademarks of their respective owners. Use of these names is for identification and reference only and does not imply sponsorship, endorsement, or affiliation. This book is not authorized by, affiliated with, or endorsed by Airbnb, Inc. or any other company named in it.</p>
  <p>Published by Teeco · teeco.co</p>
  <p>First Edition</p>
</section>
<section class="dedication page-plain"><p><em>{dedication}</em></p></section>
<section class="toc page-front"><h1 class="toc-h">Contents</h1>{toc_html}</section>
<div class="mainmatter">
{"".join(html_parts)}
</div>
</body></html>"""

from weasyprint import HTML

# pass 1
open(OUT_HTML, "w").write(document(toc_block(None)))
doc = HTML(OUT_HTML).render()
anchor_page = {}
for i, page in enumerate(doc.pages):
    for name in page.anchors:
        anchor_page.setdefault(name, i + 1)
def display(tgt): return anchor_page[tgt]
opener_pages = sorted(anchor_page[t] for lvl, _, t in toc if lvl in ("ch", "sp"))
divider_pages = sorted(anchor_page[t] for lvl, _, t in toc if lvl == "part")
first_main = min(anchor_page[t] for _, _, t in toc)
front_pages = list(range(1, first_main))
KILL = "@top-left { content: none; } @top-center { content: none; } @top-right { content: none; }"
FOLIO = "@bottom-center { content: counter(page); font-family: 'Bitstream Charter'; font-size: 9pt; color: #333; }"
opener_css = "".join(f"@page :nth({n}) {{ {KILL} {FOLIO} }}\n" for n in opener_pages)
opener_css += "".join(f"@page :nth({n}) {{ {KILL} }}\n" for n in divider_pages + front_pages)

# pass 2+: iterate to a fixed point so :nth() kills match real pagination
for it in range(4):
    html2 = document(toc_block(display)).replace("</head>", f"<style>{opener_css}</style></head>")
    open(OUT_HTML, "w").write(html2)
    doc2 = HTML(OUT_HTML).render()
    new_anchor = {}
    for i, page in enumerate(doc2.pages):
        for name in page.anchors:
            new_anchor.setdefault(name, i + 1)
    if all(new_anchor.get(t) == anchor_page.get(t) for _, _, t in toc):
        print(f"pagination stable after iteration {it+1}")
        break
    anchor_page = new_anchor
    opener_pages = sorted(anchor_page[t] for lvl, _, t in toc if lvl in ("ch", "sp"))
    divider_pages = sorted(anchor_page[t] for lvl, _, t in toc if lvl == "part")
    first_main = min(anchor_page[t] for _, _, t in toc)
    front_pages = list(range(1, first_main))
    opener_css = "".join(f"@page :nth({n}) {{ {KILL} {FOLIO} }}\n" for n in opener_pages)
    opener_css += "".join(f"@page :nth({n}) {{ {KILL} }}\n" for n in divider_pages + front_pages)
doc2.write_pdf(OUT_PDF)
info = subprocess.run(["pdfinfo", OUT_PDF], capture_output=True, text=True).stdout
print(chapnum, "chapters,", partnum, "parts; opener pages:", opener_pages)
print([l for l in info.splitlines() if l.startswith(("Pages", "Page size"))])
print("sample toc:", [(t, display(t)) for _, _, t in toc[:5]])
