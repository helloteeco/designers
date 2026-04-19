/**
 * Keep localStorage lean by moving every image blob to Supabase Storage.
 *
 * Renders, composite snapshots, and fallback cutouts are all base64
 * data URLs by default — a handful of rooms can blow past the 5-10 MB
 * browser quota and block further saves. `ensureHostedUrl` uploads any
 * data URL via /api/upload-scene-image and returns the public URL to
 * persist instead. Already-hosted URLs pass through unchanged.
 *
 * Fails open: on network/upload error we log and return the original
 * data URL so the flow doesn't die — the storage cap will still bite
 * but at least the user sees their work on screen.
 */

export async function ensureHostedUrl(
  url: string | undefined,
  folder: "scenes" | "cutouts" | "snapshots" = "scenes"
): Promise<string | undefined> {
  if (!url) return url;
  if (!url.startsWith("data:")) return url;

  try {
    const res = await fetch("/api/upload-scene-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl: url, folder }),
    });
    if (!res.ok) {
      return url;
    }
    const json = (await res.json()) as { url?: string };
    return json.url ?? url;
  } catch {
    return url;
  }
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
 * Full pipeline a caller should run after getting a cutout URL back from
 * /api/generate-cutout: color-key white → transparent, then upload to
 * cloud storage and return the hosted URL. Falls back to the original
 * URL on any error so an upstream bug never silently kills the scene.
 */
export async function finalizeCutout(
  url: string | undefined
): Promise<string | undefined> {
  if (!url) return url;
  try {
    const transparent = await whiteBgToTransparent(url);
    return (await ensureHostedUrl(transparent, "cutouts")) ?? transparent;
  } catch {
    return url;
  }
}

async function loadCorsImage(src: string): Promise<HTMLImageElement> {
  // Route non-data URLs through our proxy so the canvas stays un-tainted
  // and we can read pixels. Data URLs load directly.
  const loadFrom = src.startsWith("data:")
    ? src
    : `/api/proxy-image?url=${encodeURIComponent(src)}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for color-key"));
    img.src = loadFrom;
  });
}

/**
 * Walk a project's rooms and replace any embedded data URLs with hosted
 * URLs. Used by the "Free up storage" action to reclaim localStorage
 * space on projects that were created before scene-storage existed.
 */
export async function compactProjectImages(project: {
  rooms: Array<{
    sceneBackgroundUrl?: string;
    sceneSnapshot?: string;
    furniture: Array<{ item: { imageUrl?: string } }>;
  }>;
}): Promise<{ project: typeof project; uploaded: number }> {
  let uploaded = 0;

  for (const room of project.rooms) {
    if (room.sceneBackgroundUrl?.startsWith("data:")) {
      const hosted = await ensureHostedUrl(room.sceneBackgroundUrl, "scenes");
      if (hosted && !hosted.startsWith("data:")) {
        room.sceneBackgroundUrl = hosted;
        uploaded++;
      }
    }
    if (room.sceneSnapshot?.startsWith("data:")) {
      const hosted = await ensureHostedUrl(room.sceneSnapshot, "snapshots");
      if (hosted && !hosted.startsWith("data:")) {
        room.sceneSnapshot = hosted;
        uploaded++;
      }
    }
    for (const f of room.furniture) {
      if (f.item.imageUrl?.startsWith("data:")) {
        const hosted = await ensureHostedUrl(f.item.imageUrl, "cutouts");
        if (hosted && !hosted.startsWith("data:")) {
          f.item.imageUrl = hosted;
          uploaded++;
        }
      }
    }
  }

  return { project, uploaded };
}
