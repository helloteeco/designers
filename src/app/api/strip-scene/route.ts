import { NextResponse } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";
import { imageToInlineBase64 } from "@/lib/image-url-server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Strip a fully-furnished AI-rendered scene down to its empty room background.
 *
 * Workflow:
 *   1. Designer generates a realistic furnished render (e.g. Japandi living room)
 *   2. Designer hits "Strip to background" — this route runs Gemini image-to-
 *      image to remove ALL furniture/decor and inpaint the architecture
 *      (walls, floor, windows, doors, ceiling) cleanly behind it
 *   3. Returns the same room as a clean empty backdrop
 *   4. Designer layers sourced product cutouts on top → composite install-guide
 *      board that looks like Teeco's "LIVING ROOM" / "BEDROOM" examples
 *
 * Why this matters: the cutout-bg mode generates a generic empty room from
 * text. Strip-from-realistic gives you THIS specific styled room as the
 * empty backdrop — same wall color, same flooring, same windows — exactly
 * what'll appear behind your cutouts.
 *
 * POST body: { imageDataUrl: data:image/... }
 * Response: { imageDataUrl, modelUsed } | { error }
 */

const IMAGE_MODELS = [
  "gemini-3-pro-image",
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
];

const STRIP_PROMPT =
  "Edit this interior photograph: remove ALL furniture, all decor, all art, all rugs, " +
  "all lamps, all plants, all textiles, all accessories. Keep ONLY the architectural " +
  "shell — walls (with their existing paint/wallpaper/material), flooring, ceiling, " +
  "windows (with any window treatments removed), doors (with hardware), built-in " +
  "cabinetry, fireplaces, and structural elements like beams or wainscoting. " +
  "Inpaint the empty floor/wall behind anywhere a furniture piece used to be — " +
  "do not leave outlines, shadows, or marks where things were. Match the existing " +
  "lighting (natural daylight from windows). Result must be a clean, empty, " +
  "fully usable room photo with the SAME architecture, wall color, and flooring " +
  "as the input — just no furniture or decor. Photorealistic. Same camera angle, " +
  "same perspective, same room.";

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured on the server" }, { status: 500 });
  }

  let body: { imageDataUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { imageDataUrl } = body;
  if (!imageDataUrl) {
    return NextResponse.json({ error: "imageDataUrl (data: or https://) required" }, { status: 400 });
  }

  let mimeType: string;
  let base64Data: string;
  try {
    const normalized = await imageToInlineBase64(imageDataUrl);
    mimeType = normalized.mimeType;
    base64Data = normalized.data;
  } catch (err) {
    return NextResponse.json(
      { error: `Could not load image: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const errors: string[] = [];

  for (const model of IMAGE_MODELS) {
    try {
      const resp = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { text: STRIP_PROMPT },
              { inlineData: { mimeType, data: base64Data } },
            ],
          },
        ],
        config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
      });
      const parts = resp.candidates?.[0]?.content?.parts ?? [];
      const out = parts.find(p => p.inlineData?.data);
      if (out?.inlineData?.data) {
        const newMime = out.inlineData.mimeType || "image/png";
        return NextResponse.json({
          imageDataUrl: `data:${newMime};base64,${out.inlineData.data}`,
          modelUsed: model,
        });
      }
      errors.push(`${model}: no image returned`);
    } catch (err) {
      errors.push(`${model}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json(
    { error: `All image models failed to strip the scene. Tried: ${errors.join(" | ").slice(0, 800)}` },
    { status: 502 }
  );
}
