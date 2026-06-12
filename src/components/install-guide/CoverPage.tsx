import type { Project } from "@/lib/types";
import TeecoLogo from "./TeecoLogo";
import { CHARCOAL, GuidePage, TAUPE } from "./chrome";

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
  const addressLine = [property.address, property.city, property.state]
    .filter(Boolean)
    .join(", ");

  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount} bleed footerOnImage>
      <div className="flex h-full flex-col">
        {/* Masthead */}
        <div className="flex flex-col items-center px-[0.6in] pb-[0.32in] pt-[0.42in] text-center">
          <TeecoLogo className="h-[0.85in] w-auto" />
          <h1
            className="mt-3 text-[34px] font-bold uppercase leading-tight tracking-[0.18em]"
            style={{ color: CHARCOAL }}
          >
            Design &amp; Install Guide
          </h1>
          {client.name && (
            <p className="mt-2 text-[13px] tracking-[0.06em]" style={{ color: CHARCOAL }}>
              Prepared for {client.name}
            </p>
          )}
          {addressLine && (
            <p
              className="mt-1 text-[11px] uppercase tracking-[0.26em]"
              style={{ color: TAUPE }}
            >
              {addressLine}
            </p>
          )}
        </div>

        {/* Hero — full-bleed lower portion */}
        <div className="relative min-h-0 flex-1">
          {property.heroImageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={property.heroImageUrl}
              alt={addressLine || "Property exterior"}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ backgroundColor: TAUPE }}
            >
              <div className="px-[0.8in] text-center text-white">
                <div className="text-2xl font-semibold uppercase tracking-[0.2em]">
                  {property.address || "Your Property"}
                </div>
                {(property.city || property.state) && (
                  <div className="mt-3 text-[12px] uppercase tracking-[0.32em] opacity-90">
                    {[property.city, property.state].filter(Boolean).join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </GuidePage>
  );
}
