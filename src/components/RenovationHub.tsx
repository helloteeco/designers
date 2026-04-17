"use client";

import { useState } from "react";
import RenovationScopeBuilder from "./RenovationScopeBuilder";
import TeamAssignments from "./TeamAssignments";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

/**
 * Renovation workspace — combines Scope of Work and Team/Tasks under one tab.
 * Only shown in the main tab bar when project type is renovation / full-redesign /
 * new-construction.
 */
export default function RenovationHub({ project, onUpdate }: Props) {
  const [view, setView] = useState<"scope" | "team">("scope");

  const scopeCount = (project.scope ?? []).length;
  const teamCount = (project.team ?? []).length;
  const taskCount = (project.tasks ?? []).length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex gap-1 rounded-xl bg-white border border-brand-900/10 p-1">
          <button
            onClick={() => setView("scope")}
            className={view === "scope" ? "tab-active" : "tab"}
          >
            Scope of Work
            {scopeCount > 0 && (
              <span className="ml-1.5 text-[10px] opacity-70">{scopeCount}</span>
            )}
          </button>
          <button
            onClick={() => setView("team")}
            className={view === "team" ? "tab-active" : "tab"}
          >
            Team &amp; Tasks
            <span className="ml-1.5 text-[10px] opacity-70">
              {teamCount}/{taskCount}
            </span>
          </button>
        </div>
      </div>

      {view === "scope" ? (
        <RenovationScopeBuilder project={project} onUpdate={onUpdate} />
      ) : (
        <TeamAssignments project={project} onUpdate={onUpdate} />
      )}
    </div>
  );
}
