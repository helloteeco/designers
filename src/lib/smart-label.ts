import type { Room, RoomType } from "./types";

export interface LabelSuggestion {
  name: string;
  type: RoomType;
  reason: string;
}

function sqft(r: Room) {
  return r.widthFt * r.lengthFt;
}

function bboxCenter(r: Room): { x: number; y: number } | null {
  if (!r.svgBBox) return null;
  return {
    x: r.svgBBox.x + r.svgBBox.width / 2,
    y: r.svgBBox.y + r.svgBBox.height / 2,
  };
}

function bboxDistance(a: Room, b: Room): number {
  const ca = bboxCenter(a);
  const cb = bboxCenter(b);
  if (!ca || !cb) return Infinity;
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}

function isBedroomLike(r: Room) {
  return r.type === "bedroom" || r.type === "primary-bedroom";
}

/**
 * Generate smart label suggestions for all rooms based on type + size + adjacency.
 *
 * Heuristics:
 *  - Largest bedroom → "Primary Bedroom"
 *  - Other bedrooms → "Guest Bedroom 1", "Guest Bedroom 2", ... (ordered by size, largest first)
 *  - Largest bathroom → "Primary Bathroom"
 *  - Bathroom adjacent to Primary Bedroom (if not already labeled) → "Primary Bathroom"
 *  - Small bathroom (<30 sqft) → "Powder Room"
 *  - Other bathrooms → "Guest Bathroom 1", ...
 *  - Large closet (>25 sqft) adjacent to Primary Bedroom → "Primary Walk-in Closet"
 *  - Other closets → sequential
 *  - Kitchen/Living/Dining: only renamed if duplicate (adds "1", "2")
 */
export function buildSmartLabels(rooms: Room[]): Map<string, LabelSuggestion> {
  const result = new Map<string, LabelSuggestion>();

  const bedrooms = rooms
    .filter(isBedroomLike)
    .sort((a, b) => sqft(b) - sqft(a));

  const bathrooms = rooms
    .filter((r) => r.type === "bathroom")
    .sort((a, b) => sqft(b) - sqft(a));

  const closets = rooms
    .filter((r) => r.type === "closet")
    .sort((a, b) => sqft(b) - sqft(a));

  const primaryBedroom = bedrooms[0];

  bedrooms.forEach((r, i) => {
    if (i === 0) {
      result.set(r.id, {
        name: "Primary Bedroom",
        type: "primary-bedroom",
        reason: `largest bedroom (${sqft(r).toFixed(0)} sqft)`,
      });
    } else {
      result.set(r.id, {
        name: `Guest Bedroom ${i}`,
        type: "bedroom",
        reason: `bedroom #${i + 1} by size`,
      });
    }
  });

  // Primary bathroom = closest bathroom to primary bedroom, OR the largest
  let primaryBathId: string | null = null;
  if (primaryBedroom && bathrooms.length > 0) {
    const withDistance = bathrooms
      .map((b) => ({ bath: b, dist: bboxDistance(b, primaryBedroom) }))
      .sort((a, b) => a.dist - b.dist);
    const closest = withDistance[0];
    if (closest && closest.dist !== Infinity) {
      primaryBathId = closest.bath.id;
    }
  }
  if (!primaryBathId && bathrooms.length > 0) {
    primaryBathId = bathrooms[0].id;
  }

  let guestBathCounter = 0;
  bathrooms.forEach((r) => {
    const area = sqft(r);
    if (r.id === primaryBathId) {
      result.set(r.id, {
        name: "Primary Bathroom",
        type: "bathroom",
        reason: primaryBedroom
          ? "closest bathroom to primary bedroom"
          : "largest bathroom",
      });
    } else if (area < 30) {
      result.set(r.id, {
        name: "Powder Room",
        type: "bathroom",
        reason: `small (${area.toFixed(0)} sqft, no shower likely)`,
      });
    } else {
      guestBathCounter += 1;
      result.set(r.id, {
        name: guestBathCounter === 1 ? "Guest Bathroom" : `Guest Bathroom ${guestBathCounter}`,
        type: "bathroom",
        reason: "non-primary bathroom",
      });
    }
  });

  // Primary closet = largest closet closest to primary bedroom
  let primaryClosetId: string | null = null;
  if (primaryBedroom && closets.length > 0) {
    const withDistance = closets
      .map((c) => ({ cl: c, dist: bboxDistance(c, primaryBedroom), area: sqft(c) }))
      .filter((c) => c.area > 12)
      .sort((a, b) => a.dist - b.dist);
    if (withDistance[0] && withDistance[0].dist !== Infinity) {
      primaryClosetId = withDistance[0].cl.id;
    }
  }

  let walkInCounter = 0;
  let closetCounter = 0;
  closets.forEach((r) => {
    const area = sqft(r);
    if (r.id === primaryClosetId) {
      result.set(r.id, {
        name: "Primary Walk-in Closet",
        type: "closet",
        reason: "largest closet adjacent to primary bedroom",
      });
    } else if (area > 25) {
      walkInCounter += 1;
      result.set(r.id, {
        name: walkInCounter === 1 ? "Walk-in Closet" : `Walk-in Closet ${walkInCounter}`,
        type: "closet",
        reason: `large closet (${area.toFixed(0)} sqft)`,
      });
    } else {
      closetCounter += 1;
      result.set(r.id, {
        name: closetCounter === 1 ? "Closet" : `Closet ${closetCounter}`,
        type: "closet",
        reason: "small closet",
      });
    }
  });

  // Deduplicate other room types (kitchen/living/dining/hallway/etc)
  const otherTypes: RoomType[] = [
    "kitchen",
    "living-room",
    "dining-room",
    "hallway",
    "laundry",
    "storage",
    "outdoor",
    "office",
    "den",
    "loft",
    "bonus-room",
    "media-room",
    "game-room",
  ];

  for (const t of otherTypes) {
    const matches = rooms.filter((r) => r.type === t);
    if (matches.length === 0) continue;
    const defaultName = defaultNameForType(t);
    if (matches.length === 1) {
      const r = matches[0];
      if (isGenericName(r.name, t)) {
        result.set(r.id, {
          name: defaultName,
          type: t,
          reason: "standard name for this room type",
        });
      }
    } else {
      matches
        .sort((a, b) => sqft(b) - sqft(a))
        .forEach((r, i) => {
          result.set(r.id, {
            name: i === 0 ? defaultName : `${defaultName} ${i + 1}`,
            type: t,
            reason: i === 0 ? "primary by size" : `duplicate #${i + 1} by size`,
          });
        });
    }
  }

  return result;
}

function defaultNameForType(t: RoomType): string {
  const map: Record<RoomType, string> = {
    "primary-bedroom": "Primary Bedroom",
    bedroom: "Bedroom",
    "living-room": "Living Room",
    "dining-room": "Dining Room",
    kitchen: "Kitchen",
    bathroom: "Bathroom",
    hallway: "Hallway",
    laundry: "Laundry Room",
    storage: "Storage",
    closet: "Closet",
    outdoor: "Outdoor",
    office: "Office",
    den: "Den",
    loft: "Loft",
    "bonus-room": "Bonus Room",
    "media-room": "Media Room",
    "game-room": "Game Room",
  };
  return map[t] ?? "Room";
}

function isGenericName(name: string, type: RoomType): boolean {
  const normalized = name.trim().toLowerCase();
  const generic = [
    "room",
    "bedroom",
    "bathroom",
    "hallway",
    "closet",
    "kitchen",
    "living room",
    "dining room",
    "laundry",
    "storage",
    "den",
    "office",
    "loft",
    "outdoor",
    "entry",
    "entryway",
    "porch",
    "lounge",
  ];
  if (generic.includes(normalized)) return true;
  // Also treat "Bedroom Floor 1" style as generic
  if (normalized.startsWith(type.replace(/-/g, " "))) return true;
  return false;
}

/**
 * Detect rooms with duplicate names (case-insensitive).
 * Returns a set of room IDs that have a duplicate.
 */
export function findDuplicateNames(rooms: Room[]): Set<string> {
  const counts = new Map<string, number>();
  rooms.forEach((r) => {
    const key = r.name.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const duplicates = new Set<string>();
  rooms.forEach((r) => {
    const key = r.name.trim().toLowerCase();
    if ((counts.get(key) ?? 0) > 1) duplicates.add(r.id);
  });
  return duplicates;
}
