"use client";

import { useEffect, useRef, useState } from "react";
import { saveProject, getProject as getProjectFromStore, generateId } from "@/lib/store";
import {
  PLAN_MARKER_COLORS,
  type PlanMarker,
  type PlanMarkerType,
  type Project,
  type FloorPlan,
} from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

const MARKER_CHIPS: { type: PlanMarkerType; label: string }[] = [
  { type: "art", label: "Art" },
  { type: "mirror", label: "Mirror" },
  { type: "tv", label: "TV" },
  { type: "towel-bar", label: "Towel bar" },
  { type: "towel-hooks", label: "Towel hooks" },
  { type: "towel-ring", label: "Towel ring" },
];

const CHIP_LABELS: Record<PlanMarkerType, string> = Object.fromEntries(
  MARKER_CHIPS.map((c) => [c.type, c.label])
) as Record<PlanMarkerType, string>;

/** Primary plan = the one flagged isPrimary; else the most recent image plan. */
function getPrimaryPlan(project: Project): FloorPlan | null {
  const imagePlans = (project.property?.floorPlans ?? []).filter((p) => p.type === "image");
  if (imagePlans.length === 0) return null;
  const flagged = imagePlans.find((p) => p.isPrimary);
  if (flagged) return flagged;
  return [...imagePlans].sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""))[0];
}

/**
 * Place typed install markers (Art / Mirror / TV / towel hardware) on the
 * primary floor plan. Pick a chip, click the plan to drop a dot; click a dot
 * to select it, drag to move, ✕ or Delete key to remove. Positions are
 * stored as 0-100 % of the plan image (project.property.planMarkers) so they
 * survive any display size — the Install Guide renders the same dots.
 */
export function PlanMarkerEditor({ project, onUpdate }: Props) {
  const plan = getPrimaryPlan(project);
  const planRef = useRef<HTMLDivElement>(null);
  const [activeType, setActiveType] = useState<PlanMarkerType | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [markers, setMarkers] = useState<PlanMarker[]>(project.property.planMarkers ?? []);
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);

  // Re-sync when the parent refreshes the project (onUpdate round-trip)
  useEffect(() => {
    setMarkers(project.property.planMarkers ?? []);
  }, [project.property.planMarkers]);

  function persist(next: PlanMarker[]) {
    setMarkers(next);
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    fresh.property.planMarkers = next;
    saveProject(fresh);
    onUpdate();
  }

  function pctFromPointer(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const el = planRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    const round2 = (v: number) => Math.round(v * 100) / 100;
    return {
      x: round2(clamp(((e.clientX - rect.left) / rect.width) * 100)),
      y: round2(clamp(((e.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function handlePlanClick(e: React.MouseEvent) {
    if (!activeType) {
      setSelectedId(null);
      return;
    }
    const pos = pctFromPointer(e);
    if (!pos) return;
    const marker: PlanMarker = { id: generateId(), type: activeType, x: pos.x, y: pos.y };
    persist([...markersRef.current, marker]);
    setSelectedId(marker.id);
  }

  function deleteMarker(id: string) {
    persist(markersRef.current.filter((m) => m.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }

  // Delete key removes the selected marker (ignored while typing in a field)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selectedId) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      deleteMarker(selectedId);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ── Marker dragging (pointer events, % math) ──

  function handleMarkerPointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(id);
    dragRef.current = { id, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleMarkerPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const pos = pctFromPointer(e);
    if (!pos) return;
    drag.moved = true;
    setMarkers((prev) => prev.map((m) => (m.id === drag.id ? { ...m, x: pos.x, y: pos.y } : m)));
  }

  function handleMarkerPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) {
      persist(markersRef.current);
    }
  }

  // ── Empty state ──

  if (!plan) {
    return (
      <div className="rounded-xl border border-brand-900/10 bg-white p-6 text-center">
        <div className="text-3xl mb-2">📍</div>
        <p className="text-sm text-brand-600">
          Upload a floor plan first — markers show installers where art, mirrors and TVs go.
        </p>
      </div>
    );
  }

  const selected = markers.find((m) => m.id === selectedId) ?? null;

  // ── Render ──

  return (
    <div className="rounded-xl border border-brand-900/10 bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-brand-900/10">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div>
            <h3 className="text-sm font-semibold text-brand-900">📍 Install markers</h3>
            <p className="text-[11px] text-brand-600">
              Plan: <span className="font-medium">{plan.name}</span> · dots tell installers where art, mirrors and TVs go
            </p>
          </div>
          <div className="text-[11px] text-brand-600">
            {activeType
              ? <>Click the plan to place a <strong>{CHIP_LABELS[activeType]}</strong> marker</>
              : markers.length > 0
                ? <>Click a dot to select · drag to move · Delete to remove</>
                : <>Pick a marker type, then click the plan</>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MARKER_CHIPS.map((chip) => (
            <button
              key={chip.type}
              type="button"
              onClick={() => setActiveType((prev) => (prev === chip.type ? null : chip.type))}
              className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border transition ${
                activeType === chip.type
                  ? "border-amber bg-amber/10 text-amber-dark font-semibold"
                  : "border-brand-900/10 text-brand-600 hover:border-amber/30"
              }`}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: PLAN_MARKER_COLORS[chip.type] }}
              />
              {chip.label}
            </button>
          ))}
          {activeType && (
            <button
              type="button"
              onClick={() => setActiveType(null)}
              className="text-xs text-brand-600 hover:text-brand-900 px-2 py-1"
            >
              Done placing
            </button>
          )}
        </div>
      </div>

      {/* Plan canvas */}
      <div className="p-4 bg-brand-900/5">
        <div
          ref={planRef}
          onClick={handlePlanClick}
          className="relative inline-block select-none max-w-full"
          style={{ cursor: activeType ? "crosshair" : "default" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={plan.url}
            alt={plan.name}
            className="max-w-full max-h-[70vh] object-contain pointer-events-none rounded-lg"
            draggable={false}
          />

          {markers.map((m) => {
            const color = PLAN_MARKER_COLORS[m.type] ?? "#29B6E8";
            const isSelected = m.id === selectedId;
            return (
              <div
                key={m.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(m.id);
                }}
                onPointerDown={(e) => handleMarkerPointerDown(e, m.id)}
                onPointerMove={handleMarkerPointerMove}
                onPointerUp={handleMarkerPointerUp}
                title={`${CHIP_LABELS[m.type]}${m.label ? ` — ${m.label}` : ""} · drag to move`}
                className={`absolute rounded-full -translate-x-1/2 -translate-y-1/2 ${
                  isSelected ? "z-20 cursor-grabbing" : "z-10 cursor-grab"
                }`}
                style={{
                  left: `${m.x}%`,
                  top: `${m.y}%`,
                  width: 14,
                  height: 14,
                  backgroundColor: color,
                  touchAction: "none",
                  boxShadow: isSelected
                    ? `0 0 0 2px #fff, 0 0 0 4px ${color}66, 0 1px 4px rgba(0,0,0,0.4)`
                    : "0 0 0 2px #fff, 0 1px 3px rgba(0,0,0,0.35)",
                }}
              />
            );
          })}

          {/* ✕ delete button hovers above the selected dot */}
          {selected && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                deleteMarker(selected.id);
              }}
              title="Delete marker (or press Delete)"
              className="absolute z-30 w-5 h-5 flex items-center justify-center rounded-full bg-white border border-brand-900/20 text-brand-900 text-[11px] leading-none shadow hover:bg-red-50 hover:text-red-600 hover:border-red-300"
              style={{
                left: `calc(${selected.x}% + 12px)`,
                top: `calc(${selected.y}% - 18px)`,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Footer: legend + count */}
      <div className="px-4 py-2.5 border-t border-brand-900/10 flex items-center justify-between flex-wrap gap-2">
        <div className="text-[11px] text-brand-600">
          {markers.length === 0
            ? "No markers yet — these dots print on the Install Guide floor plan."
            : `${markers.length} marker${markers.length === 1 ? "" : "s"} on this plan`}
        </div>
        {selected && (
          <div className="text-[11px] text-brand-600">
            Selected: <span className="font-medium text-brand-900">{CHIP_LABELS[selected.type]}</span>
            {" · "}
            <button
              type="button"
              onClick={() => deleteMarker(selected.id)}
              className="text-red-600 hover:underline"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default PlanMarkerEditor;
