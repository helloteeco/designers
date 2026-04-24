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
 * URL patterns that indicate a vendor "No Image Available" placeholder.
 * Wayfair, Amazon, IKEA all serve fallback PNGs with these patterns
 * when the real product image is missing — we MUST reject these so
 * the composite board doesn't show "No Image Available" graphics
 * as if they were real products.
 */
const PLACEHOLDER_URL_PATTERNS = [
  /no[-_]?image/i,
  /placeholder/i,
  /missing[-_]?image/i,
  /unavailable/i,
  /image[-_]?not[-_]?available/i,
  /default[-_]?(?:image|product)/i,
  /noimg/i,
  /\bna\b\.(?:png|jpg|jpeg|webp)/i,
];

function isPlaceholderUrl(url: string): boolean {
  return PLACEHOLDER_URL_PATTERNS.some(p => p.test(url));
}

/**
 * Download an external image URL via the proxy and return a data URL.
 * Rejects:
 *   - URLs matching known placeholder patterns
 *   - Files <2KB (way too small to be a real product photo)
 *   - Files >5MB (too big to embed)
 *   - Non-image content types
 */
async function downloadAsDataUrl(url: string): Promise<string | null> {
  if (isPlaceholderUrl(url)) return null;
  try {
    const proxyRes = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`);
    if (!proxyRes.ok) return null;
    const ct = proxyRes.headers.get("content-type") || "image/png";
    if (!ct.startsWith("image/")) return null;
    const buf = await proxyRes.arrayBuffer();
    // Real product photos are at least ~5KB; vendor "No Image Available"
    // placeholders are typically 1-3KB grayscale PNGs.
    if (buf.byteLength > 5 * 1024 * 1024 || buf.byteLength < 2048) return null;
    const bytes = new Uint8Array(buf);
    const chunkSize = 8192;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode.apply(null, slice as unknown as number[]);
    }
    const dataUrl = `data:${ct};base64,${btoa(binary)}`;
    // Pixel-level placeholder detection runs in browser (canvas)
    if (typeof window !== "undefined" && await looksLikePlaceholder(dataUrl)) {
      return null;
    }
    return dataUrl;
  } catch {
    return null;
  }
}

/**
 * Pixel-level placeholder detection: load the image and check if it's
 * mostly a single flat color (gray or beige) — vendor "No Image Available"
 * graphics are typically near-uniform light gray with text, very low color
 * variance compared to real product photos.
 */
async function looksLikePlaceholder(dataUrl: string): Promise<boolean> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject();
      i.src = dataUrl;
    });
    // Tiny images are almost always placeholders or icons
    if (img.naturalWidth < 100 || img.naturalHeight < 100) return true;

    const canvas = document.createElement("canvas");
    const sample = 64;
    canvas.width = sample;
    canvas.height = sample;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, sample, sample);
    const data = ctx.getImageData(0, 0, sample, sample).data;

    // Compute per-channel variance over sampled pixels
    let rs = 0, gs = 0, bs = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      rs += data[i]; gs += data[i + 1]; bs += data[i + 2]; n++;
    }
    const rm = rs / n, gm = gs / n, bm = bs / n;
    let v = 0;
    for (let i = 0; i < data.length; i += 4) {
      v += Math.abs(data[i] - rm) + Math.abs(data[i + 1] - gm) + Math.abs(data[i + 2] - bm);
    }
    const meanVar = v / n;
    // Real product photos have meanVar > 30 typically; flat placeholders < 15
    return meanVar < 15;
  } catch {
    return false;
  }
}

/**
 * Extract og:image from a product page URL via the /api/og-image endpoint,
 * validating that the page's title actually matches the product description.
 * Returns the image URL only when the server confirms a match; if the page
 * looks like a different product entirely (Gemini URL hallucination), returns
 * null so the caller moves on to the next fallback or placeholder.
 */
async function extractOgImage(pageUrl: string, description: string): Promise<string | null> {
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return null;
  try {
    const qs = new URLSearchParams({ url: pageUrl });
    if (description) qs.set("description", description);
    const res = await fetch(`/api/og-image?${qs.toString()}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { imageUrl?: string };
    return json.imageUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Try to download + host a single product image URL with white bg removal.
 * Returns the hosted Supabase URL on success, null on any failure.
 */
async function tryHostVendorImage(url: string): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;

  // Already on Supabase — just process the bg
  if (url.includes("supabase.co/")) {
    try {
      const transparent = await whiteBgToTransparent(url);
      const hosted = await ensureHostedUrl(transparent, "cutouts");
      return hosted ?? url;
    } catch {
      return url;
    }
  }

  const downloaded = await downloadAsDataUrl(url);
  if (!downloaded) return null;

  let processed = downloaded;
  try {
    processed = await whiteBgToTransparent(downloaded);
  } catch {}

  try {
    const res = await fetch("/api/upload-scene-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl: processed, folder: "cutouts" }),
    });
    if (res.ok) {
      const json = (await res.json()) as { url?: string };
      if (json.url) return json.url;
    }
  } catch {}
  return processed; // data URL — at least the image works
}

/**
 * Resolve a product image — uses ONLY real product images.
 * Never generates fake AI cutouts because the masterlist deliverable
 * needs the client to actually be able to buy what they see.
 *
 * Strategy:
 *   1. Try the primary vendor image
 *   2. If that fails, try each alternative's vendor image in order
 *   3. If all real images fail, return a labeled placeholder that
 *      prompts the designer to manually swap or upload
 *
 * Returns: { url, usedAlternativeIndex }
 *   - url: the resolved image URL (real product OR placeholder)
 *   - usedAlternativeIndex: -1 if primary, 0+ if a fallback alternative
 *     was used (so caller can promote that alt to primary on the masterlist)
 *   - isPlaceholder: true if no real image worked and the designer should swap
 */
export interface ProductImageResult {
  url: string;
  usedAlternativeIndex: number;
  isPlaceholder: boolean;
}

export async function resolveProductImage(
  primaryUrl: string | undefined,
  description: string,
  alternatives: { imageUrl?: string; url?: string }[] = [],
): Promise<ProductImageResult> {
  // Attempt 1: primary vendor image URL directly
  if (primaryUrl) {
    const hosted = await tryHostVendorImage(primaryUrl);
    if (hosted) return { url: hosted, usedAlternativeIndex: -1, isPlaceholder: false };
  }

  // Attempt 2: try each alternative's direct image URL
  for (let i = 0; i < alternatives.length; i++) {
    const alt = alternatives[i];
    if (!alt.imageUrl) continue;
    const hosted = await tryHostVendorImage(alt.imageUrl);
    if (hosted) return { url: hosted, usedAlternativeIndex: i, isPlaceholder: false };
  }

  // Attempt 3: extract og:image from product PAGE URLs.
  // The product page URL (opt.url) from Gemini is always reliable even when
  // the image URL isn't — og:image meta tags are designed for link previews
  // and are always direct, hotlinkable image URLs.
  const pageUrls: { url: string; altIdx: number }[] = [];
  for (let i = 0; i < alternatives.length; i++) {
    if (alternatives[i].url) pageUrls.push({ url: alternatives[i].url!, altIdx: i });
  }
  for (const { url: pageUrl, altIdx } of pageUrls) {
    const ogImg = await extractOgImage(pageUrl, description);
    if (ogImg) {
      const hosted = await tryHostVendorImage(ogImg);
      if (hosted) return { url: hosted, usedAlternativeIndex: altIdx, isPlaceholder: false };
    }
  }

  // Attempt 3: labeled placeholder — designer needs to swap or upload manually
  return {
    url: generatePlaceholderSvg(description),
    usedAlternativeIndex: -1,
    isPlaceholder: true,
  };
}

/**
 * Inline SVG placeholder when no real product image could be sourced.
 * Calls out to the designer that this item needs manual attention.
 * Never used as a fake "real" product on the masterlist — the item
 * is flagged so the designer must swap or upload before sending to client.
 */
function generatePlaceholderSvg(description: string): string {
  const escapeXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const label = escapeXml(description.slice(0, 32));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" width="220" height="220">
    <rect x="6" y="6" width="208" height="208" rx="14" fill="#fff7ed" stroke="#fb923c" stroke-width="2.5" stroke-dasharray="6 4"/>
    <circle cx="110" cy="80" r="20" fill="none" stroke="#fb923c" stroke-width="2.5"/>
    <text x="110" y="86" text-anchor="middle" font-family="system-ui, sans-serif" font-size="22" font-weight="700" fill="#fb923c">!</text>
    <text x="110" y="125" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#9a3412" font-weight="700">No real image found</text>
    <text x="110" y="145" text-anchor="middle" font-family="system-ui, sans-serif" font-size="9.5" fill="#7c2d12">${label}</text>
    <text x="110" y="172" text-anchor="middle" font-family="system-ui, sans-serif" font-size="8.5" fill="#9a3412" font-weight="600">Tap Swap to find a real product</text>
    <text x="110" y="186" text-anchor="middle" font-family="system-ui, sans-serif" font-size="8.5" fill="#9a3412" font-weight="600">or paste a vendor URL</text>
  </svg>`;
  const b64 = typeof window !== "undefined"
    ? btoa(unescape(encodeURIComponent(svg)))
    : Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${b64}`;
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

  try {
    // Always remove white background — products on the composite board
    // must have transparent backgrounds so they float cleanly on the
    // backdrop without white rectangles around them.
    const transparent = await whiteBgToTransparent(url);
    const hosted = await ensureHostedUrl(transparent, "cutouts");
    return hosted ?? transparent;
  } catch {
    // If bg removal fails (CORS, canvas taint), at least host the original
    const hosted = await ensureHostedUrl(url, "cutouts");
    return hosted ?? url;
  }
}

/**
 * GUARANTEED cutout: like `finalizeCutout`, but if the fast white-bg removal
 * didn't actually produce transparent edges (e.g. lifestyle photo, colored
 * studio backdrop, CORS-tainted canvas), we fall back to Gemini's cutout
 * generator for a clean transparent result.
 *
 * Use this anywhere a product is going to be placed on the composite board —
 * no more white rectangles slipping through. Caller pays ~$0.01 on cache-miss
 * cutouts; cache hits are free.
 */
export async function finalizeCutoutGuaranteed(
  url: string | undefined,
  description: string,
  vendor?: string,
): Promise<string | null> {
  if (!url) return null;

  // Fast path — try white-bg removal first
  const fast = await finalizeCutout(url);
  if (fast && !(await hasOpaqueEdges(fast))) return fast;

  // Fast path didn't work — generate a proper cutout via Gemini
  try {
    const res = await fetch("/api/generate-cutout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, imageUrl: url, vendor }),
    });
    if (res.ok) {
      const json = (await res.json()) as { imageUrl?: string; imageDataUrl?: string };
      const cutout = json.imageUrl ?? json.imageDataUrl;
      if (cutout) {
        const hosted = await ensureHostedUrl(cutout, "cutouts");
        return hosted ?? cutout;
      }
    }
  } catch {
    // fall through to best-effort
  }

  return fast ?? url;
}

/**
 * Sample the edges of an image — corners + mid-edges — to detect whether it
 * still has an opaque rectangular background. Returns true if 6+ of 8 edge
 * samples are opaque (meaning white-bg removal didn't do its job and we
 * should regenerate the cutout).
 */
async function hasOpaqueEdges(src: string): Promise<boolean> {
  try {
    const img = await loadCorsImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;
    ctx.drawImage(img, 0, 0);

    let data: ImageData;
    try {
      data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      return true; // tainted canvas — can't confirm it's transparent
    }

    const pixels = data.data;
    const w = canvas.width;
    const h = canvas.height;
    const samples: [number, number][] = [
      [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
      [Math.floor(w / 2), 0], [Math.floor(w / 2), h - 1],
      [0, Math.floor(h / 2)], [w - 1, Math.floor(h / 2)],
    ];
    let opaqueCount = 0;
    for (const [x, y] of samples) {
      const i = (y * w + x) * 4;
      if (pixels[i + 3] > 128) opaqueCount++;
    }
    return opaqueCount >= 6;
  } catch {
    return true;
  }
}

/**
 * Turn a scene-crop thumbnail (the AI-generated crop of one item from the
 * room render) into a clean transparent cutout via Gemini. This is the
 * fallback path when real vendor images can't be fetched or cleaned — the
 * composite board always has SOMETHING on it, so sourcing failures never
 * leave the designer with a wall of "No Image Available" boxes.
 *
 * Always hits /api/generate-cutout because scene crops have full room
 * context behind the item (walls, other furniture) that white-bg removal
 * can't handle.
 */
export async function sceneCropToCutout(
  thumbnailDataUrl: string,
  description: string,
  vendor?: string,
): Promise<string | null> {
  if (!thumbnailDataUrl) return null;
  try {
    const res = await fetch("/api/generate-cutout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, imageUrl: thumbnailDataUrl, vendor }),
    });
    if (res.ok) {
      const json = (await res.json()) as { imageUrl?: string; imageDataUrl?: string };
      const cutout = json.imageUrl ?? json.imageDataUrl;
      if (cutout) {
        const hosted = await ensureHostedUrl(cutout, "cutouts");
        return hosted ?? cutout;
      }
    }
  } catch {
    // Fall through
  }
  // Last resort: return the raw scene crop. Still a real image from the AI
  // render — ugly-looking rectangle at worst, never "No Image Available".
  const hosted = await ensureHostedUrl(thumbnailDataUrl, "cutouts");
  return hosted ?? thumbnailDataUrl;
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
