import type { Project, Room, FurnitureItem, SelectedFurniture, DesignStyle } from "./types";
import { suggestFurniture } from "./auto-suggest";

interface PlacedFields {
  x: number;
  y: number;
  rotation: number;
}

/**
 * "Auto-design this room" — the headline AI feature.
 *
 * Picks style-aware furniture for the room, filters to items that physically
 * fit, and places them with rules instead of random offsets:
 *   - Bed against the longest wall, centered
 *   - Nightstands flanking the bed
 *   - Dresser on the wall opposite the bed
 *   - Sofa centered on the longest wall in living rooms; coffee table in front
 *   - Dining table centered in dining rooms; chairs around
 *   - Rugs centered under the anchor item
 *   - Floor lamps in unused corners
 *   - Wall items (art, mirror, TV) get markers along walls
 *
 * Returns the new SelectedFurniture[] to push into room.furniture. Caller is
 * responsible for saving + onUpdate.
 */
export function autoDesignRoom(project: Project, room: Room): (SelectedFurniture & PlacedFields)[] {
  const style = project.style;
  // Concept-locked board overrides project style if present
  const lockedConcept = project.moodBoards?.find(b => b.isLockedConcept);
  const effectiveStyle: DesignStyle = lockedConcept?.style ?? style;

  // Pull a deeper pool of candidates than usual so the placement rules have
  // options to work with, not just one bed.
  const pool = suggestFurniture(room, effectiveStyle).slice(0, 12);
  const selected: FurnitureItem[] = [];
  const seenSubs = new Set<string>();

  // Always-include first occurrence per subcategory; cap at 8 per room.
  for (const item of pool) {
    if (seenSubs.has(item.subcategory)) continue;
    if (!fitsInRoom(item, room)) continue;
    seenSubs.add(item.subcategory);
    selected.push(item);
    if (selected.length >= 8) break;
  }

  return placeWithRules(room, selected);
}

function fitsInRoom(item: FurnitureItem, room: Room): boolean {
  const w = item.widthIn / 12;
  const d = item.depthIn / 12;
  // Allow either orientation
  const fitsAsIs = w <= room.widthFt && d <= room.lengthFt;
  const fitsRotated = d <= room.widthFt && w <= room.lengthFt;
  return fitsAsIs || fitsRotated;
}

/**
 * Rule-based placement. The room is normalized to 0–100% on both axes; we
 * place items against walls (5%/95%) and use the room's longest wall as
 * the "anchor wall" (top by convention when widthFt > lengthFt, else left).
 */
function placeWithRules(room: Room, items: FurnitureItem[]): (SelectedFurniture & PlacedFields)[] {
  const out: (SelectedFurniture & PlacedFields)[] = [];
  const anchorIsTop = room.widthFt >= room.lengthFt;
  // y=10 means top wall; y=90 means bottom wall.
  // For "anchor on top": bed/sofa goes at y=15 against top wall.
  // For "anchor on left": bed/sofa goes at x=15 against left wall.

  // Categorize items by role so the rules don't have to inspect each one twice
  const beds = items.filter(i => i.category === "beds-mattresses");
  const sofas = items.filter(i => i.category === "seating" && /sofa|sectional/i.test(i.subcategory));
  const seating = items.filter(i => i.category === "seating" && !sofas.includes(i));
  const tables = items.filter(i => i.category === "tables");
  const storage = items.filter(i => i.category === "storage");
  const lighting = items.filter(i => i.category === "lighting");
  const rugs = items.filter(i => i.category === "rugs-textiles");
  const decor = items.filter(i => i.category === "decor");
  const kitchen = items.filter(i => i.category === "kitchen-dining");
  const bathroom = items.filter(i => i.category === "bathroom");

  // Bed anchor (bedrooms)
  const bed = beds[0];
  if (bed) {
    out.push(make(bed, anchorIsTop ? 50 : 15, anchorIsTop ? 20 : 50));
    // Nightstands flanking
    const nightstands = tables.filter(t => /nightstand|bedside/i.test(t.subcategory)).slice(0, 2);
    nightstands.forEach((ns, i) => {
      const offset = i === 0 ? -1 : 1;
      out.push(make(ns,
        anchorIsTop ? 50 + offset * 25 : 15,
        anchorIsTop ? 20 : 50 + offset * 25));
    });
    // Dresser on opposite wall
    const dresser = storage.find(s => /dresser|chest/i.test(s.subcategory));
    if (dresser) out.push(make(dresser, anchorIsTop ? 50 : 85, anchorIsTop ? 80 : 50));
  }

  // Sofa anchor (living rooms)
  const sofa = sofas[0];
  if (sofa) {
    out.push(make(sofa, anchorIsTop ? 50 : 15, anchorIsTop ? 20 : 50));
    // Coffee table in front of sofa
    const coffee = tables.find(t => /coffee/i.test(t.subcategory));
    if (coffee) out.push(make(coffee, 50, 50));
    // Accent chairs at angles
    const chairs = seating.filter(c => /accent|chair/i.test(c.subcategory)).slice(0, 2);
    chairs.forEach((c, i) => {
      const offset = i === 0 ? -25 : 25;
      out.push(make(c,
        anchorIsTop ? 50 + offset : 85,
        anchorIsTop ? 65 : 50 + offset));
    });
  }

  // Dining (when no bed/sofa)
  if (!bed && !sofa) {
    const diningTable = tables.find(t => /dining/i.test(t.subcategory));
    if (diningTable) {
      out.push(make(diningTable, 50, 50));
      const diningChairs = seating.filter(c => /dining/i.test(c.subcategory)).slice(0, 4);
      diningChairs.forEach((c, i) => {
        // Cardinal positions around table
        const positions = [[50, 30], [50, 70], [30, 50], [70, 50]];
        const [x, y] = positions[i] ?? [50, 50];
        out.push(make(c, x, y));
      });
    }
  }

  // Rug under the anchor item
  const rug = rugs[0];
  if (rug && (bed || sofa)) out.push(make(rug, 50, anchorIsTop ? 40 : 50));

  // Lighting in unused corners
  const lamps = lighting.filter(l => /floor lamp|standing/i.test(l.subcategory));
  lamps.slice(0, 2).forEach((l, i) => {
    const corners = [[10, 90], [90, 90], [90, 10], [10, 10]];
    const [x, y] = corners[i] ?? [10, 10];
    out.push(make(l, x, y));
  });

  // Kitchen accessories — cluster on one wall
  kitchen.slice(0, 3).forEach((k, i) => {
    out.push(make(k, 30 + i * 20, 80));
  });

  // Bathroom accessories — wall-mount, place along one wall
  bathroom.forEach((b, i) => {
    out.push(make(b, 20 + i * 20, 50));
  });

  // Decor — fill remaining items at wall positions
  decor.slice(0, 3).forEach((d, i) => {
    const positions = [[80, 80], [20, 20], [80, 20]];
    const [x, y] = positions[i] ?? [50, 50];
    out.push(make(d, x, y));
  });

  // Catch-all for anything that didn't get placed by the rules above
  const placedIds = new Set(out.map(o => o.item.id));
  const unplaced = items.filter(i => !placedIds.has(i.id));
  unplaced.forEach((i, idx) => {
    const x = 25 + (idx % 3) * 25;
    const y = 25 + Math.floor(idx / 3) * 25;
    out.push(make(i, x, y));
  });

  return out;

  function make(item: FurnitureItem, x: number, y: number): SelectedFurniture & PlacedFields {
    return {
      item,
      quantity: 1,
      roomId: room.id,
      notes: "",
      x: clampPct(x),
      y: clampPct(y),
      rotation: 0,
    };
  }
}

function clampPct(n: number): number {
  return Math.max(5, Math.min(95, n));
}
