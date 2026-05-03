"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { saveProject, getProject as getProjectFromStore, generateId, logActivity } from "@/lib/store";
import type { Project, LayoutCanvas, LayoutShape, LayoutLabel, LayoutCalibration, LayoutShapeType } from "@/lib/types";
import ShapeLibrarySidebar from "./ShapeLibrarySidebar";

interface Props {
  project: Project;
  onUpdate: () => void;
}

type Tool = "select" | "calibrate" | "label";

interface DragState {
  shapeId: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
}

/**
 * Floor Plan Layout Canvas — the designer's top-down spatial planning tool.
 *
 * Workflow:
 * 1. Upload a floor plan image (Matterport export, photo, etc.)
 * 2. Set scale by marking a known wall and entering its real length
 * 3. Drag furniture shapes from the sidebar onto the plan
 * 4. Shapes auto-size to real dimensions using the calibrated scale
 */
export default function FloorPlanCanvas({ project, onUpdate }: Props) {
  // ── State ──
  const canvases = project.layoutCanvases ?? [];
  const [activeCanvasIdx, setActiveCanvasIdx] = useState(0);
  const canvas: LayoutCanvas | null = canvases[activeCanvasIdx] ?? null;

  const [tool, setTool] = useState<Tool>("select");
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  // Calibration state
  const [calPoint1, setCalPoint1] = useState<{ x: number; y: number } | null>(null);
  const [calPoint2, setCalPoint2] = useState<{ x: number; y: number } | null>(null);
  const [calInput, setCalInput] = useState("");
  const [showCalDialog, setShowCalDialog] = useState(false);

  // Pan/zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // ── Helpers ──
  const ppf = canvas?.calibration?.pixelsPerFoot ?? 0;

  function saveCanvas(updated: LayoutCanvas) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const list = fresh.layoutCanvases ?? [];
    list[activeCanvasIdx] = updated;
    fresh.layoutCanvases = list;
    saveProject(fresh);
    onUpdate();
  }

  function getCanvasCoords(e: React.MouseEvent): { x: number; y: number } | null {
    if (!containerRef.current || !imageRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    // Mouse position relative to the container
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // Account for pan and zoom to get image-space coordinates
    const imgX = (mx - pan.x) / zoom;
    const imgY = (my - pan.y) / zoom;
    return { x: imgX, y: imgY };
  }

  // ── Upload handler ──
  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const newCanvas: LayoutCanvas = {
          id: generateId(),
          name: `Floor ${canvases.length + 1}`,
          imageUrl: dataUrl,
          imageWidth: img.naturalWidth,
          imageHeight: img.naturalHeight,
          shapes: [],
          labels: [],
        };
        const fresh = getProjectFromStore(project.id);
        if (!fresh) return;
        fresh.layoutCanvases = [...(fresh.layoutCanvases ?? []), newCanvas];
        saveProject(fresh);
        setActiveCanvasIdx((fresh.layoutCanvases?.length ?? 1) - 1);
        logActivity(project.id, "layout_canvas_created", `Created layout canvas: ${newCanvas.name}`);
        onUpdate();
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  // ── Calibration ──
  function handleCanvasClick(e: React.MouseEvent) {
    if (tool === "calibrate") {
      const coords = getCanvasCoords(e);
      if (!coords) return;
      if (!calPoint1) {
        setCalPoint1(coords);
      } else if (!calPoint2) {
        setCalPoint2(coords);
        setShowCalDialog(true);
      }
    } else if (tool === "select") {
      // Deselect if clicking empty space
      setSelectedShapeId(null);
    }
  }

  function confirmCalibration() {
    if (!calPoint1 || !calPoint2 || !canvas) return;
    const ft = parseFloat(calInput);
    if (!ft || ft <= 0) return;
    const dx = calPoint2.x - calPoint1.x;
    const dy = calPoint2.y - calPoint1.y;
    const pxDist = Math.sqrt(dx * dx + dy * dy);
    const pixelsPerFoot = pxDist / ft;

    const calibration: LayoutCalibration = {
      x1: calPoint1.x,
      y1: calPoint1.y,
      x2: calPoint2.x,
      y2: calPoint2.y,
      realLengthFt: ft,
      pixelsPerFoot,
    };

    saveCanvas({ ...canvas, calibration });
    resetCalibration();
    logActivity(project.id, "layout_calibrated", `Set scale: ${ft} ft = ${pxDist.toFixed(0)} px → ${pixelsPerFoot.toFixed(1)} px/ft`);
  }

  function resetCalibration() {
    setCalPoint1(null);
    setCalPoint2(null);
    setCalInput("");
    setShowCalDialog(false);
    setTool("select");
  }

  // ── Shape drag ──
  function handleShapeMouseDown(e: React.MouseEvent, shape: LayoutShape) {
    e.stopPropagation();
    if (tool !== "select") return;
    setSelectedShapeId(shape.id);
    const coords = getCanvasCoords(e);
    if (!coords) return;
    setDragState({
      shapeId: shape.id,
      startX: coords.x,
      startY: coords.y,
      origX: shape.x,
      origY: shape.y,
    });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (isPanning) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
      return;
    }
    if (!dragState || !canvas) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    const dx = coords.x - dragState.startX;
    const dy = coords.y - dragState.startY;
    const updated = { ...canvas };
    updated.shapes = canvas.shapes.map(s =>
      s.id === dragState.shapeId
        ? { ...s, x: dragState.origX + dx, y: dragState.origY + dy }
        : s
    );
    saveCanvas(updated);
  }

  function handleMouseUp() {
    setDragState(null);
    setIsPanning(false);
  }

  // ── Pan (middle-click or space+drag) ──
  function handleContainerMouseDown(e: React.MouseEvent) {
    // Middle mouse button or holding space for pan
    if (e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  }

  // ── Zoom (scroll wheel) ──
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.max(0.2, Math.min(5, z + delta)));
  }

  // ── Drop shape from sidebar ──
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!canvas) return;
    const data = e.dataTransfer.getData("application/layout-shape");
    if (!data) return;
    const preset = JSON.parse(data) as { type: LayoutShapeType; label: string; widthIn: number; depthIn: number; color: string };

    const coords = getCanvasCoords(e as unknown as React.MouseEvent);
    if (!coords) return;

    const newShape: LayoutShape = {
      id: generateId(),
      type: preset.type,
      label: preset.label,
      widthIn: preset.widthIn,
      depthIn: preset.depthIn,
      x: coords.x,
      y: coords.y,
      rotation: 0,
      color: preset.color,
    };

    saveCanvas({ ...canvas, shapes: [...canvas.shapes, newShape] });
    setSelectedShapeId(newShape.id);
    logActivity(project.id, "layout_shape_placed", `Placed ${preset.label} on layout`);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  // ── Shape actions ──
  function deleteShape(id: string) {
    if (!canvas) return;
    saveCanvas({ ...canvas, shapes: canvas.shapes.filter(s => s.id !== id) });
    setSelectedShapeId(null);
  }

  function rotateShape(id: string) {
    if (!canvas) return;
    saveCanvas({
      ...canvas,
      shapes: canvas.shapes.map(s =>
        s.id === id ? { ...s, rotation: (s.rotation + 90) % 360 } : s
      ),
    });
  }

  function updateShapeDimensions(id: string, widthIn: number, depthIn: number) {
    if (!canvas) return;
    saveCanvas({
      ...canvas,
      shapes: canvas.shapes.map(s =>
        s.id === id ? { ...s, widthIn, depthIn } : s
      ),
    });
  }

  function updateShapeLabel(id: string, label: string) {
    if (!canvas) return;
    saveCanvas({
      ...canvas,
      shapes: canvas.shapes.map(s =>
        s.id === id ? { ...s, label } : s
      ),
    });
  }

  // ── Render: No canvas yet ──
  if (!canvas) {
    return (
      <div className="card text-center py-12">
        <div className="text-4xl mb-3">📐</div>
        <h3 className="font-semibold text-brand-900 mb-2">Floor Plan Layout</h3>
        <p className="text-sm text-brand-600 max-w-md mx-auto mb-4">
          Upload your Matterport floor plan image to start planning furniture placement to scale.
        </p>
        <label className="inline-flex items-center gap-2 rounded-lg bg-amber px-4 py-2 text-sm font-medium text-brand-900 cursor-pointer hover:bg-amber-dark transition">
          Upload Floor Plan Image
          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </label>
      </div>
    );
  }

  // ── Render: Canvas active ──
  const selectedShape = canvas.shapes.find(s => s.id === selectedShapeId);

  return (
    <div className="flex gap-4">
      {/* Sidebar */}
      <ShapeLibrarySidebar />

      {/* Main canvas area */}
      <div className="flex-1 min-w-0">
        {/* Toolbar */}
        <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {/* Floor tabs */}
            {canvases.length > 1 && canvases.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setActiveCanvasIdx(i)}
                className={i === activeCanvasIdx ? "tab-active" : "tab"}
              >
                {c.name}
              </button>
            ))}
            <label className="text-xs text-brand-600 cursor-pointer hover:text-amber-dark ml-2">
              + Add Floor
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setTool("calibrate"); resetCalibration(); }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                tool === "calibrate"
                  ? "border-amber bg-amber/20 text-amber-dark"
                  : "border-brand-900/10 text-brand-700 hover:border-amber/40"
              }`}
              title="Click two points on a wall, then enter the real length"
            >
              📏 Set Scale
            </button>
            <button
              onClick={() => setTool("select")}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                tool === "select"
                  ? "border-amber bg-amber/20 text-amber-dark"
                  : "border-brand-900/10 text-brand-700 hover:border-amber/40"
              }`}
            >
              ↖ Select
            </button>

            <div className="flex items-center gap-1 ml-3">
              <button onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} className="text-brand-600 hover:text-brand-900 px-2 text-sm">−</button>
              <span className="text-[10px] text-brand-600 w-12 text-center">{(zoom * 100).toFixed(0)}%</span>
              <button onClick={() => setZoom(z => Math.min(5, z + 0.2))} className="text-brand-600 hover:text-brand-900 px-2 text-sm">+</button>
              <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="text-[10px] text-brand-600 hover:text-brand-900 ml-1">Reset</button>
            </div>

            {ppf > 0 && (
              <span className="text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5 ml-2">
                Scale: {ppf.toFixed(1)} px/ft
              </span>
            )}
          </div>
        </div>

        {/* Calibration instructions */}
        {tool === "calibrate" && (
          <div className="mb-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-2 text-xs text-blue-800">
            {!calPoint1 && "Click the first point on a wall you know the length of."}
            {calPoint1 && !calPoint2 && "Now click the second point (other end of the wall)."}
            {calPoint1 && calPoint2 && "Enter the real-world length of this wall segment."}
            <button onClick={resetCalibration} className="ml-3 text-blue-600 hover:underline">Cancel</button>
          </div>
        )}

        {/* Calibration dialog */}
        {showCalDialog && (
          <div className="mb-2 rounded-lg bg-white border border-amber shadow-lg px-4 py-3 flex items-center gap-3">
            <span className="text-sm text-brand-900 font-medium">Wall length:</span>
            <input
              type="number"
              step="0.5"
              min="0.5"
              className="input w-24 text-sm"
              placeholder="e.g. 14"
              value={calInput}
              onChange={e => setCalInput(e.target.value)}
              autoFocus
            />
            <span className="text-sm text-brand-600">ft</span>
            <button
              onClick={confirmCalibration}
              className="rounded-lg bg-amber px-3 py-1.5 text-xs font-medium text-brand-900 hover:bg-amber-dark"
            >
              Confirm
            </button>
            <button onClick={resetCalibration} className="text-xs text-brand-600 hover:underline">Cancel</button>
          </div>
        )}

        {/* Canvas */}
        <div
          ref={containerRef}
          className="card relative overflow-hidden cursor-crosshair"
          style={{ height: "70vh", minHeight: 400 }}
          onMouseDown={handleContainerMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleCanvasClick}
          onWheel={handleWheel}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              position: "relative",
              display: "inline-block",
            }}
          >
            {/* Background floor plan image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={canvas.imageUrl}
              alt="Floor plan"
              className="block select-none pointer-events-none"
              style={{ maxWidth: "none" }}
              draggable={false}
            />

            {/* Calibration points */}
            {tool === "calibrate" && calPoint1 && (
              <div
                className="absolute w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-lg"
                style={{ left: calPoint1.x - 6, top: calPoint1.y - 6 }}
              />
            )}
            {tool === "calibrate" && calPoint2 && (
              <div
                className="absolute w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-lg"
                style={{ left: calPoint2.x - 6, top: calPoint2.y - 6 }}
              />
            )}
            {/* Calibration line */}
            {tool === "calibrate" && calPoint1 && calPoint2 && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible" }}>
                <line
                  x1={calPoint1.x} y1={calPoint1.y}
                  x2={calPoint2.x} y2={calPoint2.y}
                  stroke="#ef4444" strokeWidth={2} strokeDasharray="6 3"
                />
              </svg>
            )}

            {/* Existing calibration line (subtle) */}
            {canvas.calibration && tool !== "calibrate" && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible" }}>
                <line
                  x1={canvas.calibration.x1} y1={canvas.calibration.y1}
                  x2={canvas.calibration.x2} y2={canvas.calibration.y2}
                  stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.6}
                />
                <text
                  x={(canvas.calibration.x1 + canvas.calibration.x2) / 2}
                  y={(canvas.calibration.y1 + canvas.calibration.y2) / 2 - 8}
                  fontSize={12} fill="#16a34a" textAnchor="middle"
                >
                  {canvas.calibration.realLengthFt} ft
                </text>
              </svg>
            )}

            {/* Shapes */}
            {canvas.shapes.map(shape => {
              const rotated = shape.rotation % 180 !== 0;
              const wPx = ppf > 0 ? ((rotated ? shape.depthIn : shape.widthIn) / 12) * ppf : 60;
              const hPx = ppf > 0 ? ((rotated ? shape.widthIn : shape.depthIn) / 12) * ppf : 40;
              const isSelected = selectedShapeId === shape.id;

              return (
                <div
                  key={shape.id}
                  className={`absolute flex items-center justify-center select-none transition-shadow rounded-sm ${
                    isSelected
                      ? "ring-2 ring-amber ring-offset-1 shadow-lg z-20 cursor-grab"
                      : "cursor-grab hover:ring-1 hover:ring-amber/60 shadow-sm z-10"
                  }`}
                  style={{
                    left: shape.x - wPx / 2,
                    top: shape.y - hPx / 2,
                    width: wPx,
                    height: hPx,
                    backgroundColor: shape.color + "CC",
                    border: `1.5px solid ${shape.color}`,
                    transform: `rotate(${shape.rotation}deg)`,
                  }}
                  onMouseDown={(e) => handleShapeMouseDown(e, shape)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedShapeId(isSelected ? null : shape.id);
                  }}
                  title={`${shape.label} (${shape.widthIn}"×${shape.depthIn}")`}
                >
                  <span
                    className="text-white text-center leading-tight font-medium drop-shadow-sm px-0.5"
                    style={{ fontSize: Math.max(8, Math.min(12, wPx / 8)) }}
                  >
                    {shape.label}
                  </span>
                </div>
              );
            })}

            {/* Labels */}
            {canvas.labels.map(lbl => (
              <div
                key={lbl.id}
                className="absolute select-none pointer-events-none font-semibold"
                style={{
                  left: lbl.x,
                  top: lbl.y,
                  fontSize: lbl.fontSize,
                  color: lbl.color,
                }}
              >
                {lbl.text}
              </div>
            ))}
          </div>
        </div>

        {/* Selected shape properties panel */}
        {selectedShape && (
          <div className="mt-3 rounded-lg bg-brand-900/5 px-4 py-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <input
                  className="input text-sm font-medium w-40"
                  value={selectedShape.label}
                  onChange={e => updateShapeLabel(selectedShape.id, e.target.value)}
                />
                <div className="flex items-center gap-1 text-xs text-brand-600">
                  <input
                    type="number"
                    className="input w-16 text-xs text-center"
                    value={selectedShape.widthIn}
                    onChange={e => updateShapeDimensions(selectedShape.id, Number(e.target.value) || 1, selectedShape.depthIn)}
                    min={1}
                  />
                  <span>&quot;W ×</span>
                  <input
                    type="number"
                    className="input w-16 text-xs text-center"
                    value={selectedShape.depthIn}
                    onChange={e => updateShapeDimensions(selectedShape.id, selectedShape.widthIn, Number(e.target.value) || 1)}
                    min={1}
                  />
                  <span>&quot;D</span>
                </div>
                {ppf > 0 && (
                  <span className="text-[10px] text-brand-600">
                    ({(selectedShape.widthIn / 12).toFixed(1)}&apos; × {(selectedShape.depthIn / 12).toFixed(1)}&apos;)
                  </span>
                )}
              </div>
              <div className="flex gap-3 text-xs">
                <button onClick={() => rotateShape(selectedShape.id)} className="text-amber-dark hover:underline">
                  Rotate 90°
                </button>
                <button onClick={() => deleteShape(selectedShape.id)} className="text-red-500 hover:underline">
                  Remove
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
