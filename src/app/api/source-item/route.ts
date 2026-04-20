import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";
export const maxDuration = 120;

const PRICE_ANCHORS: Record<string, { min: number; max: number; label: string }> = {
  sofa:      { min: 400,  max: 1800, label: "sofa / sectional" },
  bed:       { min: 300,  max: 1200, label: "bed frame / headboard" },
  mattress:  { min: 200,  max: 900,  label: "mattress" },
  chair:     { min: 100,  max: 600,  label: "accent chair" },
  dining:    { min: 80,   max: 350,  label: "dining chair" },
  table:     { min: 150,  max: 800,  label: "table" },
  desk:      { min: 120,  max: 500,  label: "desk" },
  storage:   { min: 150,  max: 700,  label: "dresser / storage" },
  rug:       { min: 80,   max: 500,  label: "area rug" },
  lighting:  { min: 40,   max: 300,  label: "lamp / pendant" },
  art:       { min: 30,   max: 250,  label: "wall art / mirror" },
  textile:   { min: 20,   max: 150,  label: "curtain / throw / pillow" },
  decor:     { min: 15,   max: 150,  label: "decorative accessory" },
  outdoor:   { min: 150,  max: 800,  label: "outdoor furniture" },
  blind:     { min: 30,   max: 200,  label: "window blind / shade" },
  nightstand:{ min: 80,   max: 350,  label: "nightstand" },
  item:      { min: 50,   max: 500,  label: "furniture item" },
};

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

  const category = inferCategory(description);
  const anchor = PRICE_ANCHORS[category] || PRICE_ANCHORS.item;

  const budgetHint = budget
    ? ` Project budget remaining: $${Math.round(budget)}. Keep this piece under roughly $${Math.round(budget * 0.25)} to leave room for the rest.`
    : "";
  const styleLine = styleHint ? ` Style direction: ${styleHint}.` : "";
  const roomLine = roomType ? ` Intended for a ${roomType.replace(/-/g, " ")}.` : "";
  const sizeLine = estimatedSize ? ` Approximate size: ${estimatedSize}.` : "";

  const prompt = [
    `Find 4 real, currently-available products a designer could buy RIGHT NOW matching this description:`,
    `"${description.trim()}".${styleLine}${roomLine}${sizeLine}${budgetHint}`,
    ``,
    `PRICING GUIDANCE — a typical mid-market ${anchor.label} retails for $${anchor.min}–$${anchor.max}.`,
    `Aim for the best value in this range. Do NOT pick luxury/premium-priced options unless the description explicitly says "luxury" or "high-end".`,
    `If you find a product priced 2x+ above the range max, skip it in favor of a better deal.`,
    ``,
    `Prefer these vendors in order: Wayfair, Amazon, Target, West Elm, CB2, Crate & Barrel, Article, Anthropologie, AllModern, Rejuvenation, IKEA, Overstock.`,
    ``,
    `Return EXACTLY 4 options, ordered from best to worst by this score:`,
    ` 1. VALUE — best quality-for-price within the $${anchor.min}–$${anchor.max} range. Closer to the low end is better if quality is comparable.`,
    ` 2. REVIEWS — 4+ stars with substantial review counts beat unrated. Weight heavily: real customer satisfaction matters.`,
    ` 3. AVAILABILITY — prefer In Stock / ready-to-ship / fast delivery.`,
    ` 4. STYLE FIT — matches the described style, color, material.`,
    ``,
    `Option 1 = BEST DEAL (highest ROI — great reviews + reasonable price).`,
    `Option 2 = BUDGET PICK (cheapest that still looks good and has decent reviews).`,
    `Option 3 = UPGRADE PICK (slightly pricier but noticeably better quality/reviews).`,
    `Option 4 = ALTERNATIVE (different style/vendor that still fits the brief — broadens the designer's choices).`,
    ``,
    `FALLBACK: if the EXACT product described isn't available anywhere, find the closest equivalent that serves the same function, fits the same space, and looks similar. A good substitute is better than no result.`,
    ``,
    `For each product return a JSON object with these fields:`,
    ` name — exact product name from the listing`,
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
    `Return strictly as a JSON array of 4 objects — no prose, no markdown fences.`,
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

    const options: ProductOption[] = parsed.slice(0, 4).map(o => {
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
      category,
      priceRange: { min: anchor.min, max: anchor.max },
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
  if (/\b(bed|headboard|bunk)\b/.test(s)) return "bed";
  if (/\b(mattress)\b/.test(s)) return "mattress";
  if (/\b(dining\s+chair|bar\s+stool|counter\s+stool)\b/.test(s)) return "dining";
  if (/\b(chair|armchair|accent chair|lounge|stool|ottoman)\b/.test(s)) return "chair";
  if (/\b(coffee table|side table|dining table|console)\b/.test(s)) return "table";
  if (/\b(nightstand|night stand|bedside)\b/.test(s)) return "nightstand";
  if (/\b(desk)\b/.test(s)) return "desk";
  if (/\b(dresser|cabinet|shelf|shelving|bookshelf|credenza|storage|wardrobe)\b/.test(s)) return "storage";
  if (/\b(rug|carpet|runner)\b/.test(s)) return "rug";
  if (/\b(lamp|pendant|chandelier|sconce|light)\b/.test(s)) return "lighting";
  if (/\b(blind|shade|shutter)\b/.test(s)) return "blind";
  if (/\b(art|painting|print|mirror|wall hanging)\b/.test(s)) return "art";
  if (/\b(pillow|throw|curtain|drape|blanket)\b/.test(s)) return "textile";
  if (/\b(plant|vase|bowl|decor|accessory)\b/.test(s)) return "decor";
  if (/\b(outdoor|patio)\b/.test(s)) return "outdoor";
  return "item";
}
