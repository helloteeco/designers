import type { Project } from "@/lib/types";
import { getTotalSleeping } from "@/lib/sleep-optimizer";
import { buildOccupancyLines, getPrimaryFloorPlan } from "./page-list";
import { CHARCOAL, GUIDE_MARKER_COLORS, GuidePage, KeyLegend, PageTitle, TAUPE } from "./chrome";

/**
 * Floor Plan — reference layout (p2): centered "FLOOR PLAN" title (no
 * overline), the plan large on the left, and a right column with the
 * "Occupancy: N" bullet breakdown followed by the "KEY:" block. Plan
 * markers render as short colored line segments (the reference swatch
 * style), not dots — the editor UI elsewhere keeps dots.
 */
export default function FloorPlanPage({
  project,
  pageNumber,
  pageCount,
}: {
  project: Project;
  pageNumber: number;
  pageCount: number;
}) {
  const plan = getPrimaryFloorPlan(project.property);
  const markers = project.property.planMarkers ?? [];
  const occupancyLines = buildOccupancyLines(project.rooms);
  const totalGuests = getTotalSleeping(project.rooms);

  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <PageTitle title="Floor Plan" />

      <div className="mt-3 flex min-h-0 flex-1 gap-[0.35in]">
        {/* Plan with marker line segments */}
        <div className="flex min-h-0 flex-1 items-center justify-center">
          {plan ? (
            <div className="relative inline-block max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={plan.url}
                alt="Floor plan"
                className="block max-w-full"
                style={{ maxHeight: "5.9in" }}
              />
              {markers.map((marker) => (
                <span
                  key={marker.id}
                  title={marker.label}
                  className="absolute h-[3px] w-[16px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${marker.x}%`,
                    top: `${marker.y}%`,
                    backgroundColor: GUIDE_MARKER_COLORS[marker.type],
                  }}
                />
              ))}
            </div>
          ) : (
            <div
              className="max-w-md rounded-lg px-10 py-12 text-center"
              style={{ border: `1px dashed ${TAUPE}` }}
            >
              <div
                className="text-[10px] font-bold uppercase tracking-[0.3em]"
                style={{ color: TAUPE }}
              >
                Floor Plan Missing
              </div>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: CHARCOAL }}>
                Upload a floor plan in the project to populate this page.
              </p>
            </div>
          )}
        </div>

        {/* Sidebar: occupancy breakdown, then key */}
        <aside className="flex w-[2.35in] shrink-0 flex-col justify-center gap-7">
          <div>
            <div className="text-[10px] font-medium" style={{ color: CHARCOAL }}>
              {totalGuests > 0 ? `Occupancy: ${totalGuests}` : "Occupancy"}
            </div>
            {occupancyLines.length > 0 ? (
              <ul className="mt-1 space-y-[3px]">
                {occupancyLines.map((line, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 text-[9px] leading-snug"
                    style={{ color: CHARCOAL }}
                  >
                    <span
                      className="mt-[4px] h-[3px] w-[3px] shrink-0 rounded-full"
                      style={{ backgroundColor: CHARCOAL }}
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[9px] italic leading-snug" style={{ color: CHARCOAL }}>
                Choose a bed configuration for each bedroom to build the
                occupancy list.
              </p>
            )}
          </div>

          <KeyLegend />
        </aside>
      </div>
    </GuidePage>
  );
}
