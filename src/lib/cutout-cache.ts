import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

/**
 * Server-side cache for generated cutouts backed by Supabase Storage.
 *
 * Why server-side cache rather than localStorage:
 *  - Survives browser clears and works across devices/designers/projects
 *  - localStorage is ~5 MB; a single cutout PNG can be ~500 KB
 *  - The Matterport contract (section 11.3) says we lose API access when the
 *    subscription ends — caching to our own storage keeps renders durable
 *
 * Setup (one-time, in Supabase Dashboard → Storage):
 *   1. Create a bucket named "cutouts" (public read access on)
 *   2. Add env var SUPABASE_SERVICE_ROLE_KEY (not NEXT_PUBLIC_ — server only)
 *
 * If Supabase isn't configured, callers gracefully fall back to returning
 * the generated base64 data URL and nothing gets cached. No crashes.
 */

const BUCKET = "cutouts";

let _cachedClient: SupabaseClient | null = null;

function getServerClient(): SupabaseClient | null {
  if (_cachedClient) return _cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  _cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _cachedClient;
}

/**
 * Deterministic cache key from a product identity. Hashes to keep the key
 * filesystem-safe and bounded-length.
 */
export function cacheKey(input: { vendor?: string; name: string; sourceUrl?: string }): string {
  const raw = `${input.vendor ?? ""}|${input.name}|${input.sourceUrl ?? ""}`;
  const hash = createHash("sha1").update(raw).digest("hex").slice(0, 24);
  return `${hash}.png`;
}

/**
 * Check if a cutout exists in the cache. Returns a public URL or null.
 * Null means: not cached OR Supabase not configured OR bucket missing —
 * the caller should generate fresh and then pass the result to putCutout().
 */
export async function getCachedCutoutUrl(key: string): Promise<string | null> {
  const client = getServerClient();
  if (!client) return null;
  try {
    // `download` is the cheapest "does it exist" check that works with the
    // anon key (`list` sometimes requires elevated permissions).
    const { error } = await client.storage.from(BUCKET).download(key);
    if (error) return null;
    const { data } = client.storage.from(BUCKET).getPublicUrl(key);
    return data?.publicUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Upload a freshly-generated cutout (as a base64 data URL) to the cache.
 * Returns the public URL on success, null on failure (including
 * Supabase-not-configured — caller keeps using the data URL).
 */
export async function putCutout(key: string, dataUrl: string): Promise<string | null> {
  const client = getServerClient();
  if (!client) return null;

  const match = dataUrl.match(/^data:(image\/[a-z0-9+.-]+);base64,(.*)$/i);
  if (!match) return null;
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");

  try {
    const { error } = await client.storage.from(BUCKET).upload(key, buffer, {
      contentType,
      upsert: true,
      cacheControl: "31536000", // 1 year — keys are content-addressed
    });
    if (error) return null;
    const { data } = client.storage.from(BUCKET).getPublicUrl(key);
    return data?.publicUrl ?? null;
  } catch {
    return null;
  }
}
