import { NextResponse } from "next/server";
import { titleMatchesDescription } from "@/lib/product-title-match";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Extract the og:image from a product page URL AND validate it's actually the
 * product the caller is looking for.
 *
 * Why validation: Gemini's grounded search sometimes hallucinates URLs. Without
 * a title check, we happily pull the og:image off a romance novel's Amazon page
 * and paste it onto a dining-chair line item on the composite board. The title
 * match is cheap and catches the common "completely unrelated page" case.
 *
 * GET /api/og-image?url=<page>&description=<what-we-wanted>
 *   → { imageUrl, title, matched: true }           — good match
 *   → { error: "title-mismatch", title, imageUrl } — looks like the wrong page
 *
 * The description param is optional. When omitted we skip validation (kept for
 * backward compat; new callers should always pass it).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url");
  const description = searchParams.get("description") ?? "";
  if (!target) {
    return NextResponse.json({ error: "url query param required" }, { status: 400 });
  }

  try {
    const res = await fetch(target, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `HTTP ${res.status}` }, { status: 502 });
    }

    const html = await res.text();

    // Grab title signals — og:title is usually cleaner than <title>, but both
    // count for the keyword match so we max our chances of a legit match.
    const ogTitle = extractMeta(html, "og:title");
    const pageTitle = extractPageTitle(html);
    const titleForMatch = [ogTitle, pageTitle].filter(Boolean).join(" | ");

    // Try og:image first, then twitter:image, then JSON-LD product schema
    let imageUrl = extractMeta(html, "og:image") ?? extractMeta(html, "twitter:image");
    if (!imageUrl) {
      const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
      if (ldMatch) {
        try {
          const ld = JSON.parse(ldMatch[1]);
          const img = ld.image ?? ld[0]?.image;
          if (typeof img === "string") imageUrl = img;
          else if (Array.isArray(img) && typeof img[0] === "string") imageUrl = img[0];
        } catch {}
      }
    }

    if (!imageUrl) {
      return NextResponse.json({ error: "No og:image found on the page" }, { status: 404 });
    }

    // Make relative URLs absolute
    if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
    else if (imageUrl.startsWith("/")) {
      const base = new URL(target);
      imageUrl = base.origin + imageUrl;
    }

    // Title validation — if a description was supplied and the page's title
    // doesn't look like the same kind of product, reject. Better to return a
    // placeholder the designer can swap than a wildly wrong image.
    if (description && titleForMatch) {
      const match = titleMatchesDescription(titleForMatch, description);
      if (!match.isMatch) {
        return NextResponse.json(
          {
            error: "title-mismatch",
            title: titleForMatch,
            description,
            imageUrl,
            keywordOverlap: match.keywordOverlap,
            categoryMatch: match.categoryMatch,
          },
          { status: 422 }
        );
      }
    }

    return NextResponse.json({ imageUrl, title: titleForMatch });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch page" },
      { status: 502 }
    );
  }
}

function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

function extractPageTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m?.[1]) return null;
  // Strip HTML entities + common vendor suffix noise ("| Wayfair", "- Amazon.com")
  return m[1]
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
