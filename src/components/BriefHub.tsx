"use client";

import { useState } from "react";
import ProjectOverview from "./ProjectOverview";
import InspirationBoard from "./InspirationBoard";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

type View = "overview" | "inspiration";

/**
 * Brief Hub — Week 1 of Teeco process.
 * Two surfaces only: project setup (property/client + floor plan upload),
 * and an inspiration board for designer references. The 3D Scans embed and
 * the AI Auto-Build pipeline were removed — Matterport links don't work
 * for clients without account login, and the SVG-driven auto-detect in
 * Floor Plans replaced what AI Auto-Build was trying to do.
 */
export default function BriefHub({ project, onUpdate }: Props) {
  const [view, setView] = useState<View>("overview");

  const inspirationCount = (() => {
    try {
      const stored = typeof window !== "undefined"
        ? localStorage.getItem(`inspiration_${project.id}`)
        : null;
      return stored ? JSON.parse(stored).length : 0;
    } catch { return 0; }
  })();

  const views: { id: View; label: string; hint: string; count?: number }[] = [
    { id: "overview", label: "Project Setup", hint: "Property, client, floor plan" },
    { id: "inspiration", label: "Inspiration", hint: "Pinterest, Houzz, client refs", count: inspirationCount },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand-900">Project Brief</h2>
          <p className="text-sm text-brand-600">
            Week 1 · Property info, client, and a floor plan. Drop a Matterport SVG to auto-create rooms.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-white border border-brand-900/10 p-1 overflow-x-auto">
          {views.map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`shrink-0 ${view === v.id ? "tab-active" : "tab"}`}
              title={v.hint}
            >
              {v.label}
              {v.count !== undefined && v.count > 0 && (
                <span className="ml-1.5 text-[10px] opacity-70">{v.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {view === "overview" && <ProjectOverview project={project} onUpdate={onUpdate} />}
      {view === "inspiration" && <InspirationBoard project={project} onUpdate={onUpdate} />}
    </div>
  );
}
