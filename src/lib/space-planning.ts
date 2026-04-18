import type { Room, FurnitureItem, SelectedFurniture } from "./types";

/**
 * x/y/rotation are stored on SelectedFurniture as extra fields (the SpacePlanner
 * casts to PlacedItem). Anything that adds furniture to a room should go through
 * `placeFurniture` so the item lands at sensible coords on the floor plan rather
 * than stacking at the default room center.
 */
export interface PlacedFields {
  x: number;
  y: number;
  rotation: number;
}

/**
 * Find an open slot in a room for a new item. Scans a 4×3 grid of candidate
 * centers (in % of room) and returns the first one that doesn't collide with
 * existing furniture. Falls back to a deterministic stagger if the room is full.
 *
 * Returns x/y as % of room (0–100), where (50,50) is room center.
 */
export function findOpenSlot(room: Room, item: FurnitureItem): { x: number; y: number } {
  const itemWPct = ((item.widthIn / 12) / Math.max(0.1, room.widthFt)) * 100;
  const itemHPct = ((item.depthIn / 12) / Math.max(0.1, room.lengthFt)) * 100;
  const cols = 4;
  const rows = 3;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = 15 + (col * 70) / (cols - 1);
      const y = 15 + (row * 70) / (rows - 1);
      const collides = room.furniture.some(f => {
        const px = (f as SelectedFurniture & Partial<PlacedFields>).x ?? 50;
        const py = (f as SelectedFurniture & Partial<PlacedFields>).y ?? 50;
        const pw = ((f.item.widthIn / 12) / Math.max(0.1, room.widthFt)) * 100;
        const ph = ((f.item.depthIn / 12) / Math.max(0.1, room.lengthFt)) * 100;
        return (
          Math.abs(px - x) < (pw + itemWPct) / 2 &&
          Math.abs(py - y) < (ph + itemHPct) / 2
        );
      });
      if (!collides) return { x, y };
    }
  }
  const n = room.furniture.length;
  return { x: 20 + ((n * 13) % 60), y: 20 + ((n * 17) % 60) };
}

/**
 * Build a SelectedFurniture object that includes x/y/rotation, ready to push
 * into `room.furniture`. Use this from any path that adds furniture so the
 * item shows up properly placed in the Space Planner.
 *
 * Pass `existingFromCatalog: false` if you've already mutated `room.furniture`
 * and need the slot to be computed against the post-mutation state — but the
 * normal pattern is: call this, then push the result.
 */
export function placeFurniture(
  room: Room,
  item: FurnitureItem,
  opts: { quantity?: number; notes?: string } = {}
): SelectedFurniture & PlacedFields {
  const slot = findOpenSlot(room, item);
  return {
    item,
    quantity: opts.quantity ?? 1,
    roomId: room.id,
    notes: opts.notes ?? "",
    x: slot.x,
    y: slot.y,
    rotation: 0,
  };
}

/**
 * Backfill x/y on any furniture that's missing it (e.g. items added before
 * pick-equals-place was wired up). Call from migration paths or when loading
 * a project so the Space Planner doesn't show stacked items.
 */
export function backfillMissingPositions(room: Room): boolean {
  let changed = false;
  for (const f of room.furniture) {
    const placed = f as SelectedFurniture & Partial<PlacedFields>;
    if (placed.x === undefined || placed.y === undefined) {
      const slot = findOpenSlot(room, f.item);
      placed.x = slot.x;
      placed.y = slot.y;
      placed.rotation = placed.rotation ?? 0;
      changed = true;
    }
  }
  return changed;
}
