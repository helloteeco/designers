"use client";

import { useRef, useState } from "react";
import { saveProject, getProject as getProjectFromStore, generateId, logActivity } from "@/lib/store";
import { useToast } from "./Toast";
import AutoDetectRooms from "./AutoDetectRooms";
import type { Project, Room, RoomType, FloorPlan, RoomAnnotation } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
  onClose: () => void;
  /** Optional: open directly to a specific plan */
  initialPlanId?: string;
}

const ROOM_TYPES: { value: RoomType; label: string; color: string }[] = [
  { value: "primary-bedroom", label: "Primary Bedroom", color: "#8B7355" },
  { value: "bedroom", label: "Bedroom", color: "#A08B6D" },
  { value: "loft", label: "Loft", color: "#9B8770" },
  { value: "bonus-room", label: "Bonus Room", color: "#8B7B6B" },
  { value: "living-room", label: "Living Room", color: "#6B8E6B" },
  { value: "dining-room", label: "Dining Room", color: "#7B8E6B" },
  { value: "kitchen", label: "Kitchen", color: "#7B8B9B" },
  { value: "den", label: "Den", color: "#6B8B5B" },
  { value: "office", label: "Office", color: "#5B7B8B" },
  { value: "game-room", label: "Game Room", color: "#9B6B8B" },
  { value: "media-room", label: "Media Room", color: "#5B5B8B" },
  { value: "bathroom", label: "Bathroom", color: "#6B9BAB" },
  { value: "hallway", label: "Hallway", color: "#ACACAC" },
  { value: "outdoor", label: "Outdoor", color: "#6B8B5B" },
];

function colorForType(type: string): string {
  return ROOM_TYPES.find(t => t.value === type)?.color ?? "#8B7B6B";
}

interface DrawState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

type FormMode =
  | { kind: "closed" }
  | { kind: "new"; rect: { x: number; y: number; width: number; height: number } }
  | { kind: "edit"; roomId: string };

export default function FloorPlanAnnotator({ project, onUpdate, onClose, initialPlanId }: Props) {
  const toast = useToast();
  const imgRef = useRef<HTMLDivElement>(null);

  const plans = project.property?.floorPlans ?? [];
  const imagePlans = plans.filter(p => p.type === "image");

  const [currentPlanId, setCurrentPlanId] = useState<string>(
    initialPlanId && imagePlans.find(p => p.id === initialPlanId)
      ? initialPlanId
      : imagePlans[0]?.id ?? ""
  );
  const [drawState, setDrawState] = useState<DrawState | null>(null);
  const [formMode, setFormMode] = useState<FormMode>({ kind: "closed" });
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [showAutoDetect, setShowAutoDetect] = useState(false);

  const currentPlan = imagePlans.find(p => p.id === currentPlanId);

  // Rooms that are annotated on the current plan
  const roomsOnPlan = project.rooms.filter(r => r.annotation?.floorPlanId === currentPlanId);

  // ── Drawing ──

  function handleMouseDown(e: React.MouseEvent) {
    if (formMode.kind !== "closed") return;
    if (!imgRef.current) return;
    // Ignore clicks on existing rectangle overlays
    if ((e.target as HTMLElement).dataset.overlay === "room") return;

    const rect = imgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setDrawState({ startX: x, startY: y, currentX: x, currentY: y });
    setSelectedRoomId(null);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!drawState || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setDrawState({ ...drawState, currentX: x, currentY: y });
  }

  function handleMouseUp() {
    if (!drawState) return;
    const minX = Math.min(drawState.startX, drawState.currentX);
    const minY = Math.min(drawState.startY, drawState.currentY);
    const width = Math.abs(drawState.currentX - drawState.startX);
    const height = Math.abs(drawState.currentY - drawState.startY);

    if (width >= 2 && height >= 2) {
      // Opened rectangle big enough — open form
      setFormMode({
        kind: "new",
        rect: { x: minX, y: minY, width, height },
      });
    }
    setDrawState(null);
  }

  // ── CRUD ──

  function createRoom(data: {
    name: string;
    type: RoomType;
    widthFt: number;
    lengthFt: number;
    ceilingHeightFt: number;
    features: string[];
  }) {
    if (formMode.kind !== "new") return;
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;

    const room: Room = {
      id: generateId(),
      name: data.name,
      type: data.type,
      widthFt: data.widthFt,
      lengthFt: data.lengthFt,
      ceilingHeightFt: data.ceilingHeightFt,
      floor: 1,
      features: data.features,
      selectedBedConfig: null,
      furniture: [],
      accentWall: null,
      notes: "",
      annotation: {
        floorPlanId: currentPlanId,
        x: formMode.rect.x,
        y: formMode.rect.y,
        width: formMode.rect.width,
        height: formMode.rect.height,
      },
    };

    fresh.rooms.push(room);
    saveProject(fresh);
    logActivity(project.id, "room_annotated", `Added ${data.name} to floor plan`);
    toast.success(`"${data.name}" added`);
    setFormMode({ kind: "closed" });
    onUpdate();
  }

  function updateRoom(roomId: string, data: {
    name: string;
    type: RoomType;
    widthFt: number;
    lengthFt: number;
    ceilingHeightFt: number;
    features: string[];
  }) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const room = fresh.rooms.find(r => r.id === roomId);
    if (!room) return;

    room.name = data.name;
    room.type = data.type;
    room.widthFt = data.widthFt;
    room.lengthFt = data.lengthFt;
    room.ceilingHeightFt = data.ceilingHeightFt;
    room.features = data.features;

    saveProject(fresh);
    toast.success(`"${data.name}" updated`);
    setFormMode({ kind: "closed" });
    onUpdate();
  }

  function removeAnnotation(roomId: string) {
    if (!confirm("Remove the plan annotation? The room itself will stay, just unanchored from the plan.")) return;
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const room = fresh.rooms.find(r => r.id === roomId);
    if (!room) return;
    room.annotation = undefined;
    saveProject(fresh);
    onUpdate();
  }

  function deleteRoom(roomId: string) {
    if (!confirm("Delete this room entirely? Furniture and finishes linked to it will also be cleaned up.")) return;
    // Use the cascading deleteRoom from store
    import("@/lib/store").then(({ deleteRoom: del }) => {
      del(project.id, roomId);
      toast.info("Room deleted");
      setFormMode({ kind: "closed" });
      onUpdate();
    });
  }

  // ── Empty state ──

  if (imagePlans.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
        <div className="card max-w-md text-center">
          <div className="text-4xl mb-3">📐</div>
          <h2 className="text-lg font-semibold mb-2">No floor plan images yet</h2>
          <p className="text-sm text-brand-600 mb-4">
            Upload a floor plan image (JPG or PNG) in the Overview tab first.
            PDF floor plans can&apos;t be annotated — export them as an image first.
          </p>
          <button onClick={onClose} className="btn-primary btn-sm">
            Got it
          </button>
        </div>
      </div>
    );
  }

  // ── Render ──

  const tempRect = drawState ? {
    x: Math.min(drawState.startX, drawState.currentX),
    y: Math.min(drawState.startY, drawState.currentY),
    width: Math.abs(drawState.currentX - drawState.startX),
    height: Math.abs(drawState.currentY - drawState.startY),
  } : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
      {/* Toolbar */}
      <div className="bg-white border-b border-brand-900/10 px-4 py-2 flex items-center gap-3">
        <span className="text-sm font-semibold text-brand-900">📐 Annotate Floor Plan</span>

        {imagePlans.length > 1 && (
          <select
            className="select text-xs w-auto"
            value={currentPlanId}
            onChange={e => { setCurrentPlanId(e.target.value); setSelectedRoomId(null); setFormMode({ kind: "closed" }); }}
          >
            {imagePlans.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        <div className="text-xs text-brand-600 flex-1 text-center hidden sm:block">
          {formMode.kind === "closed" && !drawState && (
            <>Click &amp; drag to mark a room · {roomsOnPlan.length} annotated</>
          )}
          {drawState && <>Drawing rectangle — release to name the room</>}
          {formMode.kind === "new" && <>Fill in the room details below</>}
          {formMode.kind === "edit" && <>Editing room</>}
        </div>

        {currentPlan && (
          <button
            onClick={() => setShowAutoDetect(true)}
            className="btn-accent btn-sm"
            title="Auto-read room labels + dimensions off this plan"
          >
            🤖 Auto-Detect
          </button>
        )}

        <button onClick={onClose} className="btn-secondary btn-sm">
          Done
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        {currentPlan && (
          <div
            ref={imgRef}
            className="relative inline-block select-none max-w-full max-h-full"
            style={{ cursor: drawState ? "crosshair" : formMode.kind === "closed" ? "crosshair" : "default" }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => setDrawState(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentPlan.url}
              alt={currentPlan.name}
              className="max-w-full max-h-[80vh] object-contain pointer-events-none"
              draggable={false}
            />

            {/* Existing annotations */}
            {roomsOnPlan.map(room => {
              const ann = room.annotation!;
              const isSelected = selectedRoomId === room.id;
              const color = colorForType(room.type);
              return (
                <div
                  key={room.id}
                  data-overlay="room"
                  onClick={e => {
                    e.stopPropagation();
                    setSelectedRoomId(isSelected ? null : room.id);
                  }}
                  onDoubleClick={e => {
                    e.stopPropagation();
                    setFormMode({ kind: "edit", roomId: room.id });
                  }}
                  className={`absolute border-2 rounded flex items-center justify-center text-xs font-semibold text-white transition cursor-pointer ${
                    isSelected ? "ring-2 ring-white z-20" : "z-10 hover:ring-1 hover:ring-white/50"
                  }`}
                  style={{
                    left: `${ann.x}%`,
                    top: `${ann.y}%`,
                    width: `${ann.width}%`,
                    height: `${ann.height}%`,
                    backgroundColor: color + (isSelected ? "E0" : "A0"),
                    borderColor: color,
                  }}
                  title={`${room.name} · ${room.widthFt}' × ${room.lengthFt}' · double-click to edit`}
                >
                  <div className="text-center px-1 pointer-events-none">
                    <div className="drop-shadow-sm truncate">{room.name}</div>
                    <div className="text-[10px] opacity-90 font-normal">{room.widthFt}&apos; × {room.lengthFt}&apos;</div>
                  </div>
                </div>
              );
            })}

            {/* Drawing-in-progress rectangle */}
            {tempRect && tempRect.width > 0.5 && tempRect.height > 0.5 && (
              <div
                className="absolute border-2 border-dashed border-amber bg-amber/20 pointer-events-none rounded z-30"
                style={{
                  left: `${tempRect.x}%`,
                  top: `${tempRect.y}%`,
                  width: `${tempRect.width}%`,
                  height: `${tempRect.height}%`,
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Selected-room actions bar */}
      {selectedRoomId && formMode.kind === "closed" && (() => {
        const room = project.rooms.find(r => r.id === selectedRoomId);
        if (!room) return null;
        return (
          <div className="bg-white border-t border-brand-900/10 px-4 py-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm font-semibold text-brand-900">{room.name}</div>
              <div className="text-xs text-brand-600">
                {room.type.replace(/-/g, " ")} · {room.widthFt}&apos; × {room.lengthFt}&apos; · {room.ceilingHeightFt}&apos; ceiling
                {room.features.length > 0 && ` · ${room.features.join(", ")}`}
              </div>
            </div>
            <button onClick={() => setFormMode({ kind: "edit", roomId: room.id })} className="btn-secondary btn-sm">
              Edit
            </button>
            <button onClick={() => removeAnnotation(room.id)} className="text-xs text-brand-600 hover:text-brand-900">
              Unpin from plan
            </button>
            <button onClick={() => deleteRoom(room.id)} className="text-xs text-red-500 hover:text-red-700">
              Delete
            </button>
          </div>
        );
      })()}

      {/* Create / Edit form */}
      {(formMode.kind === "new" || formMode.kind === "edit") && (
        <RoomForm
          initial={
            formMode.kind === "edit"
              ? project.rooms.find(r => r.id === formMode.roomId) ?? null
              : null
          }
          onSave={data => {
            if (formMode.kind === "new") createRoom(data);
            else if (formMode.kind === "edit") updateRoom(formMode.roomId, data);
          }}
          onCancel={() => setFormMode({ kind: "closed" })}
        />
      )}

      {/* Auto-detect modal (overlays the annotator) */}
      {showAutoDetect && currentPlan && (
        <AutoDetectRooms
          project={project}
          plan={currentPlan}
          onUpdate={onUpdate}
          onClose={() => setShowAutoDetect(false)}
        />
      )}
    </div>
  );
}

// ── Room form (modal) ──

const COMMON_FEATURES = [
  "Window", "Closet", "En-suite", "Walk-in Closet", "Fireplace",
  "Vaulted Ceiling", "Skylight", "Built-in Shelving", "Bay Window", "Balcony",
];

function RoomForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Room | null;
  onSave: (data: {
    name: string;
    type: RoomType;
    widthFt: number;
    lengthFt: number;
    ceilingHeightFt: number;
    features: string[];
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<RoomType>(initial?.type ?? "bedroom");
  const [widthFt, setWidthFt] = useState(initial?.widthFt ?? 12);
  const [lengthFt, setLengthFt] = useState(initial?.lengthFt ?? 12);
  const [ceilingHeightFt, setCeilingHeightFt] = useState(initial?.ceilingHeightFt ?? 9);
  const [features, setFeatures] = useState<string[]>(initial?.features ?? []);

  function toggleFeature(f: string) {
    setFeatures(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      alert("Room name required.");
      return;
    }
    onSave({
      name: name.trim(),
      type,
      widthFt: Math.max(4, widthFt),
      lengthFt: Math.max(4, lengthFt),
      ceilingHeightFt: Math.max(6, ceilingHeightFt),
      features,
    });
  }

  return (
    <div className="absolute inset-x-0 bottom-0 bg-white border-t-2 border-brand-900/10 shadow-2xl max-h-[70vh] overflow-y-auto">
      <form onSubmit={handleSubmit} className="p-4 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-brand-900">
            {initial ? `Edit ${initial.name}` : "Add Room from Floor Plan"}
          </h3>
          <button type="button" onClick={onCancel} className="text-brand-600 hover:text-brand-900 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="label">Room Name *</label>
            <input
              className="input"
              placeholder="e.g. Primary Suite"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="select" value={type} onChange={e => setType(e.target.value as RoomType)}>
              {ROOM_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Width (ft)</label>
            <input
              type="number"
              className="input"
              min={4}
              value={widthFt}
              onChange={e => setWidthFt(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="label">Length (ft)</label>
            <input
              type="number"
              className="input"
              min={4}
              value={lengthFt}
              onChange={e => setLengthFt(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="label">Ceiling (ft)</label>
            <input
              type="number"
              className="input"
              min={6}
              value={ceilingHeightFt}
              onChange={e => setCeilingHeightFt(parseFloat(e.target.value) || 9)}
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="label">Features (optional)</label>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_FEATURES.map(f => (
              <button
                key={f}
                type="button"
                onClick={() => toggleFeature(f)}
                className={`text-xs rounded-full px-2.5 py-1 border transition ${
                  features.includes(f)
                    ? "border-amber bg-amber/10 text-amber-dark"
                    : "border-brand-900/10 text-brand-600 hover:border-amber/30"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary btn-sm">Cancel</button>
          <button type="submit" className="btn-primary btn-sm">
            {initial ? "Save Changes" : "Add Room"}
          </button>
        </div>
      </form>
    </div>
  );
}
