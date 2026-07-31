#!/usr/bin/env python3
"""Bonus Pack: markdown -> Teeco-branded letter PDFs (brand guide, Apr 2024)."""
import os, re, subprocess, sys, glob

BOOK = os.path.dirname(os.path.abspath(__file__))
BONUS = os.path.join(BOOK, "..", "bonus")
OUTDIR = os.path.join(BONUS, "pdf")
os.makedirs(OUTDIR, exist_ok=True)

SKIP = {"BONUS_PACK_README.md"}

def pandoc(mdtext):
    p = subprocess.run(["pandoc", "-f", "markdown+smart", "-t", "html"],
                       input=mdtext, capture_output=True, text=True)
    if p.returncode: sys.exit(p.stderr)
    h = p.stdout.strip()
    h = h.replace('<li><label><input type="checkbox" />',
                  '<li class="check"><span class="cbox"></span><label>')
    h = h.replace('<li><p><label><input type="checkbox" />',
                  '<li class="check"><p><span class="cbox"></span><label>')
    return h

def document(title, body_html):
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>{title}</title>
<link rel="stylesheet" href="{BOOK}/bonus.css"></head><body>
<div class="bhead">
  <div class="bhead-l">
    <div class="eyebrow">RURAL Method &nbsp;·&nbsp; Bonus Pack</div>
    <h1>{title}</h1>
  </div>
  <div class="bhead-r"><img src="{BOOK}/teeco_logo.png"/></div>
</div>
<div class="intro">{body_html}</div>
</body></html>"""

from weasyprint import HTML

targets = sorted(glob.glob(os.path.join(BONUS, "*.md")))
for src in targets:
    name = os.path.basename(src)
    if name in SKIP: continue
    md = open(src).read()
    # drop standalone "*From the RURAL Method...*" taglines (the footer already says it)
    md = re.sub(r"^\*From the RURAL Method[^\n]*\*\s*$", "", md, flags=re.M)
    md = re.sub(r"\n---[ \t]*\n?[\s]*\Z", "\n", md)  # orphaned trailing divider
    m = re.search(r"^# (.+)$", md, re.M)
    title = m.group(1).strip() if m else name[:-3]
    body = (md[:m.start()] + md[m.end():]) if m else md
    html = document(title, pandoc(body))
    out = os.path.join(OUTDIR, name[:-3] + ".pdf")
    HTML(string=html, base_url=BOOK).write_pdf(out)
    n = subprocess.run(["pdfinfo", out], capture_output=True, text=True).stdout
    pages = [l.split()[-1] for l in n.splitlines() if l.startswith("Pages")][0]
    print(f"{pages:>3}pp  {name[:-3]}")
print("done ->", OUTDIR)
