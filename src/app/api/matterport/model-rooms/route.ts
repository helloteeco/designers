import { NextResponse } from "next/server";
import { getMatterportConfig, getRoomsWithPanoramas } from "@/lib/matterport";

export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * For a given Matterport model ID, return the rooms Matterport has on file
 * along with a suggested panorama URL per room (from the first sweep inside
 * that room's polygon). Designer can pull any of these as the reference
 * photo for the corresponding room in the project.
 *
 * GET /api/matterport/model-rooms?modelId=<mpId>
 * Response: {
 *   ok: true,
 *   rooms: [{ id, label, sweepCount, suggestedPanoUrl }]
 * } | { ok: false, error }
 */
export async function GET(request: Request) {
  const cfg = getMatterportConfig();
  if ("error" in cfg) {
    return NextResponse.json({ ok: false, error: cfg.error }, { status: 400 });
  }
  const url = new URL(request.url);
  const modelId = url.searchParams.get("modelId");
  if (!modelId) {
    return NextResponse.json(
      { ok: false, error: "modelId query param is required (from Matterport share URL: ?m=XXXXX)" },
      { status: 400 }
    );
  }
  try {
    const rooms = await getRoomsWithPanoramas(cfg, modelId);
    return NextResponse.json({ ok: true, modelId, count: rooms.length, rooms });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error:
          msg +
          (/sandbox|not.*found|private/i.test(msg)
            ? ". Your token may only have Sandbox access — models you actually own need Private Use approval (apply at Matterport → Account → Developer Tools → Private Use)."
            : ""),
      },
      { status: 502 }
    );
  }
}
