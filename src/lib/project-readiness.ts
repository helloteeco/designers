import type { Project, Room } from "./types";

/**
 * Export readiness — one source of truth for "can this project ship?"
 *
 * Blockers are hard stops: the export buttons (Install Guide + Masterlist)
 * are disabled until they're fixed.
 * Warnings are soft: exports still work, but the deliverable will have
 * gaps — each warning names the fix in plain designer language.
 */

export type ReadinessSeverity = "blocker" | "warning";

export interface ReadinessItem {
  id: string;
  severity: ReadinessSeverity;
  /** Plain-language description of what's missing. */
  message: string;
  /** Short label for the fix-link button (e.g. "Add rooms"). */
  fixLabel: string;
  /** Guided-flow step index (0-based) where the fix lives. */
  fixStep: number;
}

const BEDROOM_TYPES = new Set(["primary-bedroom", "bedroom", "loft", "bonus-room"]);

function roomHasRender(room: Room): boolean {
  return Boolean(
    room.sceneSnapshot ||
    room.originalRenderUrl ||
    (room.aiRenderUrls && room.aiRenderUrls.length > 0)
  );
}

/**
 * Full structured readiness list — used by the guided flow's finish-line
 * checklist so every item can deep-link to the step that fixes it.
 */
export function getReadinessItems(project: Project): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  const rooms = project.rooms ?? [];

  // ── Blockers ──
  if (rooms.length === 0) {
    items.push({
      id: "no-rooms",
      severity: "blocker",
      message: "Add at least one room before exporting.",
      fixLabel: "Add rooms",
      fixStep: 1,
    });
  }

  // ── Warnings ──
  const plans = project.property?.floorPlans ?? [];
  if (!plans.some(p => p.type === "image" || p.type === "pdf")) {
    items.push({
      id: "no-floor-plan",
      severity: "warning",
      message: "No floor plan uploaded — the Install Guide won't have a floor-plan page.",
      fixLabel: "Upload a plan",
      fixStep: 0,
    });
  }

  if (!project.property?.heroImageUrl) {
    items.push({
      id: "no-hero-photo",
      severity: "warning",
      message: "No exterior or hero photo — the Install Guide cover will look plain.",
      fixLabel: "Add a photo",
      fixStep: 4,
    });
  }

  if (rooms.length > 0) {
    const withoutRenders = rooms.filter(r => !roomHasRender(r));
    if (withoutRenders.length > 0) {
      const names = withoutRenders.slice(0, 3).map(r => r.name).join(", ");
      const extra = withoutRenders.length > 3 ? ` and ${withoutRenders.length - 3} more` : "";
      items.push({
        id: "rooms-missing-renders",
        severity: "warning",
        message: `${withoutRenders.length === rooms.length ? "No rooms have" : `${names}${extra} ${withoutRenders.length === 1 ? "doesn't have" : "don't have"}`} a render or design board yet.`,
        fixLabel: "Generate renders",
        fixStep: 3,
      });
    }

    const bedroomsWithoutBeds = rooms.filter(
      r => BEDROOM_TYPES.has(r.type) && !r.selectedBedConfig
    );
    if (bedroomsWithoutBeds.length > 0) {
      const names = bedroomsWithoutBeds.slice(0, 3).map(r => r.name).join(", ");
      const extra = bedroomsWithoutBeds.length > 3 ? ` and ${bedroomsWithoutBeds.length - 3} more` : "";
      items.push({
        id: "bedrooms-missing-beds",
        severity: "warning",
        message: `${names}${extra} ${bedroomsWithoutBeds.length === 1 ? "doesn't have" : "don't have"} a bed setup picked yet.`,
        fixLabel: "Pick beds",
        fixStep: 1,
      });
    }

    const totalFurniture = rooms.reduce((s, r) => s + (r.furniture?.length ?? 0), 0);
    if (totalFurniture === 0) {
      items.push({
        id: "no-furniture",
        severity: "warning",
        message: "No furniture has been added yet — the Masterlist will be empty.",
        fixLabel: "Add furniture",
        fixStep: 3,
      });
    }
  }

  return items;
}

/**
 * Simple blockers/warnings split for export buttons.
 *   blockers → disable Install Guide + Masterlist downloads
 *   warnings → show with fix-links, but allow export
 */
export function getExportBlockers(project: Project): { blockers: string[]; warnings: string[] } {
  const items = getReadinessItems(project);
  return {
    blockers: items.filter(i => i.severity === "blocker").map(i => i.message),
    warnings: items.filter(i => i.severity === "warning").map(i => i.message),
  };
}
