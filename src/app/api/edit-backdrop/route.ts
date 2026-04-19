import { NextResponse } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";
import { imageToInlineBase64 } from "@/lib/image-url-server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Whole-scene image-to-image edit — used by the Walls & Wallpaper and
 * Fixtures & Finishes panels. Unlike edit-scene-region this does NOT
 * require click coordinates: the designer describes the change in plain
 * English and Gemini edits the backdrop image-to-image.
 *
 * Used for: wall paint + wallpaper, floor material/color, ceiling fan →
 * pendant light swap, cabinet hardware upgrades, door style changes,
 * trim upgrades, etc. Anything that modifies the architectural shell
 * WITHOUT touching furniture the designer has placed (because this
 * runs on the backdrop, not the final composite).
 *
 * POST body:  { imageDataUrl: data:... or https://..., instruction: string, focus?: "walls" | "floor" | "fixtures" | "general" }
 * Response:   { imageDataUrl: data:image/...;base64,... , modelUsed }
 */

const IMAGE_MODELS = [
  "gemini-3-pro-image",
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
];

function buildPrompt(instruction: string, focus: string | undefined): string {
  const focusLine = (() => {
    switch (focus) {
      case "walls":
        return "Apply to walls only. Preserve the flooring, windows, doors, ceiling, trim, and camera angle unchanged.";
      case "floor":
        return "Apply to the flooring only. Preserve wall color/texture, windows, doors, ceiling, trim, and camera angle unchanged.";
      case "fixtures":
        return "Apply to light fixtures, cabinet hardware, door hardware, ceiling fans, and built-in finishes. Preserve walls, flooring, windows, doors, camera angle unchanged.";
      default:
        return "Preserve walls/flooring/windows/doors/camera angle except where the change explicitly applies.";
    }
  })();

  return [
    `Edit this interior photograph. Make this change: "${instruction.trim()}"`,
    focusLine,
    "Keep it photorealistic. Match the existing lighting (natural daylight through windows).",
    "Output image MUST be recognizably the SAME ROOM as the input, with only the requested change applied.",
    "No furniture additions or removals — leave any placed items alone. This is an architectural/finish edit only.",
  ].join(" ");
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured on the server" }, { status: 500 });
  }

  let body: { imageDataUrl?: string; instruction?: string; focus?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imageDataUrl, instruction, focus } = body;
  if (!imageDataUrl) {
    return NextResponse.json({ error: "imageDataUrl required" }, { status: 400 });
  }
  if (!instruction || instruction.trim().length < 3) {
    return NextResponse.json({ error: "instruction required (min 3 chars)" }, { status: 400 });
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

  const prompt = buildPrompt(instruction, focus);
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
              { text: prompt },
              { inlineData: { mimeType, data: base64Data } },
            ],
          },
        ],
        config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
      });

      const parts = resp.candidates?.[0]?.content?.parts ?? [];
      const imageParts = parts.filter(p => p.inlineData?.data);
      // Prefer the LAST image part (output) over the first (often an echo)
      const out = imageParts[imageParts.length - 1];
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
    { error: `All image models failed to edit the backdrop. Tried: ${errors.join(" | ").slice(0, 800)}` },
    { status: 502 }
  );
}
