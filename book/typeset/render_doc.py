#!/usr/bin/env python3
"""Render a markdown doc to a Teeco-branded letter PDF. Usage:
   render_doc.py SRC.md OUT.pdf [TITLE] [FOOTER]"""
import re, subprocess, os, sys
BOOK = os.path.dirname(os.path.abspath(__file__))
src, out = sys.argv[1], sys.argv[2]
title_ov = sys.argv[3] if len(sys.argv) > 3 else None
footer = sys.argv[4] if len(sys.argv) > 4 else "RURAL Method launch kit  ·  Last updated July 2026"
md = open(src).read()
md = re.sub(r"^\*From the RURAL Method[^\n]*\*\s*$", "", md, flags=re.M)
md = re.sub(r"\n---[ \t]*\n?[\s]*\Z", "\n", md)
m = re.search(r"^# (.+)$", md, re.M)
title = title_ov or (m.group(1).strip() if m else os.path.basename(src)[:-3])
body = (md[:m.start()] + md[m.end():]) if m else md
p = subprocess.run(["pandoc", "-f", "markdown+smart", "-t", "html"], input=body, capture_output=True, text=True)
h = p.stdout.strip()
h = h.replace('<li><label><input type="checkbox" />', '<li class="check"><span class="cbox"></span><label>')
h = h.replace('<li><p><label><input type="checkbox" />', '<li class="check"><p><span class="cbox"></span><label>')
html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>{title}</title>
<meta name="author" content="Dr. Jeff Chheuy">
<link rel="stylesheet" href="{BOOK}/bonus.css">
<style>@page {{ @bottom-center {{ content: "{footer}  ·  Page " counter(page); }} }}</style></head><body>
<div class="bhead"><div class="bhead-l"><div class="eyebrow">RURAL Method &nbsp;·&nbsp; Launch Kit</div><h1>{title}</h1></div>
<div class="bhead-r"><img src="{BOOK}/teeco_logo.png"/></div></div>
<div class="intro">{h}</div></body></html>"""
from weasyprint import HTML
HTML(string=html, base_url=BOOK).write_pdf(out)
n = subprocess.run(["pdfinfo", out], capture_output=True, text=True).stdout
print([l for l in n.splitlines() if l.startswith("Pages")], os.path.basename(out))
