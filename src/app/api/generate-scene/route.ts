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
    referenceImageDataUrl,
    mode,
  } = (body ?? {}) as {
    styleId?: string;
    room?: { name?: string; type: string; widthFt: number; lengthFt: number };
    extraNotes?: string;
    /**
     * Optional existing photo of the empty room (e.g. a Matterport screenshot).
     * When provided, Gemini does image-to-image restyling — the walls,
     * windows, door positions, and ceiling of the original are preserved,
     * just styled and furnished in the chosen preset. Much more accurate
     * than pure text-to-image for real properties.
     */
    referenceImageDataUrl?: string;
    /**
     * "install-guide-bg" (default): empty-room schematic styled to match
     * Teeco's install guide aesthetic — furniture cutouts get layered
     * on top separately.
     * "full-scene": photorealistic fully-furnished scene (old behavior).
     */
    mode?: "full-scene" | "install-guide-bg";
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

  const hasReference = !!referenceImageDataUrl && referenceImageDataUrl.startsWith("data:image/");
  const effectiveMode = mode ?? "install-guide-bg";
  const basePrompt = buildScenePrompt(preset, room, extraNotes, effectiveMode);

  // When a reference photo IS provided, the prompt MUST preserve the actual
  // architecture from that photo (walls, ceiling height, windows + their
  // exact positions/sizes/styles, door locations, flooring material, trim,
  // chandeliers, ceiling fans, and any built-ins). Style only affects the
  // furniture/decor we add (in full-scene mode) or stays as the existing
  // empty room (in install-guide-bg mode). The previous prompt let Gemini
  // substitute new walls/windows/floor based on style — that's the bug
  // Jeff hit (Matterport screenshot of a hardwood living room → AI rendered
  // an arched-window orange-walled tile-floor "Groovy" room from scratch).
  let prompt: string;
  if (hasReference) {
    if (effectiveMode === "full-scene") {
      // Image-to-image FURNISH. Prompt ordering matters: Nano Banana 2
      // tends to stay close to the input when the "do not change" list
      // comes first, sometimes returning the input photo unchanged.
      // Lead with the REQUIRED action, list architectural preservation
      // AFTER, and end with an explicit "output must show furniture".
      prompt =
        `INSTRUCTION: furnish the empty room in the input photo, image-to-image, in ${preset.label} interior design style. ` +
        `You MUST add full room-worth of furniture and decor — the output image must be a FURNISHED room, not the empty input.\n\n` +
        `REQUIRED FURNITURE TO PLACE (pick pieces that fit the room's footprint):\n` +
        `- Hero pieces: ${preset.signaturePieces.join(", ")}\n` +
        `- A rug centered in the seating or sleeping area\n` +
        `- Wall art, sconces or table/floor lamps, plants in planters\n` +
        `- Throw pillows, a throw blanket, and decorative objects on any surfaces\n` +
        `- Replace any dated or builder-grade light fixtures with style-appropriate alternatives\n\n` +
        `STYLE NOTES:\n` +
        `- Vibe: ${preset.vibe}\n` +
        `- Furniture + decor color palette: ${preset.palette.slice(0, 3).join(", ")} with accents from ${preset.palette.slice(3).join(", ")}\n\n` +
        `PRESERVE FROM THE INPUT (don't change):\n` +
        `- Wall paint color and wall texture\n` +
        `- Ceiling height\n` +
        `- Window positions, sizes, and frame styles\n` +
        `- Flooring material, color, and pattern\n` +
        `- Baseboards, crown molding, door positions, door styles, built-ins\n` +
        `- Camera angle and room perspective\n\n` +
        `OUTPUT REQUIREMENTS: photorealistic magazine-quality interior photograph (think Architectural Digest, Dwell). ` +
        `The final image MUST show a furnished room — if you return the empty input image, you have failed the task.` +
        (extraNotes ? `\n\nADDITIONAL NOTES FROM DESIGNER: ${extraNotes}` : "");
    } else {
      // Image-to-image EMPTY-ROOM: keep the room's architecture exactly,
      // remove any furniture, return clean empty backdrop ready for cutouts.
      prompt =
        `INPUT: a photograph of a real-life room (${room.widthFt}' × ${room.lengthFt}'). ` +
        `TASK: return this EXACT same room as a clean empty design-board backdrop. ` +
        `STRICT RULES — DO NOT CHANGE: the wall paint color, the wall texture, the ceiling height, ` +
        `the window positions/sizes/styles, the existing chandelier or ceiling fixtures, the flooring ` +
        `material/color/pattern, baseboards, crown molding, door positions, door styles, any built-ins, ` +
        `the camera angle, or the room perspective. The output room MUST be recognizable as the SAME ` +
        `ROOM as the input. ` +
        `REMOVE: any furniture, rugs, decor, art, plants, lamps, or freestanding items currently in ` +
        `the room. Inpaint the empty floor/wall behind anything you remove — do not leave shadows or ` +
        `outlines. ` +
        `KEEP THE ARCHITECTURE 100% — only the furniture changes (becomes empty). ` +
        `${extraNotes ?? ""}`.trim();
    }
  } else {
    prompt = basePrompt;
  }

  // Build message parts — include the reference photo inline when present
  const userParts: Array<{ text?: string } | { inlineData: { data: string; mimeType: string } }> = [{ text: prompt }];
  if (hasReference && referenceImageDataUrl) {
    const [meta, data] = referenceImageDataUrl.split(",");
    const mimeType = meta.replace(/^data:/, "").replace(/;base64$/, "");
    if (data) {
      userParts.push({ inlineData: { data, mimeType: mimeType || "image/png" } });
    }
  }

  // Model fallback chain covering every current Google image-gen surface.
  // Order: Nano Banana family (via generateContent) → Imagen family (via
  // generateImages). The API method differs between the two, handled below.
  //
  // env override: GEMINI_IMAGE_MODEL can force a specific primary model.
  const primary = process.env.GEMINI_IMAGE_MODEL;
  const geminiImageModels = [
    "gemini-3-pro-image",          // Nano Banana 2 (stable)
    "gemini-3-pro-image-preview",  // Nano Banana 2 preview
    "gemini-2.5-flash-image",      // Nano Banana 1 (stable, -preview suffix was dropped)
    "gemini-2.5-flash-image-preview",
  ];
  const imagenModels = [
    "imagen-4.0-generate-001",     // Imagen 4
    "imagen-3.0-generate-002",     // Imagen 3
    "imagen-3.0-generate-001",
  ];

  // If user forced a primary, try it first; otherwise use the full chain.
  const orderedGemini = primary && geminiImageModels.includes(primary)
    ? [primary, ...geminiImageModels.filter(m => m !== primary)]
    : geminiImageModels;
  const orderedImagen = primary && imagenModels.includes(primary)
    ? [primary, ...imagenModels.filter(m => m !== primary)]
    : imagenModels;

  const ai = new GoogleGenAI({ apiKey });
  const errors: { model: string; error: string }[] = [];

  // ── Attempt 1: Gemini image-via-chat models ──
  for (const model of orderedGemini) {
    try {
      const response = await ai.models.generateContent({
        model,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contents: [{ role: "user", parts: userParts as any }],
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const imagePart = parts.find(p => p.inlineData?.data);
      if (!imagePart?.inlineData?.data) {
        errors.push({ model, error: "No image in response" });
        continue;
      }

      const mimeType = imagePart.inlineData.mimeType || "image/png";
      const imageDataUrl = `data:${mimeType};base64,${imagePart.inlineData.data}`;

      return NextResponse.json({
        imageDataUrl,
        promptUsed: prompt,
        presetId: preset.id,
        modelUsed: model,
      });
    } catch (err) {
      errors.push({
        model,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // ── Attempt 2: Imagen models (different API method) ──
  for (const model of orderedImagen) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (ai.models as any).generateImages({
        model,
        prompt,
        config: { numberOfImages: 1, aspectRatio: "16:9" },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gen = (response as any).generatedImages?.[0];
      const bytes = gen?.image?.imageBytes;
      if (!bytes) {
        errors.push({ model, error: "No imageBytes in Imagen response" });
        continue;
      }
      const imageDataUrl = `data:image/png;base64,${bytes}`;
      return NextResponse.json({
        imageDataUrl,
        promptUsed: prompt,
        presetId: preset.id,
        modelUsed: model,
      });
    } catch (err) {
      errors.push({
        model,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Helpful hint for the common case: quota exceeded across the board means
  // the key needs billing enabled on the linked Google Cloud project.
  const anyQuota = errors.some(e => /429|quota|billing/i.test(e.error));
  const hint = anyQuota
    ? " HINT: At least one model returned a quota/billing error. Image generation typically requires billing enabled on the Google Cloud project behind your Gemini API key. Go to https://console.cloud.google.com/billing, enable billing on the project, then try again."
    : "";

  return NextResponse.json(
    {
      error: `All image models failed.${hint} Details per model: ${errors.map(e => `[${e.model}] ${e.error.slice(0, 120)}`).join(" | ")}`,
      errors,
    },
    { status: 502 }
  );
}
