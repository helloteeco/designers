"use client";

import { useState, useRef } from "react";
import { saveProject, getProject as getProjectFromStore, logActivity } from "@/lib/store";
import { CATALOG, searchCatalog } from "@/lib/furniture-catalog";
import { suggestFurniture } from "@/lib/auto-suggest";
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

  const canvasW = room.widthFt * SCALE_FACTOR * zoom;
  const canvasH = room.lengthFt * SCALE_FACTOR * zoom;
  const sqft = room.widthFt * room.lengthFt;

  // Calculate furniture coverage
  const furnitureSqft = room.furniture.reduce((s, f) => {
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
    const x = ((placed.x ?? 50) / 100) * canvasW;
    const y = ((placed.y ?? 50) / 100) * canvasH;
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

    const placed: PlacedItem = {
      item,
      quantity: 1,
      roomId: r.id,
      notes: "",
      x: 30 + Math.random() * 40,
      y: 30 + Math.random() * 40,
      rotation: 0,
    };
    r.furniture.push(placed);
    saveProject(fresh);
    logActivity(project.id, "furniture_placed", `Placed ${item.name} in ${r.name}`);
    onUpdate();
  }

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
    let offsetX = 20;
    let offsetY = 20;
    for (const item of items) {
      if (!r.furniture.find(f => f.item.id === item.id)) {
        const placed: PlacedItem = {
          item,
          quantity: 1,
          roomId: r.id,
          notes: "",
          x: offsetX,
          y: offsetY,
          rotation: 0,
        };
        r.furniture.push(placed);
        offsetX += 15;
        if (offsetX > 80) { offsetX = 20; offsetY += 15; }
      }
    }

    saveProject(fresh);
    logActivity(project.id, "auto_furnish", `Auto-furnished ${r.name}`);
    onUpdate();
  }

  const roomCost = room.furniture.reduce((s, f) => s + f.item.price * f.quantity, 0);
  const selectedItem = selectedItemId ? room.furniture.find(f => f.item.id === selectedItemId) : null;

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

      {/* Room Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {project.rooms.map(r => (
          <button
            key={r.id}
            onClick={() => { setSelectedRoom(r.id); setSelectedItemId(null); }}
            className={selectedRoom === r.id ? "tab-active" : "tab"}
          >
            {r.name}
            <span className="ml-1 text-[10px] opacity-60">{r.furniture.length}</span>
          </button>
        ))}
      </div>

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
                  title={room.furniture.length > 0 ? "Adds more suggested items without replacing existing ones" : "One-click fill with style-matched pieces"}
                >
                  {room.furniture.length === 0 ? "Auto-Furnish" : "+ Add Suggestions"}
                </button>
              </div>
            </div>

            {/* Room Canvas */}
            <div className="overflow-auto max-h-[600px]">
              <div
                ref={canvasRef}
                className="relative mx-auto border-2 border-brand-900/20 rounded-lg"
                style={{
                  width: canvasW,
                  height: canvasH,
                  backgroundColor: "#f0ede6",
                }}
                onClick={handleCanvasClick}
              >
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

                  return (
                    <div
                      key={f.item.id}
                      className={`absolute rounded flex items-center justify-center cursor-pointer transition-all ${
                        isSelected ? "ring-2 ring-amber ring-offset-1 z-10 shadow-md" : "hover:ring-1 hover:ring-amber/50 shadow-sm"
                      }`}
                      style={{
                        left: Math.max(0, Math.min(canvasW - rect.w, rect.x)),
                        top: Math.max(0, Math.min(canvasH - rect.h, rect.y)),
                        width: rect.w,
                        height: rect.h,
                        backgroundColor: categoryColor + "CC",
                        borderWidth: 1,
                        borderColor: categoryColor,
                      }}
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedItemId(isSelected ? null : f.item.id);
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

function checkClearance(room: Room): string[] {
  const issues: string[] = [];
  const sqft = room.widthFt * room.lengthFt;
  const furnitureSqft = room.furniture.reduce((s, f) => {
    return s + ((f.item.widthIn * f.item.depthIn) / 144) * f.quantity;
  }, 0);

  if (furnitureSqft / sqft > 0.6) {
    issues.push("Room coverage exceeds 60% — may feel cramped. Consider removing items.");
  }

  // Check for large items in small rooms
  for (const f of room.furniture) {
    const itemWidthFt = f.item.widthIn / 12;
    const itemDepthFt = f.item.depthIn / 12;
    if (itemWidthFt > room.widthFt * 0.5 || itemDepthFt > room.lengthFt * 0.5) {
      issues.push(`${f.item.name} takes up more than half the room width or length.`);
    }
  }

  // Check bed clearance
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
