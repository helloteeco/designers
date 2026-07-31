import os, subprocess, shutil, re, zipfile, tempfile

def polish_epub(path):
    """Publisher pass: visible scene breaks, flat TOC (Introduction not nested
    under Dedication), and a bodymatter 'Start Reading' landmark for Kindle."""
    tmp = tempfile.mkdtemp()
    with zipfile.ZipFile(path) as z:
        z.extractall(tmp)
    intro = None
    for root, _, files in os.walk(tmp):
        for fn in files:
            fp = os.path.join(root, fn)
            if fn == "nav.xhtml":
                s = open(fp).read()
                m = re.search(r'href="(text/ch\d+\.xhtml)">Introduction', s)
                intro = m.group(1) if m else None
                # lift Introduction out of the Dedication branch
                s = re.sub(r'(<li id="[^"]*"><a href="text/ch\d+\.xhtml">Dedication</a>)<ol class="toc">(<li id="[^"]*"><a href="text/ch\d+\.xhtml">Introduction[^<]*</a></li>)</ol></li>',
                           r'\1</li>\2', s)
                if intro:
                    s = s.replace('</ol>\n</nav>\n</body>',
                                  f'<li><a href="{intro}" epub:type="bodymatter">Start Reading</a></li></ol>\n</nav>\n</body>')
                open(fp, "w").write(s)
            elif fn == "toc.ncx":
                s = open(fp).read()
                s = re.sub(r'(<navPoint id="[^"]*">\s*<navLabel>\s*<text>Dedication</text>\s*</navLabel>\s*<content src="text/ch\d+\.xhtml" />)\s*(<navPoint id="[^"]*">\s*<navLabel>\s*<text>Introduction[^<]*</text>\s*</navLabel>\s*<content src="text/ch\d+\.xhtml" />\s*</navPoint>)\s*(</navPoint>)',
                           r'\1\3\2', s)
                open(fp, "w").write(s)
            elif fn.endswith(".xhtml") and fn.startswith("ch"):
                s = open(fp).read()
                if "<hr />" in s or "<hr/>" in s:
                    s = s.replace("<hr />", '<p class="scenebreak">&#8226;&#160;&#160;&#8226;&#160;&#160;&#8226;</p>').replace(
                                  "<hr/>", '<p class="scenebreak">&#8226;&#160;&#160;&#8226;&#160;&#160;&#8226;</p>')
                    open(fp, "w").write(s)
    with zipfile.ZipFile(path, "w") as z:
        z.write(os.path.join(tmp, "mimetype"), "mimetype", compress_type=zipfile.ZIP_STORED)
        for root, _, files in os.walk(tmp):
            for fn in files:
                fp = os.path.join(root, fn)
                arc = os.path.relpath(fp, tmp)
                if arc == "mimetype": continue
                z.write(fp, arc, compress_type=zipfile.ZIP_DEFLATED)
    shutil.rmtree(tmp)
    print("  polished:", os.path.basename(path))

BOOK = os.path.dirname(os.path.abspath(__file__))
PKGROOT = os.path.join(BOOK, "..", "packages")
PKGS = [
  dict(slug="1-RECOMMENDED-Vacation-Rentals-That-Pay-You",
       title="Vacation Rentals That Pay You",
       title_html="Vacation Rentals<br/>That Pay You",
       rh="VACATION RENTALS THAT PAY YOU",
       subtitle="The 5-Step RURAL Method for Building Cash Flow From Small Towns You've Never Visited",
       cover="cover_t2.png"),
  dict(slug="2-Booked-Anywhere",
       title="Booked Anywhere",
       title_html="Booked<br/>Anywhere",
       rh="BOOKED ANYWHERE",
       subtitle="The 5-Step RURAL Method for Buying Vacation Rentals That Pay You, From Towns You've Never Visited",
       cover="cover_t1.png"),
  dict(slug="3-ATTORNEY-ONLY-AirBNB-Anywhere",
       title="AirBNB Anywhere",
       title_html="Airbnb<br/>Anywhere",
       rh="AIRBNB ANYWHERE",
       subtitle="",
       cover="cover_b.png"),
]
for p in PKGS:
    d = os.path.join(PKGROOT, p["slug"])
    os.makedirs(d, exist_ok=True)
    env = dict(os.environ,
               OUT_PDF=os.path.join(d, f"{p['title']} - Print Interior 6x9.pdf"),
               TITLE_HTML=p["title_html"], RH_TEXT=p["rh"], SUBTITLE_OVERRIDE=p["subtitle"],
               PDF_TITLE=p["title"])
    r = subprocess.run(["python3", os.path.join(BOOK, "build_book.py")], env=env, capture_output=True, text=True)
    print(p["slug"], "PDF:", r.stdout.strip().splitlines()[-2:] if r.returncode==0 else r.stderr[-400:])
    # epub
    sub = p["subtitle"] or "The 5-Step RURAL Method for Buying Vacation Rentals That Pay You — From Towns You've Never Visited"
    r2 = subprocess.run(["pandoc", os.path.join(BOOK, "manuscript_epub.md"), "-f", "markdown+smart", "-t", "epub3",
                         "--toc", "--toc-depth=2", "--split-level=2", "--css", os.path.join(BOOK, "epub.css"),
                         "--epub-cover-image", os.path.join(BOOK, p["cover"]),
                         "-M", f"title={p['title']}", "-M", f"subtitle={sub}",
                         "-o", os.path.join(d, f"{p['title']} - Kindle.epub")], capture_output=True, text=True)
    print(p["slug"], "EPUB:", "ok" if r2.returncode==0 else r2.stderr[-200:])
    polish_epub(os.path.join(d, f"{p['title']} - Kindle.epub"))
    # cover jpg
    from PIL import Image
    Image.open(os.path.join(BOOK, p["cover"])).convert("RGB").save(os.path.join(d, f"{p['title']} - Ebook Cover.jpg"), quality=95)
print("packages done")
