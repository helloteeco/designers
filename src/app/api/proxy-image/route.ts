import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Fetch an image server-side and stream the bytes back. Lets the client-side
 * compositor (composite-scene.ts) load cutouts hosted on third-party domains
 * (Supabase storage, Wayfair/Amazon/etc. CDNs) without CORS-tainting the
 * <canvas>, which would throw a SecurityError on toDataURL().
 *
 * GET /api/proxy-image?url=https%3A%2F%2F...
 *   → 200 image/* with the bytes
 *   → 400 on missing/invalid url
 *   → 502 on upstream failure
 *
 * Keep the allowlist open — designers paste URLs from all kinds of vendors —
 * but the response content-type is always image/*, so a malicious non-image
 * URL can't smuggle back HTML or JS.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "url query param required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "only http(s) urls" }, { status: 400 });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      // Some vendor CDNs 403 on unknown UAs; spoof a plain browser UA
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/*,*/*;q=0.8",
      },
      // Short cap so a slow CDN doesn't hold a serverless slot
      signal: AbortSignal.timeout(15_000),
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: 502 }
      );
    }
    const ct = upstream.headers.get("content-type") ?? "";
    // Only allow actual image responses to pass through
    if (!ct.startsWith("image/")) {
      return NextResponse.json(
        { error: `Non-image content-type: ${ct || "unknown"}` },
        { status: 502 }
      );
    }
    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Proxy fetch failed" },
      { status: 502 }
    );
  }
}
