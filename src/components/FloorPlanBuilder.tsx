"use client";

import { useMemo, useState } from "react";
import { useToast } from "./Toast";
import { generateId, saveProject, getProject as getProjectFromStore, logActivity } from "@/lib/store";
import {
  emptyPlan,
  ftInToInches,
  inchesToFtIn,
  cmToInches,
  inchesToCm,
  formatDimension,
  wallLengthInches,
  type BuilderPlan,
  type BuilderRoom,
  type BuilderOpening,
  type BuilderUnit,
} from "@/lib/floor-plan-builder";
import { renderPlanSvg, svgStringToDataUrl } from "@/lib/floor-plan-builder-render";
import type { Project, FloorPlan } from "@/lib/types";

interface Props {
  project: Project;
  /** Editing an existing builder plan — pass its FloorPlan id. */
  existingPlanId?: string;
  onUpdate: () => void;
  onClose: () => void;
}

const WALL_NAMES = ["Top", "Right", "Bottom", "Left"];
const DEFAULT_DOOR_W = 36;    // inches
const DEFAULT_WINDOW_W = 36;  // inches

export default function FloorPlanBuilder({ project, existingPlanId, onUpdate, onClose }: Props) {
  const toast = useToast();

  // Load existing builder data if editing, else start blank
  const initialPlan = useMemo<BuilderPlan>(() => {
    if (existingPlanId) {
      const plan = project.property.floorPlans?.find((p) => p.id === existingPlanId);
      const data = (plan as FloorPlan & { builderData?: BuilderPlan })?.builderData;
      if (data) return data;
    }
    return emptyPlan();
  }, [existingPlanId, project]);

  const [plan, setPlan] = useState<BuilderPlan>(initialPlan);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    initialPlan.rooms[0]?.id ?? null
  );

  const selectedRoom = plan.rooms.find((r) => r.id === selectedRoomId) ?? null;

  function updatePlan(next: BuilderPlan) {
    setPlan(next);
  }

  function addRoom(widthInches: number, lengthInches: number, name: string) {
    // Place the new room to the right of any existing rooms, with a 12" gap
    const offset = plan.rooms.length === 0
      ? 0
      : Math.max(...plan.rooms.map((r) => r.x + r.widthInches)) + 12;
    const newRoom: BuilderRoom = {
      id: generateId(),
      name: name || `Room ${plan.rooms.length + 1}`,
      x: offset,
      y: 0,
      widthInches,
      lengthInches,
      openings: [],
    };
    const next = { ...plan, rooms: [...plan.rooms, newRoom] };
    updatePlan(next);
    setSelectedRoomId(newRoom.id);
  }

  function updateRoom(roomId: string, patch: Partial<BuilderRoom>) {
    updatePlan({
      ...plan,
      rooms: plan.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)),
    });
  }

  function deleteRoom(roomId: string) {
    const room = plan.rooms.find((r) => r.id === roomId);
    if (!confirm(`Delete "${room?.name ?? "this room"}"?`)) return;
    const next = { ...plan, rooms: plan.rooms.filter((r) => r.id !== roomId) };
    updatePlan(next);
    if (selectedRoomId === roomId) setSelectedRoomId(next.rooms[0]?.id ?? null);
  }

  function addOpening(roomId: string, type: "door" | "window", wallIndex: number) {
    const room = plan.rooms.find((r) => r.id === roomId);
    if (!room) return;
    const wallLen = wallLengthInches(room, wallIndex);
    const defaultW = type === "door" ? DEFAULT_DOOR_W : DEFAULT_WINDOW_W;
    const w = Math.min(defaultW, wallLen - 12);
    if (w < 12) {
      toast.error(`That wall is too short for a ${type}`);
      return;
    }
    const newOp: BuilderOpening = {
      id: generateId(),
      wallIndex,
      type,
      startInches: Math.max(6, (wallLen - w) / 2),
      widthInches: w,
      swing: type === "door" ? "in-left" : undefined,
    };
    updateRoom(roomId, { openings: [...room.openings, newOp] });
  }

  function updateOpening(roomId: string, opId: string, patch: Partial<BuilderOpening>) {
    const room = plan.rooms.find((r) => r.id === roomId);
    if (!room) return;
    updateRoom(roomId, {
      openings: room.openings.map((o) => (o.id === opId ? { ...o, ...patch } : o)),
    });
  }

  function deleteOpening(roomId: string, opId: string) {
    const room = plan.rooms.find((r) => r.id === roomId);
    if (!room) return;
    updateRoom(roomId, { openings: room.openings.filter((o) => o.id !== opId) });
  }

  function handleSave() {
    if (plan.rooms.length === 0) {
      toast.error("Add at least one room first");
      return;
    }
    const svg = renderPlanSvg(plan, { showDimensions: true, showRoomNames: true });
    const dataUrl = svgStringToDataUrl(svg);

    const fresh = getProjectFromStore(project.id);
    if (!fresh) {
      toast.error("Couldn't find project");
      return;
    }
    if (!fresh.property.floorPlans) fresh.property.floorPlans = [];

    if (existingPlanId) {
      // Update existing
      const idx = fresh.property.floorPlans.findIndex((p) => p.id === existingPlanId);
      if (idx >= 0) {
        const existing = fresh.property.floorPlans[idx] as FloorPlan & { builderData?: BuilderPlan };
        fresh.property.floorPlans[idx] = {
          ...existing,
          url: dataUrl,
          builderData: plan,
        };
      }
    } else {
      const newPlan: FloorPlan & { builderData?: BuilderPlan } = {
        id: generateId(),
        name: "Built Plan",
        url: dataUrl,
        type: "image",
        uploadedAt: new Date().toISOString(),
        notes: `Built with floor plan builder — ${plan.rooms.length} room${plan.rooms.length === 1 ? "" : "s"}`,
        builderData: plan,
        isPrimary: fresh.property.floorPlans.every((p) => !p.isPrimary) ? true : undefined,
      };
      fresh.property.floorPlans.push(newPlan);
    }

    // Also save as the primary floorPlanSvgContent so Space Planner + room
    // crops pick it up automatically.
    fresh.property.floorPlanSvgContent = svg;

    saveProject(fresh);
    logActivity(
      project.id,
      existingPlanId ? "floor_plan_builder_updated" : "floor_plan_builder_created",
      `${existingPlanId ? "Updated" : "Built"} floor plan — ${plan.rooms.length} room${plan.rooms.length === 1 ? "" : "s"}`
    );
    toast.success(existingPlanId ? "Plan updated" : "Plan saved");
    onUpdate();
    onClose();
  }

  const livePreviewSvg = useMemo(() => renderPlanSvg(plan, {
    showDimensions: true,
    showRoomNames: true,
  }), [plan]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-stretch">
      <div className="flex-1 bg-white flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-brand-900/10">
          <div>
            <h2 className="text-lg font-semibold text-brand-900">
              {existingPlanId ? "Edit Floor Plan" : "Floor Plan Builder"}
            </h2>
            <p className="text-[11px] text-brand-600">
              Draw to scale — all dimensions pixel-perfect accurate
            </p>
          </div>
          <div className="flex items-center gap-2">
            <UnitToggle
              unit={plan.unit}
              onChange={(u) => updatePlan({ ...plan, unit: u })}
            />
            <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
            <button onClick={handleSave} className="btn-primary btn-sm">
              {existingPlanId ? "Save Changes" : "Save Plan"}
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: rooms list + forms */}
          <div className="w-[360px] border-r border-brand-900/10 overflow-y-auto">
            <RoomsList
              plan={plan}
              selectedRoomId={selectedRoomId}
              onSelect={setSelectedRoomId}
              onAddRoom={addRoom}
              onDeleteRoom={deleteRoom}
            />
            {selectedRoom && (
              <RoomEditor
                room={selectedRoom}
                unit={plan.unit}
                onUpdateRoom={(patch) => updateRoom(selectedRoom.id, patch)}
                onAddOpening={(type, wallIndex) => addOpening(selectedRoom.id, type, wallIndex)}
                onUpdateOpening={(opId, patch) => updateOpening(selectedRoom.id, opId, patch)}
                onDeleteOpening={(opId) => deleteOpening(selectedRoom.id, opId)}
              />
            )}
          </div>

          {/* Right: live preview canvas */}
          <div className="flex-1 overflow-auto bg-brand-900/5 p-8">
            {plan.rooms.length === 0 ? (
              <EmptyCanvas />
            ) : (
              <div
                className="bg-white rounded-lg shadow-sm mx-auto"
                style={{ maxWidth: "min(100%, 900px)" }}
                dangerouslySetInnerHTML={{ __html: livePreviewSvg }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UnitToggle({ unit, onChange }: { unit: BuilderUnit; onChange: (u: BuilderUnit) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-brand-900/5 p-0.5">
      <button
        onClick={() => onChange("ft-in")}
        className={`text-xs px-2.5 py-1 rounded-md font-medium transition ${
          unit === "ft-in" ? "bg-white shadow-sm text-brand-900" : "text-brand-600"
        }`}
      >
        ft / in
      </button>
      <button
        onClick={() => onChange("cm")}
        className={`text-xs px-2.5 py-1 rounded-md font-medium transition ${
          unit === "cm" ? "bg-white shadow-sm text-brand-900" : "text-brand-600"
        }`}
      >
        cm
      </button>
    </div>
  );
}

function EmptyCanvas() {
  return (
    <div className="h-full flex items-center justify-center text-center text-brand-600">
      <div>
        <div className="text-5xl mb-3">📐</div>
        <p className="text-sm font-medium">No rooms yet</p>
        <p className="text-xs mt-1">Add a room on the left to get started — just type the width and length.</p>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Rooms list + add-room form                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

function RoomsList({
  plan,
  selectedRoomId,
  onSelect,
  onAddRoom,
  onDeleteRoom,
}: {
  plan: BuilderPlan;
  selectedRoomId: string | null;
  onSelect: (id: string) => void;
  onAddRoom: (widthInches: number, lengthInches: number, name: string) => void;
  onDeleteRoom: (id: string) => void;
}) {
  const [adding, setAdding] = useState(plan.rooms.length === 0);

  return (
    <div className="p-4 border-b border-brand-900/10">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">
          Rooms ({plan.rooms.length})
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-xs text-amber-dark hover:underline font-medium">
            + Add Room
          </button>
        )}
      </div>

      <div className="space-y-1 mb-3">
        {plan.rooms.map((r) => (
          <div
            key={r.id}
            onClick={() => onSelect(r.id)}
            className={`group px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center justify-between ${
              selectedRoomId === r.id ? "bg-amber/10 border border-amber/40" : "hover:bg-brand-900/5 border border-transparent"
            }`}
          >
            <div>
              <div className="text-sm font-medium text-brand-900">{r.name}</div>
              <div className="text-[11px] text-brand-600">
                {formatDimension(r.widthInches, plan.unit)} × {formatDimension(r.lengthInches, plan.unit)}
                {r.openings.length > 0 && ` · ${r.openings.length} opening${r.openings.length === 1 ? "" : "s"}`}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteRoom(r.id); }}
              className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
              title="Delete room"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {adding && (
        <AddRoomForm
          unit={plan.unit}
          onSubmit={(w, l, name) => {
            onAddRoom(w, l, name);
            setAdding(false);
          }}
          onCancel={plan.rooms.length > 0 ? () => setAdding(false) : undefined}
        />
      )}
    </div>
  );
}

function AddRoomForm({
  unit,
  onSubmit,
  onCancel,
}: {
  unit: BuilderUnit;
  onSubmit: (widthInches: number, lengthInches: number, name: string) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [w, setW] = useState<DimensionInput>(unit === "ft-in" ? { ft: 12, in: 0 } : { cm: 365 });
  const [l, setL] = useState<DimensionInput>(unit === "ft-in" ? { ft: 12, in: 0 } : { cm: 365 });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const widthInches = dimToInches(w, unit);
    const lengthInches = dimToInches(l, unit);
    if (widthInches < 12 || lengthInches < 12) {
      alert("Room must be at least 1ft × 1ft");
      return;
    }
    onSubmit(widthInches, lengthInches, name.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-amber/40 bg-amber/5 p-3 space-y-2">
      <div>
        <label className="label">Name</label>
        <input
          autoFocus
          className="input text-sm"
          placeholder="Kitchen, Primary Bedroom..."
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DimensionField label="Width" unit={unit} value={w} onChange={setW} />
        <DimensionField label="Length" unit={unit} value={l} onChange={setL} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && <button type="button" onClick={onCancel} className="btn-secondary btn-sm">Cancel</button>}
        <button type="submit" className="btn-primary btn-sm">Add Room</button>
      </div>
    </form>
  );
}

type DimensionInput = { ft: number; in: number } | { cm: number };

function dimToInches(d: DimensionInput, unit: BuilderUnit): number {
  if (unit === "cm" && "cm" in d) return cmToInches(d.cm);
  if (unit === "ft-in" && "ft" in d) return ftInToInches(d.ft, d.in);
  return 0;
}

function DimensionField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: BuilderUnit;
  value: DimensionInput;
  onChange: (v: DimensionInput) => void;
}) {
  if (unit === "ft-in") {
    const v = "ft" in value ? value : { ft: 0, in: 0 };
    return (
      <div>
        <label className="label">{label}</label>
        <div className="flex gap-1">
          <div className="flex-1 relative">
            <input
              type="number"
              min={0}
              className="input text-sm pr-6"
              value={v.ft}
              onChange={(e) => onChange({ ft: Number(e.target.value) || 0, in: v.in })}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-brand-600">ft</span>
          </div>
          <div className="flex-1 relative">
            <input
              type="number"
              min={0}
              max={11}
              className="input text-sm pr-6"
              value={v.in}
              onChange={(e) => onChange({ ft: v.ft, in: Number(e.target.value) || 0 })}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-brand-600">in</span>
          </div>
        </div>
      </div>
    );
  }
  const v = "cm" in value ? value : { cm: 0 };
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input
          type="number"
          min={0}
          className="input text-sm pr-8"
          value={v.cm}
          onChange={(e) => onChange({ cm: Number(e.target.value) || 0 })}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-brand-600">cm</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Room editor (edit dims + openings for the selected room)                   */
/* ────────────────────────────────────────────────────────────────────────── */

function RoomEditor({
  room,
  unit,
  onUpdateRoom,
  onAddOpening,
  onUpdateOpening,
  onDeleteOpening,
}: {
  room: BuilderRoom;
  unit: BuilderUnit;
  onUpdateRoom: (patch: Partial<BuilderRoom>) => void;
  onAddOpening: (type: "door" | "window", wallIndex: number) => void;
  onUpdateOpening: (opId: string, patch: Partial<BuilderOpening>) => void;
  onDeleteOpening: (opId: string) => void;
}) {
  const w = inchesToDim(room.widthInches, unit);
  const l = inchesToDim(room.lengthInches, unit);

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-600 mb-2">
          Editing: {room.name}
        </div>
        <input
          className="input text-sm mb-3"
          value={room.name}
          onChange={(e) => onUpdateRoom({ name: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-2">
          <DimensionField
            label="Width"
            unit={unit}
            value={w}
            onChange={(v) => onUpdateRoom({ widthInches: dimToInches(v, unit) })}
          />
          <DimensionField
            label="Length"
            unit={unit}
            value={l}
            onChange={(v) => onUpdateRoom({ lengthInches: dimToInches(v, unit) })}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">
            Openings ({room.openings.length})
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1 mb-3">
          {WALL_NAMES.map((name, wi) => (
            <div key={wi} className="text-center">
              <div className="text-[10px] text-brand-600 mb-1">{name}</div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => onAddOpening("door", wi)}
                  className="text-[10px] px-1.5 py-1 rounded bg-brand-900/5 hover:bg-amber/10 text-brand-700"
                  title={`Add door on ${name} wall`}
                >
                  + Door
                </button>
                <button
                  onClick={() => onAddOpening("window", wi)}
                  className="text-[10px] px-1.5 py-1 rounded bg-brand-900/5 hover:bg-amber/10 text-brand-700"
                  title={`Add window on ${name} wall`}
                >
                  + Window
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {room.openings.map((op) => (
            <OpeningRow
              key={op.id}
              room={room}
              opening={op}
              unit={unit}
              onChange={(patch) => onUpdateOpening(op.id, patch)}
              onDelete={() => onDeleteOpening(op.id)}
            />
          ))}
          {room.openings.length === 0 && (
            <p className="text-[11px] text-brand-600/70 italic">
              No doors or windows yet — pick a wall above to add one.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function OpeningRow({
  room,
  opening,
  unit,
  onChange,
  onDelete,
}: {
  room: BuilderRoom;
  opening: BuilderOpening;
  unit: BuilderUnit;
  onChange: (patch: Partial<BuilderOpening>) => void;
  onDelete: () => void;
}) {
  const wallLen = wallLengthInches(room, opening.wallIndex);
  const maxStart = Math.max(0, wallLen - opening.widthInches);

  return (
    <div className="group rounded-lg border border-brand-900/10 bg-white p-2 text-xs">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{opening.type === "door" ? "🚪" : "🪟"}</span>
          <span className="font-medium text-brand-900 capitalize">{opening.type}</span>
          <span className="text-brand-600">· {WALL_NAMES[opening.wallIndex]} wall</span>
        </div>
        <button
          onClick={onDelete}
          className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
        >
          ×
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-1.5">
        <div>
          <label className="text-[10px] text-brand-600">Width</label>
          <DimensionInputCompact
            unit={unit}
            inches={opening.widthInches}
            onChange={(v) => onChange({ widthInches: Math.min(v, wallLen - 2) })}
          />
        </div>
        <div>
          <label className="text-[10px] text-brand-600">From corner</label>
          <DimensionInputCompact
            unit={unit}
            inches={opening.startInches}
            onChange={(v) => onChange({ startInches: Math.max(0, Math.min(v, maxStart)) })}
          />
        </div>
      </div>

      {opening.type === "door" && (
        <div>
          <label className="text-[10px] text-brand-600">Swing</label>
          <select
            className="input text-xs py-1"
            value={opening.swing ?? "in-left"}
            onChange={(e) => onChange({ swing: e.target.value as BuilderOpening["swing"] })}
          >
            <option value="in-left">In · Left hinge</option>
            <option value="in-right">In · Right hinge</option>
            <option value="out-left">Out · Left hinge</option>
            <option value="out-right">Out · Right hinge</option>
          </select>
        </div>
      )}
    </div>
  );
}

function DimensionInputCompact({
  unit,
  inches,
  onChange,
}: {
  unit: BuilderUnit;
  inches: number;
  onChange: (inches: number) => void;
}) {
  if (unit === "cm") {
    return (
      <div className="relative">
        <input
          type="number"
          min={0}
          className="input text-xs py-1 pr-7"
          value={Math.round(inchesToCm(inches))}
          onChange={(e) => onChange(cmToInches(Number(e.target.value) || 0))}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-brand-600">cm</span>
      </div>
    );
  }
  const { ft, in: inch } = inchesToFtIn(inches);
  return (
    <div className="flex gap-1">
      <div className="flex-1 relative">
        <input
          type="number"
          min={0}
          className="input text-xs py-1 pr-5"
          value={ft}
          onChange={(e) => onChange(ftInToInches(Number(e.target.value) || 0, inch))}
        />
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-brand-600">ft</span>
      </div>
      <div className="flex-1 relative">
        <input
          type="number"
          min={0}
          max={11}
          className="input text-xs py-1 pr-5"
          value={inch}
          onChange={(e) => onChange(ftInToInches(ft, Number(e.target.value) || 0))}
        />
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-brand-600">in</span>
      </div>
    </div>
  );
}

function inchesToDim(totalInches: number, unit: BuilderUnit): DimensionInput {
  if (unit === "cm") return { cm: Math.round(inchesToCm(totalInches)) };
  return inchesToFtIn(totalInches);
}
