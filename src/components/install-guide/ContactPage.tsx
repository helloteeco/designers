import type { Project } from "@/lib/types";
import type { StudioSettings } from "@/lib/studio-settings";
import TeecoLogo from "./TeecoLogo";
import { CHARCOAL, GuidePage, TAUPE } from "./chrome";

function ContactLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-[9px] font-semibold uppercase tracking-[0.3em]"
        style={{ color: TAUPE }}
      >
        {label}
      </div>
      <div className="mt-1.5 break-words text-[12px]" style={{ color: CHARCOAL }}>
        {value}
      </div>
    </div>
  );
}

export default function ContactPage({
  project,
  settings,
  pageNumber,
  pageCount,
}: {
  project: Project;
  settings: StudioSettings;
  pageNumber: number;
  pageCount: number;
}) {
  const hero = project.property.heroImageUrl;

  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount} bleed>
      <div className="flex h-full flex-col">
        {/* Hero band (or taupe band) with the centered logo medallion */}
        <div className="relative h-[3.3in] w-full shrink-0">
          {hero ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={hero}
              alt={project.property.address || "Property"}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0" style={{ backgroundColor: TAUPE }} />
          )}
          <div className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-1/2">
            <div className="flex h-[1.65in] w-[1.65in] items-center justify-center rounded-full bg-white shadow-md">
              <TeecoLogo className="h-[1.05in] w-auto" />
            </div>
          </div>
        </div>

        {/* Contact details */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-[0.8in] pt-[0.85in] text-center">
          <div className="grid w-full max-w-[8in] grid-cols-4 gap-[0.4in]">
            <ContactLine label="Designer" value={settings.studioName || "—"} />
            <ContactLine label="Website" value="teeco.co" />
            <ContactLine label="Email" value={settings.studioEmail || "—"} />
            <ContactLine label="Phone" value={settings.studioPhone || "—"} />
          </div>
          {settings.briefFooterNote && (
            <p
              className="mt-8 max-w-[6in] text-[10px] italic leading-relaxed"
              style={{ color: CHARCOAL }}
            >
              {settings.briefFooterNote}
            </p>
          )}
        </div>
      </div>
    </GuidePage>
  );
}
