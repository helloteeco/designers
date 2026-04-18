"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { saveProject, getProject as getProjectFromStore, logActivity } from "@/lib/store";
import {
  searchCatalog,
  MARKERS,
  MARKER_COLORS,
  isMarker,
} from "@/lib/furniture-catalog";
import { suggestFurniture } from "@/lib/auto-suggest";
import type { Project, FurnitureItem, SelectedFurniture } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

interface PlacedItem extends SelectedFurniture {
  x: number;
  y: number;
}

const ROOM_COLORS: Record<string, string> = {
  "primary-bedroom": "#E8D5C4",
  bedroom: "#D4C5B5",
  loft: "#C9BBA8",
  "bonus-room": "#D4C5B5",
  "living-room": "#C4CEB5",
  "dining-room": "#C4CEB5",
  kitchen: "#D4D4C4",
  den: "#C9BBA8",
  office: "#B5C5D4",
  "media-room": "#B5B5C4",
  "game-room": "#B5C5B5",
  bathroom: "#B5D4D4",
  outdoor: "#B5D4B5",
  hallway: "#D4D4D4",
};

const ITEM_COLORS: Record<string, string> = {
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

function colorForItem(item: FurnitureItem): string {
  if (isMarker(item.id)) {
    // Placed markers have IDs like "marker-art-1700000000" — match by prefix
    const entry = Object.entries(MARKER_COLORS).find(([key]) =>
      item.id.startsWith(key)
    );
    return entry?.[1] ?? "#666";
  }
  return ITEM_COLORS[item.category] ?? "#8B7B6B";
}

interface SearchResult {
  name: string;
  vendor: string;
  vendorUrl: string;
  price: number;
  rating?: number;
  reviewCount?: number;
  imageUrl?: string;
  widthIn?: number;
  depthIn?: number;
  heightIn?: number;
  color?: string;
  material?: string;
}

export default function DesignBoard({ project, onUpdate }: Props) {
  const [selectedRoom, setSelectedRoom] = useState<string>(
    project.rooms[0]?.id ?? ""
  );
  const [selectedPlaced, setSelectedPlaced] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [webResults, setWebResults] = useState<SearchResult[] | null>(null);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    itemId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const currentRoom = project.rooms.find((r) => r.id === selectedRoom);

  const totalCost = project.rooms.reduce(
    (sum, r) =>
      sum +
      r.furniture.reduce((fs, f) => fs + f.item.price * f.quantity, 0),
    0
  );

  const CANVAS_WIDTH = 600;
  const maxDim = Math.max(currentRoom?.widthFt ?? 12, currentRoom?.lengthFt ?? 12);
  const scale = CANVAS_WIDTH / maxDim;
  const canvasHeight = currentRoom ? currentRoom.lengthFt * scale : 400;
  const canvasW = currentRoom ? currentRoom.widthFt * scale : CANVAS_WIDTH;

  function getItemDimsPx(item: FurnitureItem) {
    return {
      w: Math.max(20, (item.widthIn / 12) * scale),
      h: Math.max(20, (item.depthIn / 12) * scale),
    };
  }

  // ── Placement helpers ──

  function placeItem(item: FurnitureItem, x?: number, y?: number) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const room = fresh.rooms.find((r) => r.id === selectedRoom);
    if (!room) return;

    const existing = room.furniture.find((f) => f.item.id === item.id);
    if (existing && !isMarker(item.id)) {
      existing.quantity += 1;
      saveProject(fresh);
      onUpdate();
      return;
    }

    const placed: PlacedItem = {
      item,
      quantity: 1,
      roomId: room.id,
      notes: "",
      x: x ?? 30 + Math.random() * 40,
      y: y ?? 30 + Math.random() * 40,
    };
    // Markers can stack (multiple TVs/Art), so use a unique id suffix on placement
    if (isMarker(item.id)) {
      placed.item = { ...item, id: `${item.id}-${Date.now()}` };
    }
    room.furniture.push(placed);
    saveProject(fresh);
    onUpdate();
  }

  function removeItem(itemId: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const room = fresh.rooms.find((r) => r.id === selectedRoom);
    if (!room) return;
    room.furniture = room.furniture.filter((f) => f.item.id !== itemId);
    saveProject(fresh);
    setSelectedPlaced(null);
    onUpdate();
  }

  function clearAllFurniture() {
    if (!confirm("Remove all furniture from this room?")) return;
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const room = fresh.rooms.find((r) => r.id === selectedRoom);
    if (!room) return;
    room.furniture = [];
    saveProject(fresh);
    setSelectedPlaced(null);
    onUpdate();
  }

  function addAllSuggestions() {
    if (!currentRoom) return;
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const room = fresh.rooms.find((r) => r.id === selectedRoom);
    if (!room) return;

    const suggestions = suggestFurniture(room, fresh.style);
    let offsetY = 15;
    for (const item of suggestions) {
      if (!room.furniture.find((f) => f.item.id === item.id)) {
        room.furniture.push({
          item,
          quantity: 1,
          roomId: room.id,
          notes: "",
          x: 30 + Math.random() * 40,
          y: offsetY,
        } as PlacedItem);
        offsetY = (offsetY + 15) % 85;
      }
    }
    saveProject(fresh);
    logActivity(project.id, "furniture_added", `Auto-added suggestions to ${room.name}`);
    onUpdate();
  }

  // ── Drag handlers ──

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragState.current || !canvasRef.current || !currentRoom) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const { itemId, offsetX, offsetY } = dragState.current;

      const fresh = getProjectFromStore(project.id);
      if (!fresh) return;
      const room = fresh.rooms.find((r) => r.id === selectedRoom);
      if (!room) return;
      const placed = room.furniture.find((f) => f.item.id === itemId) as PlacedItem | undefined;
      if (!placed) return;

      const dims = getItemDimsPx(placed.item);
      const xPx = e.clientX - rect.left - offsetX;
      const yPx = e.clientY - rect.top - offsetY;
      // Convert px back to % (centered)
      const xCenter = xPx + dims.w / 2;
      const yCenter = yPx + dims.h / 2;
      placed.x = Math.max(0, Math.min(100, (xCenter / canvasW) * 100));
      placed.y = Math.max(0, Math.min(100, (yCenter / canvasHeight) * 100));

      // Update without saving on every frame — just mutate localStorage's in-memory snapshot
      saveProject(fresh);
      onUpdate();
    },
    [project.id, selectedRoom, canvasW, canvasHeight, currentRoom, onUpdate]
  );

  const handleMouseUp = useCallback(() => {
    dragState.current = null;
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseMove]);

  function startDrag(e: React.MouseEvent, placed: PlacedItem) {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dims = getItemDimsPx(placed.item);
    const xPx = ((placed.x ?? 50) / 100) * canvasW - dims.w / 2;
    const yPx = ((placed.y ?? 50) / 100) * canvasHeight - dims.h / 2;
    dragState.current = {
      itemId: placed.item.id,
      offsetX: e.clientX - rect.left - xPx,
      offsetY: e.clientY - rect.top - yPx,
    };
    setSelectedPlaced(placed.item.id);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // ── URL paste + web search ──

  async function addFromUrl() {
    const url = urlInput.trim();
    if (!url) return;
    setUrlError(null);
    setUrlLoading(true);
    try {
      const res = await fetch("/api/product-from-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fetch failed");

      const item: FurnitureItem = {
        id: `url-${Date.now()}`,
        name: data.name || "Untitled product",
        category: data.category || "decor",
        subcategory: data.subcategory || "sourced",
        widthIn: Number(data.widthIn) || 24,
        depthIn: Number(data.depthIn) || 24,
        heightIn: Number(data.heightIn) || 30,
        price: Number(data.price) || 0,
        vendor: data.vendor || new URL(url).hostname.replace(/^www\./, ""),
        vendorUrl: url,
        imageUrl: data.imageUrl || "",
        color: data.color || "",
        material: data.material || "",
        style: project.style,
      };
      placeItem(item);
      setUrlInput("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUrlError(msg);
    } finally {
      setUrlLoading(false);
    }
  }

  async function runWebSearch() {
    if (!searchQuery.trim() || !currentRoom) return;
    setWebError(null);
    setWebLoading(true);
    setWebResults(null);
    try {
      const res = await fetch("/api/search-products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: searchQuery.trim(),
          roomType: currentRoom.type,
          style: project.style,
          budget: project.budget,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setWebResults(data.results || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setWebError(msg);
    } finally {
      setWebLoading(false);
    }
  }

  function addWebResult(r: SearchResult) {
    const item: FurnitureItem = {
      id: `web-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: r.name,
      category: "decor",
      subcategory: "sourced",
      widthIn: r.widthIn ?? 24,
      depthIn: r.depthIn ?? 24,
      heightIn: r.heightIn ?? 30,
      price: r.price,
      vendor: r.vendor,
      vendorUrl: r.vendorUrl,
      imageUrl: r.imageUrl ?? "",
      color: r.color ?? "",
      material: r.material ?? "",
      style: project.style,
    };
    placeItem(item);
  }

  // ── Catalog search (local fallback) ──
  const localCatalogResults = searchQuery.trim()
    ? searchCatalog(searchQuery).slice(0, 6)
    : [];

  // ── Render ──

  if (project.rooms.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-brand-600">
          Add rooms first in the Rooms tab — upload a floor plan to create them automatically.
        </p>
      </div>
    );
  }

  const suggestions = currentRoom
    ? suggestFurniture(currentRoom, project.style).slice(0, 6)
    : [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Space Planner</h2>
          <p className="text-sm text-brand-600">
            Drag furniture to arrange it.{" "}
            <span className="font-medium text-brand-900">
              ${totalCost.toLocaleString()}
            </span>
            {project.budget > 0 && (
              <span
                className={totalCost > project.budget ? " text-red-500" : ""}
              >
                {" "}/ ${project.budget.toLocaleString()}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Room selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {project.rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => {
              setSelectedRoom(room.id);
              setSelectedPlaced(null);
            }}
            className={selectedRoom === room.id ? "tab-active" : "tab"}
          >
            {room.name}
            {room.furniture.length > 0 && (
              <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px]">
                {room.furniture.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Canvas */}
        <div className="flex-1">
          {currentRoom && (
            <div className="card p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-brand-900">
                  {currentRoom.name}
                  <span className="text-brand-600 font-normal ml-2">
                    {currentRoom.widthFt}&apos; × {currentRoom.lengthFt}&apos;{" "}
                    · {(currentRoom.widthFt * currentRoom.lengthFt).toFixed(0)} sqft
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {currentRoom.furniture.length === 0 && (
                    <button
                      onClick={addAllSuggestions}
                      className="text-xs text-amber-dark hover:underline font-medium"
                    >
                      Auto-Furnish Room
                    </button>
                  )}
                  {currentRoom.furniture.length > 0 && (
                    <button
                      onClick={clearAllFurniture}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Clear All
                    </button>
                  )}
                  <span className="text-xs text-brand-600">
                    {currentRoom.furniture.length} items · $
                    {currentRoom.furniture
                      .reduce((s, f) => s + f.item.price * f.quantity, 0)
                      .toLocaleString()}
                  </span>
                </div>
              </div>

              {/* 2D Room Canvas */}
              <div
                ref={canvasRef}
                className="relative mx-auto border-2 border-brand-900/20 rounded-lg overflow-hidden select-none"
                style={{
                  width: canvasW,
                  height: canvasHeight,
                  backgroundColor: ROOM_COLORS[currentRoom.type] ?? "#E8E4DC",
                }}
                onClick={() => setSelectedPlaced(null)}
              >
                {/* Dimension labels */}
                <div className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none">
                  <span className="bg-white/80 px-2 py-0.5 text-[10px] font-medium text-brand-700 rounded-b">
                    {currentRoom.widthFt}&apos;
                  </span>
                </div>
                <div className="absolute top-0 bottom-0 right-0 flex items-center pointer-events-none">
                  <span className="bg-white/80 px-1 py-0.5 text-[10px] font-medium text-brand-700 rounded-l -rotate-90 origin-center">
                    {currentRoom.lengthFt}&apos;
                  </span>
                </div>

                {/* Grid */}
                {Array.from({ length: Math.floor(currentRoom.widthFt) - 1 }).map(
                  (_, i) => (
                    <div
                      key={`v${i}`}
                      className="absolute top-0 bottom-0 border-l border-brand-900/5 pointer-events-none"
                      style={{ left: (i + 1) * scale }}
                    />
                  )
                )}
                {Array.from({
                  length: Math.floor(currentRoom.lengthFt) - 1,
                }).map((_, i) => (
                  <div
                    key={`h${i}`}
                    className="absolute left-0 right-0 border-t border-brand-900/5 pointer-events-none"
                    style={{ top: (i + 1) * scale }}
                  />
                ))}

                {/* Features */}
                {currentRoom.features.includes("Window") && (
                  <div className="absolute top-0 left-1/4 right-1/4 h-1 bg-blue-300/60 pointer-events-none" />
                )}
                {currentRoom.features.includes("Fireplace") && (
                  <div className="absolute bottom-0 left-1/3 w-16 h-2 bg-orange-300/60 rounded-t pointer-events-none" />
                )}
                {currentRoom.features.includes("Closet") && (
                  <div className="absolute top-0 right-0 w-10 h-12 bg-brand-900/10 rounded-bl border-l border-b border-brand-900/10 pointer-events-none">
                    <span className="text-[7px] text-brand-600/60 p-0.5 block">closet</span>
                  </div>
                )}
                {currentRoom.features.includes("En-suite") && (
                  <div className="absolute bottom-0 right-0 w-16 h-12 bg-blue-100/40 rounded-tl border-l border-t border-blue-200/40 pointer-events-none">
                    <span className="text-[7px] text-blue-400/60 p-0.5 block">en-suite</span>
                  </div>
                )}

                {/* Accent wall */}
                {currentRoom.accentWall && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      backgroundColor: currentRoom.accentWall.color + "40",
                      borderColor: currentRoom.accentWall.color,
                      ...(currentRoom.accentWall.wall === "north"
                        ? { top: 0, left: 0, right: 0, height: 4, borderBottomWidth: 2 }
                        : currentRoom.accentWall.wall === "south"
                          ? { bottom: 0, left: 0, right: 0, height: 4, borderTopWidth: 2 }
                          : currentRoom.accentWall.wall === "east"
                            ? { top: 0, bottom: 0, right: 0, width: 4, borderLeftWidth: 2 }
                            : { top: 0, bottom: 0, left: 0, width: 4, borderRightWidth: 2 }),
                    }}
                  />
                )}

                {/* Placed items */}
                {currentRoom.furniture.map((f) => {
                  const placed = f as PlacedItem;
                  const dims = getItemDimsPx(f.item);
                  const isSelected = selectedPlaced === f.item.id;
                  const xPx = ((placed.x ?? 50) / 100) * canvasW - dims.w / 2;
                  const yPx = ((placed.y ?? 50) / 100) * canvasHeight - dims.h / 2;
                  const itemColor = colorForItem(f.item);
                  const isMark = isMarker(f.item.id);

                  return (
                    <div
                      key={f.item.id}
                      className={`absolute rounded shadow-sm flex items-center justify-center transition-shadow cursor-grab active:cursor-grabbing ${
                        isSelected
                          ? "ring-2 ring-amber ring-offset-1 z-10"
                          : "hover:ring-1 hover:ring-amber/50"
                      }`}
                      style={{
                        left: Math.max(0, Math.min(canvasW - dims.w, xPx)),
                        top: Math.max(0, Math.min(canvasHeight - dims.h, yPx)),
                        width: dims.w,
                        height: dims.h,
                        backgroundColor: itemColor + (isMark ? "" : "CC"),
                        borderWidth: 1,
                        borderColor: itemColor,
                        borderStyle: isMark ? "dashed" : "solid",
                      }}
                      onMouseDown={(e) => startDrag(e, placed)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlaced(isSelected ? null : f.item.id);
                      }}
                    >
                      <span
                        className="text-white text-center leading-tight font-medium drop-shadow-sm pointer-events-none px-1"
                        style={{ fontSize: Math.max(8, Math.min(11, dims.w / 8)) }}
                      >
                        {f.item.name.length > 20
                          ? f.item.name.slice(0, 18) + "…"
                          : f.item.name}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Selected item detail bar */}
              {selectedPlaced &&
                currentRoom.furniture.find((f) => f.item.id === selectedPlaced) && (
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-brand-900/5 px-4 py-2">
                    {(() => {
                      const f = currentRoom.furniture.find(
                        (f) => f.item.id === selectedPlaced
                      )!;
                      return (
                        <>
                          <div className="text-sm min-w-0">
                            <span className="font-medium text-brand-900">
                              {f.item.name}
                            </span>
                            {f.item.vendor && f.item.vendor !== "—" && (
                              <span className="text-brand-600 ml-2">
                                {f.item.vendor}
                                {f.item.price > 0 && ` · $${f.item.price}`}
                              </span>
                            )}
                            <span className="text-brand-600/60 ml-2">
                              {f.item.widthIn}&quot;W × {f.item.depthIn}&quot;D ×{" "}
                              {f.item.heightIn}&quot;H
                            </span>
                          </div>
                          <div className="flex gap-2">
                            {f.item.vendorUrl && (
                              <a
                                href={f.item.vendorUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-amber-dark hover:underline"
                              >
                                Open
                              </a>
                            )}
                            <button
                              onClick={() => removeItem(f.item.id)}
                              className="text-xs text-red-500 hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

              {/* Item list */}
              {currentRoom.furniture.length > 0 && (
                <div className="mt-3 border-t border-brand-900/5 pt-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-2">
                    Room Items ({currentRoom.furniture.length})
                  </div>
                  <div className="grid gap-1.5 max-h-48 overflow-y-auto">
                    {currentRoom.furniture.map((f) => (
                      <div
                        key={f.item.id}
                        className={`flex items-center justify-between rounded px-2 py-1.5 text-xs cursor-pointer transition ${
                          selectedPlaced === f.item.id
                            ? "bg-amber/10 text-brand-900"
                            : "bg-cream/50 text-brand-700 hover:bg-cream"
                        }`}
                        onClick={() =>
                          setSelectedPlaced(
                            selectedPlaced === f.item.id ? null : f.item.id
                          )
                        }
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: colorForItem(f.item) }}
                          />
                          <span className="truncate">{f.item.name}</span>
                        </div>
                        <span className="text-brand-600 shrink-0 ml-2">
                          {f.item.price > 0 ? `$${f.item.price}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right-side "Add" panel (selected-only, no full catalog) */}
        <div className="w-80 shrink-0">
          <div className="card max-h-[80vh] overflow-y-auto sticky top-4 space-y-4">
            <h3 className="font-semibold text-sm">Add Furniture</h3>

            {/* Install-guide markers */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-1.5">
                Install Guide Markers
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {MARKERS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => placeItem(m)}
                    className="flex items-center gap-2 rounded border border-brand-900/10 px-2 py-1.5 text-xs hover:bg-brand-900/5 transition"
                  >
                    <span
                      className="h-3 w-3 rounded-sm"
                      style={{ backgroundColor: MARKER_COLORS[m.id] }}
                    />
                    <span className="truncate">{m.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-suggest */}
            {suggestions.length > 0 && currentRoom && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-1.5">
                  Suggested for {currentRoom.name}
                </div>
                <div className="space-y-1">
                  {suggestions.map((item) => {
                    const added = currentRoom.furniture.some(
                      (f) => f.item.id === item.id
                    );
                    return (
                      <button
                        key={item.id}
                        disabled={added}
                        onClick={() => placeItem(item)}
                        className={`flex w-full items-center justify-between rounded border px-2 py-1.5 text-xs transition text-left ${
                          added
                            ? "border-amber/30 bg-amber/5 opacity-60 cursor-default"
                            : "border-brand-900/5 hover:border-amber/30"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-brand-900 truncate">
                            {item.name}
                          </div>
                          <div className="text-brand-600/60 truncate">
                            {item.vendor} · {item.color}
                          </div>
                        </div>
                        <div className="text-right ml-2 shrink-0">
                          <div className="font-medium text-brand-900">
                            ${item.price}
                          </div>
                          <span className="text-[9px] text-brand-600">
                            {added ? "Added" : "+ Add"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Paste product URL */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-1.5">
                Paste Product URL
              </div>
              <div className="flex gap-1.5">
                <input
                  className="input text-xs flex-1"
                  placeholder="https://wayfair.com/…"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addFromUrl()}
                />
                <button
                  onClick={addFromUrl}
                  disabled={urlLoading || !urlInput.trim()}
                  className="btn-accent btn-sm shrink-0"
                >
                  {urlLoading ? "…" : "Add"}
                </button>
              </div>
              {urlError && (
                <div className="mt-1 text-[10px] text-red-500">{urlError}</div>
              )}
              <div className="mt-1 text-[10px] text-brand-600/60">
                Any vendor URL — pulls title, price, dimensions.
              </div>
            </div>

            {/* Search */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-1.5">
                Search Products
              </div>
              <div className="flex gap-1.5">
                <input
                  className="input text-xs flex-1"
                  placeholder="sage green velvet sofa…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runWebSearch()}
                />
                <button
                  onClick={runWebSearch}
                  disabled={webLoading || !searchQuery.trim()}
                  className="btn-secondary btn-sm shrink-0"
                >
                  {webLoading ? "…" : "Web"}
                </button>
              </div>
              <div className="mt-1 text-[10px] text-brand-600/60">
                Web search finds top-rated picks across Wayfair, Amazon, Target, Costco, Article, and beyond.
              </div>

              {webError && (
                <div className="mt-2 text-[10px] text-red-500">{webError}</div>
              )}

              {webResults && webResults.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[10px] text-brand-600">
                    {webResults.length} web result{webResults.length !== 1 ? "s" : ""}
                  </div>
                  {webResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => addWebResult(r)}
                      className="flex w-full items-start justify-between rounded border border-brand-900/5 px-2 py-1.5 text-xs hover:border-amber/30 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-brand-900 truncate">
                          {r.name}
                        </div>
                        <div className="text-brand-600/60 truncate">
                          {r.vendor}
                          {r.rating !== undefined && ` · ${r.rating}★`}
                          {r.reviewCount !== undefined && ` (${r.reviewCount})`}
                        </div>
                      </div>
                      <div className="text-right ml-2 shrink-0">
                        <div className="font-medium text-brand-900">
                          ${r.price}
                        </div>
                        <span className="text-[9px] text-amber-dark">+ Add</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Local catalog matches — fallback */}
              {localCatalogResults.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[10px] text-brand-600">
                    Local catalog matches
                  </div>
                  {localCatalogResults.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => placeItem(item)}
                      className="flex w-full items-start justify-between rounded border border-brand-900/5 px-2 py-1.5 text-xs hover:border-amber/30 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-brand-900 truncate">
                          {item.name}
                        </div>
                        <div className="text-brand-600/60 truncate">
                          {item.vendor} · {item.color}
                        </div>
                      </div>
                      <div className="text-right ml-2 shrink-0">
                        <div className="font-medium text-brand-900">
                          ${item.price}
                        </div>
                        <span className="text-[9px] text-brand-600">+ Add</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
