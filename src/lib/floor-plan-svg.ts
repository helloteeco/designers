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
export async function detectRoomsFromSvg(svgInput: string): Promise<DetectedRoom[]> {
  const svgText = await readSvgText(svgInput);
  const nodes = extractTextNodes(svgText);

  const detected: DetectedRoom[] = [];

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
  const deduped: DetectedRoom[] = [];
  const seen = new Set<string>();
  for (const r of detected) {
    const key = `${r.normalizedLabel}-${Math.round(r.widthFt)}-${Math.round(r.lengthFt)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  return deduped;
}

function matchLabel(text: string): { label: string; type: import("./types").RoomType; override?: string } | null {
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
