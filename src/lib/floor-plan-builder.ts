/**
 * Floor Plan Builder — vector-first, to-scale room drawing.
 *
 * All internal coordinates are stored in INCHES. Display layer converts to
 * ft-in or cm as the designer prefers. We pick inches over feet because:
 *  - keeps wall/opening widths as integers for standard sizes (36" door, etc.)
 *  - avoids floating-point drift when adding up wall segments
 *  - matches US interior design convention ("a 72 inch sofa")
 *
 * Rooms are stored as rectangles in Phase 1 (origin + width × length, rotated
 * by 0°). Corner-dragging for L/U-shapes comes in a later phase. Openings
 * (doors/windows) live on a numbered wall (0=top, 1=right, 2=bottom, 3=left)
 * at an offset from that wall's starting corner, plus a width.
 */

export type BuilderUnit = "ft-in" | "cm";

export interface BuilderOpening {
  id: string;
  /** 0=top, 1=right, 2=bottom, 3=left (clockwise from top-left corner) */
  wallIndex: number;
  type: "door" | "window";
  /** distance in inches from the wall's start corner to the opening's start */
  startInches: number;
  /** width in inches */
  widthInches: number;
  /** door swing direction; ignored for windows */
  swing?: "in-left" | "in-right" | "out-left" | "out-right";
}

export interface BuilderRoom {
  id: string;
  name: string;
  /** Top-left corner of the room bounding box, in inches from plan origin */
  x: number;
  y: number;
  /** Room interior dimensions in inches (wall thickness added on render) */
  widthInches: number;
  lengthInches: number;
  openings: BuilderOpening[];
  /** Optional floor number for multi-level homes (1 = ground floor) */
  floor?: number;
}

export interface BuilderPlan {
  /** Display unit preference — has no effect on stored numbers (always inches). */
  unit: BuilderUnit;
  rooms: BuilderRoom[];
  /** Wall thickness in inches drawn around each room. Default 5" (2x4 + drywall). */
  wallThicknessInches: number;
}

export const DEFAULT_WALL_THICKNESS = 5;

export function emptyPlan(): BuilderPlan {
  return {
    unit: "ft-in",
    rooms: [],
    wallThicknessInches: DEFAULT_WALL_THICKNESS,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Unit conversion                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

export function inchesToFtIn(totalInches: number): { ft: number; in: number } {
  const rounded = Math.round(totalInches);
  return { ft: Math.floor(rounded / 12), in: rounded % 12 };
}

export function ftInToInches(ft: number, inches: number): number {
  return ft * 12 + inches;
}

export function inchesToCm(totalInches: number): number {
  return totalInches * 2.54;
}

export function cmToInches(cm: number): number {
  return cm / 2.54;
}

/** Human-readable label for a dimension, respecting the plan's display unit. */
export function formatDimension(totalInches: number, unit: BuilderUnit): string {
  if (unit === "cm") {
    const cm = inchesToCm(totalInches);
    return `${cm.toFixed(cm < 100 ? 1 : 0)} cm`;
  }
  const { ft, in: inches } = inchesToFtIn(totalInches);
  if (ft === 0) return `${inches}"`;
  if (inches === 0) return `${ft}'`;
  return `${ft}'${inches}"`;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Geometry helpers                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Returns the start/end points (in inches) of a given wall on a rectangular
 * room. Walls are numbered clockwise from the top-left corner:
 *   0 = top    (left→right)
 *   1 = right  (top→bottom)
 *   2 = bottom (right→left)
 *   3 = left   (bottom→top)
 */
export function wallEndpoints(
  room: BuilderRoom,
  wallIndex: number
): { x1: number; y1: number; x2: number; y2: number } {
  const { x, y, widthInches: w, lengthInches: l } = room;
  switch (wallIndex % 4) {
    case 0: return { x1: x,     y1: y,     x2: x + w, y2: y     }; // top
    case 1: return { x1: x + w, y1: y,     x2: x + w, y2: y + l }; // right
    case 2: return { x1: x + w, y1: y + l, x2: x,     y2: y + l }; // bottom
    case 3: return { x1: x,     y1: y + l, x2: x,     y2: y     }; // left
    default: throw new Error(`invalid wallIndex ${wallIndex}`);
  }
}

export function wallLengthInches(room: BuilderRoom, wallIndex: number): number {
  return wallIndex % 2 === 0 ? room.widthInches : room.lengthInches;
}

/**
 * Overall bounding box of the plan in inches. Useful for computing SVG
 * viewBox and fitting all rooms in view.
 */
export function planBBox(plan: BuilderPlan): { x: number; y: number; w: number; l: number } {
  if (plan.rooms.length === 0) return { x: 0, y: 0, w: 144, l: 144 }; // 12ft × 12ft default
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of plan.rooms) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.widthInches);
    maxY = Math.max(maxY, r.y + r.lengthInches);
  }
  return { x: minX, y: minY, w: maxX - minX, l: maxY - minY };
}

/** Bounding box of a single room (for per-room cropped views). */
export function roomBBox(room: BuilderRoom): { x: number; y: number; w: number; l: number } {
  return { x: room.x, y: room.y, w: room.widthInches, l: room.lengthInches };
}
