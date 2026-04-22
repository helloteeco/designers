import { NextResponse } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";
import { getPreset, buildScenePrompt } from "@/lib/style-presets";
import { imageToInlineBase64 } from "@/lib/image-url-server";

export const runtime = "nodejs";
export const maxDuration = 120;

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
  const roomFurniture = furnitureListForRoomType(room.type, preset.label);
  let prompt: string;
  if (hasReference) {
    if (effectiveMode === "full-scene") {
      // Original image-to-image prompt that worked reliably in earlier
      // versions. My "output-focused" rewrite in v9/v10 was a regression
      // — Nano Banana actually fills rooms better when you frame the
      // task as "furnish this exact room" with explicit preservation
      // rules, not as "generate a new photo."
      //
      // Now room-type aware: signaturePieces are stored per-style (e.g.
      // Japandi's signaturePieces include "low platform bed") but a bed
      // doesn't belong in a living room. furnitureListForRoomType narrows
      // to pieces appropriate for THIS room.
      prompt =
        `INPUT: a photograph of a REAL room. Study it carefully — memorize every architectural detail. ` +
        `TASK: add ${preset.label}-style furniture and decor to this EXACT room. ` +
        `ROOM TYPE: ${roomKind.toUpperCase()} — only add furniture appropriate for a ${roomKind}. ` +
        `\n\n` +
        `ABSOLUTE PRESERVATION RULES (violating ANY of these means failure):\n` +
        `• WALLS: keep the EXACT same paint color — do NOT repaint, do NOT change the hue/saturation/brightness. If the walls are cream, they stay cream. If beige, stay beige.\n` +
        `• CEILING: keep the EXACT same height, texture, and color. Do NOT add or remove crown molding.\n` +
        `• WINDOWS: keep the EXACT same positions, sizes, frame styles, and number. Do NOT add, remove, enlarge, or reshape windows.\n` +
        `• EXISTING FIXTURES: keep the EXACT same chandelier, ceiling fan, light fixtures. Do NOT replace them — they are hardwired and stay.\n` +
        `• FLOORING: keep the EXACT same material, color, and pattern (hardwood grain direction, tile pattern, etc.).\n` +
        `• DOORS: keep the EXACT same positions, styles, and hardware.\n` +
        `• BUILT-INS: keep any railings, staircases, built-in shelves, fireplaces, HVAC vents EXACTLY as they are.\n` +
        `• BASEBOARDS & TRIM: keep the EXACT same style and color.\n` +
        `• CAMERA: keep the EXACT same angle, perspective, and focal length. Do NOT re-frame the shot.\n` +
        `• DAYLIGHT: keep the EXACT same natural light from the existing windows.\n` +
        `\n` +
        `The output must be IMMEDIATELY recognizable as the same physical room from the input photo. ` +
        `A person who lives in this house should look at the render and say "that's my room with new furniture" — ` +
        `NOT "that's a different room." If you change the wall color, window sizes, or fixtures, you have FAILED.\n` +
        `\n` +
        `WHAT TO ADD (${preset.label} style, tuned for a ${roomKind}): ${roomFurniture}.\n` +
        `Style direction: ${preset.vibe}.\n` +
        `Color palette FOR FURNITURE AND TEXTILES ONLY (not walls): ${preset.palette.slice(0, 3).join(", ")}.\n` +
        `Magazine-quality interior photography.\n` +
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
        if (inputHash && referenceBase64ForEchoCheck) {
          const { createHash } = await import("crypto");
          const candHash = createHash("sha256").update(candData).digest("hex");
          if (candHash === inputHash) {
            continue;
          }
          // Near-echo: if the output is within 5% of the input size and
          // the first 200 chars of base64 match, it's likely a re-encoded
          // version of the same image with minor compression artifacts.
          const sizeDiff = Math.abs(candData.length - referenceBase64ForEchoCheck.length) / referenceBase64ForEchoCheck.length;
          if (sizeDiff < 0.05 && candData.slice(0, 200) === referenceBase64ForEchoCheck.slice(0, 200)) {
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

/**
 * Map a room type to a human-readable furniture list. Style presets
 * hard-code signaturePieces (e.g. Japandi includes "low platform bed"),
 * but those don't apply uniformly — a bed doesn't belong in a living
 * room. This keeps the AI's furniture choices appropriate per room.
 */
function furnitureListForRoomType(roomType: string, styleLabel: string): string {
  const t = roomType.toLowerCase();
  if (t.includes("living") || t.includes("den") || t.includes("media") || t.includes("family") || t.includes("great")) {
    return (
      `a ${styleLabel}-style sofa or sectional, a coffee table, 1-2 accent chairs, side tables, ` +
      `a rug under the seating, floor and table lamps, wall art above the sofa, potted plants, ` +
      `throw pillows and a throw blanket. ` +
      `WINDOWS: every window MUST have curtains — hang them HIGH (just below crown molding / ceiling) ` +
      `and WIDE (rod extends 6-8 inches past each side of the window frame so the fabric stacks off ` +
      `the glass). Use floor-length light-filtering or blackout curtain panels in a neutral linen or ` +
      `cotton that complements the ${styleLabel} palette. Curtains should look intentional and designed, ` +
      `not an afterthought — they frame the window like architectural trim.`
    );
  }
  if (t.includes("dining")) {
    return (
      `a dining table for 4-6, matching dining chairs, a sideboard or buffet, a rug under the table, ` +
      `wall art, a tablescape (vase + ceramics or candles), potted plant in the corner. ` +
      `WINDOWS: hang curtains HIGH and WIDE — rod near the ceiling, panels extending past the window ` +
      `frame on each side. Floor-length light-filtering panels in a neutral fabric.`
    );
  }
  if (t.includes("kitchen")) {
    return (
      `counter-height bar stools if there's an island, pendant lights over the island, ` +
      `styled decor on open shelves (cookbooks, ceramics, cutting boards), a runner rug, ` +
      `a bowl of fruit or potted herb on the counter — DO NOT add or rearrange cabinets, ` +
      `appliances, or countertops, only add decor and bar stools. ` +
      `WINDOWS: use clean inside-mount roller blinds or roman shades in a neutral woven ` +
      `fabric — NOT curtains (kitchens need easy-clean, splash-safe window treatments). ` +
      `If there's a window above the sink, a simple roller shade works best.`
    );
  }
  if (t.includes("primary-bedroom") || t.includes("master")) {
    return (
      `a king or queen ${styleLabel}-style bed with a headboard, matching nightstands flanking ` +
      `the bed, a dresser or wardrobe, a rug under the foot of the bed, reading lamps on each ` +
      `nightstand, art above the bed, an accent chair or bench at the foot of the bed, styled ` +
      `throw pillows + duvet + throw blanket. ` +
      `WINDOWS: every window MUST have blackout curtains — hang them HIGH (rod at ceiling height) ` +
      `and WIDE (rod extends 8+ inches past the window frame on each side). Floor-length blackout ` +
      `panels in a ${styleLabel}-appropriate neutral tone. The curtains should look like a ` +
      `deliberate design element, not just functional — think rich, full fabric that pools ` +
      `slightly on the floor.`
    );
  }
  if (t.includes("bedroom") || t.includes("loft") || t.includes("bonus") || t.includes("bunk")) {
    return (
      `a ${styleLabel}-style bed with a headboard, matching nightstands flanking the bed, a ` +
      `dresser, a rug under the foot of the bed, reading lamps, art above the bed, ` +
      `styled throw pillows + duvet + throw blanket. ` +
      `WINDOWS: every window MUST have blackout curtains — hang them HIGH (rod at ceiling height) ` +
      `and WIDE (rod extends 6-8 inches past the window frame on each side). Floor-length blackout ` +
      `panels in a neutral fabric that matches the ${styleLabel} style.`
    );
  }
  if (t.includes("bath")) {
    return (
      `a small plant or floral arrangement, neatly rolled towels, minimal counter decor (a tray ` +
      `with soap/hand cream), framed art or a statement mirror — DO NOT rearrange the vanity, ` +
      `toilet, tub, or shower fixtures. ` +
      `WINDOWS: if there's a window, use a clean inside-mount roller blind or roman shade in a ` +
      `moisture-resistant woven fabric. Light-filtering for privacy. No curtains in bathrooms.`
    );
  }
  if (t.includes("office") || t.includes("study")) {
    return (
      `a ${styleLabel}-style desk, a task chair, a bookshelf, a rug, a desk lamp, framed art, ` +
      `potted plants, and a small side chair. ` +
      `WINDOWS: hang light-filtering curtains HIGH and WIDE — rod near the ceiling, panels ` +
      `extending past the window frame. Floor-length panels in a neutral fabric.`
    );
  }
  if (t.includes("entry") || t.includes("foyer") || t.includes("mudroom")) {
    return (
      `a console table, a bench with a basket underneath, a runner rug, wall hooks or coat rack, ` +
      `a statement pendant or sconce, a framed mirror above the console, a potted plant`
    );
  }
  if (t.includes("outdoor") || t.includes("patio") || t.includes("deck")) {
    return (
      `outdoor-rated seating (sofa or lounge chairs), a coffee table, an outdoor rug, planters, ` +
      `string lights, side tables, throw pillows rated for outdoors`
    );
  }
  if (t.includes("hall")) {
    return (
      `a runner rug, framed art on the walls, a console table or narrow bench, a pendant or sconce lighting`
    );
  }
  return (
    `${styleLabel}-style furniture appropriate for this room — seating, surfaces, lighting, ` +
    `a rug, art, and plants`
  );
}
