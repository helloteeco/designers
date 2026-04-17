"use client";

import { useState } from "react";
import FurniturePicker from "./FurniturePicker";
import FinishesPicker from "./FinishesPicker";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

/**
 * Unified item picker — combines Furniture catalog and Finishes (tile, paint,
 * faucets, etc.) under one tab with a simple toggle. Separate components under
 * the hood so each keeps its own state, search, and filters.
 */
export default function ItemsHub({ project, onUpdate }: Props) {
  const [view, setView] = useState<"furniture" | "finishes">("furniture");

  const furnitureCount = project.rooms.reduce(
    (s, r) => s + (r.furniture?.length ?? 0),
    0
  );
  const finishesCount = (project.finishes ?? []).length;

  // If project has renovation scope, default to Finishes since that's likely
  // what they came here for
  const isReno = project.projectType === "renovation" || project.projectType === "full-redesign";

  return (
    <div>
      {/* View Toggle */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex gap-1 rounded-xl bg-white border border-brand-900/10 p-1">
          <button
            onClick={() => setView("furniture")}
            className={view === "furniture" ? "tab-active" : "tab"}
          >
            Furniture
            {furnitureCount > 0 && (
              <span className="ml-1.5 text-[10px] opacity-70">{furnitureCount}</span>
            )}
          </button>
          <button
            onClick={() => setView("finishes")}
            className={view === "finishes" ? "tab-active" : "tab"}
          >
            Finishes &amp; Materials
            {finishesCount > 0 && (
              <span className="ml-1.5 text-[10px] opacity-70">{finishesCount}</span>
            )}
          </button>
        </div>

        {isReno && view === "furniture" && finishesCount === 0 && (
          <div className="text-xs text-brand-600">
            Renovation project? <button onClick={() => setView("finishes")} className="text-amber-dark underline font-medium">Switch to Finishes</button>
          </div>
        )}
      </div>

      {/* Active View */}
      {view === "furniture" ? (
        <FurniturePicker project={project} onUpdate={onUpdate} />
      ) : (
        <FinishesPicker project={project} onUpdate={onUpdate} />
      )}
    </div>
  );
}
