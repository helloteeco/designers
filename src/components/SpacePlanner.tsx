"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { saveProject, getProject as getProjectFromStore, logActivity } from "@/lib/store";
import { searchCatalog } from "@/lib/furniture-catalog";
import { suggestFurniture } from "@/lib/auto-suggest";
import type { Project, Room, FurnitureItem, SelectedFurniture } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

interface PlacedItem extends SelectedFurniture {
  x: number;    // room-relative 0-100 (legacy, kept for backwards-compat)
  y: number;
  rotation: number;
  fx?: number;  // whole-floor 0-100 (preferred when present)
  fy?: number;
}

/**
 * Space Planner — stripped to the essentials after Jeff's feedback.
 *
 * Previously: a per-room canvas with attempted SVG cropping + grid/dim/walk
 * toggles + install tips + coverage/clearance stats per room. The per-room
 * cropping was unreliable because Matterport SVGs nest transforms in ways
 * that made my bbox detection shaky.
 *
 * Now: one whole-floor canvas showing the full SVG. Designer drags furniture
 * onto the real plan. Items retain their roomId for the masterlist; the
 * Active Room pill at top tells us where new items go. Rooms are detected
 * by which bbox contains the drop point when dragging.
 *
 * Still falls back to per-room canvas when no SVG has been uploaded yet.
 */
export default function SpacePlanner({ project, onUpdate }: Props) {
  const [activeRoomId, setActiveRoomId] = useState<string>(project.rooms[0]?.id ?? "");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Drag state — refs to avoid stale React closure in the window-level handlers
  const dragRef = useRef<{ id: string; offsetXPct: number; offsetYPct: number } | null>(null);
  const dragPosRef = useRef<{ id: string; fx: number; fy: number } | null>(null);
  const [dragLive, setDragLive] = useState<{ id: string; fx: number; fy: number } | null>(null);

  const svgContent = project.property.floorPlanSvgContent;
  const hasSvg = !!svgContent;

  // Parse the SVG viewBox once per change — drives canvas dimensions
  const parsedViewBox = useMemo(() => parseViewBox(svgContent), [svgContent]);
  const activeRoom = project.rooms.find(r => r.id === activeRoomId) ?? project.rooms[0];

  // Collect all items across rooms, with whole-floor coords computed if absent
  const itemsWithFloorCoords = useMemo(() => {
    if (!parsedViewBox) return [];
    const all: { room: Room; f: PlacedItem; fx: number; fy: number }[] = [];
    for (const room of project.rooms) {
      for (const f of room.furniture) {
        const placed = f as PlacedItem;
        const { fx, fy } = resolveFloorCoords(placed, room, parsedViewBox);
        all.push({ room, f: placed, fx, fy });
      }
    }
    return all;
  }, [project.rooms, parsedViewBox]);

  // Without an SVG, nothing to draw on. Nudge the designer to upload one.
  if (!hasSvg || !parsedViewBox) {
    return (
      <div className="card text-center py-12">
        <div className="text-4xl mb-3">📐</div>
        <h3 className="font-semibold text-brand-900 mb-2">Upload a floor plan first</h3>
        <p className="text-sm text-brand-600 max-w-md mx-auto">
          The Space Planner works on your actual Matterport floor plan.
          Head to <strong>Brief</strong> → drop your Seneca SVG in the dropzone → come back here.
        </p>
      </div>
    );
  }

  if (!activeRoom) {
    return (
      <div className="card text-center py-12">
        <div className="text-4xl mb-3">📐</div>
        <h3 className="font-semibold text-brand-900 mb-2">No rooms yet</h3>
        <p className="text-sm text-brand-600 max-w-md mx-auto">
          Auto-detect should have created rooms from your SVG. Try
          re-running <strong>🤖 Detect Rooms</strong> from the Brief tab.
        </p>
      </div>
    );
  }

  // Past the early return: we know both svgContent and parsedViewBox are set.
  const viewBox = parsedViewBox;

  // Canvas dimensions: SVG aspect × a zoom-scaled target display long side
  const TARGET_LONG = 900 * zoom;
  const svgAspect = viewBox.width / viewBox.height;
  const canvasW = svgAspect >= 1 ? TARGET_LONG : TARGET_LONG * svgAspect;
  const canvasH = svgAspect >= 1 ? TARGET_LONG / svgAspect : TARGET_LONG;

  // Estimate pixels per foot so furniture sizes match the SVG's wall scale.
  // Derived from known-room SVG bboxes (set by the detector) OR from the
  // floor's total sqft + viewBox area.
  const pxPerFt = estimatePxPerFt(project, viewBox, canvasW, canvasH);

  const totalCost = project.rooms.reduce(
    (s, r) => s + r.furniture.reduce((fs, f) => fs + f.item.price * f.quantity, 0),
    0
  );
  const totalItems = project.rooms.reduce((s, r) => s + r.furniture.length, 0);

  // ── Furniture add / drag / remove ────────────────────────────────────

  function addItemToActiveRoom(item: FurnitureItem) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const r = fresh.rooms.find(r => r.id === activeRoomId);
    if (!r) return;

    const existing = r.furniture.find(f => f.item.id === item.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      // Place at active room's centroid in whole-floor coords
      const spot = defaultDropSpotForRoom(r, viewBox);
      const placed: PlacedItem = {
        item,
        quantity: 1,
        roomId: r.id,
        notes: "",
        x: 50, // kept for backward-compat
        y: 50,
        rotation: 0,
        fx: spot.fx,
        fy: spot.fy,
      };
      r.furniture.push(placed);
    }
    saveProject(fresh);
    logActivity(project.id, "furniture_placed", `Placed ${item.name} in ${r.name}`);
    onUpdate();
  }

  function removeItem(roomId: string, itemId: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const r = fresh.rooms.find(r => r.id === roomId);
    if (!r) return;
    r.furniture = r.furniture.filter(f => f.item.id !== itemId);
    saveProject(fresh);
    setSelectedItemId(null);
    onUpdate();
  }

  function rotateItem(roomId: string, itemId: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const r = fresh.rooms.find(r => r.id === roomId);
    if (!r) return;
    const f = r.furniture.find(f => f.item.id === itemId) as PlacedItem | undefined;
    if (!f) return;
    f.rotation = ((f.rotation ?? 0) + 90) % 360;
    saveProject(fresh);
    onUpdate();
  }

  function handleItemMouseDown(e: React.MouseEvent, roomId: string, item: PlacedItem) {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const cRect = canvasRef.current.getBoundingClientRect();
    const cursorFx = ((e.clientX - cRect.left) / cRect.width) * 100;
    const cursorFy = ((e.clientY - cRect.top) / cRect.height) * 100;
    // Find current floor coords for this item
    const room = project.rooms.find(r => r.id === roomId);
    if (!room) return;
    const { fx, fy } = resolveFloorCoords(item, room, viewBox);
    dragRef.current = {
      id: item.item.id,
      offsetXPct: cursorFx - fx,
      offsetYPct: cursorFy - fy,
    };
    const initial = { id: item.item.id, fx, fy };
    dragPosRef.current = initial;
    setSelectedItemId(item.item.id);
    setDragLive(initial);
  }

  function commitDrag(itemId: string, fx: number, fy: number) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;

    // Find which room currently owns this item
    let currentRoom: Room | undefined;
    let currentItem: PlacedItem | undefined;
    for (const r of fresh.rooms) {
      const f = r.furniture.find(f => f.item.id === itemId) as PlacedItem | undefined;
      if (f) { currentRoom = r; currentItem = f; break; }
    }
    if (!currentRoom || !currentItem) return;

    // Did the designer drag the item into a different room? Reassign.
    const svgX = viewBox.x + (fx / 100) * viewBox.width;
    const svgY = viewBox.y + (fy / 100) * viewBox.height;
    const targetRoom = findRoomContainingPoint(fresh.rooms, svgX, svgY) ?? currentRoom;
    if (targetRoom.id !== currentRoom.id) {
      currentRoom.furniture = currentRoom.furniture.filter(f => f.item.id !== itemId);
      currentItem.roomId = targetRoom.id;
      targetRoom.furniture.push(currentItem);
      setActiveRoomId(targetRoom.id);
    }

    currentItem.fx = fx;
    currentItem.fy = fy;
    saveProject(fresh);
    onUpdate();
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag || !canvasRef.current) return;
      const cRect = canvasRef.current.getBoundingClientRect();
      const cursorFx = ((e.clientX - cRect.left) / cRect.width) * 100;
      const cursorFy = ((e.clientY - cRect.top) / cRect.height) * 100;
      const fx = Math.max(0, Math.min(100, cursorFx - drag.offsetXPct));
      const fy = Math.max(0, Math.min(100, cursorFy - drag.offsetYPct));
      const next = { id: drag.id, fx, fy };
      dragPosRef.current = next;
      setDragLive(next);
    }
    function onUp() {
      const drag = dragRef.current;
      const pos = dragPosRef.current;
      if (drag && pos && pos.id === drag.id) {
        commitDrag(drag.id, pos.fx, pos.fy);
      }
      dragRef.current = null;
      dragPosRef.current = null;
      setDragLive(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Catalog sidebar ──────────────────────────────────────────────────

  const suggestions = suggestFurniture(activeRoom, project.style).slice(0, 8);
  const catalogItems = catalogSearch ? searchCatalog(catalogSearch) : [];

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div>
      {/* Top bar — essentials only: Active Room pill + totals + zoom */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-brand-600">
            Active Room
          </label>
          <select
            value={activeRoomId}
            onChange={e => setActiveRoomId(e.target.value)}
            className="rounded-lg border border-amber/40 bg-amber/10 px-3 py-1.5 text-sm font-medium text-brand-900"
          >
            {project.rooms.map(r => (
              <option key={r.id} value={r.id}>
                {r.name} — {r.widthFt}&apos;×{r.lengthFt}&apos;
              </option>
            ))}
          </select>
          <span className="text-xs text-brand-600/70 hidden sm:inline">
            New items from the catalog drop here
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="text-brand-700">
            <strong>{totalItems}</strong> items
          </span>
          <span className="text-brand-700">
            <strong>${totalCost.toLocaleString()}</strong>
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="text-brand-600 hover:text-brand-900 px-2">−</button>
            <span className="text-[10px] text-brand-600 w-10 text-center">{(zoom * 100).toFixed(0)}%</span>
            <button onClick={() => setZoom(z => Math.min(2, z + 0.25))} className="text-brand-600 hover:text-brand-900 px-2">+</button>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Canvas — full SVG */}
        <div className="flex-1 min-w-0">
          <div className="card p-3">
            <div className="overflow-auto max-h-[700px]">
              <div
                ref={canvasRef}
                className="relative mx-auto rounded-lg overflow-hidden"
                style={{
                  width: canvasW,
                  height: canvasH,
                  backgroundColor: "#fff",
                }}
                onClick={() => setSelectedItemId(null)}
              >
                {/* SVG floor plan as full canvas */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
                  preserveAspectRatio="xMidYMid meet"
                  dangerouslySetInnerHTML={{ __html: extractSvgInner(svgContent!) }}
                />

                {/* Furniture — all rooms' items rendered in whole-floor coords */}
                {itemsWithFloorCoords.map(({ room, f, fx, fy }) => {
                  const live = dragLive?.id === f.item.id ? dragLive : null;
                  const effFx = live ? live.fx : fx;
                  const effFy = live ? live.fy : fy;
                  const rotated = (f.rotation ?? 0) % 180 !== 0;
                  const wFt = (rotated ? f.item.depthIn : f.item.widthIn) / 12;
                  const hFt = (rotated ? f.item.widthIn : f.item.depthIn) / 12;
                  const w = wFt * pxPerFt;
                  const h = hFt * pxPerFt;
                  const leftPx = (effFx / 100) * canvasW - w / 2;
                  const topPx = (effFy / 100) * canvasH - h / 2;
                  const isSelected = selectedItemId === f.item.id;
                  const isDragging = live !== null;
                  const isActiveRoom = room.id === activeRoomId;
                  const color = getCategoryColor(f.item.category);

                  return (
                    <div
                      key={`${room.id}-${f.item.id}`}
                      className={`absolute rounded flex items-center justify-center select-none transition-shadow ${
                        isDragging
                          ? "ring-2 ring-amber z-30 shadow-lg cursor-grabbing"
                          : isSelected
                          ? "ring-2 ring-amber ring-offset-1 z-20 shadow-md cursor-grab"
                          : isActiveRoom
                          ? "cursor-grab hover:ring-1 hover:ring-amber/60 shadow-sm"
                          : "cursor-grab opacity-75 hover:opacity-100 hover:ring-1 hover:ring-amber/40"
                      }`}
                      style={{
                        left: Math.max(0, Math.min(canvasW - w, leftPx)),
                        top: Math.max(0, Math.min(canvasH - h, topPx)),
                        width: w,
                        height: h,
                        backgroundColor: color + "CC",
                        border: `1px solid ${color}`,
                      }}
                      onMouseDown={(e) => handleItemMouseDown(e, room.id, f)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedItemId(isSelected ? null : f.item.id);
                      }}
                      title={`${f.item.name} · ${room.name}`}
                    >
                      <span
                        className="text-white text-center leading-tight font-medium drop-shadow-sm px-1"
                        style={{ fontSize: Math.max(7, Math.min(10, w / 10)) }}
                      >
                        {f.item.name.length > 18 ? f.item.name.slice(0, 16) + "…" : f.item.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected item detail */}
            {selectedItemId && (() => {
              const found = itemsWithFloorCoords.find(i => i.f.item.id === selectedItemId);
              if (!found) return null;
              const { room, f } = found;
              return (
                <div className="mt-3 rounded-lg bg-brand-900/5 px-4 py-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="font-medium text-brand-900">{f.item.name}</span>
                      <span className="text-brand-600 text-xs ml-2">
                        {f.item.widthIn}&quot;W × {f.item.depthIn}&quot;D × {f.item.heightIn}&quot;H
                      </span>
                      <span className="text-brand-600 text-xs ml-2">
                        in <strong>{room.name}</strong> · ${f.item.price}
                      </span>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <button onClick={() => rotateItem(room.id, f.item.id)} className="text-amber-dark hover:underline">
                        Rotate 90°
                      </button>
                      <button onClick={() => removeItem(room.id, f.item.id)} className="text-red-500 hover:underline">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Catalog sidebar */}
        <div className="w-72 shrink-0">
          <div className="card max-h-[80vh] overflow-y-auto sticky top-4">
            <h3 className="font-semibold mb-1 text-sm">Add Furniture</h3>
            <div className="text-[10px] text-brand-600/70 mb-3">
              → drops into <strong>{activeRoom.name}</strong>
            </div>

            <input
              className="input mb-3 text-xs"
              placeholder="Search catalog..."
              value={catalogSearch}
              onChange={e => setCatalogSearch(e.target.value)}
            />

            {!catalogSearch && suggestions.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-dark mb-1.5">
                  Suggested for {activeRoom.type.replace(/-/g, " ")}
                </div>
                {suggestions.map(item => {
                  const added = activeRoom.furniture.some(f => f.item.id === item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => !added && addItemToActiveRoom(item)}
                      disabled={added}
                      className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-xs transition mb-1 ${
                        added ? "bg-amber/5 text-brand-600/60" : "hover:bg-amber/10"
                      }`}
                    >
                      <div className="truncate text-left">
                        <div className="font-medium text-brand-900">{item.name}</div>
                        <div className="text-[10px] text-brand-600">
                          {item.widthIn}&quot;×{item.depthIn}&quot; · ${item.price}
                        </div>
                      </div>
                      <span className="text-amber-dark shrink-0 ml-1">{added ? "✓" : "+"}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {catalogSearch && (
              <div className="space-y-1">
                <div className="text-[10px] text-brand-600 mb-1">{catalogItems.length} results</div>
                {catalogItems.slice(0, 30).map(item => {
                  const added = activeRoom.furniture.some(f => f.item.id === item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => !added && addItemToActiveRoom(item)}
                      disabled={added}
                      className={`flex w-full items-center justify-between rounded border px-2 py-1.5 text-xs transition ${
                        added ? "border-amber/30 bg-amber/5" : "border-brand-900/5 hover:border-amber/30"
                      }`}
                    >
                      <div className="truncate text-left">
                        <div className="font-medium text-brand-900">{item.name}</div>
                        <div className="text-[10px] text-brand-600">
                          {item.vendor} · {item.widthIn}&quot;×{item.depthIn}&quot; · ${item.price}
                        </div>
                      </div>
                      <span className="text-amber-dark shrink-0 ml-1">{added ? "✓" : "+"}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Room items inline — quick scan by room */}
            <div className="mt-4 pt-3 border-t border-brand-900/5 space-y-3">
              {project.rooms.filter(r => r.furniture.length > 0).map(r => (
                <div key={r.id}>
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
                      {r.name} ({r.furniture.length})
                    </div>
                    <div className="text-[10px] text-brand-600">
                      ${r.furniture.reduce((s, f) => s + f.item.price * f.quantity, 0).toLocaleString()}
                    </div>
                  </div>
                  {r.furniture.map(f => (
                    <div key={f.item.id} className="flex items-center justify-between text-xs py-0.5">
                      <span className="truncate text-brand-700">{f.item.name}</span>
                      <span className="text-brand-600 shrink-0 ml-1">${f.item.price}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function parseViewBox(svgText?: string): { x: number; y: number; width: number; height: number } | null {
  if (!svgText) return null;
  const m = svgText.match(/viewBox\s*=\s*["']([^"']+)["']/);
  if (!m) return null;
  const parts = m[1].split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n))) return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

const _innerCache = new Map<string, string>();
function extractSvgInner(svgText: string): string {
  const cached = _innerCache.get(svgText);
  if (cached !== undefined) return cached;
  const match = svgText.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  const inner = match ? match[1] : svgText;
  if (_innerCache.size > 4) _innerCache.clear();
  _innerCache.set(svgText, inner);
  return inner;
}

/**
 * Derive pixels-per-foot from the SVG + any detected room bbox.
 * Prefer rooms that have svgBBox set — they were dimensioned by the
 * auto-detect pass, so we can compute scale exactly. Fall back to using
 * the property's total sqft spread over the viewBox area.
 */
function estimatePxPerFt(
  project: Project,
  vb: { x: number; y: number; width: number; height: number },
  canvasW: number,
  canvasH: number
): number {
  const pxPerSvgUnitX = canvasW / vb.width;
  const pxPerSvgUnitY = canvasH / vb.height;
  const pxPerSvgUnit = (pxPerSvgUnitX + pxPerSvgUnitY) / 2;

  // Try rooms with svgBBox first — most accurate
  const upfs: number[] = [];
  for (const r of project.rooms) {
    if (!r.svgBBox || !r.widthFt || !r.lengthFt) continue;
    const areaUnits = r.svgBBox.width * r.svgBBox.height;
    const areaFt = r.widthFt * r.lengthFt;
    if (areaUnits > 0 && areaFt > 0) {
      upfs.push(Math.sqrt(areaUnits / areaFt));
    }
  }
  if (upfs.length > 0) {
    upfs.sort((a, b) => a - b);
    const unitsPerFt = upfs[Math.floor(upfs.length / 2)];
    return unitsPerFt * pxPerSvgUnit;
  }

  // Fallback: total interior sqft / viewBox area → unitsPerFt
  const interiorSqft = project.rooms
    .filter(r => r.type !== "outdoor")
    .reduce((s, r) => s + r.widthFt * r.lengthFt, 0);
  if (interiorSqft > 0) {
    const vbArea = vb.width * vb.height;
    const unitsPerFt = Math.sqrt(vbArea / interiorSqft) * 0.7; // house doesn't fill the viewBox
    return unitsPerFt * pxPerSvgUnit;
  }

  // Last resort: 40 px/ft on a 900 px canvas implies ~22 ft visible
  return 40;
}

/**
 * Convert a PlacedItem's stored coords to whole-floor % (fx, fy).
 * Prefers item.fx/fy when present (new), falls back to translating
 * item.x/y (room-relative) through room.svgBBox into the SVG viewBox.
 */
function resolveFloorCoords(
  item: PlacedItem,
  room: Room,
  vb: { x: number; y: number; width: number; height: number }
): { fx: number; fy: number } {
  if (typeof item.fx === "number" && typeof item.fy === "number") {
    return { fx: item.fx, fy: item.fy };
  }
  const bb = room.svgBBox;
  if (bb && vb.width > 0 && vb.height > 0) {
    const svgX = bb.x + ((item.x ?? 50) / 100) * bb.width;
    const svgY = bb.y + ((item.y ?? 50) / 100) * bb.height;
    return {
      fx: ((svgX - vb.x) / vb.width) * 100,
      fy: ((svgY - vb.y) / vb.height) * 100,
    };
  }
  // No bbox → can't translate. Park at center so the designer sees it.
  return { fx: 50, fy: 50 };
}

function defaultDropSpotForRoom(
  room: Room,
  vb: { x: number; y: number; width: number; height: number }
): { fx: number; fy: number } {
  const bb = room.svgBBox;
  if (!bb) return { fx: 50, fy: 50 };
  const cx = bb.x + bb.width / 2;
  const cy = bb.y + bb.height / 2;
  return {
    fx: ((cx - vb.x) / vb.width) * 100,
    fy: ((cy - vb.y) / vb.height) * 100,
  };
}

function findRoomContainingPoint(
  rooms: Room[],
  svgX: number,
  svgY: number
): Room | null {
  for (const r of rooms) {
    const bb = r.svgBBox;
    if (!bb) continue;
    if (
      svgX >= bb.x &&
      svgX <= bb.x + bb.width &&
      svgY >= bb.y &&
      svgY <= bb.y + bb.height
    ) {
      return r;
    }
  }
  return null;
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    "beds-mattresses": "#8B7355",
    seating: "#6B8E6B",
    tables: "#7B6B5B",
    storage: "#8B7B6B",
    lighting: "#C4A56B",
    decor: "#A08070",
    "rugs-textiles": "#9B8B7B",
    outdoor: "#6B8B5B",
    "kitchen-dining": "#7B8B9B",
    bathroom: "#6B9BAB",
  };
  return colors[category] ?? "#8B7B6B";
}
