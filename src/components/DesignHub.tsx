"use client";

import SpacePlanner from "./SpacePlanner";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

/**
 * Design tab — top-down Space Planner only. Spoak-style room renders moved
 * to the dedicated Scene tab so designers can find them.
 */
export default function DesignHub({ project, onUpdate }: Props) {
  return <SpacePlanner project={project} onUpdate={onUpdate} />;
}
