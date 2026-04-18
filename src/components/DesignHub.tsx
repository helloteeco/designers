"use client";

import { useState } from "react";
import SpacePlanner from "./SpacePlanner";
import SceneDesigner from "./SceneDesigner";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

/**
 * Design hub — toggle between top-down Space Plan (dimensions, clearance)
 * and Scene Designer (Spoak-style visual compositing).
 */
export default function DesignHub({ project, onUpdate }: Props) {
  const [view, setView] = useState<"space" | "scene">("space");

  const sceneItemCount = project.rooms.reduce(
    (s, r) => s + (r.sceneItems?.length ?? 0),
    0
  );
  const spaceItemCount = project.rooms.reduce(
    (s, r) => s + (r.furniture?.length ?? 0),
    0
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 rounded-xl bg-white border border-brand-900/10 p-1">
          <button
            onClick={() => setView("space")}
            className={view === "space" ? "tab-active" : "tab"}
            title="Top-down floor plan with dimensions and clearance checks"
          >
            📐 Space Plan
            {spaceItemCount > 0 && (
              <span className="ml-1.5 text-[10px] opacity-70">{spaceItemCount}</span>
            )}
          </button>
          <button
            onClick={() => setView("scene")}
            className={view === "scene" ? "tab-active" : "tab"}
            title="Spoak-style visual composition with product images"
          >
            🎨 Scene
            {sceneItemCount > 0 && (
              <span className="ml-1.5 text-[10px] opacity-70">{sceneItemCount}</span>
            )}
          </button>
        </div>
        <div className="text-xs text-brand-600">
          {view === "space" ? "Top-down with real dimensions · drag to place" : "Visual layout · drag, resize, rotate"}
        </div>
      </div>

      {view === "space" ? (
        <SpacePlanner project={project} onUpdate={onUpdate} />
      ) : (
        <SceneDesigner project={project} onUpdate={onUpdate} />
      )}
    </div>
  );
}
