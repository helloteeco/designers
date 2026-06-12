/**
 * Static Install Guide pages — identical for every project, with copy
 * transcribed verbatim from the reference Teeco deliverable (p21–25):
 * How to Hang Curtains / How to Hang Art, Rug Placement / Throw Pillows /
 * Throw Blankets, Ordering Tips, Pre-Install Checklist, Install Execution.
 */

import type { ReactNode } from "react";
import { CHARCOAL, GuidePage, PageTitle } from "./chrome";
import {
  ArtDiagram,
  BlanketDiagram,
  CurtainDiagram,
  PillowDiagram,
  RugBedDiagram,
  RugSofaDiagram,
} from "./diagrams";

interface StaticPageProps {
  pageNumber: number;
  pageCount: number;
}

/** Warm stone gray used for the reference's numerals, card outlines, icons. */
const STONE = "#8A8170";

/** Centered section heading, reference style: uppercase, light, trailing colon. */
function SectionHeading({ children, size = "md" }: { children: ReactNode; size?: "md" | "lg" }) {
  return (
    <h3
      className={`text-center font-light uppercase tracking-[0.1em] ${
        size === "lg" ? "text-[21px]" : "text-[17px]"
      }`}
      style={{ color: CHARCOAL }}
    >
      {children}
    </h3>
  );
}

function SectionIntro({ children, maxWidth = "6.4in" }: { children: ReactNode; maxWidth?: string }) {
  return (
    <p
      className="mx-auto mt-1 text-center text-[10.5px] leading-relaxed"
      style={{ color: CHARCOAL, maxWidth }}
    >
      {children}
    </p>
  );
}

// ── p21 · How to Hang Curtains / How to Hang Art ──

export function CurtainsArtPage({ pageNumber, pageCount }: StaticPageProps) {
  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <div className="flex h-full min-h-0 flex-col">
        <section className="flex min-h-0 flex-[1.05] flex-col">
          <SectionHeading size="lg">How to Hang Curtains:</SectionHeading>
          <SectionIntro>
            {'Hang curtains high and wide. 6-10" from either side of window and hung to graze floor. Please have the rod overhang the bracket 3-4".'}
          </SectionIntro>
          <div className="flex min-h-0 flex-1 items-center justify-center gap-[0.9in]">
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-semibold" style={{ color: CHARCOAL }}>
                DO:
              </span>
              <CurtainDiagram variant="do" />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-semibold" style={{ color: CHARCOAL }}>
                {"DON'T:"}
              </span>
              <CurtainDiagram variant="dont" />
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col">
          <SectionHeading size="lg">How to Hang Art:</SectionHeading>
          <SectionIntro>
            {'Position center of art at eye level (about 60" from floor) or about 6-8" from furniture. For side-by-side art, allow 3-4" of space between each piece of art.'}
          </SectionIntro>
          <div className="flex min-h-0 flex-1 items-center justify-center gap-[1.1in]">
            <ArtDiagram variant="over-sofa" />
            <ArtDiagram variant="wall-group" />
          </div>
        </section>
      </div>
    </GuidePage>
  );
}

// ── p22 · Rug Placement / Throw Pillows / Throw Blankets ──

export function RugTextilesPage({ pageNumber, pageCount }: StaticPageProps) {
  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <div className="flex h-full min-h-0 flex-col">
        {/* Top: rug placement spans both columns */}
        <section className="flex min-h-0 flex-[1.05] flex-col">
          <SectionHeading size="lg">Rug Placement:</SectionHeading>
          <div className="mt-1 grid min-h-0 flex-1 grid-cols-2 gap-[0.7in]">
            <div className="flex min-h-0 flex-col items-center">
              <p className="text-center text-[10.5px] leading-snug" style={{ color: CHARCOAL }}>
                Front legs of sofa and chairs
                <br />
                should sit on the rug.
              </p>
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <RugSofaDiagram />
              </div>
            </div>
            <div className="flex min-h-0 flex-col items-center">
              <p className="text-center text-[10.5px] leading-snug" style={{ color: CHARCOAL }}>
                Position rug under the bottom
                <br />
                two thirds of the bed.
              </p>
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <RugBedDiagram />
              </div>
            </div>
          </div>
        </section>

        {/* Bottom: pillows + blankets, each with its own heading */}
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-[0.7in] pt-2">
          <section className="flex min-h-0 flex-col items-center">
            <SectionHeading>Throw Pillows:</SectionHeading>
            <p className="mt-0.5 text-center text-[10.5px] leading-snug" style={{ color: CHARCOAL }}>
              {'Pillow inserts should be 1-2" larger than'}
              <br />
              the pillow cover. Fluff and karate chop.
            </p>
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <PillowDiagram />
            </div>
          </section>
          <section className="flex min-h-0 flex-col items-center">
            <SectionHeading>Throw Blankets:</SectionHeading>
            <p className="mt-0.5 text-center text-[10.5px] leading-snug" style={{ color: CHARCOAL }}>
              Fold and lay horizontally across
              <br />
              the foot of the bed
            </p>
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <BlanketDiagram />
            </div>
          </section>
        </div>
      </div>
    </GuidePage>
  );
}

// ── p23 · Ordering Tips ──

/** A bullet line, optionally with hollow sub-bullets beneath it. */
interface TipLine {
  text: ReactNode;
  sub?: ReactNode[];
}

function TipList({ lines }: { lines: TipLine[] }) {
  return (
    <ul className="space-y-[3px]">
      {lines.map((line, i) => (
        <li key={i}>
          <span className="flex items-start gap-1.5 text-[9px] leading-snug" style={{ color: CHARCOAL }}>
            <span
              className="mt-[4px] h-[3px] w-[3px] shrink-0 rounded-full"
              style={{ backgroundColor: CHARCOAL }}
            />
            <span>{line.text}</span>
          </span>
          {line.sub && (
            <ul className="ml-4 mt-[2px] space-y-[2px]">
              {line.sub.map((sub, j) => (
                <li
                  key={j}
                  className="flex items-start gap-1.5 text-[9px] leading-snug"
                  style={{ color: CHARCOAL }}
                >
                  <span
                    className="mt-[3.5px] h-[4px] w-[4px] shrink-0 rounded-full border"
                    style={{ borderColor: CHARCOAL }}
                  />
                  <span>{sub}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function CardIcon({ children }: { children: ReactNode }) {
  return (
    <span
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white"
      style={{ border: `1.5px solid ${STONE}`, color: STONE }}
    >
      {children}
    </span>
  );
}

const ICON_STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const CartIcon = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...ICON_STROKE}>
    <path d="M3 4h2l2.4 11h10.8l2-8H7" />
    <circle cx="9.5" cy="19" r="1.4" />
    <circle cx="16.5" cy="19" r="1.4" />
  </svg>
);

const TagIcon = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...ICON_STROKE}>
    <path d="M20 12.5 12.5 20 4 11.5V4h7.5L20 12.5Z" />
    <circle cx="8.5" cy="8.5" r="1.3" />
  </svg>
);

const ClipboardIcon = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...ICON_STROKE}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4.5V3h6v1.5M8.5 12l2.5 2.5 4.5-4.5" />
  </svg>
);

const AlertIcon = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...ICON_STROKE}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5" />
    <circle cx="12" cy="16.5" r="0.4" fill="currentColor" />
  </svg>
);

function OrderingCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex flex-col rounded-2xl px-[0.28in] pb-[0.18in] pt-[0.3in]" style={{ border: `1.5px solid ${STONE}` }}>
      <div className="absolute -top-[18px] left-1/2 -translate-x-1/2">
        <CardIcon>{icon}</CardIcon>
      </div>
      <div className="text-center text-[13px] font-semibold" style={{ color: CHARCOAL }}>
        {title}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function OrderingTipsPage({ pageNumber, pageCount }: StaticPageProps) {
  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <PageTitle title="Ordering Tips" size="xl" />
      <div className="mt-[0.32in] grid min-h-0 flex-1 grid-cols-2 content-start gap-x-[0.4in] gap-y-[0.34in]">
        <OrderingCard icon={CartIcon} title="Ordering & Organization">
          <TipList
            lines={[
              {
                text: "Add all items for one room from the same vendor to your cart.",
                sub: ["Example: Add all Living Room Amazon items together."],
              },
              {
                text: "At checkout, label each order with:",
                sub: [
                  "“[Your Name] – [Room Name]”",
                  "This prints on the shipping label and keeps deliveries organized.",
                ],
              },
              { text: "Repeat for each room and vendor." },
            ]}
          />
        </OrderingCard>

        <OrderingCard icon={TagIcon} title="Discounts">
          <TipList
            lines={[
              {
                text: "Use HostGPO and Minoan for any items marked in your Masterlist — it will note which platform to use for each purchase.",
              },
              {
                text: "These platforms provide exclusive trade discounts with top retailers and can save you 10–25% on your setup.",
              },
              {
                text: "Use our referral links!",
                sub: [
                  <span key="h" className="underline">HostGPO</span>,
                  <span key="m" className="underline">Minoan</span>,
                ],
              },
            ]}
          />
        </OrderingCard>

        <OrderingCard icon={ClipboardIcon} title="Tracking Orders">
          <p className="mb-1 text-[9px] leading-snug" style={{ color: CHARCOAL }}>
            {"Keep your master list updated with each item’s status:"}
          </p>
          <TipList
            lines={[
              {
                text: (
                  <span>
                    <em>Delivered, Back-Ordered, or In Transit.</em> This keeps your
                    project on schedule.
                  </span>
                ),
              },
              {
                text: "Gray out or color-code items as you order and receive them (e.g., gray = ordered, green = delivered, yellow = back-ordered).",
              },
            ]}
          />
        </OrderingCard>

        <OrderingCard icon={AlertIcon} title="Priority Purchases">
          <p className="mb-1 text-[9px] leading-snug" style={{ color: CHARCOAL }}>
            Buy these items first to keep setup on schedule:
          </p>
          <TipList
            lines={[
              { text: "Smart & Security Devices — Ring, Schlage, Sensi, Lockbox" },
              { text: "Large Lead-Time Items — Hot tubs, saunas, or bulky furniture" },
              {
                text: "Contractor-Installed Items —",
                sub: [
                  "Light fixtures, ceiling fans",
                  "Plumbing fixtures (faucets, shower heads)",
                  "Accent wall materials (wallpaper, slats, shiplap)",
                  "Cabinet hardware",
                ],
              },
            ]}
          />
        </OrderingCard>
      </div>
    </GuidePage>
  );
}

// ── p24/p25 · Numbered checklist pages ──

const SETUP_SUBTITLE =
  "Go through the 7-Day Setup Document in your Starter Pack to ensure a smooth, organized setup!";

/** Big stone numeral beside a rounded speech-bubble card (reference style). */
function NumberedSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="grid min-h-0 flex-1 grid-cols-2 content-center gap-x-[0.55in] gap-y-[0.26in]">
      {steps.map((step, i) => (
        <li key={i} className="flex items-center gap-4">
          <span
            className="w-[0.55in] shrink-0 text-right text-[56px] font-light leading-none"
            style={{ color: STONE }}
          >
            {i + 1}
          </span>
          <p
            className="flex-1 rounded-2xl rounded-bl-none px-4 py-3 text-[10.5px] leading-relaxed"
            style={{ color: CHARCOAL, border: `1.5px solid ${STONE}` }}
          >
            {step}
          </p>
        </li>
      ))}
    </ol>
  );
}

const PRE_INSTALL_STEPS = [
  "Remove all personal items and anything not related to the install from each room.",
  "Take down all existing window treatments (blinds, rods, and hardware) so wall touch-ups can be identified and completed.",
  "Unbox every delivery and verify all items against your Masterlist — check for missing or damaged pieces.",
  "Note anything that needs to be reordered or added and notify your Designer immediately.",
  "Tape up each Design Board printout on the door of its corresponding room to guide install and styling.",
  "Wash and dry all bedding, linens, and towels early so they’re photo-ready by install day.",
];

export function PreInstallPage({ pageNumber, pageCount }: StaticPageProps) {
  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <div className="pt-[0.25in]">
        <PageTitle title="Pre-Install Checklist" size="xl" />
      </div>
      <p className="mt-2 text-center text-[10.5px]" style={{ color: CHARCOAL }}>
        {SETUP_SUBTITLE}
      </p>
      <NumberedSteps steps={PRE_INSTALL_STEPS} />
    </GuidePage>
  );
}

const INSTALL_EXECUTION_STEPS = [
  "Complete one room fully before moving on to stay efficient and catch any missing items early.",
  "Make sure all lighting uses warm or soft bulbs (2700–3000K) for a cozy, inviting feel.",
  "Keep tools, packaging, and trash contained to one area to maintain a clear workspace.",
  "Keep boxes and packaging for any potential returns to avoid paying for new shipping materials later.",
  "Conceal visible cords inside the wall or use cord covers for a clean, finished look.",
  "If you’re unsure about anything, reach out — your Designer’s here to help!",
];

export function InstallExecutionPage({ pageNumber, pageCount }: StaticPageProps) {
  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <div className="pt-[0.25in]">
        <PageTitle title="Install Execution" size="xl" />
      </div>
      <p className="mt-2 text-center text-[10.5px]" style={{ color: CHARCOAL }}>
        {SETUP_SUBTITLE}
      </p>
      <NumberedSteps steps={INSTALL_EXECUTION_STEPS} />
    </GuidePage>
  );
}
