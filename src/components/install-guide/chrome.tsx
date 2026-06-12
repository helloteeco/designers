/**
 * Shared chrome for Install Guide pages: the fixed-size page shell with the
 * "Page X of N" footer, the title treatment (taupe overline + charcoal
 * title), the marker-color key legend, the cropped floor-plan thumbnail,
 * and the graceful board placeholder card.
 */

import type { ReactNode } from "react";
import { PLAN_MARKER_COLORS, type PlanMarkerType, type Property, type Room } from "@/lib/types";
import { getPlanForRoom } from "./page-list";

// Brand palette
export const CHARCOAL = "#2B2B2B";
export const TAUPE = "#A8987F";
export const TAUPE_FILL = "#E9E2D6";

// ── Page shell ──

export function GuidePage({
  pageNumber,
  pageCount,
  bleed = false,
  footerOnImage = false,
  children,
}: {
  pageNumber: number;
  pageCount: number;
  /** Full-bleed pages (cover, contact) manage their own padding */
  bleed?: boolean;
  /** Adds a soft white chip behind the footer when it sits on a photo */
  footerOnImage?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="guide-page" style={{ color: CHARCOAL }}>
      <div
        className={
          bleed ? "h-full w-full" : "flex h-full w-full flex-col px-[0.55in] pb-[0.5in] pt-[0.42in]"
        }
      >
        {children}
      </div>
      <div
        className={`absolute bottom-[0.2in] right-[0.3in] text-[9px] uppercase tracking-[0.18em] ${
          footerOnImage ? "rounded-sm bg-white/85 px-2 py-0.5" : ""
        }`}
        style={{ color: CHARCOAL }}
      >
        Page {pageNumber} of {pageCount}
      </div>
    </section>
  );
}

// ── Title treatment ──

export function PageTitle({
  overline,
  title,
  center = false,
  size = "lg",
}: {
  overline?: string;
  title: string;
  center?: boolean;
  size?: "lg" | "md";
}) {
  return (
    <header className={center ? "text-center" : ""}>
      {overline && (
        <div
          className="text-[9px] font-semibold uppercase tracking-[0.32em]"
          style={{ color: TAUPE }}
        >
          {overline}
        </div>
      )}
      <h2
        className={`mt-1 font-bold uppercase leading-tight tracking-[0.08em] ${
          size === "lg" ? "text-[26px]" : "text-[19px]"
        }`}
        style={{ color: CHARCOAL }}
      >
        {title}
      </h2>
    </header>
  );
}

// ── Marker key legend ──

interface KeyEntry {
  label: string;
  type: PlanMarkerType;
}

const CORE_KEY: KeyEntry[] = [
  { label: "Art", type: "art" },
  { label: "Mirror", type: "mirror" },
  { label: "TV", type: "tv" },
];

const EXPANDED_KEY: KeyEntry[] = [
  ...CORE_KEY,
  { label: "Towel bar + art", type: "towel-bar" },
  { label: "Towel hooks", type: "towel-hooks" },
  { label: "Towel ring", type: "towel-ring" },
];

function KeyRow({ entry }: { entry: KeyEntry }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-sm"
        style={{ backgroundColor: PLAN_MARKER_COLORS[entry.type] }}
      />
      <span className="text-[9px] uppercase tracking-[0.12em]" style={{ color: CHARCOAL }}>
        {entry.label}
      </span>
    </span>
  );
}

export function KeyLegend({
  expanded = false,
  vertical = false,
}: {
  expanded?: boolean;
  vertical?: boolean;
}) {
  const entries = expanded ? EXPANDED_KEY : CORE_KEY;
  if (vertical) {
    return (
      <div>
        <div
          className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.3em]"
          style={{ color: TAUPE }}
        >
          Key
        </div>
        <div className="flex flex-col gap-1.5">
          {entries.map((entry) => (
            <KeyRow key={entry.label} entry={entry} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4">
      <span className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: TAUPE }}>
        Key
      </span>
      {entries.map((entry) => (
        <KeyRow key={entry.label} entry={entry} />
      ))}
    </div>
  );
}

// ── Floor-plan thumbnail (cropped to the room when annotated) ──

export function PlanThumb({ property, room }: { property: Property; room: Room }) {
  const result = getPlanForRoom(property, room);
  if (!result) return null;
  const { plan, annotation } = result;

  return (
    <figure className="flex flex-col items-end gap-1">
      <div
        className="relative overflow-hidden bg-white"
        style={{ width: "1.85in", height: "1.35in", border: `1px solid ${TAUPE}` }}
      >
        {annotation ? (
          /* Crop: scale the plan so the room's % bbox fills the container,
             then offset by the bbox origin. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={plan.url}
            alt={`${room.name} location on floor plan`}
            className="absolute max-w-none"
            style={{
              width: `${10000 / annotation.width}%`,
              height: `${10000 / annotation.height}%`,
              left: `-${(annotation.x * 100) / annotation.width}%`,
              top: `-${(annotation.y * 100) / annotation.height}%`,
            }}
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={plan.url}
            alt="Floor plan"
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
      </div>
      <figcaption className="text-[8px] uppercase tracking-[0.22em]" style={{ color: TAUPE }}>
        Location on plan
      </figcaption>
    </figure>
  );
}

// ── Placeholder card for rooms without a board image ──

export function BoardPlaceholder({ roomName }: { roomName: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        className="max-w-sm rounded-lg px-10 py-12 text-center"
        style={{ border: `1px solid ${TAUPE}` }}
      >
        <div
          className="text-[10px] font-semibold uppercase tracking-[0.3em]"
          style={{ color: TAUPE }}
        >
          {roomName}
        </div>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: CHARCOAL }}>
          No design board yet — generate one in the Review step.
        </p>
      </div>
    </div>
  );
}

// ── Tips block ──

export function TipsBlock({ heading = "Tips", lines }: { heading?: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="max-w-[3in]">
      <div className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: TAUPE }}>
        {heading}
      </div>
      <ul className="mt-1.5 space-y-1">
        {lines.map((line, i) => (
          <li
            key={i}
            className="flex items-start gap-1.5 text-[9.5px] leading-snug"
            style={{ color: CHARCOAL }}
          >
            <span
              className="mt-[3px] h-1 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: TAUPE }}
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
