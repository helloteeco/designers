import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Upload a client-generated image (render, composite snapshot, cutout
 * fallback) to Supabase Storage and return a stable public URL. Lets
 * us keep just URLs in localStorage — the base64 data URLs from
 * Gemini can easily blow past the 5-10MB browser quota after a
 * handful of rooms.
 *
 * POST body:  { dataUrl: "data:image/png;base64,...", folder?: "scenes" }
 * Response:   { url: "https://...supabase.co/.../abc123.png" }
 *
 * Deterministic keys via SHA1 so uploading the same image twice is
 * a no-op (upsert = true). For unique-every-time uploads (e.g. each
 * new render is a fresh image), pass folder to namespace; a random
 * suffix is still added so content differs per call.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or
 * NEXT_PUBLIC_SUPABASE_ANON_KEY). Uses the existing "cutouts" bucket
 * (already provisioned with public read for the cutout cache) —
 * paths are namespaced by folder so scene renders and product
 * cutouts coexist without stepping on each other.
 */

const BUCKET = "cutouts";

let _client: SupabaseClient | null = null;
function client(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export async function POST(request: Request) {
  const sb = client();
  if (!sb) {
    return NextResponse.json(
      { error: "Supabase not configured (NEXT_PUBLIC_SUPABASE_URL + key required)" },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { dataUrl, folder } = (body ?? {}) as { dataUrl?: string; folder?: string };
  if (!dataUrl || typeof dataUrl !== "string") {
    return NextResponse.json({ error: "dataUrl required" }, { status: 400 });
  }

  const match = dataUrl.match(/^data:(image\/[a-z0-9+.-]+);base64,(.*)$/i);
  if (!match) {
    return NextResponse.json({ error: "dataUrl must be data:image/...;base64,..." }, { status: 400 });
  }
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) {
    return NextResponse.json({ error: "empty image" }, { status: 400 });
  }

  const ext = extFromMime(contentType);
  const hash = createHash("sha1").update(buffer).digest("hex").slice(0, 16);
  // Random suffix so two identical-content uploads that race don't collide
  // on the upsert (they don't, but keeping them separate is cheap insurance
  // against future edit bugs that might rely on stable URLs per scene).
  const rand = randomBytes(3).toString("hex");
  const safeFolder = (folder ?? "scenes").replace(/[^a-z0-9-_/]/gi, "") || "scenes";
  const path = `${safeFolder}/${hash}-${rand}.${ext}`;

  try {
    const { error } = await sb.storage.from(BUCKET).upload(path, buffer, {
      contentType,
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) {
      return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 502 });
    }
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) {
      return NextResponse.json({ error: "No public URL returned" }, { status: 502 });
    }
    return NextResponse.json({ url: data.publicUrl, bytes: buffer.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload threw" },
      { status: 502 }
    );
  }
}

function extFromMime(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "bin";
}
