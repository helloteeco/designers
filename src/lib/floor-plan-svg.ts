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

  // Enrich each detected room with an SVG bounding box. We pass the known
  // dimensions (widthFt, lengthFt) so the bbox heuristic uses the right
  // aspect ratio — landscape rooms get landscape bboxes, not squares.
  if (deduped.length > 0) {
    const labelPositions = deduped.map(r => ({
      label: r.rawText,
      x: (r.bbox.x0 + r.bbox.x1) / 2,
      y: (r.bbox.y0 + r.bbox.y1) / 2,
      widthFt: r.widthFt,
      lengthFt: r.lengthFt,
    }));
    const bboxes = computeRoomBBoxes(svgText, labelPositions);
    for (let i = 0; i < deduped.length; i++) {
      const bb = bboxes[i];
      if (bb) {
        deduped[i].svgBBox = bb;
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
