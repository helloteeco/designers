import type { Room, SceneItem } from "./types";

export interface CompositeOptions {
  /** Empty-room backdrop (data URL or absolute URL). */
  backdropUrl: string;
  /**
   * Cutouts to place. Each entry pairs a SceneItem (position) with its
   * product cutout image URL. Drawn in zIndex order, back-to-front.
   */
  placements: Array<{
    sceneItem: SceneItem;
    cutoutUrl: string;
  }>;
  /** Room reference — drives the title banner + floor-plan inset. */
  room: Room;
  /** Show the "KITCHEN" style banner at top. Default true. */
  showTitle?: boolean;
  /** Show the mini floor plan in the bottom-right. Default true. */
  showFloorPlan?: boolean;
  /** Output width in px. Height is derived from the backdrop aspect. */
  outputWidth?: number;
}

/**
 * Composite a Teeco-style install-guide board from an empty-room backdrop
 * + a list of product cutouts (background-removed PNGs). This is the
 * function that turns the Design tab's per-room artifacts into Jeff's
 * actual deliverable — the image that lands in the Install Guide PDF
 * and matches the masterlist by construction.
 *
 * Pure client-side canvas work: no server round-trip, no Gemini call.
 * Designer can re-run it instantly after re-positioning or swapping
 * products.
 */
export async function compositeRoomScene(opts: CompositeOptions): Promise<string> {
  const {
    backdropUrl,
    placements,
    room,
    showTitle = true,
    showFloorPlan = true,
    outputWidth = 1600,
  } = opts;

  const backdrop = await loadImage(backdropUrl);
  const aspect = backdrop.naturalHeight / backdrop.naturalWidth;
  const W = outputWidth;
  const H = Math.round(outputWidth * aspect);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context");

  // 1. Backdrop — fills the canvas
  ctx.drawImage(backdrop, 0, 0, W, H);

  // 2. Cutouts — back-to-front by zIndex
  const sorted = [...placements].sort(
    (a, b) => (a.sceneItem.zIndex ?? 0) - (b.sceneItem.zIndex ?? 0)
  );
  for (const { sceneItem, cutoutUrl } of sorted) {
    if (!cutoutUrl) continue;
    try {
      const cutout = await loadImage(cutoutUrl);
      drawCutout(ctx, cutout, sceneItem, W, H);
    } catch {
      // One bad cutout shouldn't sink the whole composite
    }
  }

  // 3. Room-title banner (top)
  if (showTitle) {
    drawTitleBanner(ctx, room.name, W, H);
  }

  // 4. Floor-plan inset (bottom-right)
  if (showFloorPlan) {
    try {
      await drawFloorPlanInset(ctx, room, W, H);
    } catch {
      // If the SVG rasterization fails (rare), just skip the inset
    }
  }

  return canvas.toDataURL("image/png");
}

function drawCutout(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  item: SceneItem,
  W: number,
  H: number
): void {
  const cx = (item.x / 100) * W;
  const cy = (item.y / 100) * H;
  const w = (item.width / 100) * W;
  const h = (item.height / 100) * H;
  const rot = ((item.rotation ?? 0) * Math.PI) / 180;

  ctx.save();
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  const sx = item.flipX ? -1 : 1;
  const sy = item.flipY ? -1 : 1;
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);

  // Soft drop shadow so the cutout sits on the scene instead of floating
  ctx.shadowColor = "rgba(0, 0, 0, 0.22)";
  ctx.shadowBlur = Math.max(8, w * 0.04);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.max(4, h * 0.04);

  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawTitleBanner(
  ctx: CanvasRenderingContext2D,
  name: string,
  W: number,
  H: number
): void {
  const bandH = Math.round(H * 0.07);
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.fillRect(0, 0, W, bandH);
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `600 ${Math.round(bandH * 0.52)}px "Inter", system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name.toUpperCase(), W / 2, bandH / 2);
  // Hairline separator underneath
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.fillRect(0, bandH, W, 1);
}

async function drawFloorPlanInset(
  ctx: CanvasRenderingContext2D,
  room: Room,
  W: number,
  H: number
): Promise<void> {
  const svg = buildFloorPlanSvg(room);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = await loadImage(dataUrl);

  const insetW = Math.round(W * 0.18);
  const insetH = Math.round(insetW * (img.naturalHeight / img.naturalWidth));
  const pad = Math.round(W * 0.015);
  const x = W - insetW - pad;
  const y = H - insetH - pad;

  // White card behind the plan so it reads on any backdrop
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  roundRect(ctx, x - 6, y - 6, insetW + 12, insetH + 12, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.drawImage(img, x, y, insetW, insetH);
}

/**
 * Inline SVG of the room's top-down plan — matches the look of
 * RoomTopDown.tsx but serialized so we can rasterize it onto the
 * composite canvas.
 */
function buildFloorPlanSvg(room: Room): string {
  const aspect = room.widthFt / Math.max(0.1, room.lengthFt);
  const base = 400;
  const w = aspect >= 1 ? base : base * aspect;
  const h = aspect >= 1 ? base / aspect : base;

  const rects: string[] = [];
  for (const f of room.furniture) {
    const placed = f as typeof f & { x?: number; y?: number; rotation?: number };
    const rotation = placed.rotation ?? 0;
    const isRotated = rotation === 90 || rotation === 270;
    const itemWFt = (isRotated ? f.item.depthIn : f.item.widthIn) / 12;
    const itemHFt = (isRotated ? f.item.widthIn : f.item.depthIn) / 12;
    const rw = (itemWFt / room.widthFt) * w;
    const rh = (itemHFt / room.lengthFt) * h;
    const cx = ((placed.x ?? 50) / 100) * w;
    const cy = ((placed.y ?? 50) / 100) * h;
    const rx = Math.max(0, Math.min(w - rw, cx - rw / 2));
    const ry = Math.max(0, Math.min(h - rh, cy - rh / 2));
    const color = categoryColor(f.item.category);
    rects.push(
      `<rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" fill="${color}" stroke="#374151" stroke-width="0.8" opacity="0.85" />`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="#f0ede6" />
    <rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="none" stroke="#374151" stroke-width="2" />
    ${rects.join("")}
  </svg>`;
}

function categoryColor(category: string): string {
  switch (category) {
    case "seating": return "#d4a574";
    case "beds-mattresses": return "#c4a98a";
    case "tables": return "#a89682";
    case "storage": return "#8b7355";
    case "lighting": return "#f2d77a";
    case "rugs-textiles": return "#bba88a";
    case "decor": return "#9eb08a";
    case "kitchen-dining": return "#c4b5a0";
    case "bathroom": return "#b8c5d1";
    case "outdoor": return "#8fa27a";
    default: return "#d6c5a3";
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 80)}`));
    img.src = src;
  });
}
