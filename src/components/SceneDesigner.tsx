"use client";

import { useEffect, useRef, useState } from "react";
import { saveProject, getProject as getProjectFromStore, generateId, logActivity } from "@/lib/store";
import { getFullCatalog, searchCatalog } from "@/lib/furniture-catalog";
import { suggestFurniture } from "@/lib/auto-suggest";
import { placeFurniture } from "@/lib/space-planning";
import AiSceneStudio from "./AiSceneStudio";
import { useToast } from "./Toast";
import type { Project, Room, FurnitureItem, SceneItem } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

type DragState =
  | { kind: "idle" }
  | { kind: "moving"; itemId: string; startMx: number; startMy: number; startX: number; startY: number }
  | { kind: "resizing"; itemId: string; corner: "tl" | "tr" | "bl" | "br"; startMx: number; startMy: number; startX: number; startY: number; startW: number; startH: number }
  | { kind: "rotating"; itemId: string; startAngle: number; startRotation: number; centerX: number; centerY: number };

const CATEGORY_COLORS: Record<string, string> = {
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

const MAX_BG_MB = 5;
const MAX_BG_BYTES = MAX_BG_MB * 1024 * 1024;

export default function SceneDesigner({ project, onUpdate }: Props) {
  const toast = useToast();
  const [selectedRoomId, setSelectedRoomId] = useState<string>(project.rooms[0]?.id ?? "");
  const [selectedSceneItemId, setSelectedSceneItemId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>({ kind: "idle" });
  const [showCatalog, setShowCatalog] = useState(true);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [pendingDragItem, setPendingDragItem] = useState<FurnitureItem | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const room = project.rooms.find(r => r.id === selectedRoomId);

  // Keyboard: delete selected item
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedSceneItemId) {
        const target = e.target as HTMLElement;
        // Don't intercept when typing in inputs
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
        e.preventDefault();
        deleteSceneItem(selectedSceneItemId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSceneItemId]);

  // Global mouseup + mousemove for dragging
  useEffect(() => {
    if (dragState.kind === "idle") return;

    function onMove(e: MouseEvent) {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 100;
      const my = ((e.clientY - rect.top) / rect.height) * 100;

      if (dragState.kind === "moving") {
        const dx = mx - dragState.startMx;
        const dy = my - dragState.startMy;
        updateSceneItem(dragState.itemId, (item) => ({
          ...item,
          x: Math.max(0, Math.min(100 - item.width, dragState.startX + dx)),
          y: Math.max(0, Math.min(100 - item.height, dragState.startY + dy)),
        }));
      } else if (dragState.kind === "resizing") {
        const dx = mx - dragState.startMx;
        const dy = my - dragState.startMy;
        updateSceneItem(dragState.itemId, (item) => {
          let newX = dragState.startX;
          let newY = dragState.startY;
          let newW = dragState.startW;
          let newH = dragState.startH;
          if (dragState.corner === "br") { newW = dragState.startW + dx; newH = dragState.startH + dy; }
          if (dragState.corner === "bl") { newX = dragState.startX + dx; newW = dragState.startW - dx; newH = dragState.startH + dy; }
          if (dragState.corner === "tr") { newY = dragState.startY + dy; newW = dragState.startW + dx; newH = dragState.startH - dy; }
          if (dragState.corner === "tl") { newX = dragState.startX + dx; newY = dragState.startY + dy; newW = dragState.startW - dx; newH = dragState.startH - dy; }
          // Enforce minimums
          if (newW < 2) { newW = 2; newX = item.x; }
          if (newH < 2) { newH = 2; newY = item.y; }
          if (newX < 0) { newW += newX; newX = 0; }
          if (newY < 0) { newH += newY; newY = 0; }
          if (newX + newW > 100) newW = 100 - newX;
          if (newY + newH > 100) newH = 100 - newY;
          return { ...item, x: newX, y: newY, width: newW, height: newH };
        });
      } else if (dragState.kind === "rotating") {
        const angle = Math.atan2(my - dragState.centerY, mx - dragState.centerX) * 180 / Math.PI;
        const rotation = dragState.startRotation + (angle - dragState.startAngle);
        updateSceneItem(dragState.itemId, (item) => ({
          ...item,
          rotation: ((rotation % 360) + 360) % 360,
        }));
      }
    }

    function onUp() {
      setDragState({ kind: "idle" });
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState]);

  // ── Early return empty state ──

  if (!room) {
    return (
      <div className="card text-center py-12">
        <div className="text-4xl mb-3">🎨</div>
        <p className="text-brand-600">Add rooms first to start designing scenes.</p>
      </div>
    );
  }

  const sceneItems = room.sceneItems ?? [];
  const fullCatalog = getFullCatalog();

  function itemCatalogEntry(sceneItem: SceneItem): FurnitureItem | null {
    return fullCatalog.find(c => c.id === sceneItem.itemId) ?? null;
  }

  // ── Scene item CRUD ──

  function addSceneItem(item: FurnitureItem, xPct = 40, yPct = 40) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const r = fresh.rooms.find(r => r.id === selectedRoomId);
    if (!r) return;
    if (!r.sceneItems) r.sceneItems = [];

    // Estimate width/height based on real dimensions (rough visual scale)
    const maxDim = Math.max(item.widthIn, item.depthIn, item.heightIn, 24);
    const widthPct = Math.max(8, Math.min(40, (item.widthIn / maxDim) * 25));
    const heightPct = Math.max(8, Math.min(40, (item.heightIn / maxDim) * 25));

    const maxZ = r.sceneItems.reduce((z, s) => Math.max(z, s.zIndex), 0);

    const newItem: SceneItem = {
      id: generateId(),
      itemId: item.id,
      x: Math.max(0, Math.min(100 - widthPct, xPct - widthPct / 2)),
      y: Math.max(0, Math.min(100 - heightPct, yPct - heightPct / 2)),
      width: widthPct,
      height: heightPct,
      rotation: 0,
      zIndex: maxZ + 1,
    };
    r.sceneItems.push(newItem);

    // Also add to furniture[] for procurement if not already present
    if (!r.furniture) r.furniture = [];
    const existing = r.furniture.find(f => f.item.id === item.id);
    if (!existing) {
      r.furniture.push(placeFurniture(r, item));
    }

    saveProject(fresh);
    setSelectedSceneItemId(newItem.id);
    onUpdate();
  }

  function updateSceneItem(sceneItemId: string, updater: (item: SceneItem) => SceneItem) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const r = fresh.rooms.find(r => r.id === selectedRoomId);
    if (!r || !r.sceneItems) return;
    const idx = r.sceneItems.findIndex(s => s.id === sceneItemId);
    if (idx < 0) return;
    r.sceneItems[idx] = updater(r.sceneItems[idx]);
    saveProject(fresh);
    onUpdate();
  }

  function deleteSceneItem(sceneItemId: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const r = fresh.rooms.find(r => r.id === selectedRoomId);
    if (!r || !r.sceneItems) return;
    r.sceneItems = r.sceneItems.filter(s => s.id !== sceneItemId);
    saveProject(fresh);
    setSelectedSceneItemId(null);
    onUpdate();
  }

  function bringForward(sceneItemId: string) {
    updateSceneItem(sceneItemId, (item) => ({
      ...item,
      zIndex: (room?.sceneItems?.reduce((z, s) => Math.max(z, s.zIndex), 0) ?? 0) + 1,
    }));
  }

  function sendBackward(sceneItemId: string) {
    updateSceneItem(sceneItemId, (item) => ({
      ...item,
      zIndex: Math.max(0, ((room?.sceneItems?.reduce((z, s) => Math.min(z, s.zIndex), Infinity) ?? 1) - 1)),
    }));
  }

  function autoSuggestAndPlace() {
    if (!room) return;
    const suggestions = suggestFurniture(room, project.style).slice(0, 8);
    if (suggestions.length === 0) {
      toast.info("No suggestions for this room type.");
      return;
    }
    // Place in a grid pattern across the canvas
    const cols = 4;
    const rows = Math.ceil(suggestions.length / cols);
    const cellW = 100 / cols;
    const cellH = 100 / rows;

    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const r = fresh.rooms.find(r => r.id === selectedRoomId);
    if (!r) return;
    if (!r.sceneItems) r.sceneItems = [];
    if (!r.furniture) r.furniture = [];

    let added = 0;
    suggestions.forEach((item, i) => {
      // Skip if already on scene
      if (r.sceneItems!.some(s => s.itemId === item.id)) return;

      const col = i % cols;
      const row = Math.floor(i / cols);
      const maxDim = Math.max(item.widthIn, item.depthIn, 24);
      const widthPct = Math.max(10, Math.min(cellW - 2, (item.widthIn / maxDim) * 20));
      const heightPct = Math.max(10, Math.min(cellH - 2, (item.heightIn / maxDim) * 20));

      const maxZ = r.sceneItems!.reduce((z, s) => Math.max(z, s.zIndex), 0);
      r.sceneItems!.push({
        id: generateId(),
        itemId: item.id,
        x: col * cellW + (cellW - widthPct) / 2,
        y: row * cellH + (cellH - heightPct) / 2,
        width: widthPct,
        height: heightPct,
        rotation: 0,
        zIndex: maxZ + 1 + i,
      });

      if (!r.furniture!.some(f => f.item.id === item.id)) {
        r.furniture!.push({
          item,
          quantity: 1,
          roomId: r.id,
          notes: "",
        });
      }
      added++;
    });

    saveProject(fresh);
    logActivity(project.id, "scene_auto_suggest", `Auto-placed ${added} items on ${r.name} scene`);
    toast.success(`Added ${added} suggested items to scene`);
    onUpdate();
  }

  // ── Background ──

  async function handleBackgroundUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BG_BYTES) {
      toast.error(`Image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Max ${MAX_BG_MB}MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const fresh = getProjectFromStore(project.id);
      if (!fresh) return;
      const r = fresh.rooms.find(r => r.id === selectedRoomId);
      if (!r) return;
      r.sceneBackgroundUrl = reader.result as string;
      saveProject(fresh);
      toast.success("Background set");
      onUpdate();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function setBackgroundFromFloorPlan(url: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const r = fresh.rooms.find(r => r.id === selectedRoomId);
    if (!r) return;
    r.sceneBackgroundUrl = url;
    saveProject(fresh);
    onUpdate();
  }

  function clearBackground() {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const r = fresh.rooms.find(r => r.id === selectedRoomId);
    if (!r) return;
    r.sceneBackgroundUrl = undefined;
    saveProject(fresh);
    onUpdate();
  }

  // ── Drag start handlers ──

  function startMove(e: React.MouseEvent, sceneItem: SceneItem) {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    setSelectedSceneItemId(sceneItem.id);
    setDragState({
      kind: "moving",
      itemId: sceneItem.id,
      startMx: mx,
      startMy: my,
      startX: sceneItem.x,
      startY: sceneItem.y,
    });
  }

  function startResize(e: React.MouseEvent, sceneItem: SceneItem, corner: "tl" | "tr" | "bl" | "br") {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    setDragState({
      kind: "resizing",
      itemId: sceneItem.id,
      corner,
      startMx: mx,
      startMy: my,
      startX: sceneItem.x,
      startY: sceneItem.y,
      startW: sceneItem.width,
      startH: sceneItem.height,
    });
  }

  function startRotate(e: React.MouseEvent, sceneItem: SceneItem) {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    const centerX = sceneItem.x + sceneItem.width / 2;
    const centerY = sceneItem.y + sceneItem.height / 2;
    const startAngle = Math.atan2(my - centerY, mx - centerX) * 180 / Math.PI;
    setDragState({
      kind: "rotating",
      itemId: sceneItem.id,
      startAngle,
      startRotation: sceneItem.rotation,
      centerX,
      centerY,
    });
  }

  // ── Catalog filter ──
  const suggestions = suggestFurniture(room, project.style).slice(0, 8);
  const filteredCatalog = catalogSearch.trim()
    ? searchCatalog(catalogSearch)
    : [];

  const selectedSceneItem = sceneItems.find(s => s.id === selectedSceneItemId);
  const selectedCatalogItem = selectedSceneItem ? itemCatalogEntry(selectedSceneItem) : null;

  const floorPlans = (project.property?.floorPlans ?? []).filter(p => p.type === "image");

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Scene Designer</h2>
          <p className="text-sm text-brand-600">
            Spoak-style visual composition. Drag items onto a room photo or floor plan.
            Use <strong>🤖 Auto-Suggest</strong> to fill the scene based on the room type and style.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCatalog(!showCatalog)} className="btn-secondary btn-sm">
            {showCatalog ? "Hide" : "Show"} Catalog
          </button>
        </div>
      </div>

      {/* Room tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {project.rooms.map(r => (
          <button
            key={r.id}
            onClick={() => { setSelectedRoomId(r.id); setSelectedSceneItemId(null); }}
            className={selectedRoomId === r.id ? "tab-active" : "tab"}
          >
            {r.name}
            {(r.sceneItems?.length ?? 0) > 0 && (
              <span className="ml-1.5 text-[10px] opacity-70">{r.sceneItems!.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* AI Scene Studio — the headline feature */}
      <AiSceneStudio project={project} room={room} onUpdate={onUpdate} />

      <div className="flex gap-4">
        {/* Canvas */}
        <div className="flex-1">
          <div className="card p-3">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-brand-900">{room.name}</span>
                <span className="text-[10px] text-brand-600">
                  {sceneItems.length} item{sceneItems.length === 1 ? "" : "s"} · {room.widthFt}&apos; × {room.lengthFt}&apos;
                </span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={autoSuggestAndPlace} className="btn-accent btn-sm">
                  🤖 Auto-Suggest
                </button>
                <button onClick={() => bgInputRef.current?.click()} className="btn-secondary btn-sm">
                  {room.sceneBackgroundUrl ? "Change BG" : "Upload BG"}
                </button>
                {floorPlans.length > 0 && (
                  <div className="relative group">
                    <button className="btn-secondary btn-sm">Use Floor Plan ▾</button>
                    <div className="hidden group-hover:block absolute right-0 top-full mt-1 z-20 w-48 rounded-lg border border-brand-900/10 bg-white shadow-lg py-1">
                      {floorPlans.map(p => (
                        <button
                          key={p.id}
                          onClick={() => setBackgroundFromFloorPlan(p.url)}
                          className="block w-full text-left px-3 py-1.5 text-xs text-brand-700 hover:bg-brand-900/5"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {room.sceneBackgroundUrl && (
                  <button onClick={clearBackground} className="text-xs text-red-400 hover:text-red-600">
                    Clear BG
                  </button>
                )}
                <input
                  ref={bgInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBackgroundUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* Canvas */}
            <div
              ref={canvasRef}
              className="relative w-full rounded-lg overflow-hidden border border-brand-900/10 bg-gradient-to-br from-brand-900/5 to-brand-900/10 select-none"
              style={{
                aspectRatio: "16/10",
                backgroundImage: room.sceneBackgroundUrl ? `url(${room.sceneBackgroundUrl})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
              onClick={() => setSelectedSceneItemId(null)}
            >
              {!room.sceneBackgroundUrl && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center text-brand-600/40">
                    <div className="text-5xl mb-2">🎨</div>
                    <div className="text-xs">Upload a room photo or use a floor plan as background</div>
                    <div className="text-[10px] mt-1">Or start placing items on blank canvas</div>
                  </div>
                </div>
              )}

              {/* Scene items */}
              {sceneItems
                .slice()
                .sort((a, b) => a.zIndex - b.zIndex)
                .map(sceneItem => {
                  const cat = itemCatalogEntry(sceneItem);
                  const isSelected = selectedSceneItemId === sceneItem.id;
                  const hasImage = cat?.imageUrl && cat.imageUrl.trim().length > 0;
                  return (
                    <div
                      key={sceneItem.id}
                      data-scene-item="true"
                      className={`absolute cursor-move transition-shadow ${
                        isSelected ? "ring-2 ring-amber ring-offset-1" : "hover:ring-1 hover:ring-amber/50"
                      }`}
                      style={{
                        left: `${sceneItem.x}%`,
                        top: `${sceneItem.y}%`,
                        width: `${sceneItem.width}%`,
                        height: `${sceneItem.height}%`,
                        transform: `rotate(${sceneItem.rotation}deg)${sceneItem.flipX ? " scaleX(-1)" : ""}${sceneItem.flipY ? " scaleY(-1)" : ""}`,
                        zIndex: sceneItem.zIndex,
                      }}
                      onMouseDown={e => startMove(e, sceneItem)}
                      onClick={e => { e.stopPropagation(); setSelectedSceneItemId(sceneItem.id); }}
                    >
                      {hasImage ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={cat!.imageUrl}
                          alt={cat!.name}
                          className="w-full h-full object-contain pointer-events-none"
                          draggable={false}
                          onError={(e) => {
                            // If image fails, fall back to rectangle
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div
                          className="w-full h-full rounded flex items-center justify-center text-white text-[10px] font-medium text-center px-1 shadow-md"
                          style={{
                            backgroundColor: cat ? (CATEGORY_COLORS[cat.category] ?? "#8B7B6B") + "E0" : "#8B7B6BE0",
                          }}
                        >
                          <span className="drop-shadow">
                            {cat?.name ?? "Item"}
                          </span>
                        </div>
                      )}

                      {/* Selection handles */}
                      {isSelected && (
                        <>
                          {/* Corner resize handles */}
                          {(["tl", "tr", "bl", "br"] as const).map(corner => (
                            <div
                              key={corner}
                              className="absolute w-3 h-3 bg-white border-2 border-amber rounded-sm"
                              style={{
                                [corner.includes("t") ? "top" : "bottom"]: -6,
                                [corner.includes("l") ? "left" : "right"]: -6,
                                cursor: corner === "tl" || corner === "br" ? "nwse-resize" : "nesw-resize",
                              }}
                              onMouseDown={(e) => startResize(e, sceneItem, corner)}
                            />
                          ))}
                          {/* Rotation handle (above top-center) */}
                          <div
                            className="absolute w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-grab"
                            style={{ top: -24, left: "50%", transform: "translateX(-50%)" }}
                            onMouseDown={(e) => startRotate(e, sceneItem)}
                            title="Rotate"
                          />
                          <div
                            className="absolute w-px bg-blue-500"
                            style={{ top: -20, left: "50%", height: 14, transform: "translateX(-50%)" }}
                          />
                        </>
                      )}
                    </div>
                  );
                })}

              {/* Pending drop preview */}
              {pendingDragItem && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-amber/20 border-2 border-amber border-dashed rounded-lg px-4 py-2 text-sm font-medium text-amber-dark">
                    Click canvas to place: {pendingDragItem.name}
                  </div>
                </div>
              )}
            </div>

            {/* Selected item toolbar */}
            {selectedSceneItem && selectedCatalogItem && (
              <div className="mt-3 rounded-lg bg-brand-900/5 px-3 py-2 flex items-center gap-3 flex-wrap">
                <div className="text-sm">
                  <span className="font-medium text-brand-900">{selectedCatalogItem.name}</span>
                  <span className="text-xs text-brand-600 ml-2">
                    {selectedCatalogItem.vendor} · ${selectedCatalogItem.price}
                  </span>
                </div>
                <div className="flex gap-1 ml-auto">
                  <button
                    onClick={() => updateSceneItem(selectedSceneItem.id, i => ({ ...i, rotation: (i.rotation + 15) % 360 }))}
                    className="text-xs text-brand-600 hover:text-brand-900 px-2 py-1 rounded hover:bg-white"
                    title="Rotate 15°"
                  >
                    ↻ 15°
                  </button>
                  <button
                    onClick={() => updateSceneItem(selectedSceneItem.id, i => ({ ...i, rotation: 0 }))}
                    className="text-xs text-brand-600 hover:text-brand-900 px-2 py-1 rounded hover:bg-white"
                    title="Reset rotation"
                  >
                    Reset ↻
                  </button>
                  <button
                    onClick={() => updateSceneItem(selectedSceneItem.id, i => ({ ...i, flipX: !i.flipX }))}
                    className="text-xs text-brand-600 hover:text-brand-900 px-2 py-1 rounded hover:bg-white"
                    title="Flip horizontally"
                  >
                    ↔
                  </button>
                  <div className="w-px bg-brand-900/10 mx-1" />
                  <button
                    onClick={() => bringForward(selectedSceneItem.id)}
                    className="text-xs text-brand-600 hover:text-brand-900 px-2 py-1 rounded hover:bg-white"
                  >
                    Front
                  </button>
                  <button
                    onClick={() => sendBackward(selectedSceneItem.id)}
                    className="text-xs text-brand-600 hover:text-brand-900 px-2 py-1 rounded hover:bg-white"
                  >
                    Back
                  </button>
                  <div className="w-px bg-brand-900/10 mx-1" />
                  {selectedCatalogItem.vendorUrl && (
                    <a
                      href={selectedCatalogItem.vendorUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-amber-dark hover:underline px-2 py-1"
                    >
                      Vendor ↗
                    </a>
                  )}
                  <button
                    onClick={() => deleteSceneItem(selectedSceneItem.id)}
                    className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-white"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}

            <div className="mt-3 text-[10px] text-brand-600/60">
              Drag to move · Corner handles to resize · Blue dot to rotate · Delete key to remove · Click empty canvas to deselect
            </div>
          </div>
        </div>

        {/* Catalog sidebar */}
        {showCatalog && (
          <div className="w-72 shrink-0">
            <div className="card max-h-[80vh] overflow-y-auto sticky top-4">
              <h3 className="font-semibold mb-3 text-sm">Add Items</h3>

              <input
                className="input mb-3 text-xs"
                placeholder="Search catalog..."
                value={catalogSearch}
                onChange={e => setCatalogSearch(e.target.value)}
              />

              {/* Suggestions */}
              {!catalogSearch && suggestions.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-dark mb-2">
                    Suggested for {room.type.replace(/-/g, " ")}
                  </div>
                  <div className="space-y-1.5">
                    {suggestions.map(item => {
                      const isPlaced = sceneItems.some(s => s.itemId === item.id);
                      return (
                        <button
                          key={item.id}
                          onClick={() => addSceneItem(item)}
                          className={`flex w-full items-center gap-2 rounded border px-2 py-1.5 text-xs transition ${
                            isPlaced ? "border-amber/30 bg-amber/5" : "border-brand-900/5 hover:border-amber/30"
                          }`}
                        >
                          {item.imageUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={item.imageUrl} alt="" className="w-8 h-8 object-contain rounded" />
                          ) : (
                            <div
                              className="w-8 h-8 rounded shrink-0"
                              style={{ backgroundColor: CATEGORY_COLORS[item.category] ?? "#8B7B6B" }}
                            />
                          )}
                          <div className="flex-1 min-w-0 text-left">
                            <div className="font-medium text-brand-900 truncate">{item.name}</div>
                            <div className="text-[10px] text-brand-600">${item.price} · {item.vendor}</div>
                          </div>
                          <span className="text-amber-dark shrink-0 text-xs">
                            {isPlaced ? "+" : "+"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Search results */}
              {catalogSearch && (
                <div>
                  <div className="text-[10px] text-brand-600 mb-2">{filteredCatalog.length} results</div>
                  <div className="space-y-1.5">
                    {filteredCatalog.slice(0, 40).map(item => (
                      <button
                        key={item.id}
                        onClick={() => addSceneItem(item)}
                        className="flex w-full items-center gap-2 rounded border border-brand-900/5 hover:border-amber/30 px-2 py-1.5 text-xs transition"
                      >
                        {item.imageUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={item.imageUrl} alt="" className="w-8 h-8 object-contain rounded" />
                        ) : (
                          <div
                            className="w-8 h-8 rounded shrink-0"
                            style={{ backgroundColor: CATEGORY_COLORS[item.category] ?? "#8B7B6B" }}
                          />
                        )}
                        <div className="flex-1 min-w-0 text-left">
                          <div className="font-medium text-brand-900 truncate">{item.name}</div>
                          <div className="text-[10px] text-brand-600">${item.price} · {item.vendor}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tips for empty state */}
              {!catalogSearch && suggestions.length === 0 && sceneItems.length === 0 && (
                <div className="text-xs text-brand-600 py-4">
                  <p className="mb-2">Start by searching the catalog or adding custom items with product images from Target/Wayfair/Amazon.</p>
                  <p className="text-[10px] text-brand-600/60">
                    Items with imageUrls will show as actual photos. Without, they show as colored rectangles with names.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
