import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { imageToInlineBase64 } from "@/lib/image-url-server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Identify every purchasable furniture/decor item in a scene image and
 * return each with a bounding box. This lets the client crop each item
 * directly out of the AI-rendered scene, producing cutouts that match
 * the render EXACTLY — so when they're layered back onto an empty
 * backdrop, the composite looks like the render, not like a "similar"
 * real-product collage.
 *
 * POST body: { imageDataUrl }
 * Response:  { items: [{ description, category, boundingBoxPct: {x,y,w,h} }] }
 *
 * Bounding boxes are percentages (0-100) of image width/height, top-left
 * origin. Coordinates are clamped to [0, 100].
 */

interface IdentifiedItem {
  description: string;
  category: string;
  boundingBoxPct: { x: number; y: number; w: number; h: number };
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

  const { imageDataUrl } = (body ?? {}) as { imageDataUrl?: string };
  if (!imageDataUrl) {
    return NextResponse.json(
      { error: "imageDataUrl is required (data: or https: URL)" },
      { status: 400 }
    );
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

  const prompt = [
    "You are cataloguing EVERY furniture and decor item visible in this room scene.",
    "For each DISTINCT purchasable piece — sofas, chairs, tables, desks, lamps, pendants, sconces, rugs, art, mirrors, plants, vases, books, pillows, throws, curtains, blinds, clocks, candles, baskets, trays, bowls, sculptures, decorative objects of any kind — return:",
    "  • description: a 4-10 word description including material, color, and style (e.g. 'rust velvet curved sectional sofa')",
    "  • category: one of: sofa, chair, table, storage, lamp, pendant, rug, art, mirror, plant, textile, decor, window-treatment",
    "  • boundingBox: pixel coordinates {x, y, w, h} in percentages of the image dimensions (0-100, top-left origin). Include a bit of padding around the item so shadows aren't clipped. Make boxes TIGHT — one item per box, no overlaps that obscure the primary item.",
    "Skip built-in architecture (walls, windows, doors, ceilings, floors, baseboards, crown molding).",
    "Be THOROUGH — include small accent items: plants, books on shelves, decorative bowls, throw pillows, candles, vases. These details make the design. Miss nothing.",
    "Return up to 25 items, largest/most prominent first.",
  ].join(" ");

  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
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
              category: { type: Type.STRING },
              boundingBox: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  w: { type: Type.NUMBER },
                  h: { type: Type.NUMBER },
                },
                required: ["x", "y", "w", "h"],
              },
            },
            required: ["description", "category", "boundingBox"],
          },
        },
      },
    });

    const raw = res.text ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Model response was not JSON", raw: raw.slice(0, 400) },
        { status: 502 }
      );
    }

    if (!Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "Expected array response" },
        { status: 502 }
      );
    }

    const items: IdentifiedItem[] = parsed
      .map(o => {
        const obj = o as Record<string, unknown>;
        const box = obj.boundingBox as Record<string, unknown> | undefined;
        if (!box) return null;
        return {
          description: String(obj.description ?? ""),
          category: String(obj.category ?? "decor"),
          boundingBoxPct: {
            x: clamp(Number(box.x) || 0, 0, 100),
            y: clamp(Number(box.y) || 0, 0, 100),
            w: clamp(Number(box.w) || 10, 1, 100),
            h: clamp(Number(box.h) || 10, 1, 100),
          },
        };
      })
      .filter((x): x is IdentifiedItem => !!x && x.description.length > 0);

    return NextResponse.json({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Extraction failed: ${msg}` }, { status: 502 });
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
