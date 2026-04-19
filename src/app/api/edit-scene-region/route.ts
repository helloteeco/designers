import { NextResponse } from "next/server";
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { imageToInlineBase64 } from "@/lib/image-url-server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Click-to-edit: designer clicked on the rendered scene at (x, y) in % coords.
 * Stage 1 — Gemini Vision identifies what's at that spot.
 * Stage 2 — Gemini image-to-image performs the requested action: swap with a
 *           specific alternative, or remove + inpaint the background back in.
 *
 * POST body: {
 *   imageDataUrl: data:image/...
 *   clickXPct: 0-100
 *   clickYPct: 0-100
 *   action: "swap" | "remove"
 *   swapTo?: string — required for action: "swap" (designer's description)
 * }
 *
 * Response: {
 *   identified: string — what Gemini saw at the click
 *   imageDataUrl?: string — the new edited image (swap/remove)
 *   modelUsed?: string
 * } | { error }
 */

interface RequestBody {
  imageDataUrl?: string;
  clickXPct?: number;
  clickYPct?: number;
  action?: "swap" | "remove";
  swapTo?: string;
}

const IMAGE_MODELS = [
  "gemini-3-pro-image",
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
];

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured on the server" }, { status: 500 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imageDataUrl, clickXPct, clickYPct, action, swapTo } = body;
  if (!imageDataUrl) {
    return NextResponse.json({ error: "imageDataUrl (data: or https://) required" }, { status: 400 });
  }
  if (typeof clickXPct !== "number" || typeof clickYPct !== "number") {
    return NextResponse.json({ error: "clickXPct + clickYPct (0-100) required" }, { status: 400 });
  }
  if (action !== "swap" && action !== "remove") {
    return NextResponse.json({ error: "action must be 'swap' or 'remove'" }, { status: 400 });
  }
  if (action === "swap" && !swapTo?.trim()) {
    return NextResponse.json({ error: "swapTo is required for action 'swap'" }, { status: 400 });
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

  // ── Stage 1: identify what's at the click coords ──
  let identified: string;
  try {
    const identifyPrompt =
      `Look at this interior design scene. The designer clicked at approximately ` +
      `${clickXPct.toFixed(0)}% from the left and ${clickYPct.toFixed(0)}% from the top of the image. ` +
      `Identify the single specific furniture or decor item at that exact location. ` +
      `Reply with one short noun phrase only — e.g. "green velvet sofa", "brass arc floor lamp", ` +
      `"vintage Persian rug", "abstract canvas art on wall". No prose, no explanations.`;

    const identifyResp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: identifyPrompt },
            { inlineData: { mimeType, data: base64Data } },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            item: { type: Type.STRING, description: "Single noun phrase identifying the item at the click coords." },
          },
          required: ["item"],
        },
      },
    });
    const text = identifyResp.text ?? "";
    const parsed = JSON.parse(text) as { item?: string };
    identified = (parsed.item ?? "").trim();
    if (!identified) throw new Error("Gemini returned empty identification");
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "Couldn't identify what's at that spot — try clicking more precisely on a specific piece. " +
          (err instanceof Error ? err.message : String(err)),
      },
      { status: 502 }
    );
  }

  // ── Stage 2: perform the edit via image-to-image ──
  const editPrompt =
    action === "swap"
      ? `Edit this interior scene: replace the ${identified} (located near ${clickXPct.toFixed(0)}% from left, ` +
        `${clickYPct.toFixed(0)}% from top) with ${swapTo!.trim()}. Keep everything else identical — same room, ` +
        `same walls, same other furniture, same lighting. Only change the one piece. Match the existing scene's ` +
        `style, lighting, and perspective so it looks natural. Photorealistic.`
      : `Edit this interior scene: remove the ${identified} (located near ${clickXPct.toFixed(0)}% from left, ` +
        `${clickYPct.toFixed(0)}% from top) and inpaint the area behind it (wall / floor / whatever was there). ` +
        `Keep everything else identical. Photorealistic, seamless.`;

  const errors: string[] = [];
  for (const model of IMAGE_MODELS) {
    try {
      const editResp = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { text: editPrompt },
              { inlineData: { mimeType, data: base64Data } },
            ],
          },
        ],
        config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
      });
      const parts = editResp.candidates?.[0]?.content?.parts ?? [];
      const out = parts.find(p => p.inlineData?.data);
      if (out?.inlineData?.data) {
        const newMime = out.inlineData.mimeType || "image/png";
        return NextResponse.json({
          identified,
          imageDataUrl: `data:${newMime};base64,${out.inlineData.data}`,
          modelUsed: model,
          action,
        });
      }
      errors.push(`${model}: no image in response`);
    } catch (err) {
      errors.push(`${model}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json(
    {
      identified,
      error: `Edit failed across all models. Tried: ${errors.join(" | ").slice(0, 800)}`,
    },
    { status: 502 }
  );
}
