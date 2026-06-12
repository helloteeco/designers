import type { DesignStyle, Project } from "@/lib/types";
import { STYLE_PRESETS } from "@/lib/style-presets";

/**
 * Guided-flow persistence + step-state machine helpers.
 *
 * State machine:
 *   - Steps: import(0) → rooms(1) → style(2) → furniture(3) → export(4)
 *   - A step is COMPLETE when the designer pressed its primary action
 *     (recorded in `guidedDone_<projectId>`), with two data-derived
 *     fallbacks so projects created elsewhere don't get stuck:
 *       · import is also complete if the project already has a scan link,
 *         a floor plan, or rooms
 *       · rooms completion additionally REQUIRES rooms.length > 0
 *         (deleting every room re-opens the step)
 *   - A step is REACHABLE if every step before it is complete; completed
 *     steps stay clickable so the designer can revisit.
 *   - On load we resume the saved step (`guidedStep_<projectId>`) when it's
 *     still reachable, otherwise auto-skip to the first incomplete step.
 */

export type GuidedStepId = "import" | "rooms" | "style" | "furniture" | "export";

export interface GuidedStepDef {
  id: GuidedStepId;
  label: string;
}

export const GUIDED_STEPS: GuidedStepDef[] = [
  { id: "import", label: "Import scan" },
  { id: "rooms", label: "Confirm rooms" },
  { id: "style", label: "Pick a style" },
  { id: "furniture", label: "Furniture & renders" },
  { id: "export", label: "Get deliverables" },
];

const stepKey = (projectId: string) => `guidedStep_${projectId}`;
const doneKey = (projectId: string) => `guidedDone_${projectId}`;
const presetKey = (projectId: string) => `guidedStylePreset_${projectId}`;

// ── Done flags ──

export function getDoneSteps(projectId: string): Set<GuidedStepId> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(doneKey(projectId));
    const arr = raw ? (JSON.parse(raw) as GuidedStepId[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function markStepDone(projectId: string, step: GuidedStepId): void {
  const done = getDoneSteps(projectId);
  done.add(step);
  localStorage.setItem(doneKey(projectId), JSON.stringify(Array.from(done)));
}

// ── Current step ──

export function getSavedStep(projectId: string): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(stepKey(projectId));
  if (raw === null) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 && n < GUIDED_STEPS.length ? n : null;
}

export function saveStep(projectId: string, index: number): void {
  localStorage.setItem(stepKey(projectId), String(index));
}

// ── Completion / reachability ──

export function isStepComplete(project: Project, stepId: GuidedStepId, done: Set<GuidedStepId>): boolean {
  switch (stepId) {
    case "import": {
      if (done.has("import")) return true;
      const p = project.property;
      return Boolean(
        p?.matterportLink ||
        p?.polycamLink ||
        (p?.floorPlans && p.floorPlans.length > 0) ||
        project.rooms.length > 0
      );
    }
    case "rooms":
      return done.has("rooms") && project.rooms.length > 0;
    case "style":
      return done.has("style");
    case "furniture":
      return done.has("furniture");
    case "export":
      // Finish line — "complete" once the project ships.
      return project.status === "delivered";
  }
}

/** Index of the first incomplete step (the export step if everything's done). */
export function firstIncompleteStep(project: Project, done: Set<GuidedStepId>): number {
  for (let i = 0; i < GUIDED_STEPS.length - 1; i++) {
    if (!isStepComplete(project, GUIDED_STEPS[i].id, done)) return i;
  }
  return GUIDED_STEPS.length - 1;
}

/** Where to land on load: resume saved step if reachable, else skip forward. */
export function initialStep(project: Project): number {
  const done = getDoneSteps(project.id);
  const reachableLimit = firstIncompleteStep(project, done);
  const saved = getSavedStep(project.id);
  if (saved !== null && saved <= reachableLimit) return saved;
  return reachableLimit;
}

// ── Style preset memory ──

/** Map the project's DesignStyle to a sensible STYLE_PRESETS id. */
export function presetIdForDesignStyle(style: DesignStyle): string {
  const map: Record<string, string> = {
    scandinavian: "scandinavian",
    "mid-century": "mid-century-modern",
    coastal: "coastal",
    bohemian: "boho",
    traditional: "traditional",
    contemporary: "organic-modern",
    modern: "japandi",
    rustic: "mediterranean",
  };
  return map[style] ?? "japandi";
}

/** The preset the designer picked in the guided Style step (exact memory —
 *  multiple presets can share one DesignStyle, so we keep the real choice). */
export function getGuidedPresetId(project: Project): string {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(presetKey(project.id));
    if (saved && STYLE_PRESETS.some(p => p.id === saved)) return saved;
  }
  return presetIdForDesignStyle(project.style);
}

export function setGuidedPresetId(projectId: string, presetId: string): void {
  localStorage.setItem(presetKey(projectId), presetId);
}
