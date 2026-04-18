"use client";

import { useState } from "react";
import ProjectChecklist from "./ProjectChecklist";
import ProjectSummary from "./ProjectSummary";
import ActivityFeed from "./ActivityFeed";
import TeamChat from "./TeamChat";
import { isConfigured } from "@/lib/supabase";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  projectId: string;
}

type View = "guide" | "checklist" | "summary" | "chat";

/**
 * Install Hub — Week 7 of Teeco process.
 * Installation, setup, staging. Delivery checklist, activity feed,
 * and team chat (if Supabase connected).
 */
export default function InstallHub({ project, projectId }: Props) {
  const supabaseReady = isConfigured();
  const [view, setView] = useState<View>("guide");

  const views: { id: View; label: string; hint: string; visible: boolean }[] = [
    { id: "guide", label: "📖 Install Guide", hint: "Generate branded PDF for client", visible: true },
    { id: "checklist", label: "Progress Checklist", hint: "7-step delivery tracker", visible: true },
    { id: "summary", label: "Final Summary", hint: "Full project recap", visible: true },
    { id: "chat", label: "Team Chat + Activity", hint: "Requires Cloud Sync", visible: supabaseReady },
  ];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand-900">Install &amp; Staging</h2>
          <p className="text-sm text-brand-600">
            Week 7 · Deliveries arrive, furniture assembled, rooms staged. Final sign-off.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-white border border-brand-900/10 p-1">
          {views.filter(v => v.visible).map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={view === v.id ? "tab-active" : "tab"}
              title={v.hint}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === "guide" && <InstallGuidePanel project={project} />}
      {view === "checklist" && <ProjectChecklist project={project} />}
      {view === "summary" && <ProjectSummary project={project} />}
      {view === "chat" && supabaseReady && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <TeamChat projectId={projectId} />
          </div>
          <div>
            <ActivityFeed projectId={projectId} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Install Guide panel — the primary deliverable for every Teeco project.
 * Both Design Only + Full Service packages get this.
 */
function InstallGuidePanel({ project }: { project: Project }) {
  const roomsWithScenes = project.rooms.filter(r => r.sceneItems && r.sceneItems.length > 0).length;
  const hasFloorPlan = (project.property.floorPlans ?? []).some(p => p.type === "image");
  const hasHero = !!project.property.heroImageUrl;
  const totalRooms = project.rooms.length;

  return (
    <div>
      <div className="card mb-4">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h3 className="font-semibold text-brand-900 mb-1">Install Guide — Primary Deliverable</h3>
            <p className="text-sm text-brand-600">
              Generate a branded PDF with cover, how-to pages, checklist, tips, floor plan, and per-room design boards.
              Opens in a new tab — use your browser&apos;s Print → Save as PDF.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => window.open(`/projects/install-guide?id=${project.id}`, "_blank")}
              className="btn-primary"
            >
              📖 Open Install Guide
            </button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-brand-900/5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <ReadinessItem done={hasHero} label="Hero image" hint="Exterior shot for cover" />
          <ReadinessItem done={hasFloorPlan} label="Floor plan" hint="Upload in Overview" />
          <ReadinessItem done={roomsWithScenes > 0} label={`${roomsWithScenes}/${totalRooms} rooms rendered`} hint="Build in Scene Designer" />
          <ReadinessItem done={(project.rooms.some(r => r.installTips)) || roomsWithScenes > 0} label="Install tips" hint="Per-room guidance" />
        </div>
      </div>

      <div className="card bg-amber/5 border-amber/20">
        <h3 className="text-sm font-semibold text-brand-900 mb-2">Install Guide contents</h3>
        <ul className="text-xs text-brand-700 space-y-1">
          <li>✓ <strong>Cover page</strong> — property address + hero image</li>
          <li>✓ <strong>How-tos</strong> — curtains, art, rugs, pillows, blankets (standard pages)</li>
          <li>✓ <strong>Checklist</strong> — what client should do before install</li>
          <li>✓ <strong>Tips</strong> — process tips (one room at a time, clean as you go, hide cords)</li>
          <li>✓ <strong>Floor plan</strong> — full plan with occupancy + bed list + key (Art=blue, Mirror=yellow, TV=red)</li>
          <li>✓ <strong>Per-room pages</strong> — scene render + per-room tips + mini floor plan inset</li>
          <li>✓ <strong>Back cover</strong> — your studio contact info from Settings</li>
        </ul>
      </div>
    </div>
  );
}

function ReadinessItem({ done, label, hint }: { done: boolean; label: string; hint: string }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${done ? "bg-emerald-50 border border-emerald-200" : "bg-brand-900/5 border border-brand-900/10"}`}>
      <div className={`font-medium ${done ? "text-emerald-900" : "text-brand-700"}`}>
        {done ? "✓" : "○"} {label}
      </div>
      <div className="text-[10px] text-brand-600/70">{hint}</div>
    </div>
  );
}
