/**
 * Matterport Model API helpers.
 *
 * Matterport uses HTTP Basic Auth on their GraphQL endpoint —
 * username = MATTERPORT_TOKEN_ID, password = MATTERPORT_TOKEN_SECRET.
 * Endpoint: https://api.matterport.com/api/models/graph
 *
 * Docs: https://matterport.com/api-reference  (developer.matterport.com
 * for auth setup)
 *
 * Sandbox tokens see only Matterport's demo models; Private-Use tokens
 * see the account's own scans. Same auth flow either way.
 */

export interface MatterportConfig {
  tokenId: string;
  tokenSecret: string;
  endpoint: string;
}

export function getMatterportConfig(): MatterportConfig | { error: string } {
  const tokenId = process.env.MATTERPORT_TOKEN_ID;
  const tokenSecret = process.env.MATTERPORT_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    return {
      error:
        "Matterport tokens not set. In Vercel → design-studio → Settings → " +
        "Environment Variables, add MATTERPORT_TOKEN_ID and MATTERPORT_TOKEN_SECRET " +
        "from Matterport → Account → Developer Tools → API Token Management. " +
        "Redeploy after saving.",
    };
  }
  return {
    tokenId,
    tokenSecret,
    endpoint: process.env.MATTERPORT_ENDPOINT || "https://api.matterport.com/api/models/graph",
  };
}

function basicAuthHeader(cfg: MatterportConfig): string {
  const raw = `${cfg.tokenId}:${cfg.tokenSecret}`;
  return `Basic ${Buffer.from(raw, "utf-8").toString("base64")}`;
}

/**
 * Run a GraphQL query against Matterport's Model API. Throws on non-2xx
 * or if the response contains errors[], with a message suitable for the
 * client-facing error banner.
 */
export async function matterportQuery<T>(
  cfg: MatterportConfig,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(cfg.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthHeader(cfg),
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });
  const bodyText = await res.text();
  let body: unknown;
  try { body = JSON.parse(bodyText); } catch { body = { raw: bodyText }; }

  if (!res.ok) {
    const msg = (body as { errors?: Array<{ message: string }>; message?: string })?.errors?.[0]?.message
      || (body as { message?: string })?.message
      || `HTTP ${res.status}`;
    throw new Error(`Matterport ${msg}`);
  }
  const errs = (body as { errors?: Array<{ message: string }> })?.errors;
  if (errs && errs.length > 0) {
    throw new Error(`Matterport: ${errs.map(e => e.message).join("; ")}`);
  }
  return (body as { data: T }).data;
}

/**
 * List the models accessible to the current token. Sandbox tokens will
 * return Matterport's demo models; Private-Use tokens return the
 * account's own scans.
 */
export async function listModels(cfg: MatterportConfig): Promise<MatterportModel[]> {
  const q = `
    query ListModels {
      models(pagination: { perPage: 50, page: 1 }) {
        results {
          id
          name
          created
          description
        }
      }
    }
  `;
  try {
    const data = await matterportQuery<{ models?: { results?: MatterportModel[] } }>(cfg, q);
    return data.models?.results ?? [];
  } catch (err) {
    // Some Matterport plans expose `spaces` instead of `models` — try that
    const q2 = `
      query ListSpaces {
        spaces(pagination: { perPage: 50, page: 1 }) {
          results {
            id
            name
            created
          }
        }
      }
    `;
    try {
      const data2 = await matterportQuery<{ spaces?: { results?: MatterportModel[] } }>(cfg, q2);
      return data2.spaces?.results ?? [];
    } catch {
      throw err;
    }
  }
}

/**
 * For a given model, return rooms + sweeps + suggested panorama URLs.
 * Each room has a label (if Matterport extracted it), a list of sweeps
 * inside the room's polygon, and a picked "best" sweep for preview.
 */
export async function getRoomsWithPanoramas(
  cfg: MatterportConfig,
  modelId: string
): Promise<MatterportRoomWithPano[]> {
  // Single GraphQL query pulling everything we need
  const q = `
    query ModelRooms($id: ID!) {
      model(id: $id) {
        id
        name
        rooms {
          id
          label
          floor { id name }
          sweeps {
            id
            position { x y z }
            skybox { children }
          }
        }
        sweeps {
          id
          position { x y z }
          skybox { children }
        }
      }
    }
  `;

  const data = await matterportQuery<{ model?: MatterportModelDetail }>(cfg, q, { id: modelId });
  const model = data.model;
  if (!model) throw new Error(`Model ${modelId} not found or not accessible with this token.`);

  // Matterport's schema varies by API version; some don't expose rooms[] directly.
  // When `rooms` is absent we fall back to treating the whole model as one room.
  const rooms = model.rooms && model.rooms.length > 0
    ? model.rooms
    : [{ id: model.id, label: model.name || "Model", sweeps: model.sweeps ?? [] }];

  return rooms.map(r => {
    const sweep = r.sweeps?.[0];
    // Skybox child URLs come in cube-face form; the "pano_0000.jpg" style
    // front face usually renders best as a flat reference photo.
    const panoUrl = sweep?.skybox?.children?.find(c => /\.(jpg|png|webp)$/i.test(c)) ?? null;
    return {
      id: r.id,
      label: r.label ?? "Unnamed",
      sweepCount: r.sweeps?.length ?? 0,
      suggestedPanoUrl: panoUrl,
    };
  });
}

// ── Shared types ────────────────────────────────────────────────────────

export interface MatterportModel {
  id: string;
  name?: string;
  created?: string;
  description?: string;
}

export interface MatterportSweep {
  id: string;
  position?: { x: number; y: number; z: number };
  skybox?: { children?: string[] };
}

export interface MatterportRoom {
  id: string;
  label?: string;
  floor?: { id: string; name?: string };
  sweeps?: MatterportSweep[];
}

export interface MatterportModelDetail {
  id: string;
  name?: string;
  rooms?: MatterportRoom[];
  sweeps?: MatterportSweep[];
}

export interface MatterportRoomWithPano {
  id: string;
  label: string;
  sweepCount: number;
  suggestedPanoUrl: string | null;
}
