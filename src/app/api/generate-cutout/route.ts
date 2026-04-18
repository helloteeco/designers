import { NextResponse } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";

export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * Generate a product-cutout image for any sourced item — Spoak-style catalog
 * look on demand. Two modes:
 *
 *   1. If an existing imageUrl is passed, we can ask Gemini image-to-image
 *      to cleanly remove the background (returns the same product on
 *      transparent/white, no context).
 *
 *   2. If no imageUrl is available (Google Search grounding didn't return
 *      one), we generate one from scratch — "a [description], studio-
 *      lit product-catalog photo, isolated on white background" — so the
 *      sourced item still has a usable visual asset.
 *
 * Cost ~$0.01 per call. Designers cache in localStorage to avoid re-
 * generating the same cutout.
 *
 * POST body: {
 *   description: string — product description for the prompt
 *   imageUrl?: string — existing product image (will be background-removed)
 *   vendor?: string — adds brand context to the prompt
 * }
 *
 * Response: { imageDataUrl: "data:image/png;base64,..." }
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

  const { description, imageUrl, vendor } = (body ?? {}) as {
    description?: string;
    imageUrl?: string;
    vendor?: string;
  };

  if (!description) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  const vendorHint = vendor ? ` by ${vendor}` : "";
  const ai = new GoogleGenAI({ apiKey });

  // Gemini image models — same fallback chain as /api/generate-scene
  const models = [
    "gemini-3-pro-image",
    "gemini-3-pro-image-preview",
    "gemini-2.5-flash-image",
    "gemini-2.5-flash-image-preview",
  ];

  const errors: string[] = [];

  // ── Mode 1: background-remove an existing product photo ──
  if (imageUrl) {
    try {
      const imgPart = await fetchAsInlineData(imageUrl);
      if (imgPart) {
        for (const model of models) {
          try {
            const prompt = `Remove the background from this product image. Output only the product (${description}${vendorHint}), isolated on a pure white background, centered, studio-lit catalog style. Do not add or remove features. Do not add decor around it.`;
            const response = await ai.models.generateContent({
              model,
              contents: [{ role: "user", parts: [{ text: prompt }, imgPart] }],
              config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
            });
            const parts = response.candidates?.[0]?.content?.parts ?? [];
            const out = parts.find(p => p.inlineData?.data);
            if (out?.inlineData?.data) {
              return NextResponse.json({
                imageDataUrl: `data:${out.inlineData.mimeType || "image/png"};base64,${out.inlineData.data}`,
                mode: "bg-removed",
                modelUsed: model,
              });
            }
          } catch (err) {
            errors.push(`${model} (edit): ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } else {
        errors.push("Could not fetch source imageUrl for background removal — falling through to text-to-image");
      }
    } catch (err) {
      errors.push(`fetch imageUrl: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Mode 2: generate from scratch (no source image available) ──
  const genPrompt = `Product catalog photo of ${description}${vendorHint}. Studio-lit, isolated on pure white background, centered, shot from 3/4 front angle. Clean, minimal, no decor around it. Photorealistic.`;
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: genPrompt }] }],
        config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
      });
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const out = parts.find(p => p.inlineData?.data);
      if (out?.inlineData?.data) {
        return NextResponse.json({
          imageDataUrl: `data:${out.inlineData.mimeType || "image/png"};base64,${out.inlineData.data}`,
          mode: "generated",
          modelUsed: model,
        });
      }
    } catch (err) {
      errors.push(`${model} (gen): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json(
    { error: `Cutout generation failed. Details: ${errors.join(" | ").slice(0, 1000)}` },
    { status: 502 }
  );
}

/**
 * Fetch an external image URL and turn it into a Gemini inlineData part.
 * Returns null if the fetch fails (CORS, dead link, bad MIME, etc.) so the
 * caller falls through to text-to-image generation.
 */
async function fetchAsInlineData(url: string): Promise<{ inlineData: { data: string; mimeType: string } } | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "TeecoDesignStudio/1.0" } });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 5 * 1024 * 1024) return null; // 5 MB cap
    const base64 = Buffer.from(buf).toString("base64");
    return { inlineData: { data: base64, mimeType: contentType } };
  } catch {
    return null;
  }
}
