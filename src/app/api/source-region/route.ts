import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { imageToInlineBase64 } from "@/lib/image-url-server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Source 3 real product alternatives for whatever's at a click point.
 * Faster + cheaper than running source-from-scene against the whole image
 * because we only do one identification call + one Google Search call
 * (not N items × 3 options).
 *
 * POST body: {
 *   imageDataUrl: data:image/...
 *   clickXPct: 0-100
 *   clickYPct: 0-100
 *   styleHint?: string
 *   budget?: number
 * }
 *
 * Response: {
 *   identified: string
 *   options: [{ name, vendor, price, url, imageUrl?, dimensions? }]
 * } | { error }
 */

interface RequestBody {
  imageDataUrl?: string;
  clickXPct?: number;
  clickYPct?: number;
  styleHint?: string;
  budget?: number;
}

interface ProductOption {
  name: string;
  vendor: string;
  price: number | null;
  url: string;
  imageUrl?: string;
  dimensions?: string;
  rating?: number | null;
  reviewCount?: number | null;
  deliveryEstimate?: string | null;
  inStock?: boolean | null;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured on the server" }, { status: 500 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imageDataUrl, clickXPct, clickYPct, styleHint, budget } = body;
  if (!imageDataUrl) {
    return NextResponse.json({ error: "imageDataUrl is required (data: or https: URL)" }, { status: 400 });
  }
  if (typeof clickXPct !== "number" || typeof clickYPct !== "number") {
    return NextResponse.json({ error: "clickXPct + clickYPct (0-100) required" }, { status: 400 });
  }

  let base64Data: string;
  let mimeType: string;
  try {
    const img = await imageToInlineBase64(imageDataUrl);
    base64Data = img.data;
    mimeType = img.mimeType;
  } catch (e) {
    return NextResponse.json(
      { error: `Could not load image: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 }
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  // ── Stage 1: identify item + build a search query ──
  let identified: string;
  let searchQuery: string;
  let estimatedSize: string | undefined;
  try {
    const identifyPrompt =
      `Look at this interior design scene. The designer clicked at approximately ` +
      `${clickXPct.toFixed(0)}% from the left and ${clickYPct.toFixed(0)}% from the top. ` +
      `Identify the single piece of furniture or decor at that exact location and produce a detailed ` +
      `searchQuery a shopper could paste into Wayfair / Google Shopping to find similar items. ` +
      `Include material, color, style, and rough size.` +
      (styleHint ? ` Style direction: ${styleHint}.` : "");

    const idResp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: identifyPrompt },
            { inlineData: { mimeType, data: base64Data } },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            item: { type: Type.STRING, description: "Short noun phrase (e.g. 'green velvet sofa')." },
            searchQuery: { type: Type.STRING, description: "Detailed search query with material, color, style, size." },
            estimatedSize: { type: Type.STRING, description: "Rough dimensions e.g. '84\" sofa', '8x10 rug'." },
          },
          required: ["item", "searchQuery"],
        },
      },
    });
    const text = idResp.text ?? "";
    const parsed = JSON.parse(text) as { item?: string; searchQuery?: string; estimatedSize?: string };
    identified = (parsed.item ?? "").trim();
    searchQuery = (parsed.searchQuery ?? identified).trim();
    estimatedSize = parsed.estimatedSize?.trim();
    if (!identified) throw new Error("Gemini returned empty identification");
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "Couldn't identify what's at that spot — try clicking more precisely. " +
          (err instanceof Error ? err.message : String(err)),
      },
      { status: 502 }
    );
  }

  // ── Stage 2: Google Search grounding for 3 real products ──
  try {
    const budgetHint = budget ? ` Keep prices reasonable, ideally under $${Math.round(budget)} per item.` : "";
    const sourcePrompt =
      `Find 3 real products a designer could actually buy that match this description: "${searchQuery}". ` +
      (estimatedSize ? `Approximate size: ${estimatedSize}. ` : "") +
      `Prefer Wayfair, Amazon, Target, West Elm, CB2, Crate & Barrel, Article, Anthropologie, AllModern, Rejuvenation. ` +
      `RANK best→worst by: (1) price fit${budget ? ` near/under $${Math.round(budget)}` : ""}, (2) review quality (4+ stars with real review counts beat unrated), (3) availability (in-stock / fast ship preferred). ` +
      budgetHint +
      ` For each return JSON with: name, vendor, price (number), url, imageUrl, dimensions, ` +
      `rating (0-5 or null), reviewCount (int or null), deliveryEstimate (string or null), inStock (true/false/null). ` +
      `CRITICAL: return null for any field NOT clearly visible in search results — never fake ratings/reviews/delivery. ` +
      `Return strictly as a JSON array of exactly 3 objects. No prose, no markdown fences.`;

    const sourceResp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: sourcePrompt }] }],
      config: { tools: [{ googleSearch: {} }] },
    });
    const raw = sourceResp.text ?? "";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      return NextResponse.json({ identified, searchQuery, estimatedSize, options: [] });
    }
    const parsed = JSON.parse(match[0]) as ProductOption[];
    const toNum = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const toStr = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s && s.toLowerCase() !== "null" && s.toLowerCase() !== "unknown" ? s : null;
    };
    const toBool = (v: unknown): boolean | null => v === true || v === "true" ? true : v === false || v === "false" ? false : null;

    const options = (Array.isArray(parsed) ? parsed : []).slice(0, 3).map(o => {
      const rc = toNum((o as unknown as Record<string, unknown>).reviewCount);
      return {
        name: String(o.name ?? ""),
        vendor: String(o.vendor ?? ""),
        price: toNum(o.price),
        url: String(o.url ?? ""),
        dimensions: o.dimensions ? String(o.dimensions) : undefined,
        imageUrl: o.imageUrl ? String(o.imageUrl) : undefined,
        rating: toNum((o as unknown as Record<string, unknown>).rating),
        reviewCount: rc !== null ? Math.round(rc) : null,
        deliveryEstimate: toStr((o as unknown as Record<string, unknown>).deliveryEstimate),
        inStock: toBool((o as unknown as Record<string, unknown>).inStock),
      };
    });

    // Server-side image verification: validate each option's imageUrl actually
    // loads a real image. Falls back to og:image extraction from product page.
    // Same hardening as /api/source-item — prevents broken/wrong images.
    await Promise.all(options.map(async (opt) => {
      if (opt.imageUrl) {
        const ok = await verifyImageUrl(opt.imageUrl);
        if (ok) return;
      }
      if (opt.url) {
        const ogImg = await extractOgImageServer(opt.url);
        if (ogImg) {
          opt.imageUrl = ogImg;
          return;
        }
      }
      opt.imageUrl = undefined;
    }));

    return NextResponse.json({ identified, searchQuery, estimatedSize, options });
  } catch (err) {
    return NextResponse.json(
      { identified, searchQuery, estimatedSize, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}

// ── Image verification helpers (ported from source-item route) ──────────

/**
 * HEAD/GET probe to verify a URL actually returns an image (2xx + image/* content-type).
 * Times out after 5s to avoid blocking the response.
 */
async function verifyImageUrl(url: string): Promise<boolean> {
  if (!url || url.startsWith("data:")) return true;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    // Try HEAD first (cheaper)
    let res = await fetch(url, {
      method: "HEAD",
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EdgeDesigner/1.0)" },
    });
    // Some servers reject HEAD — fall back to GET with range
    if (!res.ok) {
      res = await fetch(url, {
        method: "GET",
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; EdgeDesigner/1.0)",
          Range: "bytes=0-1023",
        },
      });
    }
    clearTimeout(timer);
    if (!res.ok) return false;
    const ct = res.headers.get("content-type") ?? "";
    return ct.startsWith("image/");
  } catch {
    return false;
  }
}

/**
 * Fetch a product page URL and extract og:image meta tag as fallback image.
 * Times out after 6s. Returns null on failure.
 */
async function extractOgImageServer(pageUrl: string): Promise<string | null> {
  if (!pageUrl) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(pageUrl, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    // Only read first 50KB to avoid downloading huge pages
    const text = await res.text();
    const chunk = text.slice(0, 50000);
    // Match og:image meta tag
    const m = chunk.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? chunk.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (m?.[1]) {
      const img = m[1];
      // Verify the extracted URL is actually an image
      const ok = await verifyImageUrl(img);
      return ok ? img : null;
    }
    return null;
  } catch {
    return null;
  }
}
