import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/scrape-listing
 *
 * Accepts a real-estate listing URL (e.g. bluegrass, matterport, zillow)
 * and attempts to extract:
 *   - Gallery photos (room images)
 *   - Floor plan images
 *   - Property address / title
 *   - Embedded Matterport model ID
 *
 * This is a best-effort convenience shortcut. If scraping fails or the
 * format is unrecognized, the response includes `{ ok: false, reason }`
 * so the client can fall back to manual upload gracefully.
 */
export async function POST(req: NextRequest) {
  try {
    const { url } = (await req.json()) as { url?: string };
    if (!url || typeof url !== "string") {
      return NextResponse.json({ ok: false, reason: "No URL provided" }, { status: 400 });
    }

    // Fetch the listing page HTML
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let html: string;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,*/*",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, reason: `Listing page returned HTTP ${res.status}` },
          { status: 200 },
        );
      }
      html = await res.text();
    } catch (err) {
      clearTimeout(timeout);
      const msg = err instanceof Error ? err.message : "unknown";
      return NextResponse.json(
        { ok: false, reason: `Could not fetch listing: ${msg}` },
        { status: 200 },
      );
    }

    // Extract data from HTML
    const result: ScrapedListing = {
      ok: true,
      title: extractTitle(html),
      address: extractAddress(html),
      matterportModelId: extractMatterportId(html, url),
      galleryImages: extractGalleryImages(html, url),
      floorPlanImages: extractFloorPlanImages(html, url),
    };

    // If we got nothing useful, report that
    const hasContent =
      result.galleryImages.length > 0 ||
      result.floorPlanImages.length > 0 ||
      result.matterportModelId;

    if (!hasContent) {
      return NextResponse.json({
        ok: false,
        reason:
          "Could not extract images or Matterport data from this page. Try uploading your floor plan and room photos directly.",
        title: result.title,
        address: result.address,
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ── Types ──

interface ScrapedListing {
  ok: boolean;
  title?: string;
  address?: string;
  matterportModelId?: string;
  galleryImages: string[];
  floorPlanImages: string[];
}

// ── Extraction helpers ──

function extractTitle(html: string): string | undefined {
  // Try og:title first, then <title>
  const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (ogMatch) return decodeEntities(ogMatch[1]);
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) return decodeEntities(titleMatch[1]).trim();
  return undefined;
}

function extractAddress(html: string): string | undefined {
  // Common patterns: og:description, schema.org address, or meta description
  const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  if (ogDesc) {
    const text = decodeEntities(ogDesc[1]);
    // If it looks like an address (has a number and state abbreviation)
    if (/\d+.*[A-Z]{2}/.test(text)) return text;
  }
  // Try structured data
  const streetMatch = html.match(/"streetAddress"\s*:\s*"([^"]+)"/i);
  if (streetMatch) return decodeEntities(streetMatch[1]);
  return undefined;
}

function extractMatterportId(html: string, pageUrl: string): string | undefined {
  // Check for embedded Matterport iframe
  const iframeMatch = html.match(
    /src=["'][^"']*(?:my\.matterport\.com|matterport\.com)\/show\/?\?m=([A-Za-z0-9]+)/i,
  );
  if (iframeMatch) return iframeMatch[1];

  // Check for matterport model ID in any script or data attribute
  const dataMatch = html.match(/["'](?:model_?id|matterport_?id|m)["']\s*[:=]\s*["']([A-Za-z0-9]{8,})["']/i);
  if (dataMatch) return dataMatch[1];

  // Check if the page URL itself is a matterport link
  const urlMatch = pageUrl.match(/matterport\.com\/show\/?\?m=([A-Za-z0-9]+)/i);
  if (urlMatch) return urlMatch[1];

  return undefined;
}

function extractGalleryImages(html: string, pageUrl: string): string[] {
  const images: string[] = [];
  const seen = new Set<string>();

  // Strategy 1: og:image
  const ogImages = html.matchAll(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/gi);
  for (const m of ogImages) {
    const url = resolveUrl(m[1], pageUrl);
    if (url && !seen.has(url) && isLikelyPhoto(url)) {
      seen.add(url);
      images.push(url);
    }
  }

  // Strategy 2: Large images in the page (likely gallery)
  const imgTags = html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*/gi);
  for (const m of imgTags) {
    const url = resolveUrl(m[1], pageUrl);
    if (!url || seen.has(url)) continue;
    // Filter out tiny icons, logos, tracking pixels
    if (isLikelyPhoto(url)) {
      seen.add(url);
      images.push(url);
    }
  }

  // Strategy 3: Background images in style attributes
  const bgImages = html.matchAll(/url\(["']?([^"')]+)["']?\)/gi);
  for (const m of bgImages) {
    const url = resolveUrl(m[1], pageUrl);
    if (!url || seen.has(url)) continue;
    if (isLikelyPhoto(url)) {
      seen.add(url);
      images.push(url);
    }
  }

  // Strategy 4: JSON-LD or data attributes with image arrays
  const jsonMatches = html.matchAll(/"(?:image|photo|url)":\s*"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi);
  for (const m of jsonMatches) {
    const url = m[1];
    if (!seen.has(url) && isLikelyPhoto(url)) {
      seen.add(url);
      images.push(url);
    }
  }

  return images.slice(0, 50); // Cap at 50 to avoid overwhelming
}

function extractFloorPlanImages(html: string, pageUrl: string): string[] {
  const plans: string[] = [];
  const seen = new Set<string>();

  // Look for images with "floor" or "plan" in the URL, alt text, or nearby text
  const allImgs = html.matchAll(/<img[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*/gi);
  for (const m of allImgs) {
    const fullTag = m[0].toLowerCase();
    const url = resolveUrl(m[1], pageUrl);
    if (!url || seen.has(url)) continue;
    if (
      fullTag.includes("floor") ||
      fullTag.includes("plan") ||
      fullTag.includes("layout") ||
      fullTag.includes("schematic") ||
      url.toLowerCase().includes("floor") ||
      url.toLowerCase().includes("plan")
    ) {
      seen.add(url);
      plans.push(url);
    }
  }

  return plans.slice(0, 10);
}

// ── Utility helpers ──

function isLikelyPhoto(url: string): boolean {
  const lower = url.toLowerCase();
  // Must be an image format
  if (!/\.(jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(lower) && !lower.includes("/image")) return false;
  // Filter out tiny images (icons, logos, tracking)
  if (lower.includes("logo") || lower.includes("icon") || lower.includes("favicon")) return false;
  if (lower.includes("1x1") || lower.includes("pixel") || lower.includes("tracking")) return false;
  // Filter out very small dimension hints in URL
  if (/\/\d{1,2}x\d{1,2}[./]/.test(lower)) return false;
  return true;
}

function resolveUrl(raw: string, base: string): string | undefined {
  try {
    const decoded = decodeEntities(raw);
    if (decoded.startsWith("data:")) return undefined;
    return new URL(decoded, base).href;
  } catch {
    return undefined;
  }
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}
