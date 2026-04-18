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

import type { RoomType } from "./types";

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

// ── Room-type vocabulary ──
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

// ── Main OCR entry point ──

export async function detectRoomsFromImage(
  imageUrl: string,
  onProgress?: (pct: number, status: string) => void
): Promise<DetectedRoom[]> {
  const Tesseract = await loadTesseract();
  onProgress?.(5, "Loading OCR engine...");

  const worker = await Tesseract.createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(20 + m.progress * 70, "Reading floor plan text...");
      }
    },
  });

  try {
    const { data } = await worker.recognize(imageUrl);
    onProgress?.(95, "Parsing room data...");
    const rooms = parseRooms(data);
    onProgress?.(100, `Found ${rooms.length} rooms`);
    return rooms;
  } finally {
    await worker.terminate();
  }
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

export function parseDimensionOnly(text: string): { widthFt: number; lengthFt: number } | null {
  DIMENSION_RE.lastIndex = 0;
  const match = DIMENSION_RE.exec(text);
  if (!match) return null;

  const wFt = parseFloat(match[1]);
  const wIn = match[2] ? parseInt(match[2]) : 0;
  const lFt = parseFloat(match[3]);
  const lIn = match[4] ? parseInt(match[4]) : 0;

  const width = wFt + wIn / 12;
  const length = lFt + lIn / 12;

  // Sanity: residential rooms are between 3' and 60'
  if (width < 3 || width > 60 || length < 3 || length > 60) return null;

  return {
    widthFt: Math.round(width * 10) / 10,
    lengthFt: Math.round(length * 10) / 10,
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
