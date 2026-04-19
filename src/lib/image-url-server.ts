/**
 * Server-side helper: turn any image reference (data URL OR hosted URL)
 * into the inline base64 form Gemini expects for image-to-image calls.
 *
 * We started with data URLs everywhere but now offload to Supabase
 * Storage to keep localStorage small — so API endpoints need to accept
 * both. Each endpoint that does image editing calls this first to
 * normalize.
 */

export interface InlineImage {
  /** Base64 payload, no data: prefix */
  data: string;
  /** image/png, image/jpeg, etc. */
  mimeType: string;
  /** Rebuilt data:URL for convenience when you just want to pass around */
  dataUrl: string;
}

export async function imageToInlineBase64(input: string): Promise<InlineImage> {
  if (input.startsWith("data:")) {
    const [meta, data] = input.split(",");
    if (!data) throw new Error("Malformed data URL (no comma)");
    const mimeType = meta.replace(/^data:/, "").replace(/;base64$/, "") || "image/png";
    return { data, mimeType, dataUrl: input };
  }

  if (!/^https?:\/\//i.test(input)) {
    throw new Error(`Unsupported image reference: ${input.slice(0, 60)}`);
  }

  const res = await fetch(input, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "image/*",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${input.slice(0, 80)}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Upstream returned non-image content-type: ${contentType || "unknown"}`);
  }
  const buf = await res.arrayBuffer();
  const data = Buffer.from(buf).toString("base64");
  return {
    data,
    mimeType: contentType,
    dataUrl: `data:${contentType};base64,${data}`,
  };
}
