import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * Pick-first sourcing: designer describes what they want in plain English
 * (or by category), and we return 3 real products a designer could actually
 * buy right now — Wayfair, Amazon, Target, West Elm, CB2, Crate & Barrel,
 * Article, Anthropologie, AllModern, Rejuvenation — with vendor, price, URL,
 * dimensions, and primary product photo.
 *
 * Unlike /api/source-from-scene, this does NOT require a scene image — it
 * works from the description alone. That's the whole point of the new
 * pick-first workflow: designer picks the exact product BEFORE any render
 * happens, so the composite image and the masterlist ship the same items
 * by construction.
 *
 * POST body: {
 *   description: string      — "curved boucle sectional sofa for a living room"
 *   styleHint?: string       — e.g. "scandinavian" or "mid-century-modern"
 *   budget?: number          — remaining $ across the project; biases picks
 *   estimatedSize?: string   — e.g. "84\" sofa" or "8x10 rug"
 *   roomType?: string        — e.g. "kitchen" for tighter relevance
 * }
 *
 * Response: {
 *   options: Array<{ name, vendor, price, url, imageUrl?, dimensions? }>
 *   description: string (echoed)
 *   category: string (inferred from description)
 * }
 */

interface ProductOption {
  name: string;
  vendor: string;
  price: number | null;
  url: string;
  imageUrl?: string;
  dimensions?: string;
  rating?: number | null;            // 0-5 (Google Shopping / vendor page)
  reviewCount?: number | null;       // integer
  deliveryEstimate?: string | null;  // e.g. "2-5 business days"
  inStock?: boolean | null;          // null = unknown, don't fake
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
    description,
    styleHint,
    budget,
    estimatedSize,
    roomType,
  } = (body ?? {}) as {
    description?: string;
    styleHint?: string;
    budget?: number;
    estimatedSize?: string;
    roomType?: string;
  };

  if (!description || description.trim().length < 3) {
    return NextResponse.json(
      { error: "description is required (min 3 chars)" },
      { status: 400 }
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  const budgetHint = budget
    ? ` Keep this piece under roughly $${Math.round(budget * 0.25)} to leave room for the rest of the project (budget remaining: $${Math.round(budget)}).`
    : "";
  const styleLine = styleHint ? ` Style direction: ${styleHint}.` : "";
  const roomLine = roomType ? ` Intended for a ${roomType.replace(/-/g, " ")}.` : "";
  const sizeLine = estimatedSize ? ` Approximate size: ${estimatedSize}.` : "";

  const prompt = [
    `Find 3 real, currently-available products a designer could buy right now matching this description:`,
    `"${description.trim()}".${styleLine}${roomLine}${sizeLine}${budgetHint}`,
    `Prefer these vendors in order: Wayfair, Amazon, Target, West Elm, CB2, Crate & Barrel, Article, Anthropologie, AllModern, Rejuvenation.`,
    ``,
    `RANK the 3 options by combining (in order):`,
    ` 1. Price fit — closer to the budget hint is better; never exceed by more than 20%.`,
    ` 2. Review quality — 4+ stars with substantial review counts beat unrated. If a vendor hides review data, weight lower.`,
    ` 3. Availability — prefer products marked In Stock / ready-to-ship / fast delivery.`,
    `Return them ordered best→worst by this combined score.`,
    ``,
    `For each product return as JSON object with these fields:`,
    ` name — exact product name`,
    ` vendor — vendor name`,
    ` price — current USD price as a plain number, no $`,
    ` url — direct product URL (NOT a search page)`,
    ` imageUrl — primary product photo URL shown on the listing`,
    ` dimensions — W x D x H in inches as a string`,
    ` rating — average star rating 0-5 as a number, or null if the listing doesn't show ratings`,
    ` reviewCount — integer review count, or null if hidden`,
    ` deliveryEstimate — shipping window string like "2-5 business days" or "Ships in 1 week", or null if not shown`,
    ` inStock — true / false / null (null when the page doesn't say clearly)`,
    ``,
    `CRITICAL: if a field is NOT visible in the search results or product page, return null. NEVER hallucinate ratings, review counts, delivery times, or stock status. Null is correct when uncertain.`,
    ``,
    `Return strictly as a JSON array of 3 objects — no prose, no markdown fences.`,
  ].join("\n");

  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const raw = res.text ?? "";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      return NextResponse.json(
        { error: "Grounded response did not include a JSON array", raw: raw.slice(0, 400) },
        { status: 502 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return NextResponse.json(
        { error: "Could not parse JSON", raw: raw.slice(0, 400) },
        { status: 502 }
      );
    }

    if (!Array.isArray(parsed)) {
      return NextResponse.json({ error: "Response JSON was not an array" }, { status: 502 });
    }

    // Parse all fields including the new quality signals. For rating/reviews/
    // delivery/inStock we respect null (the prompt explicitly says null > hallucination)
    // and only coerce when the value is clearly present + well-typed.
    const asNumOrNull = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const asStrOrNull = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s.length > 0 && s.toLowerCase() !== "null" && s.toLowerCase() !== "unknown" ? s : null;
    };
    const asBoolOrNull = (v: unknown): boolean | null => {
      if (v === true || v === "true" || v === "yes") return true;
      if (v === false || v === "false" || v === "no") return false;
      return null;
    };

    const options: ProductOption[] = parsed.slice(0, 3).map(o => {
      const obj = o as Record<string, unknown>;
      return {
        name: String(obj.name ?? ""),
        vendor: String(obj.vendor ?? ""),
        price: asNumOrNull(obj.price),
        url: String(obj.url ?? ""),
        dimensions: obj.dimensions ? String(obj.dimensions) : undefined,
        imageUrl: obj.imageUrl ? String(obj.imageUrl) : undefined,
        rating: asNumOrNull(obj.rating),
        reviewCount: asNumOrNull(obj.reviewCount) !== null ? Math.round(asNumOrNull(obj.reviewCount) as number) : null,
        deliveryEstimate: asStrOrNull(obj.deliveryEstimate),
        inStock: asBoolOrNull(obj.inStock),
      };
    });

    return NextResponse.json({
      options,
      description: description.trim(),
      category: inferCategory(description),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Sourcing call failed: ${message}` },
      { status: 502 }
    );
  }
}

function inferCategory(desc: string): string {
  const s = desc.toLowerCase();
  if (/\b(sofa|sectional|loveseat|couch)\b/.test(s)) return "sofa";
  if (/\b(bed|mattress|headboard|bunk)\b/.test(s)) return "bed";
  if (/\b(chair|armchair|accent chair|lounge|stool)\b/.test(s)) return "chair";
  if (/\b(coffee table|side table|dining table|nightstand|desk|console)\b/.test(s)) return "table";
  if (/\b(dresser|cabinet|shelf|shelving|bookshelf|credenza|storage)\b/.test(s)) return "storage";
  if (/\b(rug|carpet|runner)\b/.test(s)) return "rug";
  if (/\b(lamp|pendant|chandelier|sconce|light)\b/.test(s)) return "lighting";
  if (/\b(art|painting|print|mirror|wall hanging)\b/.test(s)) return "art";
  if (/\b(pillow|throw|curtain|drape|blanket)\b/.test(s)) return "textile";
  if (/\b(plant|vase|bowl|decor|accessory)\b/.test(s)) return "decor";
  return "item";
}
