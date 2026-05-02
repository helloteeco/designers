import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/extract-floorplan
 *
 * Accepts a floor plan image (as base64 data URL) and uses GPT-4.1-mini vision
 * to extract room names, dimensions, and floor numbers.
 *
 * Returns: { ok: true, rooms: [...], unit: "m" | "ft", floors: number }
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface ExtractedRoom {
  name: string;
  type: string;
  widthM: number;
  lengthM: number;
  floor: number;
}

const ROOM_TYPE_MAP: Record<string, string> = {
  "living room": "living-room",
  "lounge": "living-room",
  "family room": "living-room",
  "great room": "living-room",
  "kitchen": "kitchen",
  "eat-in kitchen": "kitchen",
  "kitchenette": "kitchen",
  "dining": "dining-room",
  "dining room": "dining-room",
  "dining area": "dining-room",
  "bedroom": "bedroom",
  "master bedroom": "primary-bedroom",
  "primary bedroom": "primary-bedroom",
  "primary suite": "primary-bedroom",
  "master suite": "primary-bedroom",
  "bathroom": "bathroom",
  "bath": "bathroom",
  "half bath": "bathroom",
  "powder room": "bathroom",
  "en-suite": "bathroom",
  "ensuite": "bathroom",
  "laundry": "laundry",
  "utility": "laundry",
  "garage": "garage",
  "porch": "outdoor",
  "deck": "outdoor",
  "patio": "outdoor",
  "balcony": "outdoor",
  "outdoor": "outdoor",
  "office": "office",
  "study": "office",
  "den": "office",
  "loft": "loft",
  "bonus room": "bonus-room",
  "game room": "bonus-room",
  "hallway": "hallway",
  "entry": "hallway",
  "foyer": "hallway",
  "mudroom": "hallway",
  "closet": "closet",
  "walk-in closet": "closet",
  "storage": "closet",
};

function inferRoomType(name: string): string {
  const lower = name.toLowerCase().trim();
  for (const [key, type] of Object.entries(ROOM_TYPE_MAP)) {
    if (lower.includes(key)) return type;
  }
  return "bedroom"; // fallback
}

export async function POST(req: NextRequest) {
  try {
    const { imageDataUrl, imageUrl } = await req.json();

    const imgContent = imageDataUrl || imageUrl;
    if (!imgContent) {
      return NextResponse.json({ ok: false, error: "No image provided" }, { status: 400 });
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "OpenAI API key not configured" }, { status: 500 });
    }

    // Call GPT-4.1-mini vision to extract room data
    const systemPrompt = `You are a floor plan analyzer. Given an image of a floor plan, extract all rooms with their names, dimensions, and floor numbers.

Rules:
- Return ONLY valid JSON, no markdown, no explanation
- Extract every labeled room you can see
- Dimensions should be in the unit shown on the plan (usually meters or feet)
- If the plan shows "1st floor" or "2nd floor" labels, use those for floor numbers
- If no floor label, assume floor 1
- Skip areas labeled "OPEN TO BELOW" or similar non-room spaces
- Include porches, decks, and outdoor areas

Return format:
{
  "rooms": [
    {"name": "Living Room", "width": 2.63, "length": 5.92, "floor": 1},
    {"name": "Bedroom", "width": 4.68, "length": 2.55, "floor": 2}
  ],
  "unit": "m",
  "floors": 2
}

The "unit" field should be "m" if dimensions use meters, "ft" if feet, or "m" if unclear.
The "floors" field is the total number of floors shown.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: imgContent,
                  detail: "high",
                },
              },
              {
                type: "text",
                text: "Extract all rooms with their names, dimensions, and floor numbers from this floor plan image. Return only JSON.",
              },
            ],
          },
        ],
        max_tokens: 1500,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI vision error:", errText);
      return NextResponse.json({ ok: false, error: "Vision API failed" }, { status: 500 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    // Parse the JSON response
    let parsed: { rooms: { name: string; width: number; length: number; floor: number }[]; unit: string; floors: number };
    try {
      // Strip markdown code fences if present
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse vision response:", content);
      return NextResponse.json({ ok: false, error: "Could not parse floor plan data" }, { status: 422 });
    }

    if (!parsed.rooms || !Array.isArray(parsed.rooms) || parsed.rooms.length === 0) {
      return NextResponse.json({ ok: false, error: "No rooms detected in floor plan" }, { status: 422 });
    }

    const unit = parsed.unit === "ft" ? "ft" : "m";
    const M_TO_FT = 3.28084;

    // Convert to our format with both metric and imperial
    const rooms: ExtractedRoom[] = parsed.rooms.map((r) => ({
      name: r.name,
      type: inferRoomType(r.name),
      widthM: unit === "m" ? r.width : r.width / M_TO_FT,
      lengthM: unit === "m" ? r.length : r.length / M_TO_FT,
      floor: r.floor || 1,
    }));

    return NextResponse.json({
      ok: true,
      rooms,
      unit,
      floors: parsed.floors || 1,
      rawRooms: parsed.rooms, // original dimensions in original unit
    });
  } catch (err) {
    console.error("extract-floorplan error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
