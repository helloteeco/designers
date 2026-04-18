import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You extract rooms from floor plan images. Return STRICT JSON only, no prose, no markdown fences.

Schema:
{
  "rooms": [
    {
      "name": "string — the room label as printed",
      "type": "primary-bedroom|bedroom|loft|den|living-room|dining-room|kitchen|bathroom|outdoor|hallway|bonus-room|office|game-room|media-room",
      "widthFt": number,
      "lengthFt": number,
      "floor": number
    }
  ]
}

Rules:
- Parse dimensions like 13'6" × 27'9" into decimal feet (13.5, 27.75). Round to 2 decimals.
- Use the shorter side as widthFt, longer as lengthFt.
- Assign each room the closest matching "type" from the enum. If a label says "Primary Suite" or "Master Bedroom" use "primary-bedroom". If it says "Bunk Room" or "Guest Room" use "bedroom". If it says "Great Room" use "living-room". A "W.I.C." or closet should be omitted unless it is labeled as a separate bedroom.
- Skip storage rooms, laundry rooms under 40 sqft, hallways under 20 sqft, porches/entries under 40 sqft — they are not design rooms.
- Include decks, patios, and porches as "outdoor" only if they are larger than 80 sqft.
- Floor numbering: the plan usually labels "FLOOR 1" / "FLOOR 2". If only one plan is shown, floor = 1.
- If the image shows multiple floor plans side-by-side, extract rooms from all of them with the correct floor number.
- Name each room as it is labeled on the plan, preserving capitalization and numbering (e.g. "Bedroom 1", "Primary Suite", "Great Room").`;

interface ParsedRoom {
  name: string;
  type: string;
  widthFt: number;
  lengthFt: number;
  floor: number;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set on server" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.imageBase64 !== "string" || typeof body.mediaType !== "string") {
    return NextResponse.json(
      { error: "Expected { imageBase64, mediaType }" },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: body.mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
                data: body.imageBase64,
              },
            },
            {
              type: "text",
              text: "Extract every room from this floor plan. Return only the JSON object.",
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No text response from model" }, { status: 502 });
    }

    // Strip accidental code fences just in case
    const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

    let parsed: { rooms?: ParsedRoom[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Model returned invalid JSON", raw }, { status: 502 });
    }

    const rooms = Array.isArray(parsed.rooms) ? parsed.rooms : [];
    return NextResponse.json({ rooms });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
