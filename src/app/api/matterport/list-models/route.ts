import { NextResponse } from "next/server";
import { getMatterportConfig, listModels } from "@/lib/matterport";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * List Matterport models accessible with the configured token.
 * Sandbox tokens return Matterport's demo spaces. Private-Use tokens
 * return the account's own scans.
 *
 * GET /api/matterport/list-models
 * Response: { ok: true, models: [{ id, name, created }] } | { ok: false, error }
 */
export async function GET() {
  const cfg = getMatterportConfig();
  if ("error" in cfg) {
    return NextResponse.json({ ok: false, error: cfg.error }, { status: 400 });
  }
  try {
    const models = await listModels(cfg);
    return NextResponse.json({ ok: true, count: models.length, models });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error:
          msg +
          (/unauthoriz|forbidden|401|403/i.test(msg)
            ? ". Check that MATTERPORT_TOKEN_ID + MATTERPORT_TOKEN_SECRET match an active token in Matterport Developer Tools, and that the token hasn't expired."
            : ""),
      },
      { status: 502 }
    );
  }
}
