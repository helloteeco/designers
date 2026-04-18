/**
 * Nano Banana — Gemini 2.5 Flash Image
 * Photorealistic room rendering from Scene Designer compositions.
 *
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/
 *           gemini-2.5-flash-image-preview:generateContent?key=API_KEY
 *
 * Accepts a prompt + optional reference image (scene screenshot).
 * Returns a photorealistic generated image as base64.
 *
 * Cost: ~$0.039 per image.
 */

import type { Project, Room } from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent";

export interface RenderResult {
  imageDataUrl: string;    // data:image/png;base64,...
  mimeType: string;
  elapsedMs: number;
  promptUsed: string;
}

export interface RenderOptions {
  apiKey: string;
  prompt: string;
  /** Optional base64 data URL of the scene screenshot to use as reference */
  referenceImageDataUrl?: string;
}

export async function renderWithNanoBanana(opts: RenderOptions): Promise<RenderResult> {
  if (!opts.apiKey?.trim()) {
    throw new Error("Google API key required. Add it in Settings → AI Render.");
  }
  if (!opts.prompt?.trim()) {
    throw new Error("Prompt required.");
  }

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: opts.prompt },
  ];

  if (opts.referenceImageDataUrl) {
    // Strip data URL prefix to get raw base64
    const match = opts.referenceImageDataUrl.match(/^data:(.+?);base64,(.+)$/);
    if (match) {
      parts.push({
        inlineData: {
          mimeType: match[1],
          data: match[2],
        },
      });
    }
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
    },
  };

  const started = Date.now();
  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(opts.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let msg = `Gemini API error: ${res.status}`;
    try {
      const err = await res.json();
      msg = err?.error?.message ?? msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  const data = await res.json();
  const elapsedMs = Date.now() - started;

  // Find the image part in the response
  const candidates = data?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("No image returned from Gemini.");
  }

  const imagePart = candidates[0]?.content?.parts?.find((p: unknown) => {
    return typeof p === "object" && p !== null && "inlineData" in p;
  }) as { inlineData?: { mimeType?: string; data?: string } } | undefined;

  if (!imagePart?.inlineData?.data) {
    // Check if it was blocked by safety
    const finishReason = candidates[0]?.finishReason;
    if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT") {
      throw new Error("Render blocked by Gemini safety filter. Try a simpler prompt.");
    }
    throw new Error(`No image in Gemini response (finish: ${finishReason ?? "unknown"})`);
  }

  const mimeType = imagePart.inlineData.mimeType ?? "image/png";
  const imageDataUrl = `data:${mimeType};base64,${imagePart.inlineData.data}`;

  return {
    imageDataUrl,
    mimeType,
    elapsedMs,
    promptUsed: opts.prompt,
  };
}

// ── Prompt builder ──

export function buildRoomPrompt(project: Project, room: Room): string {
  const style = project.style.replace(/-/g, " ");
  const roomType = room.type.replace(/-/g, " ");
  const dims = `${room.widthFt}' x ${room.lengthFt}'`;
  const ceiling = room.ceilingHeightFt >= 10 ? "vaulted ceiling" : `${room.ceilingHeightFt}' ceiling`;

  // Accent wall description
  let accentDesc = "";
  if (room.accentWall) {
    accentDesc = `with a ${hexToName(room.accentWall.color)} ${room.accentWall.treatment} accent wall`;
  }

  // Bed configuration
  const bedDesc = room.selectedBedConfig && room.selectedBedConfig.totalSleeps > 0
    ? `featuring ${room.selectedBedConfig.name.toLowerCase()}`
    : "";

  // Features
  const featureMap: Record<string, string> = {
    "Window": "large windows with natural daylight",
    "Vaulted Ceiling": "vaulted ceiling",
    "Fireplace": "stone fireplace as focal point",
    "Skylight": "skylight",
    "Balcony": "balcony access",
    "Bay Window": "bay window seating",
    "Built-in Shelving": "built-in shelving",
    "En-suite": "en-suite bathroom door visible",
    "Closet": "closet door visible",
    "Walk-in Closet": "walk-in closet entrance",
  };
  const features = room.features
    .map(f => featureMap[f] ?? f.toLowerCase())
    .filter(Boolean)
    .join(", ");

  // Furniture items (from sceneItems first, fall back to furniture[])
  const itemCount = room.sceneItems?.length ?? room.furniture.length;
  const furnitureList = (room.sceneItems ?? [])
    .map(s => {
      const item = room.furniture.find(f => f.item.id === s.itemId);
      return item?.item.name;
    })
    .filter(Boolean)
    .slice(0, 8);

  // Color palette from project's first mood board / concept
  const palette = project.moodBoards[0]?.colorPalette?.slice(0, 3) ?? [];
  const colorDesc = palette.length > 0
    ? `Color palette: ${palette.map(hexToName).join(", ")}.`
    : "";

  const parts = [
    `Photorealistic interior design render of a ${style} ${roomType} (${dims}, ${ceiling})`,
    bedDesc && `${bedDesc}.`,
    accentDesc && `${accentDesc}.`,
    features && `Features: ${features}.`,
    furnitureList.length > 0 && `Furnished with: ${furnitureList.join(", ")}.`,
    colorDesc,
    "Warm natural lighting, high-end vacation rental staging, professional real estate photography, wide angle. Soft shadows, realistic materials and textures. 4K, photorealistic, ultra detailed.",
    "Preserve the furniture arrangement and room layout shown in the reference image. Match item positions and general composition.",
  ].filter(Boolean);

  return parts.join(" ");
}

function hexToName(hex: string): string {
  const colors: Record<string, string> = {
    "#f5f0eb": "warm cream", "#d4a574": "warm amber", "#8b7355": "mocha brown",
    "#3d3022": "dark chocolate", "#1a1a2e": "deep navy", "#f0f7fa": "icy blue",
    "#87ceeb": "sky blue", "#4a90a4": "ocean teal", "#2c5f6e": "deep teal",
    "#f2f5f0": "sage white", "#a8b5a0": "soft sage", "#5a6b50": "forest green",
    "#faf5ef": "warm linen", "#e8c9a8": "desert sand", "#c4956a": "terracotta",
    "#ffffff": "pure white", "#d4d4d4": "light gray", "#737373": "medium gray",
    "#404040": "charcoal", "#0a0a0a": "near black", "#fef3e2": "pale peach",
    "#f4a261": "golden amber", "#e76f51": "burnt sienna", "#264653": "dark teal",
    "#2a9d8f": "emerald teal", "#faf0e6": "antique linen", "#d4856c": "dusty rose",
  };
  const lower = hex.toLowerCase();
  if (colors[lower]) return colors[lower];
  const r = parseInt(lower.slice(1, 3), 16);
  const g = parseInt(lower.slice(3, 5), 16);
  const b = parseInt(lower.slice(5, 7), 16);
  if (isNaN(r)) return "neutral";
  const brightness = (r + g + b) / 3;
  if (brightness > 220) return "light neutral";
  if (brightness > 180) return "warm neutral";
  if (brightness > 120) return "muted tone";
  if (brightness > 60) return "rich tone";
  return "dark tone";
}
