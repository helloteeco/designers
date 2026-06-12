import type { Project } from "@/lib/types";
import type { StudioSettings } from "@/lib/studio-settings";
import TeecoLogo from "./TeecoLogo";
import { CHARCOAL, GuidePage, TAUPE } from "./chrome";

function ContactField({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-[13px]" style={{ color: CHARCOAL }}>
        {label}
      </div>
      <div className="mt-1.5 break-words text-[10px]" style={{ color: CHARCOAL }}>
        {value}
      </div>
    </div>
  );
}

/**
 * Contact — reference layout (p26): a full-width photo band across the
 * upper page, the inline teeco lockup centered beneath it, the Designer
 * name, then a Website / Email Address / Phone Number row.
 */
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
        {/* Photo band, inset from the very top like the reference */}
        <div className="relative mt-[0.45in] h-[2.95in] w-full shrink-0">
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
        </div>

        {/* Lockup + designer + contact fields */}
        <div className="flex min-h-0 flex-1 flex-col items-center px-[0.8in]">
          <TeecoLogo className="mt-[0.32in] h-[0.46in] w-auto" />

          <div className="mt-[0.35in] text-center">
            <div className="text-[13px]" style={{ color: CHARCOAL }}>
              Designer
            </div>
            <div className="mt-1.5 text-[10px]" style={{ color: CHARCOAL }}>
              {settings.studioName || "—"}
            </div>
          </div>

          <div className="mt-[0.42in] grid w-full max-w-[7.6in] grid-cols-3 gap-[0.4in]">
            <ContactField label="Website" value="teeco.co" />
            <ContactField label="Email Address" value={settings.studioEmail || "—"} />
            <ContactField label="Phone Number" value={settings.studioPhone || "—"} />
          </div>

          {settings.briefFooterNote && (
            <p
              className="mt-5 max-w-[6in] text-center text-[9px] italic leading-relaxed"
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
