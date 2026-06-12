/**
 * Shared chrome for Install Guide pages, styled to match the real Teeco
 * client deliverable: the fixed-size page shell with the tiny "Page X of N"
 * footer, the centered light-weight tracked title, the "KEY:" legend whose
 * swatches are short colored line segments, the cropped floor-plan
 * thumbnail, the TIPS block, and the graceful board placeholder card.
 */

import type { ReactNode } from "react";
import { PLAN_MARKER_COLORS, type PlanMarkerType, type Property, type Room } from "@/lib/types";
import { getPlanForRoom } from "./page-list";

// Brand palette
export const CHARCOAL = "#2B2B2B";
export const TAUPE = "#A8987F";
export const TAUPE_FILL = "#E9E2D6";

/**
 * Guide-only marker colors. The editor UI keeps PLAN_MARKER_COLORS; the
 * printed guide matches the reference key, where the towel ring is orange.
 */
export const GUIDE_MARKER_COLORS: Record<PlanMarkerType, string> = {
  ...PLAN_MARKER_COLORS,
  "towel-ring": "#F57C00",
};

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
          bleed ? "h-full w-full" : "flex h-full w-full flex-col px-[0.45in] pb-[0.42in] pt-[0.3in]"
        }
      >
        {children}
      </div>
      {/* Reference footer: tiny mixed-case "Page X of 26", bottom-right */}
      <div
        className={`absolute bottom-[0.14in] right-[0.22in] text-[8px] leading-none ${
          footerOnImage ? "rounded-sm bg-white/85 px-1.5 py-0.5" : ""
        }`}
        style={{ color: CHARCOAL }}
      >
        Page {pageNumber} of {pageCount}
      </div>
    </section>
  );
}

// ── Title treatment ──

/**
 * Reference title: centered, uppercase, light weight, gently tracked —
 * no overline, no rules. `note` renders a small italic line underneath
 * (used for the photo-fallback "Design Board to Follow" message).
 */
export function PageTitle({
  title,
  note,
  size = "lg",
}: {
  title: string;
  /** Small italic line under the title (photo-fallback pages) */
  note?: string;
  size?: "lg" | "xl";
}) {
  return (
    <header className="text-center">
      <h2
        className={`font-light uppercase leading-tight tracking-[0.12em] ${
          size === "xl" ? "text-[30px]" : "text-[22px]"
        }`}
        style={{ color: CHARCOAL }}
      >
        {title}
      </h2>
      {note && (
        <p className="mt-0.5 text-[9px] italic" style={{ color: TAUPE }}>
          {note}
        </p>
      )}
    </header>
  );
}

// ── Marker key legend ──

interface KeyEntry {
  label: string;
  type: PlanMarkerType;
}

/** Core key on the floor plan + room board pages. */
const CORE_KEY: KeyEntry[] = [
  { label: "Art", type: "art" },
  { label: "Mirror", type: "mirror" },
  { label: "TV", type: "tv" },
];

/** Bathroom pages swap to the towel-centric key (reference p18–19). */
const BATH_KEY: KeyEntry[] = [
  { label: "Mirror", type: "mirror" },
  { label: "Towel bar + art above", type: "towel-bar" },
  { label: "Towel hooks", type: "towel-hooks" },
  { label: "Towel ring", type: "towel-ring" },
];

/** Short colored line segment — the reference swatch (not a dot). */
export function KeySwatch({ type, className = "" }: { type: PlanMarkerType; className?: string }) {
  return (
    <span
      className={`inline-block h-[3px] w-[22px] shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: GUIDE_MARKER_COLORS[type] }}
    />
  );
}

/**
 * "KEY:" block — stacked rows of `Label -` followed by a colored line
 * segment, mixed case, tiny, charcoal (reference treatment).
 */
export function KeyLegend({
  variant = "core",
  className = "",
}: {
  variant?: "core" | "bath";
  className?: string;
}) {
  const entries = variant === "bath" ? BATH_KEY : CORE_KEY;
  return (
    <div className={className}>
      <div className="text-[9px] font-medium leading-snug" style={{ color: CHARCOAL }}>
        KEY:
      </div>
      <div className="mt-0.5 flex flex-col gap-[3px]">
        {entries.map((entry) => (
          <span key={entry.label} className="flex items-center gap-1.5">
            <span className="text-[8px] leading-none" style={{ color: CHARCOAL }}>
              {entry.label} -
            </span>
            <KeySwatch type={entry.type} />
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Floor-plan thumbnail (cropped to the room when annotated) ──

export function PlanThumb({
  property,
  room,
  width = "1.7in",
  height = "1.3in",
}: {
  property: Property;
  room: Room;
  width?: string;
  height?: string;
}) {
  const result = getPlanForRoom(property, room);
  if (!result) return null;
  const { plan, annotation: tight } = result;
  // Pad the crop ~10% per side so room labels at the bbox edge don't clip.
  const annotation = tight
    ? (() => {
        const padX = tight.width * 0.1;
        const padY = tight.height * 0.1;
        const x = Math.max(0, tight.x - padX);
        const y = Math.max(0, tight.y - padY);
        return {
          ...tight,
          x,
          y,
          width: Math.min(100 - x, tight.width + padX * 2),
          height: Math.min(100 - y, tight.height + padY * 2),
        };
      })()
    : tight;

  return (
    <div
      className="relative shrink-0 overflow-hidden bg-white"
      style={{ width, height, border: "1px solid #E2DCD2" }}
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

export function TipsBlock({
  heading = "TIPS",
  lines,
  maxWidth = "3.4in",
}: {
  heading?: string;
  lines: string[];
  maxWidth?: string;
}) {
  if (lines.length === 0) return null;
  return (
    <div style={{ maxWidth }}>
      <div className="text-[10px] font-medium tracking-[0.04em]" style={{ color: CHARCOAL }}>
        {heading}
      </div>
      <ul className="mt-1 space-y-[3px]">
        {lines.map((line, i) => (
          <li
            key={i}
            className="flex items-start gap-1.5 text-[8.5px] leading-snug"
            style={{ color: CHARCOAL }}
          >
            <span
              className="mt-[3px] h-[3px] w-[3px] shrink-0 rounded-full"
              style={{ backgroundColor: CHARCOAL }}
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Compact furniture & decor list (board pages) ──

/** Compact two-column item list so the page reads like a real install guide
 *  even before a styled board composite exists. First board page only. */
export function FurnitureList({ room }: { room: Room }) {
  const items = room.furniture ?? [];
  if (items.length === 0) return null;
  const MAX = 12;
  const shown = items.slice(0, MAX);
  return (
    <div className="max-w-[3.4in]">
      <div className="text-[8px] font-semibold uppercase tracking-[0.18em]" style={{ color: TAUPE }}>
        Furniture &amp; Decor
      </div>
      <ul className="mt-1 columns-2 gap-4 text-[8px] leading-[1.5]" style={{ color: CHARCOAL }}>
        {shown.map((f, i) => (
          <li key={i} className="break-inside-avoid truncate">
            &middot; {f.item.name}
            {f.quantity > 1 ? ` ×${f.quantity}` : ""}
          </li>
        ))}
        {items.length > MAX && (
          <li className="break-inside-avoid opacity-60">…and {items.length - MAX} more (see Masterlist)</li>
        )}
      </ul>
    </div>
  );
}
