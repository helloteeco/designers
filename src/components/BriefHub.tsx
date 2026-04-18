"use client";

import { useState } from "react";
import ProjectOverview from "./ProjectOverview";
import ScanViewer from "./ScanViewer";
import InspirationBoard from "./InspirationBoard";
import WorkflowEngine from "./WorkflowEngine";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

type View = "overview" | "scans" | "inspiration" | "workflow";

/**
 * Brief Hub — Week 1 of Teeco process.
 * Consolidates kickoff needs: property/client, 3D scans, inspiration refs,
 * and the AI auto-build button to draft the whole project.
 */
export default function BriefHub({ project, onUpdate }: Props) {
  const [view, setView] = useState<View>("overview");

  const scansCount = [
    project.property.matterportLink,
    project.property.polycamLink,
    project.property.spoakLink,
  ].filter(Boolean).length + (project.property.floorPlans?.length ?? 0);

  const inspirationCount = (() => {
    try {
      const stored = typeof window !== "undefined"
        ? localStorage.getItem(`inspiration_${project.id}`)
        : null;
      return stored ? JSON.parse(stored).length : 0;
    } catch { return 0; }
  })();

  const views: { id: View; label: string; hint: string; count?: number }[] = [
    { id: "overview", label: "Property & Client", hint: "Core info + delivery checklist" },
    { id: "scans", label: "3D Scans", hint: "Matterport, Polycam, Spoak embeds", count: scansCount },
    { id: "inspiration", label: "Inspiration", hint: "Pinterest, Houzz, client refs", count: inspirationCount },
    { id: "workflow", label: "AI Auto-Build", hint: "12-step pipeline to draft the whole project" },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand-900">Project Brief</h2>
          <p className="text-sm text-brand-600">
            Week 1 · Kickoff, measurements, client alignment. Run AI Auto-Build to draft the whole project in minutes.
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
      {view === "scans" && <ScanViewer property={project.property} />}
      {view === "inspiration" && <InspirationBoard project={project} onUpdate={onUpdate} />}
      {view === "workflow" && <WorkflowEngine project={project} onUpdate={onUpdate} />}
    </div>
  );
}
