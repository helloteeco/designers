import { PLAN_MARKER_COLORS, type Project } from "@/lib/types";
import { getTotalSleeping } from "@/lib/sleep-optimizer";
import { buildOccupancyLines, getPrimaryFloorPlan } from "./page-list";
import { CHARCOAL, GuidePage, KeyLegend, PageTitle, TAUPE } from "./chrome";

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
      <PageTitle overline="Property Overview" title="Floor Plan" />

      <div className="mt-4 flex min-h-0 flex-1 gap-[0.45in]">
        {/* Plan with marker dots */}
        <div className="flex min-h-0 flex-1 items-center justify-center">
          {plan ? (
            <div className="relative inline-block max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={plan.url}
                alt="Floor plan"
                className="block max-w-full"
                style={{ maxHeight: "5.4in" }}
              />
              {markers.map((marker) => (
                <span
                  key={marker.id}
                  title={marker.label}
                  className="absolute h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
                  style={{
                    left: `${marker.x}%`,
                    top: `${marker.y}%`,
                    backgroundColor: PLAN_MARKER_COLORS[marker.type],
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

        {/* Sidebar: occupancy + key */}
        <aside className="flex w-[2.6in] shrink-0 flex-col gap-6 pt-1">
          <div>
            <div
              className="text-[10px] font-bold uppercase tracking-[0.28em]"
              style={{ color: TAUPE }}
            >
              {totalGuests > 0 ? `Occupancy: ${totalGuests} Guests` : "Occupancy"}
            </div>
            {occupancyLines.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {occupancyLines.map((line, i) => (
                  <li
                    key={i}
                    className="text-[10px] leading-snug"
                    style={{ color: CHARCOAL }}
                  >
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[10px] italic leading-snug" style={{ color: CHARCOAL }}>
                Choose a bed configuration for each bedroom to build the
                occupancy list.
              </p>
            )}
          </div>

          <KeyLegend vertical />
        </aside>
      </div>
    </GuidePage>
  );
}
