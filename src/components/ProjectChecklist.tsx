"use client";

import type { Project } from "@/lib/types";
import { getTotalSleeping } from "@/lib/sleep-optimizer";

interface Props {
  project: Project;
  onJumpTo?: (tab: string) => void;
}

interface CheckItem {
  label: string;
  done: boolean;
  detail: string;
  jumpTo?: string;
  cta?: string;
}

export default function ProjectChecklist({ project, onJumpTo }: Props) {
  const checks = getChecks(project);
  const completed = checks.filter((c) => c.done).length;
  const pct = checks.length > 0 ? Math.round((completed / checks.length) * 100) : 0;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-brand-900">Delivery Checklist</h3>
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 rounded-full bg-brand-900/10">
            <div
              className={`h-2 rounded-full transition-all ${
                pct === 100 ? "bg-emerald-500" : "bg-amber"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-brand-600 font-medium">
            {completed}/{checks.length} · {pct}%
          </span>
        </div>
      </div>

      <div className="space-y-1">
        {checks.map((check, i) => {
          const clickable = !check.done && check.jumpTo && onJumpTo;
          const content = (
            <div
              className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition ${
                clickable ? "cursor-pointer hover:bg-amber/5" : ""
              }`}
            >
              <div
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  check.done
                    ? "bg-emerald-100 text-emerald-600"
                    : "bg-brand-900/5 text-brand-600/40"
                }`}
              >
                {check.done ? "✓" : "○"}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm ${
                    check.done ? "text-brand-900" : "text-brand-900 font-medium"
                  }`}
                >
                  {check.label}
                </div>
                <div className="text-xs text-brand-600/70">{check.detail}</div>
              </div>
              {clickable && (
                <span className="shrink-0 text-xs font-semibold text-amber-dark">
                  {check.cta ?? "Fix →"}
                </span>
              )}
            </div>
          );

          return clickable ? (
            <button
              key={i}
              type="button"
              onClick={() => onJumpTo!(check.jumpTo!)}
              className="block w-full text-left"
            >
              {content}
            </button>
          ) : (
            <div key={i}>{content}</div>
          );
        })}
      </div>

      {pct === 100 && (
        <div className="mt-4 pt-3 border-t border-emerald-200 bg-emerald-50 -mx-6 -mb-6 px-6 pb-6 rounded-b-xl">
          <p className="text-sm text-emerald-800 font-medium flex items-center justify-between gap-2">
            <span>Ready to deliver! Export your design package.</span>
            {onJumpTo && (
              <button
                type="button"
                onClick={() => onJumpTo("export")}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline"
              >
                Go to Export →
              </button>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function getChecks(project: Project): CheckItem[] {
  const sleeping = getTotalSleeping(project.rooms);
  const totalFurniture = project.rooms.reduce(
    (s, r) => s + r.furniture.length,
    0
  );
  const roomsWithBeds = project.rooms.filter(
    (r) => r.selectedBedConfig && r.selectedBedConfig.totalSleeps > 0
  ).length;
  const roomsWithFurniture = project.rooms.filter(
    (r) => r.furniture.length > 0
  ).length;

  return [
    {
      label: "Property details added",
      done: !!(project.property.address && project.property.city),
      detail: project.property.address
        ? `${project.property.address}, ${project.property.city}`
        : "Add address and city",
      jumpTo: "overview",
      cta: "Add →",
    },
    {
      label: "Client information set",
      done: !!project.client.name,
      detail: project.client.name || "Add client name",
      jumpTo: "overview",
      cta: "Add →",
    },
    {
      label: "Rooms defined",
      done: project.rooms.length >= 2,
      detail: `${project.rooms.length} room${project.rooms.length !== 1 ? "s" : ""} added`,
      jumpTo: "rooms",
      cta: "Plan →",
    },
    {
      label: "Sleep plan configured",
      done: roomsWithBeds >= 1 && sleeping >= project.targetGuests,
      detail:
        sleeping >= project.targetGuests
          ? `${sleeping} guests (target: ${project.targetGuests})`
          : `${sleeping}/${project.targetGuests} guests — need ${project.targetGuests - sleeping} more`,
      jumpTo: "sleep",
      cta: "Configure →",
    },
    {
      label: "Furniture selected",
      done: totalFurniture >= 5 && roomsWithFurniture >= 2,
      detail: `${totalFurniture} items across ${roomsWithFurniture} rooms`,
      jumpTo: "catalog",
      cta: "Shop →",
    },
    {
      label: "Mood board created",
      done: project.moodBoards.length >= 1,
      detail:
        project.moodBoards.length > 0
          ? `${project.moodBoards.length} mood board${project.moodBoards.length !== 1 ? "s" : ""}`
          : "Create at least one mood board",
      jumpTo: "mood",
      cta: "Create →",
    },
    {
      label: "3D scan linked",
      done: !!(
        project.property.matterportLink ||
        project.property.polycamLink ||
        project.property.spoakLink
      ),
      detail:
        project.property.matterportLink || project.property.polycamLink
          ? "Scan linked"
          : "Add Matterport, Polycam, or Spoak link",
      jumpTo: "scans",
      cta: "Link →",
    },
  ];
}
