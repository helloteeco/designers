/**
 * SVG renderer for BuilderPlan. Produces a standalone SVG string that can be
 * saved to Project.property.floorPlanSvgContent (same slot the Matterport
 * schematics use) so every downstream feature — Space Planner, Install Guide,
 * room crops — works with no extra wiring.
 *
 * Coordinate system in the output SVG: 1 unit = 1 inch. Walls drawn as filled
 * rectangles so the room interior is the visible negative space. Openings are
 * drawn as white rectangles overlapping the wall rect to "cut" them out.
 */

import {
  type BuilderPlan,
  type BuilderRoom,
  type BuilderOpening,
  type BuilderUnit,
  planBBox,
  roomBBox,
  wallEndpoints,
  formatDimension,
} from "./floor-plan-builder";

interface RenderOptions {
  /** If true, adds dimension labels on every wall (for designer view). */
  showDimensions?: boolean;
  /** If true, shows room name labels centered in each room. */
  showRoomNames?: boolean;
  /** Scale factor for stroke widths / font sizes (auto by default). */
  padding?: number;
  /** Only render one room (for per-room cropped inset). */
  onlyRoomId?: string;
}

/**
 * Build an SVG string for a BuilderPlan. Used both for the live canvas in the
 * builder UI and for the persisted floorPlanSvgContent.
 */
export function renderPlanSvg(plan: BuilderPlan, opts: RenderOptions = {}): string {
  const {
    showDimensions = true,
    showRoomNames = true,
    padding = 24,
    onlyRoomId,
  } = opts;

  const rooms = onlyRoomId
    ? plan.rooms.filter((r) => r.id === onlyRoomId)
    : plan.rooms;

  const bbox = onlyRoomId && rooms[0]
    ? roomBBox(rooms[0])
    : planBBox({ ...plan, rooms });

  // Pad so labels outside the walls don't clip
  const pad = padding + plan.wallThicknessInches;
  const viewBox = `${bbox.x - pad} ${bbox.y - pad} ${bbox.w + pad * 2} ${bbox.l + pad * 2}`;

  const wallT = plan.wallThicknessInches;
  const strokeW = Math.max(bbox.w, bbox.l) * 0.002;
  const fontSize = Math.max(bbox.w, bbox.l) * 0.025;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" data-builder="1" data-unit="${plan.unit}">`
  );
  parts.push(`<rect x="${bbox.x - pad}" y="${bbox.y - pad}" width="${bbox.w + pad * 2}" height="${bbox.l + pad * 2}" fill="#ffffff"/>`);

  for (const room of rooms) {
    parts.push(renderRoom(room, wallT, plan.unit, {
      showDimensions,
      showRoomNames,
      strokeWidth: strokeW,
      fontSize,
    }));
  }

  parts.push(`</svg>`);
  return parts.join("");
}

function renderRoom(
  room: BuilderRoom,
  wallT: number,
  unit: BuilderUnit,
  style: { showDimensions: boolean; showRoomNames: boolean; strokeWidth: number; fontSize: number }
): string {
  const { x, y, widthInches: w, lengthInches: l } = room;

  // Outer wall rect (filled dark) with inner rect cut out via evenodd fill
  // gives us clean hollow walls that openings can carve into.
  const outer = {
    x: x - wallT,
    y: y - wallT,
    w: w + wallT * 2,
    l: l + wallT * 2,
  };

  const parts: string[] = [];
  parts.push(`<g data-room-id="${room.id}" data-room-name="${escapeAttr(room.name)}">`);

  // Walls: outer filled rect minus inner interior rect (floor shows through)
  parts.push(
    `<path fill="#1f2937" fill-rule="evenodd" d="` +
      `M ${outer.x} ${outer.y} h ${outer.w} v ${outer.l} h ${-outer.w} Z ` +
      `M ${x} ${y} h ${w} v ${l} h ${-w} Z` +
    `"/>`
  );

  // Floor interior (white, for crisp look)
  parts.push(
    `<rect x="${x}" y="${y}" width="${w}" height="${l}" fill="#ffffff"/>`
  );

  // Openings (cut through the wall)
  for (const op of room.openings) {
    parts.push(renderOpening(room, op, wallT));
  }

  // Dimension labels
  if (style.showDimensions) {
    const offset = wallT + style.fontSize * 1.5;
    // Top dimension (width)
    parts.push(
      `<text x="${x + w / 2}" y="${y - offset}" font-family="ui-sans-serif, system-ui" font-size="${style.fontSize}" fill="#374151" text-anchor="middle">${formatDimension(w, unit)}</text>`
    );
    // Left dimension (length), rotated
    parts.push(
      `<text x="${x - offset}" y="${y + l / 2}" font-family="ui-sans-serif, system-ui" font-size="${style.fontSize}" fill="#374151" text-anchor="middle" transform="rotate(-90 ${x - offset} ${y + l / 2})">${formatDimension(l, unit)}</text>`
    );
  }

  // Room name label centered
  if (style.showRoomNames && room.name) {
    parts.push(
      `<text x="${x + w / 2}" y="${y + l / 2}" font-family="ui-sans-serif, system-ui" font-size="${style.fontSize * 1.4}" font-weight="600" fill="#6b7280" text-anchor="middle" dominant-baseline="middle" letter-spacing="2">${escapeText(room.name.toUpperCase())}</text>`
    );
  }

  parts.push(`</g>`);
  return parts.join("");
}

function renderOpening(room: BuilderRoom, op: BuilderOpening, wallT: number): string {
  const wall = wallEndpoints(room, op.wallIndex);

  // Unit vector along the wall
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;

  // Perpendicular pointing outward (away from room interior)
  const nx = uy;
  const ny = -ux;

  // Opening start and end along the wall
  const sx = wall.x1 + ux * op.startInches;
  const sy = wall.y1 + uy * op.startInches;
  const ex = wall.x1 + ux * (op.startInches + op.widthInches);
  const ey = wall.y1 + uy * (op.startInches + op.widthInches);

  // The opening is a quad straddling the wall, wallT thick
  const outerS = { x: sx + nx * wallT, y: sy + ny * wallT };
  const outerE = { x: ex + nx * wallT, y: ey + ny * wallT };
  const innerS = { x: sx - nx * wallT, y: sy - ny * wallT };
  const innerE = { x: ex - nx * wallT, y: ey - ny * wallT };

  const parts: string[] = [];

  // Cut the wall: white quad covering the wall opening
  parts.push(
    `<path fill="#ffffff" d="M ${outerS.x} ${outerS.y} L ${outerE.x} ${outerE.y} L ${innerE.x} ${innerE.y} L ${innerS.x} ${innerS.y} Z"/>`
  );

  if (op.type === "window") {
    // Window: thin horizontal line across the opening at the wall center
    const cS = { x: sx, y: sy };
    const cE = { x: ex, y: ey };
    parts.push(
      `<line x1="${cS.x}" y1="${cS.y}" x2="${cE.x}" y2="${cE.y}" stroke="#1f2937" stroke-width="${wallT * 0.25}"/>`
    );
    // Two parallel lines at the glass line (inside + outside)
    const glassOffset = wallT * 0.35;
    parts.push(
      `<line x1="${cS.x + nx * glassOffset}" y1="${cS.y + ny * glassOffset}" x2="${cE.x + nx * glassOffset}" y2="${cE.y + ny * glassOffset}" stroke="#1f2937" stroke-width="${wallT * 0.15}"/>`
    );
    parts.push(
      `<line x1="${cS.x - nx * glassOffset}" y1="${cS.y - ny * glassOffset}" x2="${cE.x - nx * glassOffset}" y2="${cE.y - ny * glassOffset}" stroke="#1f2937" stroke-width="${wallT * 0.15}"/>`
    );
  } else if (op.type === "door") {
    // Door: a line representing the slab, plus an arc for the swing
    // Hinge side depends on swing; default in-left (hinge on start corner, swings into room).
    const swing = op.swing ?? "in-left";
    const hingeOnStart = swing.endsWith("-left");
    const swingsInward = swing.startsWith("in");

    const hinge = hingeOnStart ? { x: sx, y: sy } : { x: ex, y: ey };
    const tip = hingeOnStart ? { x: ex, y: ey } : { x: sx, y: sy };
    const doorWidth = op.widthInches;

    // Direction from hinge to tip along wall
    const hx = (tip.x - hinge.x) / doorWidth;
    const hy = (tip.y - hinge.y) / doorWidth;

    // Swing direction perpendicular
    const sgn = swingsInward ? -1 : 1; // interior is opposite of nx/ny
    const swingTipX = hinge.x + (-ny) * sgn * doorWidth;
    const swingTipY = hinge.y + (nx) * sgn * doorWidth;

    // Door slab line from hinge to swung-open tip
    parts.push(
      `<line x1="${hinge.x}" y1="${hinge.y}" x2="${swingTipX}" y2="${swingTipY}" stroke="#1f2937" stroke-width="${wallT * 0.2}"/>`
    );
    // Swing arc
    const sweep = hingeOnStart ? (swingsInward ? 1 : 0) : (swingsInward ? 0 : 1);
    parts.push(
      `<path d="M ${swingTipX} ${swingTipY} A ${doorWidth} ${doorWidth} 0 0 ${sweep} ${tip.x} ${tip.y}" fill="none" stroke="#9ca3af" stroke-width="${wallT * 0.1}" stroke-dasharray="${wallT * 0.5} ${wallT * 0.3}"/>`
    );
    // Jamb markers at both ends
    parts.push(
      `<line x1="${hinge.x + nx * wallT}" y1="${hinge.y + ny * wallT}" x2="${hinge.x - nx * wallT}" y2="${hinge.y - ny * wallT}" stroke="#1f2937" stroke-width="${wallT * 0.15}"/>`
    );
    parts.push(
      `<line x1="${tip.x + nx * wallT}" y1="${tip.y + ny * wallT}" x2="${tip.x - nx * wallT}" y2="${tip.y - ny * wallT}" stroke="#1f2937" stroke-width="${wallT * 0.15}"/>`
    );
    // silence unused var warning from hx/hy (they may be used if we add hinge dot)
    void hx; void hy;
  }

  return parts.join("");
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

/** Convert an SVG string to a data URL (same format other floor plan flows use). */
export function svgStringToDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
