"use client";

import { useState, useMemo } from "react";
import { saveProject, getProject as getProjectFromStore, logActivity } from "@/lib/store";
import { autoDesignRoom } from "@/lib/auto-design";
import SpacePlanner from "./SpacePlanner";
import SceneDesigner from "./SceneDesigner";
import FurniturePicker from "./FurniturePicker";
import SleepOptimizer from "./SleepOptimizer";
import { useToast } from "./Toast";
import type { Project, Room } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

type View = "layout" | "scene" | "items" | "sleep";

const SLEEPABLE_TYPES = new Set([
  "primary-bedroom",
  "bedroom",
  "loft",
  "bonus-room",
]);

/**
 * Design Workspace — single tab covering everything room-related.
 *
 * Replaces 4 separate top-level tabs (Space Plan, Scene, Items, Sleep Plan)
 * with one canvas that picks a room, then offers Layout / Scene / Items /
 * Sleep sub-views. Designer stays on this tab for the bulk of their work.
 *
 * Includes the headline "🪄 Auto-Design Room" button — places style-aware
 * furniture in the selected room with rule-based positioning.
 */
export default function DesignWorkspace({ project, onUpdate }: Props) {
  const toast = useToast();
  const [selectedRoomId, setSelectedRoomId] = useState<string>(
    project.rooms[0]?.id ?? ""
  );
  const [view, setView] = useState<View>("layout");

  const room = useMemo(
    () => project.rooms.find(r => r.id === selectedRoomId) ?? project.rooms[0],
    [project.rooms, selectedRoomId]
  );

  // Show Sleep sub-view only for sleepable room types
  const showSleep = room && SLEEPABLE_TYPES.has(room.type);

  // Per-room scoped subset for Items view so designer doesn't have to keep
  // re-picking the room
  const scopedProject = useMemo<Project>(() => {
    if (!room) return project;
    return project;
  }, [room, project]);

  function autoDesignSelectedRoom() {
    if (!room) return;
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const target = fresh.rooms.find(r => r.id === room.id);
    if (!target) return;
    if (target.furniture.length > 0) {
      if (!confirm(`${target.name} already has ${target.furniture.length} items. Replace them with auto-designed picks?`)) return;
      target.furniture = [];
    }
    const placed = autoDesignRoom(fresh, target);
    target.furniture.push(...placed);
    saveProject(fresh);
    logActivity(project.id, "auto_design", `Auto-designed ${target.name} with ${placed.length} items`);
    toast.success(`Designed ${target.name}: ${placed.length} items placed`);
    onUpdate();
  }

  function autoDesignAllRooms() {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const empty = fresh.rooms.filter(r => r.furniture.length === 0);
    if (empty.length === 0) {
      toast.info("Every room already has furniture. Use 'Auto-Design Room' to redo a single room.");
      return;
    }
    if (!confirm(`Auto-design ${empty.length} empty room${empty.length === 1 ? "" : "s"}? Rooms with existing furniture stay as-is.`)) return;
    let total = 0;
    for (const r of empty) {
      const placed = autoDesignRoom(fresh, r);
      r.furniture.push(...placed);
      total += placed.length;
    }
    saveProject(fresh);
    logActivity(project.id, "auto_design_all", `Auto-designed ${empty.length} rooms with ${total} items`);
    toast.success(`Designed ${empty.length} room${empty.length === 1 ? "" : "s"}: ${total} items placed`);
    onUpdate();
  }

  if (project.rooms.length === 0) {
    return (
      <div className="card text-center py-12">
        <div className="text-4xl mb-3">📐</div>
        <h3 className="font-semibold text-brand-900 mb-2">No rooms yet</h3>
        <p className="text-sm text-brand-600 max-w-md mx-auto">
          Drop a Matterport SVG on the <strong>Brief</strong> tab to auto-create rooms,
          or add rooms manually from the <strong>Rooms</strong> tab.
        </p>
      </div>
    );
  }

  if (!room) return null;

  return (
    <div>
      {/* Header — title + auto-design buttons */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Design</h2>
          <p className="text-sm text-brand-600">
            Pick a room, then lay it out, render it, or browse items.
            Use <strong>🪄 Auto-Design</strong> to fill a room in one click.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={autoDesignSelectedRoom}
            className="rounded-lg bg-amber px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-dark"
            title={`Pick style-aware furniture for ${room.name} and place it with rules (bed against wall, nightstands flanking, rug under bed, etc.)`}
          >
            🪄 Auto-Design {room.name}
          </button>
          <button
            onClick={autoDesignAllRooms}
            className="rounded-lg border border-amber/40 px-3 py-1.5 text-xs font-medium text-amber-dark hover:bg-amber/10"
            title="Auto-design every empty room in one click"
          >
            🪄 Auto-Design All Empty
          </button>
        </div>
      </div>

      {/* Room picker — visual strip with all rooms */}
      <div className="mb-4 flex flex-wrap gap-2">
        {project.rooms.map(r => {
          const isSelected = r.id === room.id;
          const hasFurniture = r.furniture.length > 0;
          return (
            <button
              key={r.id}
              onClick={() => setSelectedRoomId(r.id)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${
                isSelected
                  ? "border-amber bg-amber/10 text-brand-900 font-semibold"
                  : "border-brand-900/10 bg-white text-brand-700 hover:border-amber/40"
              }`}
            >
              <span>{r.name}</span>
              <span className="text-[10px] opacity-60">
                {r.widthFt}&apos;×{r.lengthFt}&apos;
              </span>
              {hasFurniture && (
                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                  {r.furniture.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sub-view tabs — Layout / Scene / Items / Sleep */}
      <div className="mb-4 flex gap-1 rounded-xl bg-white border border-brand-900/10 p-1 inline-flex">
        <button
          onClick={() => setView("layout")}
          className={view === "layout" ? "tab-active" : "tab"}
          title="Top-down floor plan with measurements + clearance"
        >
          📐 Layout
        </button>
        <button
          onClick={() => setView("scene")}
          className={view === "scene" ? "tab-active" : "tab"}
          title="Spoak-style visual render with real product images"
        >
          🎨 Scene
        </button>
        <button
          onClick={() => setView("items")}
          className={view === "items" ? "tab-active" : "tab"}
          title="Browse the catalog and add items"
        >
          🛋 Items
        </button>
        {showSleep && (
          <button
            onClick={() => setView("sleep")}
            className={view === "sleep" ? "tab-active" : "tab"}
            title="Pick a bed configuration for this bedroom"
          >
            🛏 Sleep
          </button>
        )}
      </div>

      {/* Active sub-view */}
      <div className="animate-in">
        {view === "layout" && <SpacePlanner project={scopedProject} onUpdate={onUpdate} />}
        {view === "scene" && <SceneDesigner project={scopedProject} onUpdate={onUpdate} />}
        {view === "items" && <FurniturePicker project={scopedProject} onUpdate={onUpdate} />}
        {view === "sleep" && showSleep && <SleepOptimizer project={scopedProject} onUpdate={onUpdate} />}
      </div>
    </div>
  );
}

// Re-export the type for external consumers (none yet, but keeps the surface flat)
export type { Room };
