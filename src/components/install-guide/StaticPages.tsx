/**
 * Static Install Guide pages — identical for every project:
 * Curtains & Art, Rug Placement & Textiles, Ordering Tips,
 * Pre-Install Checklist, and Install Execution.
 */

import type { ReactNode } from "react";
import { CHARCOAL, GuidePage, PageTitle, TAUPE } from "./chrome";
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

// ── Curtains + Art ──

export function CurtainsArtPage({ pageNumber, pageCount }: StaticPageProps) {
  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <div className="grid h-full min-h-0 grid-cols-2 gap-[0.5in]">
        <section className="flex h-full min-h-0 flex-col">
          <PageTitle overline="Install Guide" title="How to Hang Curtains" size="md" />
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: CHARCOAL }}>
            {'Mount the rod 6–10" above the window frame and extend it 6–10" past each side. Panels should just kiss the floor.'}
          </p>
          <div className="flex min-h-0 flex-1 items-center justify-around">
            <CurtainDiagram variant="do" />
            <CurtainDiagram variant="dont" />
          </div>
        </section>

        <section className="flex h-full min-h-0 flex-col">
          <PageTitle overline="Install Guide" title="How to Hang Art" size="md" />
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: CHARCOAL }}>
            {'Hang art so its center sits at 60" eye level — about 6–8" above furniture. Leave 3–4" of space between grouped pieces.'}
          </p>
          <div className="flex min-h-0 flex-1 items-center justify-around">
            <ArtDiagram variant="over-sofa" />
            <ArtDiagram variant="wall-group" />
          </div>
        </section>
      </div>
    </GuidePage>
  );
}

// ── Rug placement / throw pillows / throw blankets ──

function Quadrant({
  heading,
  caption,
  children,
}: {
  heading: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col items-center justify-center text-center">
      <div
        className="text-[9px] font-semibold uppercase tracking-[0.28em]"
        style={{ color: TAUPE }}
      >
        {heading}
      </div>
      <div className="my-1 flex min-h-0 flex-1 items-center justify-center">{children}</div>
      <p className="text-[10px] leading-snug" style={{ color: CHARCOAL }}>
        {caption}
      </p>
    </div>
  );
}

export function RugTextilesPage({ pageNumber, pageCount }: StaticPageProps) {
  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <PageTitle
        overline="Styling Guide"
        title="Rug Placement / Throw Pillows / Throw Blankets"
        size="md"
        center
      />
      <div className="mt-2 grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-x-[0.5in] gap-y-[0.15in]">
        <Quadrant
          heading="Rug Under Sofa"
          caption="Front legs of the sofa and chairs sit on the rug."
        >
          <RugSofaDiagram />
        </Quadrant>
        <Quadrant
          heading="Rug Under Bed"
          caption={'The rug extends 18–24" beyond the bed on three sides.'}
        >
          <RugBedDiagram />
        </Quadrant>
        <Quadrant
          heading="Throw Pillows"
          caption="Layer pillows large to small — odd counts style best."
        >
          <PillowDiagram />
        </Quadrant>
        <Quadrant
          heading="Throw Blankets"
          caption="Drape a throw over the sofa arm or across the foot of the bed."
        >
          <BlanketDiagram />
        </Quadrant>
      </div>
    </GuidePage>
  );
}

// ── Ordering tips ──

const ORDERING_TIPS: { title: string; body: string }[] = [
  {
    title: "Join HostGPO",
    body: "Free group-purchasing discounts for short-term-rental hosts at major furniture and supply brands.",
  },
  {
    title: "Use Minoan",
    body: "Referral discounts at Wayfair, Article, West Elm and more — trade pricing from one cart.",
  },
  {
    title: "Order long-lead items first",
    body: "Anything quoted over 2 weeks ships first so the install date never slips.",
  },
  {
    title: "Track every delivery",
    body: "Log each order in the Masterlist 'Completed payments' tab the day it is placed.",
  },
];

export function OrderingTipsPage({ pageNumber, pageCount }: StaticPageProps) {
  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <PageTitle overline="Procurement" title="Ordering Tips" />
      <div className="mt-5 grid flex-1 grid-cols-2 content-center gap-[0.35in]">
        {ORDERING_TIPS.map((tip, i) => (
          <div
            key={tip.title}
            className="flex items-start gap-5 rounded-xl px-[0.32in] py-[0.3in]"
            style={{ border: `1px solid ${TAUPE}` }}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold text-white"
              style={{ backgroundColor: TAUPE }}
            >
              {i + 1}
            </span>
            <div>
              <div
                className="text-[14px] font-bold uppercase tracking-[0.1em]"
                style={{ color: CHARCOAL }}
              >
                {tip.title}
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: CHARCOAL }}>
                {tip.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </GuidePage>
  );
}

// ── Numbered-step pages ──

function NumberedSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="grid min-h-0 flex-1 grid-flow-col grid-cols-2 grid-rows-3 content-center gap-x-[0.6in] gap-y-[0.28in]">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-4">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold text-white"
            style={{ backgroundColor: TAUPE }}
          >
            {i + 1}
          </span>
          <p className="pt-1.5 text-[12px] leading-relaxed" style={{ color: CHARCOAL }}>
            {step}
          </p>
        </li>
      ))}
    </ol>
  );
}

const PRE_INSTALL_STEPS = [
  "Confirm every delivery has arrived and inspect each item for damage.",
  "Schedule the install crew and reserve a truck.",
  "Have the property professionally cleaned.",
  "Stage boxes room by room using this guide.",
  "Gather tools and mounting hardware.",
  "Walk through the plan with the crew one final time.",
];

export function PreInstallPage({ pageNumber, pageCount }: StaticPageProps) {
  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <PageTitle overline="Before Install Day" title="Pre-Install Checklist" />
      <NumberedSteps steps={PRE_INSTALL_STEPS} />
    </GuidePage>
  );
}

const INSTALL_EXECUTION_STEPS = [
  "Assemble large furniture first.",
  "Lay rugs before placing furniture.",
  "Place furniture according to the floor plan.",
  "Hang curtains and art following the guides.",
  "Style beds, shelves and decor to match the design boards.",
  "Test TVs and smart tech, then photograph every room.",
];

export function InstallExecutionPage({ pageNumber, pageCount }: StaticPageProps) {
  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <PageTitle overline="Install Day" title="Install Execution" />
      <NumberedSteps steps={INSTALL_EXECUTION_STEPS} />
    </GuidePage>
  );
}
