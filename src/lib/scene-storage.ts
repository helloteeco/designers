import { createClient } from "@supabase/supabase-js";

/**
 * Cutout image cache backed by Supabase Storage.
 * Keyed by a content-derived hash so the same product always hits cache.
 */
export const cacheEnabled =
  typeof process !== "undefined" &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function ensureHostedUrl(
  url: string | undefined,
  folder: "scenes" | "cutouts" | "snapshots" = "scenes"
): Promise<string | undefined> {
  if (!url) return url;
  if (url.includes("supabase.co/")) return url;

  let dataUrl: string;
  if (url.startsWith("data:")) {
    dataUrl = url;
  } else if (/^https?:\/\//i.test(url)) {
    const downloaded = await downloadAsDataUrl(url);
    if (!downloaded) return url;
    dataUrl = downloaded;
  } else {
    return url;
  }

  try {
    const res = await fetch("/api/upload-scene-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl, folder }),
    });
    if (!res.ok) return url;
    const json = (await res.json()) as { url?: string };
    return json.url ?? url;
  } catch {
    return url;
  }
}

/**
 * Download an external image URL via the proxy and return a data URL.
 * Uses a chunked base64 conversion that doesn't blow the call stack.
 */
async function downloadAsDataUrl(url: string): Promise<string | null> {
  try {
    const proxyRes = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`);
    if (!proxyRes.ok) return null;
    const ct = proxyRes.headers.get("content-type") || "image/png";
    if (!ct.startsWith("image/")) return null;
    const buf = await proxyRes.arrayBuffer();
    if (buf.byteLength > 5 * 1024 * 1024 || buf.byteLength < 100) return null;
    const bytes = new Uint8Array(buf);
    const chunkSize = 8192;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode.apply(null, slice as unknown as number[]);
    }
    return `data:${ct};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

/**
 * Try to get a product image for the composite board. Strategy:
 *   1. Download the vendor URL via proxy → upload to Supabase
 *   2. If that fails, generate one with Gemini (generate-cutout API)
 *   3. If that also fails, return null (item will be skipped)
 */
export async function resolveProductImage(
  vendorImageUrl: string | undefined,
  description: string,
  vendor?: string,
): Promise<string | null> {
  // Attempt 1: download + host the vendor image
  if (vendorImageUrl && vendorImageUrl.includes("supabase.co/")) {
    return vendorImageUrl;
  }
  if (vendorImageUrl && /^https?:\/\//i.test(vendorImageUrl)) {
    const downloaded = await downloadAsDataUrl(vendorImageUrl);
    if (downloaded) {
      try {
        const res = await fetch("/api/upload-scene-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: downloaded, folder: "cutouts" }),
        });
        if (res.ok) {
          const json = (await res.json()) as { url?: string };
          if (json.url) return json.url;
        }
      } catch {}
    }
  }

  // Attempt 2: generate a product image with Gemini
  try {
    const cutRes = await fetch("/api/generate-cutout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        imageUrl: vendorImageUrl || undefined,
        vendor: vendor || undefined,
      }),
    });
    if (cutRes.ok) {
      const json = (await cutRes.json()) as { imageUrl?: string; imageDataUrl?: string };
      const result = json.imageUrl ?? json.imageDataUrl;
      if (result) return result;
    }
  } catch {}

  return null;
}

/**
 * Convert an image's near-white pixels to fully transparent, producing
 * a "real" cutout (no white box around products on the composite). This
 * runs client-side on the returned cutout from /api/generate-cutout,
 * regardless of whether Gemini gave us a perfectly bg-removed image.
 *
 * Tolerance is generous (240+ on all three channels) so JPEG artifacts
 * near the edges still get knocked out. Returns a PNG data URL.
 */
export async function whiteBgToTransparent(src: string): Promise<string> {
  // Load the image into a canvas
  const img = await loadCorsImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0);

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    // Tainted canvas (CORS) — skip rather than throw
    return src;
  }
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    if (r > 240 && g > 240 && b > 240) {
      pixels[i + 3] = 0;
    } else if (r > 220 && g > 220 && b > 220) {
      // Soft edge: fade out near-white pixels so we don't get a hard halo
      const brightness = (r + g + b) / 3;
      const fade = Math.max(0, 1 - (brightness - 220) / 20);
      pixels[i + 3] = Math.round(pixels[i + 3] * fade);
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Finalize a cutout URL:
 *   1. If it's a data URL → make bg transparent → upload to Supabase
 *   2. If it's a hosted URL → just return (already clean)
 */
export async function finalizeCutout(url: string | undefined): Promise<string | null> {
  if (!url) return null;

  // If already hosted, skip processing
  if (url.includes("supabase.co/")) return url;

  // If it's a data URL, process it
  if (url.startsWith("data:")) {
    const transparent = await whiteBgToTransparent(url);
    const hosted = await ensureHostedUrl(transparent, "cutouts");
    return hosted ?? transparent;
  }

  // External URL — try to host it
  const hosted = await ensureHostedUrl(url, "cutouts");
  return hosted ?? url;
}

/**
 * Compact all room images in a project by re-uploading any remaining
 * data URLs to Supabase. Frees localStorage space.
 */
export async function compactProjectImages(project: { id: string; rooms: Array<{ sceneBackgroundUrl?: string; sceneSnapshot?: string; originalRenderUrl?: string; referenceImageUrl?: string }> }): Promise<void> {
  for (const room of project.rooms) {
    if (room.sceneBackgroundUrl?.startsWith("data:")) {
      room.sceneBackgroundUrl = await ensureHostedUrl(room.sceneBackgroundUrl, "scenes") ?? room.sceneBackgroundUrl;
    }
    if (room.sceneSnapshot?.startsWith("data:")) {
      room.sceneSnapshot = await ensureHostedUrl(room.sceneSnapshot, "snapshots") ?? room.sceneSnapshot;
    }
    if (room.originalRenderUrl?.startsWith("data:")) {
      room.originalRenderUrl = await ensureHostedUrl(room.originalRenderUrl, "scenes") ?? room.originalRenderUrl;
    }
    if (room.referenceImageUrl?.startsWith("data:")) {
      room.referenceImageUrl = await ensureHostedUrl(room.referenceImageUrl, "scenes") ?? room.referenceImageUrl;
    }
  }
}

// ── Internal helpers ──────────────────────────────────────────────

function loadCorsImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    if (src.startsWith("data:") || src.includes("supabase.co")) {
      img.src = src;
    } else {
      img.src = `/api/proxy-image?url=${encodeURIComponent(src)}`;
    }
  });
}
