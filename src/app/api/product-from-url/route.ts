import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You extract product details from a single product page URL. Use the web fetch tool to load the page, then return STRICT JSON — no prose, no markdown fences.

Schema:
{
  "name": "string",
  "vendor": "string — e.g. 'Wayfair', 'Amazon', 'Article'",
  "price": number,
  "widthIn": number | null,
  "depthIn": number | null,
  "heightIn": number | null,
  "color": "string (optional)",
  "material": "string (optional)",
  "imageUrl": "string (optional — absolute URL)",
  "category": "beds-mattresses|seating|tables|storage|lighting|decor|rugs-textiles|outdoor|kitchen-dining|bathroom",
  "subcategory": "string (freeform, e.g. 'Sofa', 'Nightstand')"
}

Rules:
- If dimensions are listed as "W 85 × D 36 × H 34", use those numbers.
- If only overall dimensions are given, use the largest as widthIn, the second as depthIn, the smallest as heightIn unless the page labels are clear.
- price is a number (no $), use the current sale price if shown.
- If a field isn't findable, use null (for numbers) or "" (for strings). Never invent values.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set on server" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.url !== "string") {
    return NextResponse.json(
      { error: "Expected { url }" },
      { status: 400 }
    );
  }

  let url: URL;
  try {
    url = new URL(body.url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3,
        } as unknown as Anthropic.Tool,
      ],
      messages: [
        {
          role: "user",
          content: `Fetch this product page and return the JSON: ${url.toString()}`,
        },
      ],
    });

    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim();

    const match = text.match(/\{[\s\S]*\}/);
    const jsonStr = (match ? match[0] : text)
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "");

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: "Model returned invalid JSON", raw: text },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
