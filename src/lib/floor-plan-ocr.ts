/**
 * Floor plan OCR — extract room labels and dimensions from Matterport
 * and similar architect-generated plans using Tesseract.js in-browser.
 *
 * Matterport Floor Plan Service output is ideal: cleanly typeset,
 * consistent "ROOM NAME 13'8" x 11'7"" format. Accuracy ~85-95% on
 * those plans. Lower on hand-drawn / photos.
 *
 * Designer always confirms results before we create/update rooms.
 */

import type { RoomType, RoomAnnotation } from "./types";

export interface DetectedRoom {
  rawText: string;
  label: string;           // e.g. "Primary Suite"
  normalizedLabel: string; // e.g. "primary suite" (for matching)
  widthFt: number;
  lengthFt: number;
  bbox: { x0: number; y0: number; x1: number; y1: number }; // image pixel coords
  confidence: number;      // 0-1, Tesseract word confidence averaged
  guessedType: RoomType;
}

// ── Regex for dimensions ──
// Matches: 13'8" x 11'7"  |  13' x 11'  |  13.5' × 11.5'  |  13 x 11
const DIMENSION_RE = new RegExp(
  [
    "(\\d+(?:\\.\\d+)?)",           // width feet
    "['']?",
    "(?:\\s*(\\d+)[\"\"″]?)?",      // optional width inches
    "\\s*[x×X]\\s*",                // separator
    "(\\d+(?:\\.\\d+)?)",           // length feet
    "['']?",
    "(?:\\s*(\\d+)[\"\"″]?)?",      // optional length inches
  ].join(""),
  "g"
);

// Metric: 2.63 m x 5.92 m  |  2.63m × 5.92m  |  2.63 m X 5.92 m
const METRIC_DIMENSION_RE = /(\d+(?:\.\d+)?)\s*m\s*[x×X]\s*(\d+(?:\.\d+)?)\s*m/g;

const M_TO_FT = 3.28084;

// ── Room-type vocabulary ──
// Order matters — more specific keywords come first so "primary bathroom"
// matches before generic "bathroom", and "walk-in closet / w.i.c" matches
// before "closet".
export const ROOM_KEYWORDS: { keywords: string[]; type: RoomType; label?: string }[] = [
  { keywords: ["primary suite", "primary bedroom", "master suite", "master bedroom"], type: "primary-bedroom", label: "Primary Suite" },
  { keywords: ["bedroom", "bed rm", "br "], type: "bedroom" },
  { keywords: ["loft"], type: "loft" },
  { keywords: ["bonus", "bonus room"], type: "bonus-room" },
  { keywords: ["primary bath", "master bath", "en-suite", "ensuite"], type: "bathroom", label: "Primary Bathroom" },
  { keywords: ["half bath", "powder"], type: "bathroom", label: "Half Bath" },
  { keywords: ["bathroom", "bath rm", "bath"], type: "bathroom" },
  { keywords: ["kitchen"], type: "kitchen" },
  { keywords: ["dining"], type: "dining-room" },
  { keywords: ["great room", "living room", "family room", "living"], type: "living-room" },
  { keywords: ["den", "study"], type: "den" },
  { keywords: ["office"], type: "office" },
  { keywords: ["media", "theater"], type: "media-room" },
  { keywords: ["game", "rec"], type: "game-room" },
  // Utility rooms — all Matterport labels them
  { keywords: ["laundry", "mud"], type: "laundry", label: "Laundry" },
  { keywords: ["storage", "pantry", "utility"], type: "storage" },
  { keywords: ["walk-in closet", "walk in closet", "w.i.c", "wic"], type: "closet", label: "Walk-in Closet" },
  { keywords: ["closet"], type: "closet" },
  { keywords: ["hallway", "hall", "entry", "foyer"], type: "hallway" },
  { keywords: ["porch", "deck", "patio", "balcony", "outdoor"], type: "outdoor" },
];

// ── Tesseract loader (dynamic import) ──

let _tesseractPromise: Promise<typeof import("tesseract.js")> | null = null;
function loadTesseract() {
  if (!_tesseractPromise) {
    _tesseractPromise = import("tesseract.js");
  }
  return _tesseractPromise;
}

// ── Canvas pre-processing ──
//
// Tesseract does noticeably better on floor plans when we hand it a large,
// high-contrast grayscale image. Pipeline: upscale so the longest side is
// at least 1600px (small phone photos / thumbnail exports), grayscale,
// linear contrast stretch between the 1st/99th-percentile luminance, then
// a LIGHT threshold that pushes near-white paper to pure white and near-
// black ink to pure black while keeping midtones (pencil, shading) intact.
//
// Bounding boxes from Tesseract come back in the PREPROCESSED image's pixel
// space — detectRoomsFromImage divides them back by `scale` so callers
// always receive bboxes in the ORIGINAL image's pixel coordinates.

const OCR_MIN_LONG_SIDE = 1600;

interface PreprocessedImage {
  /** Data URL (or the original input when preprocessing isn't possible). */
  source: string;
  /** Upscale factor applied (1 = none). Divide bboxes by this. */
  scale: number;
}

async function preprocessImageForOcr(imageUrl: string): Promise<PreprocessedImage> {
  if (typeof document === "undefined") return { source: imageUrl, scale: 1 };

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image load failed"));
      el.src = imageUrl;
    });

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return { source: imageUrl, scale: 1 };

    const longSide = Math.max(w, h);
    const scale = longSide < OCR_MIN_LONG_SIDE ? OCR_MIN_LONG_SIDE / longSide : 1;
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { source: imageUrl, scale: 1 };

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#fff"; // flatten transparency (PNG plans) to white paper
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);

    // getImageData throws on cross-origin-tainted canvases — fall back to
    // the untouched source in that case.
    const imageData = ctx.getImageData(0, 0, cw, ch);
    const px = imageData.data;

    // Luminance histogram → robust min/max (1st / 99th percentile) so a
    // single stray pixel can't wreck the stretch.
    const hist = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) {
      const lum = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) | 0;
      hist[lum]++;
    }
    const total = cw * ch;
    const cut = Math.max(1, Math.floor(total * 0.01));
    let lo = 0;
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= cut) { lo = v; break; } }
    let hi = 255;
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= cut) { hi = v; break; } }
    if (hi - lo < 16) { lo = 0; hi = 255; } // nearly flat image — skip stretch

    const range = hi - lo;
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      // Linear contrast stretch
      let v = ((lum - lo) / range) * 255;
      if (v < 0) v = 0;
      else if (v > 255) v = 255;
      // Light threshold: clean paper → white, ink → black, keep midtones
      if (v >= 210) v = 255;
      else if (v <= 50) v = 0;
      px[i] = px[i + 1] = px[i + 2] = v;
      px[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    return { source: canvas.toDataURL("image/png"), scale };
  } catch {
    // Any failure (tainted canvas, decode error, memory) → OCR the original.
    return { source: imageUrl, scale: 1 };
  }
}

// ── Main OCR entry point ──

export async function detectRoomsFromImage(
  imageUrl: string,
  onProgress?: (pct: number, status: string) => void
): Promise<DetectedRoom[]> {
  const Tesseract = await loadTesseract();
  onProgress?.(5, "Loading OCR engine...");

  onProgress?.(10, "Sharpening floor plan image...");
  const pre = await preprocessImageForOcr(imageUrl);

  const worker = await Tesseract.createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(20 + m.progress * 70, "Reading floor plan text...");
      }
    },
  });

  try {
    const { data } = await worker.recognize(pre.source);
    onProgress?.(95, "Parsing room data...");
    const rooms = parseRooms(data);
    // Tesseract bboxes are in the preprocessed (possibly upscaled) image's
    // pixel space — map back to ORIGINAL image pixels so downstream
    // consumers (annotationFromBBox etc.) can use the plan's natural size.
    if (pre.scale !== 1) {
      for (const r of rooms) {
        r.bbox = {
          x0: r.bbox.x0 / pre.scale,
          y0: r.bbox.y0 / pre.scale,
          x1: r.bbox.x1 / pre.scale,
          y1: r.bbox.y1 / pre.scale,
        };
      }
    }
    onProgress?.(100, `Found ${rooms.length} rooms`);
    return rooms;
  } finally {
    await worker.terminate();
  }
}

// ── Pixel bbox → plan annotation ──

/**
 * Convert a pixel-space bounding box (e.g. a DetectedRoom.bbox from OCR)
 * into a RoomAnnotation: percentages (0-100) of the plan image, clamped,
 * with a small ~2% breathing-room padding on every side so the annotation
 * comfortably covers the room label it came from.
 */
export function annotationFromBBox(
  bbox: { x0: number; y0: number; x1: number; y1: number },
  imageW: number,
  imageH: number,
  floorPlanId: string
): RoomAnnotation {
  const PAD_PCT = 2;
  const w = Math.max(1, imageW);
  const h = Math.max(1, imageH);
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const round2 = (v: number) => Math.round(v * 100) / 100;

  const x0 = clamp((Math.min(bbox.x0, bbox.x1) / w) * 100 - PAD_PCT);
  const y0 = clamp((Math.min(bbox.y0, bbox.y1) / h) * 100 - PAD_PCT);
  const x1 = clamp((Math.max(bbox.x0, bbox.x1) / w) * 100 + PAD_PCT);
  const y1 = clamp((Math.max(bbox.y0, bbox.y1) / h) * 100 + PAD_PCT);

  return {
    floorPlanId,
    x: round2(x0),
    y: round2(y0),
    width: round2(x1 - x0),
    height: round2(y1 - y0),
  };
}

// ── Parsing ──

interface OCRLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** Extract lines with their bounding boxes from Tesseract result */
function extractLines(data: unknown): OCRLine[] {
  const lines: OCRLine[] = [];
  const d = data as {
    lines?: Array<{
      text: string;
      confidence?: number;
      bbox?: { x0: number; y0: number; x1: number; y1: number };
      words?: Array<{
        bbox?: { x0: number; y0: number; x1: number; y1: number };
        confidence?: number;
      }>;
    }>;
    text?: string;
  };

  if (Array.isArray(d.lines)) {
    for (const line of d.lines) {
      const text = (line.text ?? "").trim();
      if (!text) continue;
      // Use line bbox if available, otherwise derive from word bboxes
      let bbox = line.bbox;
      if (!bbox && line.words && line.words.length > 0) {
        const xs = line.words.map((w) => w.bbox).filter(Boolean) as { x0: number; x1: number; y0: number; y1: number }[];
        if (xs.length > 0) {
          bbox = {
            x0: Math.min(...xs.map((b) => b.x0)),
            y0: Math.min(...xs.map((b) => b.y0)),
            x1: Math.max(...xs.map((b) => b.x1)),
            y1: Math.max(...xs.map((b) => b.y1)),
          };
        }
      }
      lines.push({
        text,
        confidence: (line.confidence ?? 0) / 100,
        bbox: bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
      });
    }
  } else if (typeof d.text === "string") {
    // Fallback: split text by newline, no bboxes
    d.text.split("\n").forEach((text) => {
      const t = text.trim();
      if (t) lines.push({ text: t, confidence: 0.5, bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } });
    });
  }

  return lines;
}

function parseRooms(data: unknown): DetectedRoom[] {
  const lines = extractLines(data);
  const detected: DetectedRoom[] = [];

  // Strategy 1: label + dimensions on same line (Matterport format)
  for (const line of lines) {
    const result = parseRoomLine(line.text);
    if (result) {
      detected.push({
        rawText: line.text,
        label: result.label,
        normalizedLabel: result.label.toLowerCase().trim(),
        widthFt: result.widthFt,
        lengthFt: result.lengthFt,
        bbox: line.bbox,
        confidence: line.confidence,
        guessedType: guessRoomType(result.label),
      });
    }
  }

  // Strategy 2: if strategy 1 found nothing, try pairing separate lines
  if (detected.length === 0) {
    const labeled: { line: OCRLine; roomLabel: string; type: RoomType }[] = [];
    const dimensional: { line: OCRLine; widthFt: number; lengthFt: number }[] = [];

    for (const line of lines) {
      const dim = parseDimensionOnly(line.text);
      const lbl = extractLabel(line.text);
      if (dim && !lbl) dimensional.push({ line, ...dim });
      if (lbl && !dim) labeled.push({ line, roomLabel: lbl.label, type: lbl.type });
    }

    // Pair each label with nearest dimension
    for (const lab of labeled) {
      const nearest = findNearest(lab.line.bbox, dimensional.map((d) => d.line.bbox));
      if (nearest !== null) {
        const dim = dimensional[nearest];
        detected.push({
          rawText: `${lab.line.text} ${dim.line.text}`,
          label: lab.roomLabel,
          normalizedLabel: lab.roomLabel.toLowerCase(),
          widthFt: dim.widthFt,
          lengthFt: dim.lengthFt,
          bbox: mergeBbox(lab.line.bbox, dim.line.bbox),
          confidence: Math.min(lab.line.confidence, dim.line.confidence),
          guessedType: lab.type,
        });
      }
    }
  }

  // Dedupe: same label + similar dims = same room
  const deduped: DetectedRoom[] = [];
  const seen = new Set<string>();
  for (const room of detected) {
    const key = `${room.normalizedLabel}-${Math.round(room.widthFt)}-${Math.round(room.lengthFt)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(room);
  }

  return deduped;
}

/** Try to parse a single line that contains both label and dimensions. */
function parseRoomLine(text: string): { label: string; widthFt: number; lengthFt: number } | null {
  const dim = parseDimensionOnly(text);
  if (!dim) return null;

  // Remove the dimension portion from the line to get the label
  const dimMatch = text.match(new RegExp(DIMENSION_RE.source, "i"));
  if (!dimMatch) return null;
  const label = text.replace(dimMatch[0], "").trim()
    .replace(/[^a-zA-Z0-9\s\-&/]/g, "")  // strip stray punctuation
    .replace(/\s+/g, " ")
    .trim();

  if (!label || label.length < 2) return null;

  // Must match a known room keyword to avoid false positives
  const type = guessRoomType(label);
  // If no keyword matched, reject (label doesn't look like a room)
  const keywordHit = ROOM_KEYWORDS.some((k) =>
    k.keywords.some((kw) => label.toLowerCase().includes(kw))
  );
  if (!keywordHit) return null;

  // Check the override label for common types
  const pretty = prettifyLabel(label, type);

  return { label: pretty, widthFt: dim.widthFt, lengthFt: dim.lengthFt };
}

export function parseDimensionOnly(text: string): { widthFt: number; lengthFt: number; sourceUnit: "ft" | "m" } | null {
  // Try metric first (more specific pattern — requires "m" suffix)
  METRIC_DIMENSION_RE.lastIndex = 0;
  const metricMatch = METRIC_DIMENSION_RE.exec(text);
  if (metricMatch) {
    const wM = parseFloat(metricMatch[1]);
    const lM = parseFloat(metricMatch[2]);
    // Sanity: residential rooms 1m–20m
    if (wM >= 1 && wM <= 20 && lM >= 1 && lM <= 20) {
      return {
        widthFt: Math.round(wM * M_TO_FT * 10) / 10,
        lengthFt: Math.round(lM * M_TO_FT * 10) / 10,
        sourceUnit: "m",
      };
    }
  }

  // Fall back to imperial (feet + optional inches)
  DIMENSION_RE.lastIndex = 0;
  const match = DIMENSION_RE.exec(text);
  if (!match) return null;

  const wFt = parseFloat(match[1]);
  const wIn = match[2] ? parseInt(match[2]) : 0;
  const lFt = parseFloat(match[3]);
  const lIn = match[4] ? parseInt(match[4]) : 0;

  const width = wFt + wIn / 12;
  const length = lFt + lIn / 12;

  // Sanity: residential rooms range from ~2' closets to 60' great rooms
  if (width < 2 || width > 60 || length < 2 || length > 60) return null;

  return {
    widthFt: Math.round(width * 10) / 10,
    lengthFt: Math.round(length * 10) / 10,
    sourceUnit: "ft",
  };
}

function extractLabel(text: string): { label: string; type: RoomType } | null {
  const lower = text.toLowerCase();
  for (const entry of ROOM_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) {
        return {
          label: prettifyLabel(text, entry.type, entry.label),
          type: entry.type,
        };
      }
    }
  }
  return null;
}

export function guessRoomType(label: string): RoomType {
  const lower = label.toLowerCase();
  for (const entry of ROOM_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) return entry.type;
    }
  }
  return "bedroom";
}

export function prettifyLabel(raw: string, type: RoomType, override?: string): string {
  if (override) return override;
  // Title-case the raw label
  const trimmed = raw
    .replace(/[^a-zA-Z0-9\s\-&/]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed) return capitalize(type.replace(/-/g, " "));
  return trimmed
    .split(" ")
    .map((w) => (w.length > 2 ? capitalize(w.toLowerCase()) : w.toUpperCase()))
    .join(" ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function findNearest(
  target: { x0: number; y0: number; x1: number; y1: number },
  candidates: { x0: number; y0: number; x1: number; y1: number }[]
): number | null {
  if (candidates.length === 0) return null;
  const tc = { x: (target.x0 + target.x1) / 2, y: (target.y0 + target.y1) / 2 };
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const cc = { x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2 };
    const dx = tc.x - cc.x;
    const dy = tc.y - cc.y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function mergeBbox(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number }
) {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

// ── Matching detected rooms to existing project rooms ──

export interface RoomMatch {
  detected: DetectedRoom;
  existingRoomId: string | null;  // null = will create new
  action: "update" | "create" | "skip";
}

/**
 * Fuzzy-match detected rooms to existing project rooms by name.
 * Returns a proposal the designer can review.
 */
export function matchDetectedToExisting(
  detected: DetectedRoom[],
  existingRooms: { id: string; name: string; type: string }[]
): RoomMatch[] {
  const matches: RoomMatch[] = [];
  const usedIds = new Set<string>();

  for (const det of detected) {
    const detNorm = det.normalizedLabel;

    // Try exact name match first
    let match = existingRooms.find(
      (r) => !usedIds.has(r.id) && r.name.toLowerCase().trim() === detNorm
    );

    // Then substring match
    if (!match) {
      match = existingRooms.find(
        (r) =>
          !usedIds.has(r.id) &&
          (r.name.toLowerCase().includes(detNorm) || detNorm.includes(r.name.toLowerCase()))
      );
    }

    // Then type match (e.g. only one bedroom existing, detected 'Bedroom 2')
    if (!match) {
      match = existingRooms.find(
        (r) => !usedIds.has(r.id) && r.type === det.guessedType
      );
    }

    if (match) {
      usedIds.add(match.id);
      matches.push({ detected: det, existingRoomId: match.id, action: "update" });
    } else {
      matches.push({ detected: det, existingRoomId: null, action: "create" });
    }
  }

  return matches;
}
