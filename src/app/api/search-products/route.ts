import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM_PROMPT = `You are a furniture sourcing assistant for short-term rental designers. Given a search query, room type, style, and optional budget, use web search to find 4–6 strong buy recommendations from any online retailer.

Prefer (but do not restrict to): Wayfair, Amazon, Target, Costco, Article, West Elm, CB2, IKEA, World Market. If a better option exists elsewhere, include it.

Requirements per recommendation:
- In stock and purchasable at a real URL
- 4.0+ star rating preferred (include rating + review count when visible)
- Fits the style (mountain-lodge, modern, coastal, farmhouse, etc.)
- Within budget if specified
- Include approximate dimensions (widthIn, depthIn, heightIn) from the product page when listed

Return STRICT JSON only — no prose, no markdown fences:

{
  "results": [
    {
      "name": "string",
      "vendor": "string",
      "vendorUrl": "https://…",
      "price": number,
      "rating": number | null,
      "reviewCount": number | null,
      "imageUrl": "string (optional)",
      "widthIn": number | null,
      "depthIn": number | null,
      "heightIn": number | null,
      "color": "string (optional)",
      "material": "string (optional)"
    }
  ]
}`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set on server" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.query !== "string") {
    return NextResponse.json(
      { error: "Expected { query, roomType?, style?, budget? }" },
      { status: 400 }
    );
  }

  const query = String(body.query).slice(0, 200);
  const roomType = body.roomType ? String(body.roomType) : "";
  const style = body.style ? String(body.style) : "";
  const budget =
    typeof body.budget === "number" && body.budget > 0 ? body.budget : null;

  const userMsg = [
    `Search query: ${query}`,
    roomType && `Room type: ${roomType}`,
    style && `Style: ${style}`,
    budget && `Budget context (total room budget, not per item): $${budget}`,
    "",
    "Find 4–6 options and return only the JSON object.",
  ]
    .filter(Boolean)
    .join("\n");

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
        } as unknown as Anthropic.Tool, // SDK type lag; server-side tool is supported
      ],
      messages: [{ role: "user", content: userMsg }],
    });

    // Stitch together all text blocks (final summary after tool calls)
    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim();

    if (!text) {
      return NextResponse.json(
        { error: "No text response from model", raw: response.content },
        { status: 502 }
      );
    }

    // Extract JSON — sometimes wrapped in prose
    const match = text.match(/\{[\s\S]*\}/);
    const jsonStr = (match ? match[0] : text)
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "");

    let parsed: { results?: unknown[] };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: "Model returned invalid JSON", raw: text },
        { status: 502 }
      );
    }

    const results = Array.isArray(parsed.results) ? parsed.results : [];
    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
