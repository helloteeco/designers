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
  /** Optional install tips rendered underneath the scene, left side. */
  tips?: string;
  /** Output width in px. Height is derived from the backdrop aspect. */
  outputWidth?: number;
}

/**
 * Composite a Teeco-style install-guide board from an empty-room backdrop
 * + a list of product cutouts. Output layout matches Jeff's reference:
 *
 *   ┌──────────────────────────────┐
 *   │      ROOM TITLE (banner)     │
 *   ├──────────────────────────────┤
 *   │                              │
 *   │         SCENE (cutouts)      │
 *   │                              │
 *   ├──────────────────────────────┤
 *   │ TIPS (left)   │ FLOOR (right)│
 *   └──────────────────────────────┘
 *
 * Pure client-side canvas work: no server round-trip for the composition
 * itself. Cutouts hosted on third-party CDNs load via /api/proxy-image so
 * the canvas never gets CORS-tainted.
 */
export async function compositeRoomScene(opts: CompositeOptions): Promise<string> {
  const {
    backdropUrl,
    placements,
    room,
    showTitle = true,
    showFloorPlan = true,
    tips,
    outputWidth = 1600,
  } = opts;

  const backdrop = await loadImage(backdropUrl);
  const backdropAspect = backdrop.naturalHeight / backdrop.naturalWidth;
  const sceneW = outputWidth;
  const sceneH = Math.round(outputWidth * backdropAspect);

  const titleH = showTitle ? Math.round(sceneH * 0.07) : 0;
  const hasBottom = !!(tips && tips.trim()) || showFloorPlan;
  const bottomH = hasBottom ? Math.round(sceneH * 0.18) : 0;

  const W = outputWidth;
  const H = titleH + sceneH + bottomH;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context");

  // 0. Page background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // 1. Title banner (top)
  if (showTitle) {
    drawTitleBanner(ctx, room.name, W, titleH);
  }

  // 2. Scene — backdrop fills the middle band
  ctx.drawImage(backdrop, 0, titleH, sceneW, sceneH);

  // 3. Cutouts — back-to-front by zIndex, positioned as % of scene band
  const sorted = [...placements].sort(
    (a, b) => (a.sceneItem.zIndex ?? 0) - (b.sceneItem.zIndex ?? 0)
  );
  for (const { sceneItem, cutoutUrl } of sorted) {
    if (!cutoutUrl) continue;
    try {
      const cutout = await loadImage(cutoutUrl);
      drawCutout(ctx, cutout, sceneItem, sceneW, sceneH, titleH);
    } catch {
      // One bad cutout shouldn't sink the whole composite
    }
  }

  // 4. Bottom band: tips left + floor plan right (matches Jeff's reference)
  if (hasBottom) {
    const pad = Math.round(W * 0.02);
    const bottomTop = titleH + sceneH;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, bottomTop, W, bottomH);
    // subtle hairline between scene and bottom
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(0, bottomTop, W, 1);

    // Floor plan on the right
    let tipsRightLimit = W - pad;
    if (showFloorPlan) {
      try {
        const svg = buildFloorPlanSvg(room);
        const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
        const planH = bottomH - pad * 2;
        const planW = Math.round(planH * (img.naturalWidth / img.naturalHeight));
        const planX = W - planW - pad;
        const planY = bottomTop + pad;
        ctx.drawImage(img, planX, planY, planW, planH);
        tipsRightLimit = planX - pad;
      } catch {
        // If SVG rasterization fails we still get tips on the left
      }
    }

    // Tips on the left
    if (tips && tips.trim()) {
      drawTips(ctx, tips, pad, bottomTop + pad, tipsRightLimit - pad, bottomH - pad * 2);
    }
  }

  return canvas.toDataURL("image/png");
}

function drawCutout(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  item: SceneItem,
  sceneW: number,
  sceneH: number,
  sceneTop: number
): void {
  const cx = (item.x / 100) * sceneW;
  const cy = sceneTop + (item.y / 100) * sceneH;
  const w = (item.width / 100) * sceneW;
  const h = (item.height / 100) * sceneH;
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
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `600 ${Math.round(H * 0.52)}px "Inter", system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name.toUpperCase(), W / 2, H / 2);
  // Hairline separator underneath
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.fillRect(0, H, W, 1);
}

/**
 * Draw install tips as a wrapped paragraph with a heading.
 * Matches the Teeco install-guide look: "TIPS" caps label + bullet list.
 */
function drawTips(
  ctx: CanvasRenderingContext2D,
  tips: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number
): void {
  ctx.fillStyle = "#374151";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `600 14px "Inter", system-ui, sans-serif`;
  ctx.fillText("TIPS", x, y);

  const bodyFontSize = Math.max(14, Math.round(maxH * 0.12));
  ctx.font = `${bodyFontSize}px "Inter", system-ui, sans-serif`;
  ctx.fillStyle = "#374151";

  const lines = tips.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  let cursorY = y + 26;
  const lineH = bodyFontSize * 1.35;
  for (const line of lines) {
    if (cursorY > y + maxH) break;
    const bullet = line.startsWith("•") || line.startsWith("-") ? "" : "• ";
    const text = `${bullet}${line.replace(/^[•\-]\s*/, "")}`;
    // Simple word-wrap inside maxW
    const words = text.split(" ");
    let row = "";
    for (const word of words) {
      const candidate = row ? `${row} ${word}` : word;
      if (ctx.measureText(candidate).width > maxW) {
        ctx.fillText(row, x, cursorY);
        cursorY += lineH;
        row = word;
        if (cursorY > y + maxH) return;
      } else {
        row = candidate;
      }
    }
    if (row) {
      ctx.fillText(row, x, cursorY);
      cursorY += lineH;
    }
  }
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
    <rect width="${w}" height="${h}" fill="#f5f1e8" />
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

/**
 * Load an image for canvas compositing without tainting it. Strategy:
 *   - data: URLs load directly
 *   - everything else goes through /api/proxy-image which streams the
 *     bytes back from our origin, so the canvas stays clean and
 *     toDataURL() works reliably
 *
 * If the proxy fails (network issue, non-image response), we fall back
 * to a direct anonymous-CORS load — cutouts on well-configured CDNs
 * (e.g. Supabase Storage with public access) usually work this way.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  if (src.startsWith("data:")) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("data URL load failed"));
      img.src = src;
    });
  }
  return loadViaProxy(src).catch(() => loadDirect(src));
}

async function loadViaProxy(src: string): Promise<HTMLImageElement> {
  const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(src)}`);
  if (!res.ok) throw new Error(`proxy ${res.status}`);
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("blob load failed"));
    img.src = objUrl;
    // Object URL stays valid until the tab unloads; that's fine because
    // the resulting <img> is only needed for the current canvas draw.
  });
}

function loadDirect(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src.slice(0, 80)}`));
    img.src = src;
  });
}
