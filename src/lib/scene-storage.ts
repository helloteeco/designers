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
