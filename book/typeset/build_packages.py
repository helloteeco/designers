import os, subprocess, shutil
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
               TITLE_HTML=p["title_html"], RH_TEXT=p["rh"], SUBTITLE_OVERRIDE=p["subtitle"])
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
    # cover jpg
    from PIL import Image
    Image.open(os.path.join(BOOK, p["cover"])).convert("RGB").save(os.path.join(d, f"{p['title']} - Ebook Cover.jpg"), quality=95)
print("packages done")
