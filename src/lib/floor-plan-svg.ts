/**
 * Matterport Schematic Floor Plan SVG parser.
 *
 * Matterport's "Export → Schematic Floor Plan" gives PDF, SVG, or PNG. The
 * SVG is the gold path: text labels and dimensions are real <text> elements
 * with exact (x,y) coordinates, so we can pair them by spatial proximity
 * without OCR. Result is fast (no Tesseract download), accurate (no
 * mis-recognized characters), and works on any size.
 *
 * For PDF + PNG schematic exports, the existing OCR path still applies.
 */

import type { DetectedRoom } from "./floor-plan-ocr";
import { ROOM_KEYWORDS, parseDimensionOnly, prettifyLabel, guessRoomType } from "./floor-plan-ocr";

/**
 * Per-room SVG bounding box: where in the SVG's coordinate space this room
 * lives. Used to crop the floor plan so each room shows only its own walls,
 * doors, and windows in the Space Planner backdrop.
 */
export interface SvgBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SvgDetectedRoom extends DetectedRoom {
  svgBBox?: SvgBBox;
}

/** True if the data: URL or raw text appears to be SVG. */
export function isSvgSource(input: string): boolean {
  return (
    input.startsWith("data:image/svg+xml") ||
    /^\s*<\?xml[^>]*\?>\s*<svg/i.test(input) ||
    /^\s*<svg[\s>]/i.test(input)
  );
}

/** Decode a data:image/svg+xml URL to raw SVG text. Pass-through if already raw. */
export async function readSvgText(input: string): Promise<string> {
  if (input.startsWith("data:image/svg+xml")) {
    const comma = input.indexOf(",");
    if (comma === -1) throw new Error("Malformed SVG data URL");
    const meta = input.slice(0, comma);
    const payload = input.slice(comma + 1);
    if (meta.includes("base64")) {
      return atob(payload);
    }
    return decodeURIComponent(payload);
  }
  // Otherwise assume raw SVG text was passed
  return input;
}

interface SvgTextNode {
  text: string;
  x: number;
  y: number;
}

/**
 * Extract every <text>/<tspan> in the SVG with its accumulated position.
 * Walks the tree manually so we can sum nested <g transform="translate(...)">
 * offsets — Matterport's exports nest text inside translated groups.
 */
function extractTextNodes(svgText: string): SvgTextNode[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("Could not parse SVG — file may be corrupted or not valid SVG.");
  }
  const out: SvgTextNode[] = [];

  function walk(node: Element, dx: number, dy: number) {
    let nx = dx;
    let ny = dy;
    const transform = node.getAttribute("transform") ?? "";
    const translate = parseTranslate(transform);
    nx += translate.x;
    ny += translate.y;

    if (node.tagName.toLowerCase() === "text" || node.tagName.toLowerCase() === "tspan") {
      const tx = parseFloat(node.getAttribute("x") ?? "0");
      const ty = parseFloat(node.getAttribute("y") ?? "0");
      const text = (node.textContent ?? "").trim();
      if (text) {
        out.push({ text, x: nx + tx, y: ny + ty });
      }
      // Continue walking children — tspans inside text — but use accumulated text-element coords
    }
    for (const child of Array.from(node.children)) {
      walk(child, nx, ny);
    }
  }

  const root = doc.documentElement;
  if (root) walk(root, 0, 0);
  return out;
}

/**
 * Resolve each label's TRUE position in the SVG's coordinate space by
 * mounting the SVG offscreen and asking the browser for the rendered
 * center of each matching <text>. This handles Matterport's nested
 * matrix() transforms that our hand-rolled translate()-only walker can't.
 *
 * Returns a map from rawText → { x, y } in the SVG's resolved coord space
 * (matches viewBox).
 */
function resolveLabelPositions(
  svgText: string,
  labels: string[]
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (typeof document === "undefined") return out;

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.width = "1200px";
  host.style.height = "1200px";
  host.style.visibility = "hidden";
  host.style.pointerEvents = "none";
  host.innerHTML = svgText;
  document.body.appendChild(host);

  try {
    const svg = host.querySelector("svg") as SVGSVGElement | null;
    if (!svg) return out;
    const allTexts = Array.from(svg.querySelectorAll("text, tspan")) as SVGGraphicsElement[];
    for (const label of labels) {
      if (out.has(label)) continue;
      const match = allTexts.find(t => (t.textContent ?? "").trim() === label.trim());
      if (!match) continue;
      try {
        const bb = match.getBBox();
        out.set(label, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
      } catch {
        // ignore
      }
    }
  } finally {
    document.body.removeChild(host);
  }
  return out;
}

/**
 * Pixel-perfect bbox detection by rasterizing the SVG and flood-filling
 * outward from each room's label position.
 *
 * Why this works:
 *   - Matterport schematic SVGs render with white interiors and dark walls
 *   - A flood fill from a room label spreads through the room's interior
 *     and stops at the walls — boundary pixels of the fill = the room's
 *     exact polygon
 *   - The bbox of the filled pixels IS the room's bounding rectangle, with
 *     wall accuracy down to a single pixel of resolution
 *
 * Caveat: doors in Matterport are drawn as wall cutouts (the wall has a
 * white gap with an arc showing the swing). Flood fill will leak through
 * that gap into the next room. Defense: we INTERSECT the flood-fill bbox
 * with the nearest-neighbor Voronoi bbox so a leak can't blow up the
 * room's bbox to the whole house.
 *
 * Returns null entries if rasterization fails (e.g., browser blocks the
 * SVG-as-image load); caller falls back to nearest-neighbor bbox alone.
 */
interface FloodFillResult {
  bbox: SvgBBox;
  /** Centroid of filled pixels in SVG coords — more accurate than bbox center */
  cx: number;
  cy: number;
  /** Total filled area in SVG units² — used to estimate units-per-foot */
  area: number;
}

async function detectRoomBBoxesByFloodFill(
  svgText: string,
  labelPositions: { label: string; x: number; y: number }[]
): Promise<(FloodFillResult | null)[]> {
  if (typeof document === "undefined" || labelPositions.length === 0) {
    return labelPositions.map(() => null);
  }

  // Render at this resolution. 1600 keeps each room ~50-200 px wide for the
  // Seneca-sized house, which is enough for stable flood fills, and the
  // total raster (1600² × 4 = ~10 MB) fits comfortably in memory.
  const RASTER = 1600;

  // Parse SVG to grab viewBox so we can map svg coords → pixel coords
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const svgEl = doc.querySelector("svg");
  if (!svgEl) return labelPositions.map(() => null);

  let vb: { x: number; y: number; width: number; height: number };
  const vbAttr = svgEl.getAttribute("viewBox");
  if (vbAttr) {
    const parts = vbAttr.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(n => Number.isFinite(n))) {
      vb = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    } else return labelPositions.map(() => null);
  } else {
    const w = parseFloat(svgEl.getAttribute("width") ?? "0");
    const h = parseFloat(svgEl.getAttribute("height") ?? "0");
    if (!w || !h) return labelPositions.map(() => null);
    vb = { x: 0, y: 0, width: w, height: h };
    svgEl.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }

  // Make sure it'll rasterize at our target resolution
  const aspect = vb.width / vb.height;
  const RW = aspect >= 1 ? RASTER : Math.round(RASTER * aspect);
  const RH = aspect >= 1 ? Math.round(RASTER / aspect) : RASTER;

  // Force a white background so the fill has somewhere to spread (Matterport
  // SVGs sometimes have transparent backgrounds, which kills the heuristic)
  if (!svgEl.getAttribute("style")?.includes("background")) {
    svgEl.setAttribute("style", `background:#fff; ${svgEl.getAttribute("style") ?? ""}`);
  }
  const wrappedSvg = new XMLSerializer().serializeToString(svgEl);

  const blob = new Blob([wrappedSvg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  let pixels: Uint8ClampedArray;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG image load failed"));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = RW;
    canvas.height = RH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return labelPositions.map(() => null);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, RW, RH);
    ctx.drawImage(img, 0, 0, RW, RH);
    pixels = ctx.getImageData(0, 0, RW, RH).data;
  } catch {
    return labelPositions.map(() => null);
  } finally {
    URL.revokeObjectURL(url);
  }

  // Map SVG coords → raster pixel coords
  function svgToPx(sx: number, sy: number): [number, number] {
    return [
      Math.round(((sx - vb.x) / vb.width) * RW),
      Math.round(((sy - vb.y) / vb.height) * RH),
    ];
  }
  function pxToSvgX(px: number): number { return (px / RW) * vb.width + vb.x; }
  function pxToSvgY(py: number): number { return (py / RH) * vb.height + vb.y; }

  // Threshold: anything darker than this is treated as a wall/boundary.
  // Matterport draws walls solid black; text is also dark but small enough
  // that the fill goes around it without being meaningfully blocked.
  const DARK = 200;
  function isWall(idx: number): boolean {
    const p = idx * 4;
    return (pixels[p] + pixels[p + 1] + pixels[p + 2]) / 3 < DARK;
  }

  const out: (FloodFillResult | null)[] = [];
  // Per-pixel svg-unit dimensions so we can convert area/centroid correctly
  const unitPerPxX = vb.width / RW;
  const unitPerPxY = vb.height / RH;
  const unitPerPx2 = unitPerPxX * unitPerPxY;

  for (const lp of labelPositions) {
    let [sx, sy] = svgToPx(lp.x, lp.y);
    if (sx < 0 || sx >= RW || sy < 0 || sy >= RH) {
      out.push(null);
      continue;
    }

    // If the label pixel itself is a wall (text happens to overlap a line),
    // search outward for the nearest non-wall pixel. Room labels sit inside
    // the room >99% of the time, so a few-pixel nudge is enough.
    if (isWall(sy * RW + sx)) {
      let found = false;
      for (let r = 1; r < 20 && !found; r++) {
        for (let dy = -r; dy <= r && !found; dy++) {
          for (let dx = -r; dx <= r && !found; dx++) {
            const nx = sx + dx, ny = sy + dy;
            if (nx < 0 || nx >= RW || ny < 0 || ny >= RH) continue;
            if (!isWall(ny * RW + nx)) {
              sx = nx; sy = ny;
              found = true;
            }
          }
        }
      }
      if (!found) { out.push(null); continue; }
    }

    // Flood-fill (4-connected) from the label position. Hard cap on filled
    // pixels (50% of raster) so a door leak can't run away with the whole
    // house.
    const visited = new Uint8Array(RW * RH);
    const FILL_CAP = Math.floor(RW * RH * 0.5);
    let filled = 0;
    let minX = sx, maxX = sx, minY = sy, maxY = sy;
    let sumX = 0, sumY = 0;

    const queue = new Int32Array(RW * RH);
    let qHead = 0, qTail = 0;
    queue[qTail++] = sy * RW + sx;
    visited[sy * RW + sx] = 1;

    while (qHead < qTail && filled < FILL_CAP) {
      const idx = queue[qHead++];
      if (isWall(idx)) continue;
      filled++;
      const x = idx % RW;
      const y = (idx - x) / RW;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbors = [idx - 1, idx + 1, idx - RW, idx + RW];
      for (const n of neighbors) {
        if (n < 0 || n >= RW * RH) continue;
        if (n === idx - 1 && x === 0) continue;
        if (n === idx + 1 && x === RW - 1) continue;
        if (visited[n]) continue;
        visited[n] = 1;
        queue[qTail++] = n;
      }
    }

    if (filled < 25) {
      out.push(null);
      continue;
    }

    out.push({
      bbox: {
        x: pxToSvgX(minX),
        y: pxToSvgY(minY),
        width: pxToSvgX(maxX) - pxToSvgX(minX),
        height: pxToSvgY(maxY) - pxToSvgY(minY),
      },
      cx: pxToSvgX(sumX / filled),
      cy: pxToSvgY(sumY / filled),
      area: filled * unitPerPx2,
    });
  }

  return out;
}

/**
 * Intersect two bboxes — returns the overlap, or null if they don't overlap.
 */
function intersectBBox(a: SvgBBox, b: SvgBBox): SvgBBox | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/**
 * Compute per-room bounding boxes from the SVG.
 *
 * Matterport's schematic SVGs are flat (every room is a sibling, not nested
 * inside its own <g>). So we can't just walk up parents to find the room
 * group — that picks the whole house. Instead we use a Voronoi-style
 * heuristic:
 *
 *   1. Use the label position as the room's center
 *   2. Find the nearest other room label — half the distance to it is the
 *      room's effective "reach" in any direction
 *   3. Build a bbox of that reach, sized in the room's actual widthFt:lengthFt
 *      aspect ratio so it shows as a portrait/landscape rectangle (not square)
 *   4. Clamp to the SVG's overall bbox
 *
 * Result: each room gets a believable rectangular region of the floor plan
 * that doesn't overlap into its neighbors. The SVG inside that region — walls,
 * doors, windows, fixtures — renders accurately.
 */
function computeRoomBBoxes(
  svgText: string,
  labelPositions: { label: string; x: number; y: number; widthFt?: number; lengthFt?: number }[]
): (SvgBBox | null)[] {
  if (typeof document === "undefined") return labelPositions.map(() => null);
  if (labelPositions.length === 0) return [];

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.width = "1000px";
  host.style.height = "1000px";
  host.style.visibility = "hidden";
  host.style.pointerEvents = "none";
  host.innerHTML = svgText;
  document.body.appendChild(host);

  const out: (SvgBBox | null)[] = [];
  try {
    const svg = host.querySelector("svg") as SVGSVGElement | null;
    if (!svg) {
      for (let i = 0; i < labelPositions.length; i++) out.push(null);
      return out;
    }

    let rootBBox: { x: number; y: number; width: number; height: number };
    try {
      const bb = (svg as unknown as SVGGraphicsElement).getBBox();
      rootBBox = { x: bb.x, y: bb.y, width: bb.width, height: bb.height };
    } catch {
      // Fall back to the SVG's declared viewBox
      const vb = svg.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
      rootBBox = vb && vb.length === 4
        ? { x: vb[0], y: vb[1], width: vb[2], height: vb[3] }
        : { x: 0, y: 0, width: 1000, height: 1000 };
    }

    for (let i = 0; i < labelPositions.length; i++) {
      const lp = labelPositions[i];

      // Distance to nearest other label
      let nearestDist = Infinity;
      for (let j = 0; j < labelPositions.length; j++) {
        if (i === j) continue;
        const other = labelPositions[j];
        const d = Math.hypot(lp.x - other.x, lp.y - other.y);
        if (d < nearestDist) nearestDist = d;
      }
      // If only one room, use a fraction of the house bbox
      if (!Number.isFinite(nearestDist)) {
        nearestDist = Math.min(rootBBox.width, rootBBox.height) / 2;
      }

      // Half-distance to nearest = the maximum diagonal half of this room.
      // Convert to a per-axis bbox using the room's aspect ratio.
      const halfReach = nearestDist * 0.55; // slight overshoot so walls land inside
      const aspect =
        lp.widthFt && lp.lengthFt && lp.lengthFt > 0
          ? lp.widthFt / lp.lengthFt
          : 1;

      // Solve for halfW, halfH so that hypot(halfW, halfH) = halfReach
      // and halfW / halfH = aspect.
      // halfW = aspect * halfH; (aspect² + 1) * halfH² = halfReach²
      const halfH = halfReach / Math.sqrt(aspect * aspect + 1);
      const halfW = aspect * halfH;

      let x = lp.x - halfW;
      let y = lp.y - halfH;
      let w = halfW * 2;
      let h = halfH * 2;

      // Clamp to root bbox
      if (x < rootBBox.x) { w -= rootBBox.x - x; x = rootBBox.x; }
      if (y < rootBBox.y) { h -= rootBBox.y - y; y = rootBBox.y; }
      if (x + w > rootBBox.x + rootBBox.width) w = rootBBox.x + rootBBox.width - x;
      if (y + h > rootBBox.y + rootBBox.height) h = rootBBox.y + rootBBox.height - y;

      out.push({ x, y, width: w, height: h });
    }
  } finally {
    document.body.removeChild(host);
  }

  return out;
}

function parseTranslate(transform: string): { x: number; y: number } {
  // Match translate(x, y) or translate(x y) — first occurrence is enough for our needs
  const m = transform.match(/translate\(\s*(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)?\s*\)/);
  if (!m) return { x: 0, y: 0 };
  return { x: parseFloat(m[1]), y: m[2] ? parseFloat(m[2]) : 0 };
}

/**
 * Detect rooms from a Matterport schematic SVG. Same return shape as the OCR
 * detector so the existing review UI works without changes.
 *
 * Strategy:
 *  1. Same-text-node label+dimension (e.g. "BEDROOM 13'8" × 11'7"")
 *  2. Otherwise pair each label-node with its nearest dimension-node
 */
export async function detectRoomsFromSvg(svgInput: string): Promise<SvgDetectedRoom[]> {
  const svgText = await readSvgText(svgInput);
  const nodes = extractTextNodes(svgText);

  const detected: SvgDetectedRoom[] = [];

  // Pass 1: label + dim on the same node
  const consumed = new Set<number>();
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const dim = parseDimensionOnly(n.text);
    const lbl = matchLabel(n.text);
    if (dim && lbl) {
      detected.push({
        rawText: n.text,
        label: prettifyLabel(lbl.label, lbl.type, lbl.override),
        normalizedLabel: lbl.label.toLowerCase().trim(),
        widthFt: dim.widthFt,
        lengthFt: dim.lengthFt,
        bbox: { x0: n.x, y0: n.y, x1: n.x, y1: n.y },
        confidence: 1, // SVG text is exact; no recognition uncertainty
        guessedType: lbl.type,
      });
      consumed.add(i);
    }
  }

  // Pass 2: pair separate label and dimension nodes by proximity
  if (detected.length === 0 || true) {
    const labels: { idx: number; text: string; type: import("./types").RoomType; override?: string; x: number; y: number }[] = [];
    const dims: { idx: number; widthFt: number; lengthFt: number; x: number; y: number }[] = [];
    for (let i = 0; i < nodes.length; i++) {
      if (consumed.has(i)) continue;
      const n = nodes[i];
      const dim = parseDimensionOnly(n.text);
      const lbl = matchLabel(n.text);
      if (dim && !lbl) dims.push({ idx: i, widthFt: dim.widthFt, lengthFt: dim.lengthFt, x: n.x, y: n.y });
      if (lbl && !dim) labels.push({ idx: i, text: lbl.label, type: lbl.type, override: lbl.override, x: n.x, y: n.y });
    }

    for (const lab of labels) {
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let j = 0; j < dims.length; j++) {
        const d = dims[j];
        const dist = Math.hypot(d.x - lab.x, d.y - lab.y);
        if (dist < bestDist) { bestDist = dist; bestIdx = j; }
      }
      if (bestIdx >= 0) {
        const d = dims[bestIdx];
        detected.push({
          rawText: `${lab.text} ${d.widthFt}' × ${d.lengthFt}'`,
          label: prettifyLabel(lab.text, lab.type, lab.override),
          normalizedLabel: lab.text.toLowerCase().trim(),
          widthFt: d.widthFt,
          lengthFt: d.lengthFt,
          bbox: { x0: Math.min(lab.x, d.x), y0: Math.min(lab.y, d.y), x1: Math.max(lab.x, d.x), y1: Math.max(lab.y, d.y) },
          confidence: 1,
          guessedType: lab.type,
        });
        // Don't reuse the same dimension twice
        dims.splice(bestIdx, 1);
      }
    }
  }

  // Dedupe identical labels with very similar dimensions
  const deduped: SvgDetectedRoom[] = [];
  const seen = new Set<string>();
  for (const r of detected) {
    const key = `${r.normalizedLabel}-${Math.round(r.widthFt)}-${Math.round(r.lengthFt)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }

  // Enrich each detected room with an SVG bounding box. Three stages:
  //
  //   1. Resolve label positions via the browser's getBBox() — handles
  //      Matterport's matrix() transforms that our translate()-only
  //      walker can't.
  //   2. Flood-fill from each resolved label — gets pixel-accurate
  //      centroid (room's visual center) and interior area.
  //   3. Build the final bbox at the room's real aspect ratio, sized
  //      from a globally-estimated units-per-foot (median across rooms,
  //      robust to one bad flood).
  //
  // End result: every room's bbox has the right aspect, correct scale
  // relative to the SVG, and is centered on the room's actual interior
  // (not a label that might sit near the wall).
  if (deduped.length > 0) {
    // Resolve label positions via DOM (handles matrix() transforms)
    const resolved = resolveLabelPositions(svgText, deduped.map(r => r.rawText));
    const labelPositions = deduped.map(r => {
      const r0 = resolved.get(r.rawText);
      return {
        label: r.rawText,
        // Prefer the DOM-resolved position; fall back to the hand-parsed one
        x: r0?.x ?? (r.bbox.x0 + r.bbox.x1) / 2,
        y: r0?.y ?? (r.bbox.y0 + r.bbox.y1) / 2,
        widthFt: r.widthFt,
        lengthFt: r.lengthFt,
      };
    });

    let flood: (FloodFillResult | null)[] = [];
    try {
      flood = await detectRoomBBoxesByFloodFill(svgText, labelPositions);
    } catch {
      flood = labelPositions.map(() => null);
    }

    // Estimate SVG units per foot as the median of sqrt(floodArea / roomSqft)
    // across all successful floods. Median is robust to one or two bad
    // fills that leaked through doors.
    const upfCandidates: number[] = [];
    for (let i = 0; i < deduped.length; i++) {
      const f = flood[i];
      const r = deduped[i];
      if (!f || !r.widthFt || !r.lengthFt) continue;
      const roomSqft = r.widthFt * r.lengthFt;
      if (roomSqft <= 0) continue;
      upfCandidates.push(Math.sqrt(f.area / roomSqft));
    }
    upfCandidates.sort((a, b) => a - b);
    const medianUpf = upfCandidates.length > 0
      ? upfCandidates[Math.floor(upfCandidates.length / 2)]
      : null;

    // Voronoi as a defensive cap — flood leaks can push the centroid a bit
    // into the neighboring room; intersecting against Voronoi keeps it sane.
    const voronoi = computeRoomBBoxes(svgText, labelPositions);

    for (let i = 0; i < deduped.length; i++) {
      const f = flood[i];
      const v = voronoi[i];
      const r = deduped[i];

      // Preferred: build bbox at room aspect, centered on flood centroid,
      // sized by global units-per-foot. Guarantees correct aspect + scale.
      if (f && medianUpf && r.widthFt && r.lengthFt) {
        const w = r.widthFt * medianUpf;
        const h = r.lengthFt * medianUpf;
        const built: SvgBBox = {
          x: f.cx - w / 2,
          y: f.cy - h / 2,
          width: w,
          height: h,
        };
        // Clip to Voronoi if available so we don't extend into neighbors
        deduped[i].svgBBox = v ? (intersectBBox(built, v) ?? built) : built;
        continue;
      }

      // Fallback: flood bbox ∩ voronoi, or whichever is available
      if (f && v) {
        deduped[i].svgBBox = intersectBBox(f.bbox, v) ?? f.bbox;
      } else if (f) {
        deduped[i].svgBBox = f.bbox;
      } else if (v) {
        deduped[i].svgBBox = v;
      }
    }
  }

  return deduped;
}

// Matterport schematic SVGs include overlay text that isn't a room (page
// totals, the floor banner, the "GROSS INTERNAL AREA" callout, the
// "EXCLUDED AREA" disclaimer). Reject these before they get matched as
// rooms.
function isOverlayLabel(text: string): boolean {
  const upper = text.toUpperCase();
  if (upper.includes("EXCLUDED AREA")) return true;
  if (upper.includes("GROSS INTERNAL")) return true;
  if (upper.includes("TOTAL:")) return true;
  if (/\bSQ\s*FT\b/.test(upper)) return true;
  if (/^FLOOR\s+\d+\s*$/.test(upper.trim())) return true;
  if (/^FLOOR\s+\d+\s*:/.test(upper.trim())) return true;
  return false;
}

function matchLabel(text: string): { label: string; type: import("./types").RoomType; override?: string } | null {
  if (isOverlayLabel(text)) return null;
  const lower = text.toLowerCase();
  for (const entry of ROOM_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) {
        return { label: text, type: entry.type, override: entry.label };
      }
    }
  }
  return null;
}

// Re-export so callers can use guessRoomType etc. without importing the OCR module
export { guessRoomType };
