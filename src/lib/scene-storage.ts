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
 * URLs. Writes directly to localStorage through the project store,
 * refusing to overwrite any field whose value has changed while we
 * were uploading — so a fresh render that completes mid-compact never
 * gets clobbered by a stale snapshot.
 *
 * Returns the number of images uploaded + persisted.
 */
export async function compactProjectImages(projectOrId: string | {
  id: string;
  rooms: Array<{
    id: string;
    sceneBackgroundUrl?: string;
    sceneSnapshot?: string;
    furniture: Array<{ item: { id: string; imageUrl?: string } }>;
  }>;
}): Promise<{ uploaded: number }> {
  // Lazy-import to avoid a circular module-load between store ↔ this lib
  const { getProject, saveProject } = await import("./store");
  const projectId = typeof projectOrId === "string" ? projectOrId : projectOrId.id;

  const initial = getProject(projectId);
  if (!initial) return { uploaded: 0 };

  // Phase 1: collect every data URL that needs lifting + upload each.
  // We capture the ORIGINAL value so the write phase can bail if
  // somebody else moved the field on during our upload.
  interface Upload {
    roomId: string;
    kind: "sceneBackgroundUrl" | "sceneSnapshot" | "cutout";
    itemId?: string;
    originalValue: string;
    hostedValue: string;
  }
  const uploads: Upload[] = [];

  for (const room of initial.rooms) {
    if (room.sceneBackgroundUrl?.startsWith("data:")) {
      const hosted = await ensureHostedUrl(room.sceneBackgroundUrl, "scenes");
      if (hosted && !hosted.startsWith("data:")) {
        uploads.push({
          roomId: room.id,
          kind: "sceneBackgroundUrl",
          originalValue: room.sceneBackgroundUrl,
          hostedValue: hosted,
        });
      }
    }
    if (room.sceneSnapshot?.startsWith("data:")) {
      const hosted = await ensureHostedUrl(room.sceneSnapshot, "snapshots");
      if (hosted && !hosted.startsWith("data:")) {
        uploads.push({
          roomId: room.id,
          kind: "sceneSnapshot",
          originalValue: room.sceneSnapshot,
          hostedValue: hosted,
        });
      }
    }
    for (const f of room.furniture) {
      if (f.item.imageUrl?.startsWith("data:")) {
        const hosted = await ensureHostedUrl(f.item.imageUrl, "cutouts");
        if (hosted && !hosted.startsWith("data:")) {
          uploads.push({
            roomId: room.id,
            kind: "cutout",
            itemId: f.item.id,
            originalValue: f.item.imageUrl,
            hostedValue: hosted,
          });
        }
      }
    }
  }

  if (uploads.length === 0) return { uploaded: 0 };

  // Phase 2: apply to the LATEST state, skipping any field that changed
  // during our uploads. This is the critical race fix — if the user
  // kicked off a fresh render while compact was running, the scene
  // background is now a fresh hosted URL (not our original data URL),
  // and we leave it alone.
  const latest = getProject(projectId);
  if (!latest) return { uploaded: 0 };

  let applied = 0;
  for (const up of uploads) {
    const targetRoom = latest.rooms.find(r => r.id === up.roomId);
    if (!targetRoom) continue;

    if (up.kind === "sceneBackgroundUrl") {
      if (targetRoom.sceneBackgroundUrl === up.originalValue) {
        targetRoom.sceneBackgroundUrl = up.hostedValue;
        applied++;
      }
    } else if (up.kind === "sceneSnapshot") {
      if (targetRoom.sceneSnapshot === up.originalValue) {
        targetRoom.sceneSnapshot = up.hostedValue;
        applied++;
      }
    } else if (up.kind === "cutout" && up.itemId) {
      const f = targetRoom.furniture.find(ff => ff.item.id === up.itemId);
      if (f && f.item.imageUrl === up.originalValue) {
        f.item.imageUrl = up.hostedValue;
        applied++;
      }
    }
  }

  if (applied > 0) {
    saveProject(latest);
  }
  return { uploaded: applied };
}
