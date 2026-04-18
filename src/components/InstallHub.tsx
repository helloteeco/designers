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

type View = "checklist" | "summary" | "chat";

/**
 * Install Hub — Week 7 of Teeco process.
 * Installation, setup, staging. Delivery checklist, activity feed,
 * and team chat (if Supabase connected).
 */
export default function InstallHub({ project, projectId }: Props) {
  const supabaseReady = isConfigured();
  const [view, setView] = useState<View>("checklist");

  const views: { id: View; label: string; hint: string; visible: boolean }[] = [
    { id: "checklist", label: "Install Checklist", hint: "7-step delivery progress", visible: true },
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
