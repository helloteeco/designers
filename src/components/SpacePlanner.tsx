"use client";

import { useState, useRef, useEffect } from "react";
import { saveProject, getProject as getProjectFromStore, logActivity } from "@/lib/store";
import { CATALOG, searchCatalog } from "@/lib/furniture-catalog";
import { suggestFurniture } from "@/lib/auto-suggest";
import { placeFurniture } from "@/lib/space-planning";
import FloorPlanReference from "./FloorPlanReference";
import type { Project, Room, FurnitureItem, SelectedFurniture } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

interface PlacedItem extends SelectedFurniture {
  x: number;
  y: number;
  rotation: number;
}

const SCALE_FACTOR = 40; // px per foot

export default function SpacePlanner({ project, onUpdate }: Props) {
  const [selectedRoom, setSelectedRoom] = useState(project.rooms[0]?.id ?? "");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showMeasure, setShowMeasure] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showWalkPaths, setShowWalkPaths] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [showCatalog, setShowCatalog] = useState(true);
  const canvasRef = useRef<HTMLDivElement>(null);
  // Drag state — tracked outside React to keep mousemove cheap.
  // dragLive holds the in-flight position so we can re-render at 60fps without
  // touching localStorage; commit happens on mouseup.
  // dragPosRef mirrors dragLive so the window-level mouseup handler always
  // sees the latest position, not a stale React closure value.
  const dragRef = useRef<{ id: string; offsetXPct: number; offsetYPct: number } | null>(null);
  const dragPosRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const [dragLive, setDragLive] = useState<{ id: string; x: number; y: number } | null>(null);
  // Local-only install-tips draft (persisted on blur).
  const [tipsDraft, setTipsDraft] = useState("");
  const [tipsSaved, setTipsSaved] = useState(false);

  // If no rooms defined yet OR selected room is stale
  const rooms = project.rooms ?? [];
  let room = rooms.find(r => r.id === selectedRoom);
  // Auto-heal: if selectedRoom is stale but rooms exist, use first
  if (!room && rooms.length > 0) {
    room = rooms[0];
  }
  if (!room) {
    return (
      <div className="card text-center py-12">
        <div className="text-4xl mb-3">📐</div>
        <h3 className="font-semibold text-brand-900 mb-2">No Rooms Yet</h3>
        <p className="text-sm text-brand-600 max-w-sm mx-auto mb-4">
          The Space Planner needs rooms with dimensions to lay out furniture.
          Add at least one room to get started.
        </p>
        <p className="text-xs text-brand-600/60">
          Use the <strong>Rooms</strong> tab above to define room dimensions, or start
          with a <strong>Template</strong> from the New Project page.
        </p>
      </div>
    );
  }

  // Canvas size: prefer the SVG bbox aspect when present (so the canvas
  // matches the actual room shape from the floor plan, not just a rectangle
  // derived from widthFt × lengthFt). Falls back to the dimensional rectangle.
  const baseLong = Math.max(room.widthFt, room.lengthFt) * SCALE_FACTOR * zoom;
  let canvasW: number;
  let canvasH: number;
  if (room.svgBBox && room.svgBBox.width > 0 && room.svgBBox.height > 0) {
    const svgAspect = room.svgBBox.width / room.svgBBox.height;
    if (svgAspect >= 1) {
      canvasW = baseLong;
      canvasH = baseLong / svgAspect;
    } else {
      canvasH = baseLong;
      canvasW = baseLong * svgAspect;
    }
  } else {
    canvasW = room.widthFt * SCALE_FACTOR * zoom;
    canvasH = room.lengthFt * SCALE_FACTOR * zoom;
  }
  const sqft = room.widthFt * room.lengthFt;

  // Calculate furniture coverage from floor-occupying items only.
  const floorFurniture = room.furniture.filter(f => !isAccessory(f.item));
  const furnitureSqft = floorFurniture.reduce((s, f) => {
    return s + ((f.item.widthIn * f.item.depthIn) / 144) * f.quantity;
  }, 0);
  const coveragePercent = sqft > 0 ? (furnitureSqft / sqft) * 100 : 0;

  // Walk path clearance check (36" minimum)
  const clearanceIssues = checkClearance(room);

  const suggestions = suggestFurniture(room, project.style).slice(0, 8);
  const catalogItems = catalogSearch ? searchCatalog(catalogSearch) : [];

  function getItemRect(f: SelectedFurniture) {
    const placed = f as PlacedItem;
    const rotation = placed.rotation ?? 0;
    const isRotated = rotation === 90 || rotation === 270;
    const w = (isRotated ? f.item.depthIn : f.item.widthIn) / 12 * SCALE_FACTOR * zoom;
    const h = (isRotated ? f.item.widthIn : f.item.depthIn) / 12 * SCALE_FACTOR * zoom;
    const live = dragLive && dragLive.id === f.item.id ? dragLive : null;
    const xPct = live ? live.x : (placed.x ?? 50);
    const yPct = live ? live.y : (placed.y ?? 50);
    const x = (xPct / 100) * canvasW;
    const y = (yPct / 100) * canvasH;
    return { x: x - w / 2, y: y - h / 2, w, h };
  }

  function handleCanvasClick() {
    if (!canvasRef.current) return;
    setSelectedItemId(null);
  }

  function addItemToRoom(item: FurnitureItem) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const r = fresh.rooms.find(r => r.id === selectedRoom);
    if (!r) return;

    if (r.furniture.find(f => f.item.id === item.id)) return;

    r.furniture.push(placeFurniture(r, item));
    saveProject(fresh);
    logActivity(project.id, "furniture_placed", `Placed ${item.name} in ${r.name}`);
    onUpdate();
  }

  // ── Drag handlers ─────────────────────────────────────────────────────
  // Mousedown on an item: record where the cursor is relative to the item
  // center, in % of canvas. We then update item position on mousemove.
  function handleItemMouseDown(e: React.MouseEvent, f: SelectedFurniture) {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const placed = f as PlacedItem;
    const cRect = canvasRef.current.getBoundingClientRect();
    const cursorXPct = ((e.clientX - cRect.left) / cRect.width) * 100;
    const cursorYPct = ((e.clientY - cRect.top) / cRect.height) * 100;
    dragRef.current = {
      id: f.item.id,
      offsetXPct: cursorXPct - (placed.x ?? 50),
      offsetYPct: cursorYPct - (placed.y ?? 50),
    };
    const initial = { id: f.item.id, x: placed.x ?? 50, y: placed.y ?? 50 };
    dragPosRef.current = initial;
    setSelectedItemId(f.item.id);
    setDragLive(initial);
  }

  function commitDragImmediate(itemId: string, xPct: number, yPct: number) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const r = fresh.rooms.find(r => r.id === selectedRoom);
    if (!r) return;
    const f = r.furniture.find(f => f.item.id === itemId) as PlacedItem | undefined;
    if (!f) return;
    f.x = xPct;
    f.y = yPct;
    saveProject(fresh);
    onUpdate();
  }

  // Window-level mousemove/mouseup so dragging continues even if the cursor
  // briefly leaves the canvas. We always clamp to the canvas bounds.
  // Listeners are registered ONCE (empty deps) so the closure can't go stale.
  // Latest position is read from dragPosRef which onMove updates on every frame.
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag || !canvasRef.current) return;
      const cRect = canvasRef.current.getBoundingClientRect();
      const cursorXPct = ((e.clientX - cRect.left) / cRect.width) * 100;
      const cursorYPct = ((e.clientY - cRect.top) / cRect.height) * 100;
      const xPct = Math.max(0, Math.min(100, cursorXPct - drag.offsetXPct));
      const yPct = Math.max(0, Math.min(100, cursorYPct - drag.offsetYPct));
      const next = { id: drag.id, x: xPct, y: yPct };
      dragPosRef.current = next;
      setDragLive(next);
    }
    function onUp() {
      const drag = dragRef.current;
      const pos = dragPosRef.current;
      if (drag && pos && pos.id === drag.id) {
        commitDragImmediate(drag.id, pos.x, pos.y);
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
  }, [selectedRoom]);

  function removeFromRoom(itemId: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const r = fresh.rooms.find(r => r.id === selectedRoom);
    if (!r) return;
    r.furniture = r.furniture.filter(f => f.item.id !== itemId);
    saveProject(fresh);
    setSelectedItemId(null);
    onUpdate();
  }

  function rotateItem(itemId: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const r = fresh.rooms.find(r => r.id === selectedRoom);
    if (!r) return;
    const f = r.furniture.find(f => f.item.id === itemId) as PlacedItem | undefined;
    if (!f) return;
    f.rotation = ((f.rotation ?? 0) + 90) % 360;
    saveProject(fresh);
    onUpdate();
  }

  function autoFillRoom() {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const r = fresh.rooms.find(r => r.id === selectedRoom);
    if (!r) return;

    const items = suggestFurniture(r, fresh.style);
    let skipped = 0;
    for (const item of items) {
      if (r.furniture.find(f => f.item.id === item.id)) continue;
      // Skip items that physically can't fit in the room (sofa wider than the
      // room, king bed in a 6-foot bedroom, etc.). User can still add via
      // the catalog if they really want.
      const itemWFt = item.widthIn / 12;
      const itemDFt = item.depthIn / 12;
      const fitsAsIs = itemWFt <= r.widthFt && itemDFt <= r.lengthFt;
      const fitsRotated = itemDFt <= r.widthFt && itemWFt <= r.lengthFt;
      if (!fitsAsIs && !fitsRotated) {
        skipped++;
        continue;
      }
      r.furniture.push(placeFurniture(r, item));
    }

    saveProject(fresh);
    logActivity(project.id, "auto_furnish", `Auto-furnished ${r.name}${skipped ? ` (skipped ${skipped} oversized)` : ""}`);
    onUpdate();
  }

  function cleanupGarbageRooms(ids: string[]) {
    if (ids.length === 0) return;
    if (!confirm(`Remove ${ids.length} unused room${ids.length === 1 ? "" : "s"}? They have no furniture and look like duplicate or garbage detections.`)) return;
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    fresh.rooms = fresh.rooms.filter(r => !ids.includes(r.id));
    saveProject(fresh);
    if (ids.includes(selectedRoom)) {
      setSelectedRoom(fresh.rooms[0]?.id ?? "");
    }
    logActivity(project.id, "rooms_cleaned", `Removed ${ids.length} garbage rooms`);
    onUpdate();
  }

  function clearRoomFurniture() {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const r = fresh.rooms.find(r => r.id === selectedRoom);
    if (!r) return;
    if (r.furniture.length === 0) return;
    if (!confirm(`Remove all ${r.furniture.length} items from ${r.name}? This can't be undone.`)) return;
    r.furniture = [];
    saveProject(fresh);
    setSelectedItemId(null);
    logActivity(project.id, "room_cleared", `Cleared furniture in ${r.name}`);
    onUpdate();
  }

  function saveInstallTips(value: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const r = fresh.rooms.find(r => r.id === selectedRoom);
    if (!r) return;
    r.installTips = value;
    saveProject(fresh);
    setTipsSaved(true);
    setTimeout(() => setTipsSaved(false), 1500);
    onUpdate();
  }

  const roomCost = room.furniture.reduce((s, f) => s + f.item.price * f.quantity, 0);
  const selectedItem = selectedItemId ? room.furniture.find(f => f.item.id === selectedItemId) : null;
  const currentRoomId = room.id;

  // Sync local tips draft when the selected room changes.
  useEffect(() => {
    setTipsDraft(room.installTips ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoomId]);

  return (
    <div>
      {/* Floor plan reference */}
      <FloorPlanReference project={project} />

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Space Planner</h2>
          <p className="text-sm text-brand-600">
            Plan furniture layout with real dimensions from your 3D scan.
            36&quot; clearance paths shown for walkability.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCatalog(!showCatalog)} className="btn-secondary btn-sm">
            {showCatalog ? "Hide" : "Show"} Catalog
          </button>
        </div>
      </div>

      {/* Room Tabs — only "real" rooms by default; hide garbage detections
          (e.g. "Excluded Area Porch 58 SQ FT D", "- Entry -") and exact-name
          duplicates that came from re-running auto-detect. */}
      {(() => {
        const garbage = project.rooms.filter(r => isGarbageRoom(r, project.rooms));
        const visible = project.rooms.filter(r => !isGarbageRoom(r, project.rooms));
        return (
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            {visible.map(r => (
              <button
                key={r.id}
                onClick={() => { setSelectedRoom(r.id); setSelectedItemId(null); }}
                className={selectedRoom === r.id ? "tab-active" : "tab"}
              >
                {r.name}
                <span className="ml-1 text-[10px] opacity-60">{r.furniture.length}</span>
              </button>
            ))}
            {garbage.length > 0 && (
              <button
                onClick={() => cleanupGarbageRooms(garbage.map(r => r.id))}
                className="text-[10px] text-red-500 hover:underline ml-2"
                title={`Remove: ${garbage.map(r => r.name).join(", ")}`}
              >
                🧹 Clean up {garbage.length} unused room{garbage.length === 1 ? "" : "s"}
              </button>
            )}
          </div>
        );
      })()}

      {/* Scan Links */}
      {(project.property.matterportLink || project.property.polycamLink) && (
        <div className="mb-4 flex gap-3 rounded-lg bg-blue-50 border border-blue-200 px-4 py-2">
          <div className="text-xs text-blue-700 flex items-center gap-2 flex-1">
            <span className="font-semibold">Reference your 3D scan:</span>
            {project.property.matterportLink && (
              <a href={project.property.matterportLink} target="_blank" rel="noopener noreferrer" className="underline">
                Matterport
              </a>
            )}
            {project.property.polycamLink && (
              <a href={project.property.polycamLink} target="_blank" rel="noopener noreferrer" className="underline">
                Polycam
              </a>
            )}
          </div>
          <div className="text-[10px] text-blue-600/60">
            Use scan measurements to verify room dimensions
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <StatCard label="Room Size" value={`${room.widthFt}' x ${room.lengthFt}'`} sub={`${sqft} sqft`} />
        <StatCard label="Items" value={room.furniture.length.toString()} sub={`${furnitureSqft.toFixed(0)} sqft covered`} />
        <StatCard
          label="Coverage"
          value={`${coveragePercent.toFixed(0)}%`}
          sub={coveragePercent > 60 ? "Feels crowded" : coveragePercent > 40 ? "Well furnished" : "Room to add"}
          warn={coveragePercent > 60}
        />
        <StatCard
          label="Clearance"
          value={clearanceIssues.length === 0 ? "OK" : `${clearanceIssues.length} issue(s)`}
          sub={'Min 36" walkways'}
          warn={clearanceIssues.length > 0}
        />
        <StatCard label="Room Cost" value={`$${roomCost.toLocaleString()}`} sub={`$${sqft > 0 ? (roomCost / sqft).toFixed(0) : 0}/sqft`} />
      </div>

      <div className="flex gap-4">
        {/* Canvas */}
        <div className="flex-1">
          <div className="card p-3">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowGrid(!showGrid)}
                  className={`text-[10px] rounded px-2 py-1 ${showGrid ? "bg-brand-900 text-white" : "bg-brand-900/5 text-brand-600"}`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setShowMeasure(!showMeasure)}
                  className={`text-[10px] rounded px-2 py-1 ${showMeasure ? "bg-brand-900 text-white" : "bg-brand-900/5 text-brand-600"}`}
                >
                  Dimensions
                </button>
                <button
                  onClick={() => setShowWalkPaths(!showWalkPaths)}
                  className={`text-[10px] rounded px-2 py-1 ${showWalkPaths ? "bg-brand-900 text-white" : "bg-brand-900/5 text-brand-600"}`}
                >
                  Walk Paths
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="text-xs text-brand-600 hover:text-brand-900">-</button>
                <span className="text-[10px] text-brand-600 w-10 text-center">{(zoom * 100).toFixed(0)}%</span>
                <button onClick={() => setZoom(z => Math.min(2, z + 0.25))} className="text-xs text-brand-600 hover:text-brand-900">+</button>
                <button
                  onClick={autoFillRoom}
                  className="text-xs text-amber-dark hover:underline font-medium ml-3"
                  title={room.furniture.length > 0 ? "Adds more suggested items without replacing existing ones" : "One-click fill with style-matched pieces (oversized items skipped)"}
                >
                  {room.furniture.length === 0 ? "Auto-Furnish" : "+ Add Suggestions"}
                </button>
                {room.furniture.length > 0 && (
                  <button
                    onClick={clearRoomFurniture}
                    className="text-xs text-red-500 hover:underline ml-2"
                    title="Remove all furniture from this room"
                  >
                    Clear Room
                  </button>
                )}
              </div>
            </div>

            {/* Room Canvas */}
            <div className="overflow-auto max-h-[600px]">
              <div
                ref={canvasRef}
                className={`relative mx-auto rounded-lg overflow-hidden ${
                  project.property.floorPlanSvgContent && room.svgBBox
                    ? ""
                    : "border-2 border-brand-900/20"
                }`}
                style={{
                  width: canvasW,
                  height: canvasH,
                  backgroundColor: "#f0ede6",
                }}
                onClick={handleCanvasClick}
              >
                {/* SVG floor-plan backdrop — when present, this IS the canvas:
                    real walls, doors, windows, fixtures from the Matterport
                    schematic at full opacity. Furniture renders on top. */}
                {project.property.floorPlanSvgContent && room.svgBBox && (
                  <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox={`${room.svgBBox.x} ${room.svgBBox.y} ${room.svgBBox.width} ${room.svgBBox.height}`}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ opacity: 0.95 }}
                    dangerouslySetInnerHTML={{ __html: extractSvgInner(project.property.floorPlanSvgContent) }}
                  />
                )}

                {/* Grid */}
                {showGrid && Array.from({ length: Math.floor(room.widthFt) - 1 }).map((_, i) => (
                  <div key={`v${i}`} className="absolute top-0 bottom-0 border-l border-brand-900/5" style={{ left: (i + 1) * SCALE_FACTOR * zoom }} />
                ))}
                {showGrid && Array.from({ length: Math.floor(room.lengthFt) - 1 }).map((_, i) => (
                  <div key={`h${i}`} className="absolute left-0 right-0 border-t border-brand-900/5" style={{ top: (i + 1) * SCALE_FACTOR * zoom }} />
                ))}

                {/* Dimensions */}
                {showMeasure && (
                  <>
                    <div className="absolute -top-5 left-0 right-0 flex justify-center">
                      <span className="text-[10px] font-mono text-brand-600">{room.widthFt}&apos;</span>
                    </div>
                    <div className="absolute top-0 bottom-0 -right-5 flex items-center">
                      <span className="text-[10px] font-mono text-brand-600 -rotate-90">{room.lengthFt}&apos;</span>
                    </div>
                  </>
                )}

                {/* Features */}
                {room.features.includes("Window") && (
                  <div className="absolute top-0 left-[15%] right-[15%] h-1.5 bg-blue-300/50 rounded-b" title="Window" />
                )}
                {room.features.includes("Fireplace") && (
                  <div className="absolute bottom-0 left-[30%] w-[20%] h-2 bg-orange-300/50 rounded-t" title="Fireplace" />
                )}
                {room.features.includes("Closet") && (
                  <div className="absolute top-0 right-0 w-[15%] h-[15%] bg-brand-900/5 rounded-bl border-l border-b border-brand-900/10">
                    <span className="text-[7px] text-brand-600/40 p-0.5 block">closet</span>
                  </div>
                )}
                {room.features.includes("En-suite") && (
                  <div className="absolute bottom-0 right-0 w-[20%] h-[15%] bg-blue-50/60 rounded-tl border-l border-t border-blue-200/40">
                    <span className="text-[7px] text-blue-400/60 p-0.5 block">en-suite</span>
                  </div>
                )}

                {/* Door clearance zone (3ft from entry) */}
                {showWalkPaths && (
                  <div
                    className="absolute bottom-0 left-[40%] w-[12%] border-2 border-dashed border-amber/30 rounded-t"
                    style={{ height: 3 * SCALE_FACTOR * zoom }}
                    title="Door clearance zone (3ft)"
                  >
                    <span className="text-[7px] text-amber/50 p-0.5 block text-center">door</span>
                  </div>
                )}

                {/* Accent wall */}
                {room.accentWall && (
                  <div
                    className="absolute"
                    style={{
                      backgroundColor: room.accentWall.color + "30",
                      borderColor: room.accentWall.color,
                      ...(room.accentWall.wall === "north"
                        ? { top: 0, left: 0, right: 0, height: 4, borderBottomWidth: 2 }
                        : room.accentWall.wall === "south"
                          ? { bottom: 0, left: 0, right: 0, height: 4, borderTopWidth: 2 }
                          : room.accentWall.wall === "east"
                            ? { top: 0, bottom: 0, right: 0, width: 4, borderLeftWidth: 2 }
                            : { top: 0, bottom: 0, left: 0, width: 4, borderRightWidth: 2 }),
                    }}
                  />
                )}

                {/* Furniture items */}
                {room.furniture.map(f => {
                  const rect = getItemRect(f);
                  const isSelected = selectedItemId === f.item.id;
                  const categoryColor = getCategoryColor(f.item.category);

                  const isDragging = dragLive?.id === f.item.id;
                  return (
                    <div
                      key={f.item.id}
                      className={`absolute rounded flex items-center justify-center transition-shadow ${
                        isDragging
                          ? "ring-2 ring-amber z-20 shadow-lg cursor-grabbing"
                          : isSelected
                          ? "ring-2 ring-amber ring-offset-1 z-10 shadow-md cursor-grab"
                          : "hover:ring-1 hover:ring-amber/50 shadow-sm cursor-grab"
                      }`}
                      style={{
                        left: Math.max(0, Math.min(canvasW - rect.w, rect.x)),
                        top: Math.max(0, Math.min(canvasH - rect.h, rect.y)),
                        width: rect.w,
                        height: rect.h,
                        backgroundColor: categoryColor + "CC",
                        borderWidth: 1,
                        borderColor: categoryColor,
                        userSelect: "none",
                      }}
                      onMouseDown={e => handleItemMouseDown(e, f)}
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedItemId(isSelected && !isDragging ? null : f.item.id);
                      }}
                    >
                      <span
                        className="text-white text-center leading-tight font-medium drop-shadow-sm px-1"
                        style={{ fontSize: Math.max(7, Math.min(10, rect.w / 8)) }}
                      >
                        {f.item.name.length > 15 ? f.item.name.slice(0, 13) + "..." : f.item.name}
                      </span>
                      {/* Dimension label */}
                      {showMeasure && isSelected && (
                        <div className="absolute -bottom-4 left-0 right-0 text-center">
                          <span className="text-[8px] font-mono bg-white/90 px-1 rounded text-brand-700">
                            {f.item.widthIn}&quot;x{f.item.depthIn}&quot;
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected item detail */}
            {selectedItem && (
              <div className="mt-3 rounded-lg bg-brand-900/5 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-brand-900">{selectedItem.item.name}</span>
                    <span className="text-brand-600 text-xs ml-2">
                      {selectedItem.item.widthIn}&quot;W x {selectedItem.item.depthIn}&quot;D x {selectedItem.item.heightIn}&quot;H
                    </span>
                    <span className="text-brand-600 text-xs ml-2">
                      {selectedItem.item.vendor} &middot; ${selectedItem.item.price}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => rotateItem(selectedItem.item.id)} className="text-xs text-amber-dark hover:underline">
                      Rotate 90&deg;
                    </button>
                    <button onClick={() => removeFromRoom(selectedItem.item.id)} className="text-xs text-red-500 hover:underline">
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Clearance Issues */}
            {clearanceIssues.length > 0 && (
              <div className="mt-3 rounded-lg bg-amber/10 border border-amber/20 px-4 py-2">
                <div className="text-xs font-semibold text-amber-dark mb-1">Space Planning Alerts</div>
                {clearanceIssues.map((issue, i) => (
                  <div key={i} className="text-xs text-brand-700">&bull; {issue}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Catalog Sidebar */}
        {showCatalog && (
          <div className="w-72 shrink-0">
            <div className="card max-h-[80vh] overflow-y-auto sticky top-4">
              <h3 className="font-semibold mb-3 text-sm">Add Furniture</h3>

              <input
                className="input mb-3 text-xs"
                placeholder="Search catalog..."
                value={catalogSearch}
                onChange={e => setCatalogSearch(e.target.value)}
              />

              {/* Suggestions */}
              {!catalogSearch && suggestions.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-dark mb-1.5">
                    Suggested for {room.type.replace(/-/g, " ")}
                  </div>
                  {suggestions.map(item => {
                    const isAdded = room.furniture.some(f => f.item.id === item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => !isAdded && addItemToRoom(item)}
                        disabled={isAdded}
                        className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-xs transition mb-1 ${
                          isAdded ? "bg-amber/5 text-brand-600/60" : "hover:bg-amber/10"
                        }`}
                      >
                        <div className="truncate text-left">
                          <div className="font-medium text-brand-900">{item.name}</div>
                          <div className="text-[10px] text-brand-600">
                            {item.widthIn}&quot;x{item.depthIn}&quot; &middot; ${item.price}
                          </div>
                        </div>
                        <span className="text-amber-dark shrink-0 ml-1">
                          {isAdded ? "\u2713" : "+"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Search Results */}
              {catalogSearch && (
                <div className="space-y-1">
                  <div className="text-[10px] text-brand-600 mb-1">{catalogItems.length} results</div>
                  {catalogItems.slice(0, 30).map(item => {
                    const isAdded = room.furniture.some(f => f.item.id === item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => !isAdded && addItemToRoom(item)}
                        disabled={isAdded}
                        className={`flex w-full items-center justify-between rounded border px-2 py-1.5 text-xs transition ${
                          isAdded ? "border-amber/30 bg-amber/5" : "border-brand-900/5 hover:border-amber/30"
                        }`}
                      >
                        <div className="truncate text-left">
                          <div className="font-medium text-brand-900">{item.name}</div>
                          <div className="text-[10px] text-brand-600">
                            {item.vendor} &middot; {item.widthIn}&quot;x{item.depthIn}&quot; &middot; ${item.price}
                          </div>
                        </div>
                        <span className="text-amber-dark shrink-0 ml-1">
                          {isAdded ? "\u2713" : "+"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Install tips editor — feeds the per-room page in the Install Guide */}
              <div className="mt-4 pt-3 border-t border-brand-900/5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
                    Install Tips for {room.name}
                  </div>
                  {tipsSaved && <span className="text-[10px] text-emerald-600">Saved</span>}
                </div>
                <textarea
                  className="input text-xs min-h-[72px]"
                  placeholder={`e.g. "Center the bed under the window. Hang art 8\" above the headboard."`}
                  value={tipsDraft}
                  onChange={e => setTipsDraft(e.target.value)}
                  onBlur={() => {
                    if (tipsDraft !== (room.installTips ?? "")) saveInstallTips(tipsDraft);
                  }}
                />
                <div className="text-[10px] text-brand-600/60 mt-1">
                  Shown on this room&apos;s page in the Install Guide PDF.
                </div>
              </div>

              {/* Room items */}
              {room.furniture.length > 0 && (
                <div className="mt-4 pt-3 border-t border-brand-900/5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-2">
                    In Room ({room.furniture.length})
                  </div>
                  {room.furniture.map(f => (
                    <div key={f.item.id} className="flex items-center justify-between text-xs py-1">
                      <span className="truncate text-brand-700">{f.item.name}</span>
                      <span className="text-brand-600 shrink-0 ml-1">${f.item.price}</span>
                    </div>
                  ))}
                  <div className="mt-2 pt-2 border-t border-brand-900/5 flex justify-between text-xs font-semibold">
                    <span>Total</span>
                    <span>${roomCost.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className={`card py-2 px-3 ${warn ? "border-amber/40 bg-amber/5" : ""}`}>
      <div className="text-[10px] uppercase tracking-wider text-brand-600">{label}</div>
      <div className={`text-lg font-bold ${warn ? "text-amber-dark" : "text-brand-900"}`}>{value}</div>
      <div className="text-[10px] text-brand-600/60">{sub}</div>
    </div>
  );
}

// Strip the outer <svg> wrapper from a Matterport schematic, leaving just
// the inner geometry to inject under our own <svg viewBox>. We cache the
// extracted inner content so we're not re-parsing on every render.
const _svgInnerCache = new WeakMap<object, string>();
const _svgInnerStringCache = new Map<string, string>();
function extractSvgInner(svgText: string): string {
  const cached = _svgInnerStringCache.get(svgText);
  if (cached !== undefined) return cached;
  const match = svgText.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  const inner = match ? match[1] : svgText;
  // Limit cache size to avoid leaks if multiple SVGs are loaded.
  if (_svgInnerStringCache.size > 8) _svgInnerStringCache.clear();
  _svgInnerStringCache.set(svgText, inner);
  void _svgInnerCache; // keep weak-map symbol around for future caching by object key
  return inner;
}

// Hide rooms that look like junk from auto-detect (or duplicates from
// re-running it). Designer can still see the underlying room via the Rooms
// tab; this just keeps the Space Planner tab strip readable.
//
// A room is "garbage" if it has zero furniture AND any of:
//   1. Name has telltale OCR/parser noise: "Excluded Area", "SQ FT", "- Foo -"
//   2. Name is wrapped in dashes ("- Entry -") or starts with a digit
//   3. An exact-name duplicate of another room that already has furniture
function isGarbageRoom(room: Room, allRooms: Room[]): boolean {
  if (room.furniture.length > 0) return false;
  const name = (room.name || "").trim();
  if (!name) return true;
  if (/excluded|sq\s*ft/i.test(name)) return true;
  if (/^[-–—]\s*.+\s*[-–—]$/.test(name)) return true;
  if (/^\d/.test(name)) return true;
  const lower = name.toLowerCase();
  const dupHasFurniture = allRooms.some(
    r => r.id !== room.id && r.name.trim().toLowerCase() === lower && r.furniture.length > 0
  );
  if (dupHasFurniture) return true;
  return false;
}

// Items that don't sit on the floor (wall-mount, on-counter accessories).
// These don't count against clearance or coverage.
function isAccessory(item: FurnitureItem): boolean {
  if (item.category === "bathroom") return true;
  if (item.category === "decor") return true;
  if (item.depthIn === 0 || item.widthIn === 0) return true; // wall-mounted
  return false;
}

function checkClearance(room: Room): string[] {
  const issues: string[] = [];
  const floorItems = room.furniture.filter(f => !isAccessory(f.item));
  const sqft = room.widthFt * room.lengthFt;
  const furnitureSqft = floorItems.reduce((s, f) => {
    return s + ((f.item.widthIn * f.item.depthIn) / 144) * f.quantity;
  }, 0);

  if (furnitureSqft / sqft > 0.6) {
    issues.push("Room coverage exceeds 60% — may feel cramped. Consider removing items.");
  }

  for (const f of floorItems) {
    const itemWidthFt = f.item.widthIn / 12;
    const itemDepthFt = f.item.depthIn / 12;
    if (itemWidthFt > room.widthFt * 0.5 || itemDepthFt > room.lengthFt * 0.5) {
      issues.push(`${f.item.name} takes up more than half the room width or length.`);
    }
  }

  const beds = room.furniture.filter(f => f.item.category === "beds-mattresses");
  if (beds.length > 0) {
    const totalBedWidth = beds.reduce((s, f) => s + f.item.widthIn / 12, 0);
    const remainingWidth = room.widthFt - totalBedWidth;
    if (remainingWidth < 3) {
      issues.push("Less than 36\" clearance around beds — hard to make and access.");
    }
  }

  return issues;
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
