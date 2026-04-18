"use client";

import { useState, useMemo } from "react";
import { saveProject, getProject as getProjectFromStore, logActivity } from "@/lib/store";
import { autoDesignRoom } from "@/lib/auto-design";
import SpacePlanner from "./SpacePlanner";
import RoomDesigner from "./RoomDesigner";
import { useToast } from "./Toast";
import type { Project, Room } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

type View = "by-room" | "whole-plan";

/**
 * Design Workspace — per-room AI design is the default path.
 *
 * "By Room" = pick room → drop photo → pick style → ⚡ → approve items
 *             (AI Scene Studio does the work, designer reviews)
 * "Whole Plan" = top-down floor plan for spatial validation after approvals
 */
export default function DesignWorkspace({ project, onUpdate }: Props) {
  const toast = useToast();
  const [view, setView] = useState<View>("by-room");

  function autoDesignAllRooms() {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const empty = fresh.rooms.filter(r => r.furniture.length === 0);
    if (empty.length === 0) {
      toast.info("Every room already has furniture. Use 'Auto-Design' inside a room to redo just that one.");
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

  return (
    <div>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Design</h2>
          <p className="text-sm text-brand-600">
            {view === "by-room"
              ? "Pick a room · drop a photo · pick a style · ⚡ Design · approve."
              : "Whole-house top-down: every room, every item, real positions."}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={autoDesignAllRooms}
            className="rounded-lg border border-amber/40 px-3 py-1.5 text-xs font-medium text-amber-dark hover:bg-amber/10"
            title="Fill every empty room with style-matched furniture in one click"
          >
            🪄 Auto-Design All Empty Rooms
          </button>

          <div className="flex gap-1 rounded-xl bg-white border border-brand-900/10 p-1">
            <button
              onClick={() => setView("by-room")}
              className={view === "by-room" ? "tab-active" : "tab"}
              title="Per-room creative work: style, scene, items, sleep"
            >
              🎨 By Room
            </button>
            <button
              onClick={() => setView("whole-plan")}
              className={view === "whole-plan" ? "tab-active" : "tab"}
              title="Whole-house floor plan with all furniture"
            >
              📐 Whole Plan
            </button>
          </div>
        </div>
      </div>

      <div className="animate-in">
        {view === "by-room" && <RoomDesigner project={project} onUpdate={onUpdate} />}
        {view === "whole-plan" && <SpacePlanner project={project} onUpdate={onUpdate} />}
      </div>
    </div>
  );
}

// Re-export the type for external consumers (none yet, but keeps the surface flat)
export type { Room };
