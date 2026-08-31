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
 * Echo handling: Nano Banana frequently returns the INPUT image as an
 * early image part in its response and the actual edit as a later part —
 * or sometimes only echoes the input when it can't fulfill the edit. We
 * iterate parts newest-first and skip anything that hashes to the input
 * (full or near-echo). Without this guard the API silently returns the
 * still-furnished render, which is what users were hitting in the wild.
 *
 * POST body: { imageDataUrl: data:image/... | https://... }
 * Response: { imageDataUrl, modelUsed } | { error }
 */

const IMAGE_MODELS = [
  "gemini-3-pro-image",
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
];

const STRIP_PROMPT_PRIMARY =
  "INPUT: a photograph of a real interior room (it currently has furniture and decor). " +
  "TASK: return this EXACT same room as a clean, empty design-board backdrop with NO furniture, " +
  "NO decor, NO movable items.\n\n" +
  "ABSOLUTE PRESERVATION RULES (violating ANY means failure):\n" +
  "• WALLS: keep the EXACT same paint color, texture, wallpaper, and finish.\n" +
  "• CEILING: keep the EXACT same height, color, and any crown molding or beams.\n" +
  "• WINDOWS: keep the EXACT same positions, sizes, frame styles, and number — but REMOVE any curtains, blinds, or shades.\n" +
  "• FLOORING: keep the EXACT same material, color, and pattern (hardwood grain direction, tile pattern, carpet). REMOVE any rugs.\n" +
  "• DOORS: keep the EXACT same positions, styles, and hardware.\n" +
  "• BUILT-INS: keep railings, staircases, built-in shelves, fireplaces, HVAC vents EXACTLY as they are.\n" +
  "• BASEBOARDS & TRIM: keep the EXACT same style and color.\n" +
  "• LIGHTING FIXTURES: keep ceiling-mounted fixtures (chandeliers, fans, pendants, flush-mounts) EXACTLY as they are.\n" +
  "• CAMERA: keep the EXACT same angle, perspective, and focal length.\n" +
  "• DAYLIGHT: keep the EXACT same natural light from the existing windows.\n\n" +
  "REMOVE COMPLETELY (inpaint clean wall/floor/ceiling behind):\n" +
  "• ALL furniture (sofas, beds, chairs, tables, dressers, shelves, ottomans, benches, desks).\n" +
  "• ALL rugs and floor coverings on top of the base flooring.\n" +
  "• ALL window treatments (curtains, drapes, blinds, shades, valances).\n" +
  "• ALL art, mirrors, and wall-mounted decor (except built-ins).\n" +
  "• ALL plants, vases, books, ceramics, lamps (table & floor), pillows, throws, accessories.\n" +
  "• Any shadows or scuffs left behind by removed items.\n\n" +
  "OUTPUT REQUIREMENT: the result MUST be visibly different from the input — the input has furniture, " +
  "the output must have NONE. If the output still contains a sofa, bed, chair, table, rug, curtain, " +
  "art, lamp, or plant you have FAILED. Photorealistic, same room, just empty.";

const STRIP_PROMPT_RETRY =
  "Your previous output still contained furniture. That was wrong. " +
  STRIP_PROMPT_PRIMARY +
  "\n\nThis is your second chance. Return an empty room. NO sofa. NO bed. NO chairs. NO tables. " +
  "NO rugs. NO curtains. NO lamps. NO art. NO plants. JUST the architectural shell.";

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

  const { createHash } = await import("crypto");
  const inputHash = createHash("sha256").update(base64Data).digest("hex");

  const ai = new GoogleGenAI({ apiKey });
  const errors: { model: string; error: string }[] = [];

  // Try each model with the primary prompt; if every returned image is an
  // echo of the input, retry that same model once with a more aggressive
  // "you failed, do it again" prompt. Order: per-model primary → retry.
  for (const model of IMAGE_MODELS) {
    const result = await tryStrip({
      ai,
      model,
      mimeType,
      base64Data,
      inputHash,
      prompt: STRIP_PROMPT_PRIMARY,
    });
    if (result.kind === "ok") {
      return NextResponse.json({ imageDataUrl: result.dataUrl, modelUsed: model });
    }
    if (result.kind === "echo") {
      // Retry once with the more aggressive prompt — same model.
      const retry = await tryStrip({
        ai,
        model,
        mimeType,
        base64Data,
        inputHash,
        prompt: STRIP_PROMPT_RETRY,
      });
      if (retry.kind === "ok") {
        return NextResponse.json({ imageDataUrl: retry.dataUrl, modelUsed: `${model} (retry)` });
      }
      errors.push({ model, error: retry.kind === "echo" ? `echoed input on both attempts (${retry.detail})` : retry.detail });
    } else {
      errors.push({ model, error: result.detail });
    }
  }

  const anyQuota = errors.some(e => /429|quota|billing/i.test(e.error));
  const hint = anyQuota
    ? " HINT: At least one model returned a quota/billing error. Image generation typically requires billing enabled on the Google Cloud project behind your Gemini API key. Go to https://console.cloud.google.com/billing, enable billing on the project, then try again."
    : "";

  return NextResponse.json(
    {
      error: `Strip-scene failed across all models.${hint} Details: ${errors.map(e => `[${e.model}] ${e.error.slice(0, 140)}`).join(" | ")}`,
      errors,
    },
    { status: 502 }
  );
}

type StripResult =
  | { kind: "ok"; dataUrl: string }
  | { kind: "echo"; detail: string }
  | { kind: "error"; detail: string };

async function tryStrip(params: {
  ai: GoogleGenAI;
  model: string;
  mimeType: string;
  base64Data: string;
  inputHash: string;
  prompt: string;
}): Promise<StripResult> {
  const { ai, model, mimeType, base64Data, inputHash, prompt } = params;
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
    if (imageParts.length === 0) {
      return { kind: "error", detail: "no image parts in response" };
    }

    // Walk newest-first and pick the first non-echo. Nano Banana's edit is
    // typically the LAST image part; the input echo (when present) is FIRST.
    const { createHash } = await import("crypto");
    let echoCount = 0;
    for (let i = imageParts.length - 1; i >= 0; i--) {
      const cand = imageParts[i];
      const candData = cand.inlineData?.data;
      if (!candData) continue;

      const candHash = createHash("sha256").update(candData).digest("hex");
      if (candHash === inputHash) {
        echoCount++;
        continue;
      }
      // Near-echo: within 5% size + first 200 base64 chars match → still
      // effectively the input image, just re-encoded.
      const sizeDiff = Math.abs(candData.length - base64Data.length) / base64Data.length;
      if (sizeDiff < 0.05 && candData.slice(0, 200) === base64Data.slice(0, 200)) {
        echoCount++;
        continue;
      }

      const newMime = cand.inlineData?.mimeType || "image/png";
      return { kind: "ok", dataUrl: `data:${newMime};base64,${candData}` };
    }

    return {
      kind: "echo",
      detail: `${imageParts.length} image part(s), all ${echoCount} echoes of input`,
    };
  } catch (err) {
    return {
      kind: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
