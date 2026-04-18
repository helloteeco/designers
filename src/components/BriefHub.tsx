"use client";

import ProjectOverview from "./ProjectOverview";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

/**
 * Brief Hub — Week 1 of Teeco process.
 * Now just the project overview (property/client/floor plan). The previous
 * subtabs (3D Scans, Inspiration, AI Auto-Build) all collapsed: 3D Scans
 * needed login that clients don't have, AI Auto-Build duplicated the SVG
 * auto-detect, and Inspiration overlapped with Concept's image collection.
 */
export default function BriefHub({ project, onUpdate }: Props) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-brand-900">Project Brief</h2>
        <p className="text-sm text-brand-600">
          Week 1 · Property info, client, and a floor plan. Drop a Matterport SVG to auto-create rooms.
        </p>
      </div>
      <ProjectOverview project={project} onUpdate={onUpdate} />
    </div>
  );
}
