import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Attempts to resolve an Instagram post URL into usable content for the
 * post builder. IG aggressively blocks unauthenticated access, so this
 * route falls through three strategies in order:
 *
 *   1. Official oEmbed — requires INSTAGRAM_OEMBED_TOKEN env var (free
 *      Meta developer app). Returns caption + thumbnail URL.
 *   2. Public page scrape — fetch the post HTML and pull og:description
 *      + og:image from the meta tags. Works ~60% of the time.
 *   3. Graceful fail — instruct the user to paste screenshots instead.
 *
 * We never return more than the caption text and an image URL; the
 * downstream /analyze route does the actual rewriting via Claude.
 */

interface IgResult {
  caption: string | null;
  imageUrls: string[];
  author: string | null;
  source: "oembed" | "scrape" | "none";
}

function normalizeUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return null;
    // Keep only /p/<id>/ or /reel/<id>/ — drop tracking params.
    const m = /^\/(p|reel|tv)\/([^/]+)/.exec(u.pathname);
    if (!m) return null;
    return `https://www.instagram.com/${m[1]}/${m[2]}/`;
  } catch {
    return null;
  }
}

async function tryOEmbed(url: string): Promise<IgResult | null> {
  const token = process.env.INSTAGRAM_OEMBED_TOKEN;
  if (!token) return null;
  const endpoint = `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(
    url,
  )}&access_token=${encodeURIComponent(token)}`;
  try {
    const resp = await fetch(endpoint, {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      title?: string;
      thumbnail_url?: string;
      author_name?: string;
    };
    return {
      caption: data.title ?? null,
      imageUrls: data.thumbnail_url ? [data.thumbnail_url] : [],
      author: data.author_name ?? null,
      source: "oembed",
    };
  } catch {
    return null;
  }
}

function extractMeta(html: string, property: string): string | null {
  // Match both property="..." and name="..." patterns; tolerate attr order.
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) return decodeHtmlEntities(m[1]);
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/");
}

async function tryScrape(url: string): Promise<IgResult | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        // Pretend to be a browser — IG's anti-bot is aggressive.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    // Bail if IG redirected us to a login wall.
    if (
      html.includes("Login • Instagram") ||
      html.includes("accounts/login") && !html.includes("og:description")
    ) {
      return null;
    }
    const caption = extractMeta(html, "og:description");
    const image = extractMeta(html, "og:image");
    if (!caption && !image) return null;
    return {
      caption,
      imageUrls: image ? [image] : [],
      author: extractMeta(html, "og:title"),
      source: "scrape",
    };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return NextResponse.json(
      { ok: false, code: "BAD_JSON", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (!body.url) {
    return NextResponse.json(
      {
        ok: false,
        code: "MISSING_URL",
        message: "Request must include { url: '<instagram post URL>' }.",
      },
      { status: 400 },
    );
  }

  const normalized = normalizeUrl(body.url);
  if (!normalized) {
    return NextResponse.json(
      {
        ok: false,
        code: "BAD_URL",
        message:
          "URL didn't look like a public Instagram post. Expected format: https://www.instagram.com/p/<id>/ or /reel/<id>/.",
      },
      { status: 400 },
    );
  }

  const oembed = await tryOEmbed(normalized);
  if (oembed) {
    return NextResponse.json({ ok: true, result: oembed });
  }

  const scraped = await tryScrape(normalized);
  if (scraped) {
    return NextResponse.json({ ok: true, result: scraped });
  }

  return NextResponse.json(
    {
      ok: false,
      code: "FETCH_BLOCKED",
      message:
        "Instagram blocked the fetch. This is common — IG requires auth for most posts. Paste screenshots of the carousel instead; it works just as well.",
    },
    { status: 502 },
  );
}
