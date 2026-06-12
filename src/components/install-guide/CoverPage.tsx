import type { Project } from "@/lib/types";
import TeecoLogo from "./TeecoLogo";
import { CHARCOAL, GuidePage, TAUPE } from "./chrome";

/**
 * Cover — reference layout (p1): LEFT white panel with the small inline
 * teeco lockup, a heavy two-line "DESIGN & / INSTALL GUIDE" headline, then
 * the client names ("Kelly + Zyaire" style) and address line; RIGHT ~45%
 * is the exterior photo, inset from the page edges by a white margin.
 */
export default function CoverPage({
  project,
  pageNumber,
  pageCount,
}: {
  project: Project;
  pageNumber: number;
  pageCount: number;
}) {
  const { property, client } = project;
  // The deliverable joins couple names with "+" (reference: "Kelly + Zyaire").
  const clientNames = (client.name ?? "").replace(/\s*&\s*/g, " + ").trim();

  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount} bleed>
      <div className="flex h-full w-full">
        {/* Left panel */}
        <div className="flex min-w-0 flex-1 flex-col py-[0.55in] pl-[0.55in] pr-[0.3in]">
          <div className="mt-[0.85in]">
            <TeecoLogo className="h-[0.42in] w-auto" />
          </div>

          <h1
            className="mt-[0.35in] whitespace-nowrap text-[48px] font-extrabold uppercase leading-[1.08] tracking-[0.01em]"
            style={{ color: CHARCOAL }}
          >
            Design &amp;
            <br />
            Install Guide
          </h1>

          <div className="mt-[1.05in]">
            {clientNames && (
              <p className="text-[14px] leading-snug" style={{ color: CHARCOAL }}>
                {clientNames}
              </p>
            )}
            {property.address && (
              <p className="mt-1 text-[14px] leading-snug" style={{ color: CHARCOAL }}>
                {property.address}
              </p>
            )}
          </div>
        </div>

        {/* Right photo panel — inset from the page edges */}
        <div className="w-[45%] shrink-0 py-[0.3in] pr-[0.3in]">
          <div className="relative h-full w-full overflow-hidden">
            {property.heroImageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={property.heroImageUrl}
                alt={property.address || "Property exterior"}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ backgroundColor: TAUPE }}
              >
                <div className="px-[0.5in] text-center text-white">
                  <div className="text-xl font-semibold uppercase tracking-[0.2em]">
                    {property.address || "Your Property"}
                  </div>
                  {(property.city || property.state) && (
                    <div className="mt-3 text-[11px] uppercase tracking-[0.32em] opacity-90">
                      {[property.city, property.state].filter(Boolean).join(", ")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </GuidePage>
  );
}
