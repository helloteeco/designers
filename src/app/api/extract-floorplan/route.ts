import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";
// Allow longer execution for vision calls (PDFs especially)
export const maxDuration = 60;

/**
 * POST /api/extract-floorplan
 *
 * Accepts a floor plan (base64 data URL — image OR PDF — and/or a hosted
 * https URL) and uses Gemini vision to extract room names, dimensions,
 * floor numbers, and approximate per-room bounding boxes on the plan.
 *
 * Gemini handles PDFs natively, so "Export → Schematic Floor Plan → PDF"
 * uploads work without a rasterization step.
 *
 * Response shape is backward compatible with the old GPT-4.1-mini version:
 *   { ok: true, rooms: [{ name, type, widthM, lengthM, floor, bboxPct? }],
 *     unit, floors, rawRooms }
 * `bboxPct` is purely additive — {x, y, width, height} as 0-100 percentages
 * of the full plan image.
 */

// Text+vision fallback chain, newest first.
const GEMINI_MODELS = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

interface BBoxPct {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ExtractedRoom {
  name: string;
  type: string;
  widthM: number;
  lengthM: number;
  floor: number;
  bboxPct?: BBoxPct;
}

interface RawRoom {
  name: string;
  width: number;
  length: number;
  floor: number;
  bboxPct?: BBoxPct;
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

/**
 * Normalize the incoming plan reference (data URL — image or PDF — or a
 * hosted http(s) URL) into the inlineData part Gemini expects. PDFs are
 * passed through with mimeType application/pdf — Gemini reads them natively.
 */
async function toInlineData(input: string): Promise<{ data: string; mimeType: string }> {
  if (input.startsWith("data:")) {
    const comma = input.indexOf(",");
    if (comma === -1) throw new Error("Malformed data URL (no comma)");
    const meta = input.slice(0, comma);
    if (!/;base64$/i.test(meta)) throw new Error("Data URL must be base64-encoded");
    const mimeType = meta.replace(/^data:/, "").replace(/;base64$/i, "") || "image/png";
    if (!mimeType.startsWith("image/") && mimeType !== "application/pdf") {
      throw new Error(`Unsupported data URL mime type: ${mimeType}`);
    }
    return { data: input.slice(comma + 1), mimeType };
  }

  if (!/^https?:\/\//i.test(input)) {
    throw new Error(`Unsupported plan reference: ${input.slice(0, 60)}`);
  }

  const res = await fetch(input, {
    headers: { Accept: "image/*,application/pdf" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${input.slice(0, 80)}`);
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!contentType.startsWith("image/") && contentType !== "application/pdf") {
    throw new Error(`Upstream returned unsupported content-type: ${contentType || "unknown"}`);
  }
  const buf = await res.arrayBuffer();
  return { data: Buffer.from(buf).toString("base64"), mimeType: contentType };
}

/** Robust JSON extraction — handles raw JSON, fenced JSON, or JSON embedded in prose. */
function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      // fall through
    }
  }
  return null;
}

/** Validate + clamp a model-supplied bboxPct. Returns undefined if unusable. */
function sanitizeBBoxPct(raw: unknown): BBoxPct | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const b = raw as Record<string, unknown>;
  const nums = [b.x, b.y, b.width, b.height];
  if (!nums.every((v) => typeof v === "number" && Number.isFinite(v))) return undefined;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const x = clamp(b.x as number);
  const y = clamp(b.y as number);
  const width = Math.min(clamp(b.width as number), 100 - x);
  const height = Math.min(clamp(b.height as number), 100 - y);
  if (width <= 0 || height <= 0) return undefined;
  const r = (v: number) => Math.round(v * 100) / 100;
  return { x: r(x), y: r(y), width: r(width), height: r(height) };
}

const PROMPT = `You are a floor plan analyzer. Given a floor plan (image or PDF), extract every room with its name, dimensions, floor number, and approximate location on the plan.

Rules:
- Return ONLY valid JSON, no markdown, no explanation
- Extract every labeled room you can see
- Dimensions should be in the unit shown on the plan (usually meters or feet)
- If the plan shows "1st floor" or "2nd floor" labels, use those for floor numbers
- If no floor label, assume floor 1
- Skip areas labeled "OPEN TO BELOW" or similar non-room spaces
- Include porches, decks, and outdoor areas
- For each room, also include "bboxPct": the approximate bounding box of the room on the FULL image, as percentages of the image's width and height (0-100, top-left origin). x/y is the box's top-left corner; width/height is its size. Cover the room's interior walls-to-walls. If you genuinely cannot locate a room on the plan, omit its bboxPct.

Return format:
{
  "rooms": [
    {"name": "Living Room", "width": 2.63, "length": 5.92, "floor": 1, "bboxPct": {"x": 8, "y": 12, "width": 28, "height": 33}},
    {"name": "Bedroom", "width": 4.68, "length": 2.55, "floor": 2, "bboxPct": {"x": 55, "y": 10, "width": 24, "height": 20}}
  ],
  "unit": "m",
  "floors": 2
}

The "unit" field should be "m" if dimensions use meters, "ft" if feet, or "m" if unclear.
The "floors" field is the total number of floors shown.`;

export async function POST(req: NextRequest) {
  try {
    const { imageDataUrl, imageUrl } = await req.json();

    const planSource: string | undefined = imageDataUrl || imageUrl;
    if (!planSource) {
      return NextResponse.json({ ok: false, error: "No image provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          code: "NO_KEY",
          error:
            "GEMINI_API_KEY is not set on the server. Add it in Vercel → Project → Settings → Environment Variables, then redeploy.",
        },
        { status: 400 }
      );
    }

    let inline: { data: string; mimeType: string };
    try {
      inline = await toInlineData(planSource);
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: `Could not load floor plan: ${err instanceof Error ? err.message : "unknown"}` },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const errors: { model: string; error: string }[] = [];

    for (const model of GEMINI_MODELS) {
      let content: string;
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                { text: PROMPT },
                { inlineData: { data: inline.data, mimeType: inline.mimeType } },
                {
                  text: "Extract all rooms with their names, dimensions, floor numbers, and bboxPct locations from this floor plan. Return only JSON.",
                },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        });
        content = response.text?.trim() ?? "";
      } catch (err) {
        errors.push({ model, error: err instanceof Error ? err.message : "Unknown error" });
        continue;
      }

      const parsed = extractJson(content) as {
        rooms?: RawRoom[];
        unit?: string;
        floors?: number;
      } | null;

      if (!parsed || !Array.isArray(parsed.rooms)) {
        errors.push({ model, error: `Response was not parseable floor-plan JSON: ${content.slice(0, 120)}` });
        continue;
      }

      if (parsed.rooms.length === 0) {
        // The model worked — there's just nothing recognizable on the plan.
        return NextResponse.json(
          { ok: false, error: "No rooms detected in floor plan" },
          { status: 422 }
        );
      }

      const unit = parsed.unit === "ft" ? "ft" : "m";
      const M_TO_FT = 3.28084;

      // Convert to our format, normalized to meters (the client at
      // /projects/new converts widthM/lengthM to feet — do not change).
      const rooms: ExtractedRoom[] = parsed.rooms
        .filter((r) => r && typeof r.name === "string")
        .map((r) => {
          const width = typeof r.width === "number" && Number.isFinite(r.width) ? r.width : 0;
          const length = typeof r.length === "number" && Number.isFinite(r.length) ? r.length : 0;
          const bboxPct = sanitizeBBoxPct(r.bboxPct);
          return {
            name: r.name,
            type: inferRoomType(r.name),
            widthM: unit === "m" ? width : width / M_TO_FT,
            lengthM: unit === "m" ? length : length / M_TO_FT,
            floor: r.floor || 1,
            ...(bboxPct ? { bboxPct } : {}),
          };
        });

      return NextResponse.json({
        ok: true,
        rooms,
        unit,
        floors: parsed.floors || 1,
        rawRooms: parsed.rooms, // original dimensions in original unit
        modelUsed: model,
      });
    }

    // Every model in the chain failed.
    return NextResponse.json(
      {
        ok: false,
        error: `All Gemini models failed. Details per model: ${errors
          .map((e) => `[${e.model}] ${e.error.slice(0, 120)}`)
          .join(" | ")}`,
        errors,
      },
      { status: 502 }
    );
  } catch (err) {
    console.error("extract-floorplan error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
