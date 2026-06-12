/**
 * Install Guide page-list builder.
 *
 * The guide is rendered from an ordered array of typed page descriptors so
 * the exact total page count is known up front (every page prints a
 * "Page X of N" footer). Room pages are driven entirely by project.rooms —
 * nothing is hard-coded to a particular house.
 *
 * Reference sequence (Teeco "Design & Install Guide"):
 *   Cover · Floor Plan + Legend · per-room board page(s) (+ optional AI
 *   render page) for living/dining/kitchen/bedrooms/other common rooms ·
 *   one page per bathroom · Exterior · Curtains & Art · Rug & Textiles ·
 *   Ordering Tips · Pre-Install Checklist · Install Execution · Contact.
 */

import type {
  BedConfiguration,
  BedType,
  FloorPlan,
  Project,
  Property,
  Room,
  RoomAnnotation,
  RoomType,
} from "@/lib/types";

// ── Page descriptor types ──

export interface RoomBoardDescriptor {
  kind: "room-board";
  room: Room;
  displayName: string;
  /** null → render the graceful "no board yet" placeholder card */
  boardImageUrl: string | null;
  boardIndex: number;
  boardCount: number;
  /** Bedrooms (and any room with designer-written tips) show a TIPS block */
  showTips: boolean;
}

export interface AiRenderDescriptor {
  kind: "ai-render";
  room: Room;
  displayName: string;
  /** 1–2 render urls (aiRenderUrls first, legacy originalRenderUrl fallback) */
  imageUrls: string[];
}

export interface BathroomDescriptor {
  kind: "bathroom";
  room: Room;
  displayName: string;
  boardImageUrl: string | null;
}

export interface ExteriorDescriptor {
  kind: "exterior";
  room: Room;
  displayName: string;
  boardImageUrl: string | null;
  /** Optional second board image — shown as the circular inset (reference p20) */
  insetImageUrl: string | null;
}

export type GuidePageDescriptor =
  | { kind: "cover" }
  | { kind: "floor-plan" }
  | RoomBoardDescriptor
  | AiRenderDescriptor
  | BathroomDescriptor
  | ExteriorDescriptor
  | { kind: "curtains-art" }
  | { kind: "rug-textiles" }
  | { kind: "ordering-tips" }
  | { kind: "pre-install" }
  | { kind: "install-execution" }
  | { kind: "contact" };

// ── Room ordering ──

/** Utility rooms never appear in the client guide. */
const SKIPPED_TYPES = new Set<RoomType>(["hallway", "laundry", "storage", "closet"]);

const BEDROOM_TYPES = new Set<RoomType>(["primary-bedroom", "bedroom"]);

/** Common spaces that lead the guide, in fixed order. */
const LEAD_TYPES: RoomType[] = ["living-room", "dining-room", "kitchen"];

const GENERIC_BEDROOM_NAME = /^\s*(?:primary|master|main|guest)?\s*(?:bed\s*room|bdrm|bed)\s*#?\d*\s*$/i;
const GENERIC_BATHROOM_NAME = /^\s*(?:primary|master|main|guest|half|full)?\s*(?:bath\s*room|bath)\s*#?\d*\s*$/i;
const GENERIC_EXTERIOR_NAME = /^\s*(?:outdoor|exterior|outside|backyard|patio|deck|porch)(?:\s+(?:space|area|living))?\s*$/i;

export interface OrderedRoom {
  room: Room;
  displayName: string;
}

/**
 * Orders project rooms for the guide:
 * living room(s) → dining room → kitchen → bedrooms (project order,
 * generic names shown as "Bedroom 1/2/3…") → other common rooms
 * (loft/den/office/game/media/bonus) → bathrooms → exterior.
 * Hallway/laundry/storage/closet rooms are skipped entirely.
 */
export function orderRoomsForGuide(rooms: Room[]): {
  main: OrderedRoom[];
  bathrooms: OrderedRoom[];
  exteriors: OrderedRoom[];
} {
  const eligible = rooms.filter((r) => !SKIPPED_TYPES.has(r.type));
  const main: OrderedRoom[] = [];

  for (const lead of LEAD_TYPES) {
    for (const room of eligible) {
      if (room.type === lead) main.push({ room, displayName: room.name });
    }
  }

  const bedrooms = eligible.filter((r) => BEDROOM_TYPES.has(r.type));
  bedrooms.forEach((room, i) => {
    const generic = !room.name.trim() || GENERIC_BEDROOM_NAME.test(room.name);
    const displayName = generic
      ? bedrooms.length > 1
        ? `Bedroom ${i + 1}`
        : "Bedroom"
      : room.name;
    main.push({ room, displayName });
  });

  // Remaining common rooms (loft, den, office, game, media, bonus, and any
  // future types) keep project order after the bedrooms.
  for (const room of eligible) {
    if (room.type === "bathroom" || room.type === "outdoor") continue;
    if (LEAD_TYPES.includes(room.type) || BEDROOM_TYPES.has(room.type)) continue;
    main.push({ room, displayName: room.name });
  }

  const baths = eligible.filter((r) => r.type === "bathroom");
  const bathrooms = baths.map((room, i) => {
    const generic = !room.name.trim() || GENERIC_BATHROOM_NAME.test(room.name);
    return {
      room,
      displayName: generic ? (baths.length > 1 ? `Bathroom ${i + 1}` : "Bathroom") : room.name,
    };
  });

  const exteriors = eligible
    .filter((r) => r.type === "outdoor")
    .map((room) => ({
      room,
      displayName:
        !room.name.trim() || GENERIC_EXTERIOR_NAME.test(room.name) ? "Exterior" : room.name,
    }));

  return { main, bathrooms, exteriors };
}

// ── Image helpers ──

function nonEmpty(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Primary design board first (sceneSnapshot), then any extra board images.
 *  When no board exists yet, falls back to the designer's room photo so the
 *  page shows the real space instead of an empty card. */
export function getBoardImages(room: Room): string[] {
  const boards = [room.sceneSnapshot, ...(room.extraBoardImageUrls ?? [])].filter(nonEmpty);
  if (boards.length > 0) return boards;
  return [room.referenceImageUrl].filter(nonEmpty);
}

/** True when this board page is showing the room photo stand-in, not a real board. */
export function isPhotoFallback(room: Room, boardImageUrl: string | null): boolean {
  return (
    !!boardImageUrl &&
    !nonEmpty(room.sceneSnapshot) &&
    boardImageUrl === room.referenceImageUrl
  );
}

/** 1–2 AI renders: aiRenderUrls when present, else legacy originalRenderUrl. */
export function getAiRenderImages(room: Room): string[] {
  const renders = (room.aiRenderUrls ?? []).filter(nonEmpty).slice(0, 2);
  if (renders.length > 0) return renders;
  return nonEmpty(room.originalRenderUrl) ? [room.originalRenderUrl] : [];
}

// ── buildPageList ──

export function buildPageList(project: Project): GuidePageDescriptor[] {
  const pages: GuidePageDescriptor[] = [{ kind: "cover" }, { kind: "floor-plan" }];
  const { main, bathrooms, exteriors } = orderRoomsForGuide(project.rooms);

  for (const { room, displayName } of main) {
    const showTips = BEDROOM_TYPES.has(room.type) || nonEmpty(room.installTips);
    const boards = getBoardImages(room);
    if (boards.length === 0) {
      pages.push({
        kind: "room-board",
        room,
        displayName,
        boardImageUrl: null,
        boardIndex: 0,
        boardCount: 1,
        showTips,
      });
    } else {
      boards.forEach((boardImageUrl, boardIndex) => {
        pages.push({
          kind: "room-board",
          room,
          displayName,
          boardImageUrl,
          boardIndex,
          boardCount: boards.length,
          showTips,
        });
      });
    }
    const imageUrls = getAiRenderImages(room);
    if (imageUrls.length > 0) {
      pages.push({ kind: "ai-render", room, displayName, imageUrls });
    }
  }

  for (const { room, displayName } of bathrooms) {
    pages.push({
      kind: "bathroom",
      room,
      displayName,
      boardImageUrl: getBoardImages(room)[0] ?? null,
    });
  }

  for (const { room, displayName } of exteriors) {
    const boards = getBoardImages(room);
    pages.push({
      kind: "exterior",
      room,
      displayName,
      boardImageUrl: boards[0] ?? null,
      insetImageUrl: boards[1] ?? null,
    });
  }

  pages.push(
    { kind: "curtains-art" },
    { kind: "rug-textiles" },
    { kind: "ordering-tips" },
    { kind: "pre-install" },
    { kind: "install-execution" },
    { kind: "contact" }
  );

  return pages;
}

// ── Floor-plan helpers ──

/** The primary plan: isPrimary image plan if flagged, else most recent image plan. */
export function getPrimaryFloorPlan(property: Property): FloorPlan | null {
  const images = (property.floorPlans ?? []).filter((p) => p.type === "image" && nonEmpty(p.url));
  if (images.length === 0) return null;
  const flagged = images.find((p) => p.isPrimary);
  if (flagged) return flagged;
  return [...images].sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""))[0];
}

/**
 * Plan + crop annotation for a room's plan thumbnail. Prefers the plan the
 * room annotation is anchored to; falls back to the primary plan (uncropped).
 */
export function getPlanForRoom(
  property: Property,
  room: Room
): { plan: FloorPlan; annotation: RoomAnnotation | null } | null {
  const annotation = room.annotation;
  if (annotation && annotation.width > 0 && annotation.height > 0) {
    const annotated = (property.floorPlans ?? []).find(
      (p) => p.id === annotation.floorPlanId && p.type === "image" && nonEmpty(p.url)
    );
    if (annotated) return { plan: annotated, annotation };
  }
  const primary = getPrimaryFloorPlan(property);
  return primary ? { plan: primary, annotation: null } : null;
}

// ── Occupancy ──

/** Reference occupancy lines spell out "Queen Bed" for single mattresses. */
const BED_TYPE_LABELS: Record<BedType, string> = {
  king: "King Bed",
  queen: "Queen Bed",
  full: "Full Bed",
  twin: "Twin Bed",
  "queen-over-queen-bunk": "Queen over Queen Bunk",
  "twin-over-twin-bunk": "Twin over Twin Bunk",
  "twin-over-full-bunk": "Twin over Full Bunk",
  "sofa-bed": "Sofa Bed",
  "murphy-bed": "Murphy Bed",
  "daybed-trundle": "Daybed with Trundle",
};

/** "(x2) Queen over Queen Bunk" / "Queen + Twin over Twin Bunk" */
export function formatBedConfig(config: BedConfiguration): string {
  if (!config.beds || config.beds.length === 0) return config.name;
  return config.beds
    .map((bed) =>
      bed.quantity > 1
        ? `(x${bed.quantity}) ${BED_TYPE_LABELS[bed.type]}`
        : BED_TYPE_LABELS[bed.type]
    )
    .join(" + ");
}

/** Per-bed breakdown lines, e.g. "Bed 3 - (x2) Queen over Queen Bunk - 8 Guests"
 *  (plain hyphen separators, matching the reference floor-plan sidebar). */
export function buildOccupancyLines(rooms: Room[]): string[] {
  const { main, bathrooms, exteriors } = orderRoomsForGuide(rooms);
  return [...main, ...bathrooms, ...exteriors]
    .filter(({ room }) => room.selectedBedConfig && room.selectedBedConfig.totalSleeps > 0)
    .map(({ room }, i) => {
      const config = room.selectedBedConfig as BedConfiguration;
      const guests = config.totalSleeps;
      return `Bed ${i + 1} - ${formatBedConfig(config)} - ${guests} Guest${guests === 1 ? "" : "s"}`;
    });
}

// ── Tips ──

/** Splits designer-written tips into clean bullet lines (max 4 for layout). */
export function parseTipLines(text: string | undefined, max = 4): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-–—•*·]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, max);
}

/** Verbatim bedroom TIPS from the reference deliverable (p11/13/14/16). */
export const DEFAULT_BEDROOM_TIPS = [
  "Each mattress gets one throw blanket + one throw pillow. Lay throw blankets across the bed from left to right.",
  'Hang mirror 4" above baseboard.',
  "Bend the branches on the plants to help make it look more realistic",
];

/** Verbatim bathroom TIPS from the reference deliverable (p18). */
export const BATHROOM_HEIGHT_TIPS = [
  'Install towel bar 42-48" from floor.',
  'Install towel hooks 70" from floor.',
  'Install towel ring 20" from vanity countertop.',
  'Install Toilet paper holder 26" from the floor.',
];
