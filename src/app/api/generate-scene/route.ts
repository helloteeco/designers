import { NextResponse } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";
import { getPreset, buildScenePrompt } from "@/lib/style-presets";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Scene generation via Gemini 2.5 Flash Image Preview ("nano banana").
 * Takes a style preset + room context, returns a photorealistic interior
 * scene image ready to use as the Scene Designer backdrop.
 *
 * POST body: {
 *   styleId: string — matches a STYLE_PRESETS id
 *   room: { name, type, widthFt, lengthFt }
 *   extraNotes?: string — optional designer override notes
 * }
 *
 * Response: {
 *   imageDataUrl: "data:image/png;base64,..." — inlined so it can save
 *     directly onto Room.sceneBackgroundUrl
 *   promptUsed: the resolved prompt text (for debugging / transparency)
 * }
 */
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
    styleId,
    room,
    extraNotes,
  } = (body ?? {}) as {
    styleId?: string;
    room?: { name?: string; type: string; widthFt: number; lengthFt: number };
    extraNotes?: string;
  };

  const preset = getPreset(styleId);
  if (!preset) {
    return NextResponse.json({ error: "Unknown styleId" }, { status: 400 });
  }
  if (!room || !room.type || !room.widthFt || !room.lengthFt) {
    return NextResponse.json(
      { error: "room.type, room.widthFt, room.lengthFt are required" },
      { status: 400 }
    );
  }

  const prompt = buildScenePrompt(preset, room, extraNotes);

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });

    // Response shape: candidates[0].content.parts[].inlineData (image)
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find(p => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      return NextResponse.json(
        { error: "Gemini returned no image", parts: parts.map(p => Object.keys(p)) },
        { status: 502 }
      );
    }

    const mimeType = imagePart.inlineData.mimeType || "image/png";
    const imageDataUrl = `data:${mimeType};base64,${imagePart.inlineData.data}`;

    return NextResponse.json({
      imageDataUrl,
      promptUsed: prompt,
      presetId: preset.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Gemini call failed: ${message}` },
      { status: 502 }
    );
  }
}
