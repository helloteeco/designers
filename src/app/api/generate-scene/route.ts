import { NextResponse } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";
import { getPreset, buildScenePrompt } from "@/lib/style-presets";
import { imageToInlineBase64 } from "@/lib/image-url-server";

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

  // Accept either a data: URL or a hosted https:// URL. The reference
  // image is persisted to Supabase now, so it arrives as a public URL
  // from the client — silently dropping those turns the AI into a
  // pure text-to-image generator that invents a random room.
  const hasReference =
    !!referenceImageDataUrl &&
    (referenceImageDataUrl.startsWith("data:image/") ||
      /^https?:\/\//i.test(referenceImageDataUrl));
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
  const roomKind = room.type.replace(/-/g, " ");
  let prompt: string;
  if (hasReference) {
    if (effectiveMode === "full-scene") {
      // Original image-to-image prompt that worked reliably in earlier
      // versions. My "output-focused" rewrite in v9/v10 was a regression
      // — Nano Banana actually fills rooms better when you frame the
      // task as "furnish this exact room" with explicit preservation
      // rules, not as "generate a new photo."
      //
      // Keeping echo-skip parsing below as belt-and-suspenders.
      prompt =
        `INPUT: a photograph of an empty real-life room. ` +
        `TASK: photorealistically furnish this exact room in ${preset.label} style. ` +
        `STRICT RULES — DO NOT CHANGE: the wall paint color, the wall texture/finish, the ceiling ` +
        `height, the window positions, the window sizes, the window frame style, the existing ` +
        `chandelier or ceiling fixtures, the flooring material/color/pattern, baseboards, crown ` +
        `molding, door positions, door styles, any built-ins, the camera angle, the lighting ` +
        `quality, or the room's perspective. The output room MUST be recognizable as the SAME ROOM ` +
        `as the input — same walls, same floor, same windows, same chandelier, same trim. ` +
        `WHAT TO ADD: ${preset.vibe} furniture and decor — ${preset.signaturePieces.join(", ")} — ` +
        `placed naturally and to scale. Add a rug, art on walls, lamps, plants, throw pillows. ` +
        `Color palette for furniture only: ${preset.palette.slice(0, 3).join(", ")} (do not repaint walls). ` +
        `Magazine-quality interior photography. Same daylight from the existing windows. ` +
        `${extraNotes ?? ""}`.trim();
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

  // Build message parts — include the reference photo inline when present.
  // Normalize any URL form (data: OR https://) to inline base64 so Gemini
  // actually sees the architecture instead of generating a random room.
  const userParts: Array<{ text?: string } | { inlineData: { data: string; mimeType: string } }> = [{ text: prompt }];
  // Captured here so the echo-skip in the model loop below has the REAL
  // bytes Gemini saw — previously inputHash was computed from
  // referenceImageDataUrl.split(","), which returned undefined for hosted
  // URLs, leaving echo-skip inactive whenever the reference was in Supabase.
  let referenceBase64ForEchoCheck: string | null = null;
  if (hasReference && referenceImageDataUrl) {
    try {
      const inline = await imageToInlineBase64(referenceImageDataUrl);
      userParts.push({ inlineData: { data: inline.data, mimeType: inline.mimeType } });
      referenceBase64ForEchoCheck = inline.data;
    } catch (err) {
      return NextResponse.json(
        {
          error: `Could not load reference photo: ${err instanceof Error ? err.message : String(err)}`,
        },
        { status: 400 }
      );
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

  // Capture the input-image SHA so we can detect (and reject) the case
  // where Nano Banana just echoes our reference back. Hash the actual
  // bytes Gemini received — NOT the URL string — so this works whether
  // the reference was a data: URL or a Supabase https:// URL.
  let inputHash: string | null = null;
  if (referenceBase64ForEchoCheck) {
    const { createHash } = await import("crypto");
    inputHash = createHash("sha256").update(referenceBase64ForEchoCheck).digest("hex");
  }

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
      // Collect EVERY image part. Nano Banana sometimes returns the
      // input as the first image and the actual edit as a later one;
      // we iterate newest-first and skip any part that matches the
      // input hash (pure echo).
      const imageParts = parts.filter(p => p.inlineData?.data);
      if (imageParts.length === 0) {
        errors.push({ model, error: "No image in response" });
        continue;
      }

      let chosen: typeof imageParts[0] | null = null;
      for (let i = imageParts.length - 1; i >= 0; i--) {
        const cand = imageParts[i];
        const candData = cand.inlineData?.data;
        if (!candData) continue;
        if (inputHash) {
          const { createHash } = await import("crypto");
          const candHash = createHash("sha256").update(candData).digest("hex");
          if (candHash === inputHash) {
            // Skip — this is the model echoing our reference image
            continue;
          }
        }
        chosen = cand;
        break;
      }

      if (!chosen?.inlineData?.data) {
        errors.push({
          model,
          error: `Model returned ${imageParts.length} image part(s) but all were echoes of the reference. Try a different style or re-roll.`,
        });
        continue;
      }

      const mimeType = chosen.inlineData.mimeType || "image/png";
      const imageDataUrl = `data:${mimeType};base64,${chosen.inlineData.data}`;

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
