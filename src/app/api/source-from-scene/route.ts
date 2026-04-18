import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Reverse-source real products from a generated scene image.
 *
 * Two-stage pipeline:
 *   1. Gemini Vision identifies each distinct furniture/decor piece in the
 *      scene image (sofa, lamp, rug, art, coffee table, etc.) along with a
 *      brief description (material, color, style notes).
 *   2. For each identified piece, a separate Gemini call with Google Search
 *      grounding finds 3 real products that match the description, pulling
 *      vendor, price, URL, and image where possible.
 *
 * Designer reviews the 3 options per item, confirms one (or rejects all).
 * Budget-aware: the response includes a price range per item so the UI can
 * flag when a selection blows the remaining budget.
 *
 * POST body: {
 *   imageDataUrl: data:image/png;base64,... from generate-scene
 *   budget?: number — remaining dollars; ranks picks to fit when provided
 *   styleHint?: string — e.g. "japandi" for extra context
 * }
 *
 * Response: {
 *   items: Array<{
 *     description: string,
 *     category: string,
 *     options: Array<{ name, vendor, price, url, imageUrl?, dimensions? }>
 *   }>
 * }
 */

interface IdentifiedItem {
  description: string;
  category: string;
  searchQuery: string;
  estimatedSize?: string;
}

interface ProductOption {
  name: string;
  vendor: string;
  price: number | null;
  url: string;
  imageUrl?: string;
  dimensions?: string;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured on the server" },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    imageDataUrl,
    budget,
    styleHint,
  } = (body ?? {}) as {
    imageDataUrl?: string;
    budget?: number;
    styleHint?: string;
  };

  if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
    return NextResponse.json(
      { error: "imageDataUrl must be a data:image/... URL" },
      { status: 400 }
    );
  }

  const [mimePart, base64Data] = imageDataUrl.split(",");
  const mimeType = mimePart.replace("data:", "").replace(";base64", "");

  const ai = new GoogleGenAI({ apiKey });

  // ── Stage 1: Identify items ──────────────────────────────────────────

  let identified: IdentifiedItem[] = [];
  try {
    const identifyPrompt = [
      "You are an interior designer cataloguing furniture and decor in a room scene.",
      "Look at the image and list every distinct purchasable furniture or decor piece visible.",
      "Skip built-in architecture (walls, windows, doors, floors, ceilings).",
      "For each piece, give a detailed searchQuery a shopper could paste into Wayfair or Google to find something similar — include material, color, style, rough size.",
      styleHint ? `Style direction: ${styleHint}.` : "",
      "Return 5-10 items, most prominent first.",
    ].filter(Boolean).join(" ");

    const identifyResponse = await ai.models.generateContent({
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
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING },
              category: { type: Type.STRING, description: "broad category e.g. sofa, lamp, rug, table, chair, art, storage, lighting, textile, decor" },
              searchQuery: { type: Type.STRING },
              estimatedSize: { type: Type.STRING, description: "rough dimensions e.g. 84\" sofa, 8x10 rug" },
            },
            required: ["description", "category", "searchQuery"],
          },
        },
      },
    });

    const text = identifyResponse.text ?? "";
    identified = JSON.parse(text);
    if (!Array.isArray(identified)) identified = [];
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Scene analysis failed: ${message}` },
      { status: 502 }
    );
  }

  if (identified.length === 0) {
    return NextResponse.json({ items: [] });
  }

  // ── Stage 2: Source products per item via Google Search grounding ────

  const perItemBudgetHint = budget && identified.length > 0
    ? ` Keep prices reasonable — the full set shouldn't exceed $${Math.round(budget)}.`
    : "";

  const sourced = await Promise.all(
    identified.map(async (item): Promise<{ item: IdentifiedItem; options: ProductOption[] }> => {
      try {
        const sourcePrompt = [
          `Find 3 real products a designer could actually buy that match this description:`,
          `"${item.searchQuery}".`,
          item.estimatedSize ? `Approximate size: ${item.estimatedSize}.` : "",
          `Prefer: Wayfair, Amazon, Target, West Elm, CB2, Crate & Barrel, Article, Anthropologie, AllModern, Rejuvenation.`,
          `For each, return: exact product name, vendor, current price in USD, direct product URL, dimensions.`,
          perItemBudgetHint,
          `Return strictly as JSON: [{"name": "...", "vendor": "...", "price": 0, "url": "...", "dimensions": "..."}] with exactly 3 entries. No prose.`,
        ].filter(Boolean).join(" ");

        const sourceResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: sourcePrompt }] }],
          config: {
            tools: [{ googleSearch: {} }],
          },
        });

        const raw = sourceResponse.text ?? "";
        // Grounded responses often include prose around the JSON; extract the array.
        const match = raw.match(/\[[\s\S]*\]/);
        if (!match) return { item, options: [] };
        const parsed = JSON.parse(match[0]) as ProductOption[];
        if (!Array.isArray(parsed)) return { item, options: [] };

        return {
          item,
          options: parsed.slice(0, 3).map(o => ({
            name: String(o.name ?? ""),
            vendor: String(o.vendor ?? ""),
            price: typeof o.price === "number" ? o.price : Number(o.price) || null,
            url: String(o.url ?? ""),
            dimensions: o.dimensions ? String(o.dimensions) : undefined,
            imageUrl: o.imageUrl ? String(o.imageUrl) : undefined,
          })),
        };
      } catch {
        return { item, options: [] };
      }
    })
  );

  return NextResponse.json({
    items: sourced.map(s => ({
      description: s.item.description,
      category: s.item.category,
      searchQuery: s.item.searchQuery,
      estimatedSize: s.item.estimatedSize,
      options: s.options,
    })),
  });
}
