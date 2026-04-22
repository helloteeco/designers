import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Extract the og:image (Open Graph image) from any product page URL.
 * Every major vendor (Wayfair, Overstock, Target, IKEA, Amazon, etc.)
 * sets og:image in their HTML <head> because social media platforms
 * use it for link previews. It's always a direct, hotlinkable image URL.
 *
 * GET /api/og-image?url=https%3A%2F%2Fwww.overstock.com%2F...
 *   → { imageUrl: "https://ak1.ostkcdn.com/images/..." }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url");
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

    // Try og:image first (most reliable)
    let imageUrl = extractMeta(html, "og:image");

    // Fallback: twitter:image
    if (!imageUrl) imageUrl = extractMeta(html, "twitter:image");

    // Fallback: first large image in JSON-LD product schema
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

    return NextResponse.json({ imageUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch page" },
      { status: 502 }
    );
  }
}

function extractMeta(html: string, property: string): string | null {
  // Match both property="og:image" and name="og:image" patterns
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
