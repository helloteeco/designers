"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getProject } from "@/lib/store";
import { getStudioSettings, type StudioSettings } from "@/lib/studio-settings";
import type { Project } from "@/lib/types";
import {
  buildPageList,
  type GuidePageDescriptor,
} from "@/components/install-guide/page-list";
import CoverPage from "@/components/install-guide/CoverPage";
import FloorPlanPage from "@/components/install-guide/FloorPlanPage";
import RoomBoardPage from "@/components/install-guide/RoomBoardPage";
import AiRenderPage from "@/components/install-guide/AiRenderPage";
import BathroomPage from "@/components/install-guide/BathroomPage";
import ExteriorPage from "@/components/install-guide/ExteriorPage";
import {
  CurtainsArtPage,
  InstallExecutionPage,
  OrderingTipsPage,
  PreInstallPage,
  RugTextilesPage,
} from "@/components/install-guide/StaticPages";
import ContactPage from "@/components/install-guide/ContactPage";

/**
 * Teeco "Design & Install Guide" — the client-deliverable print route.
 * Access via /projects/install-guide?id=PROJECT_ID, then Print / Save as PDF.
 *
 * The whole document is driven by buildPageList(project), which returns an
 * ordered array of typed page descriptors:
 *   Cover → Floor Plan + Legend → per-room design-board page(s) and optional
 *   AI-render page (living → dining → kitchen → bedrooms → other common
 *   rooms) → bathrooms → exterior → curtains & art → rug & textiles →
 *   ordering tips → pre-install checklist → install execution → contact.
 * Knowing the full list up front lets every page print a "Page X of N"
 * footer at the bottom-right.
 */
export default function InstallGuidePage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-gray-400">Loading install guide...</div>
      }
    >
      <InstallGuideContent />
    </Suspense>
  );
}

function InstallGuideContent() {
  const params = useSearchParams();
  const id = params?.get("id");
  const [project, setProject] = useState<Project | null>(null);
  const [settings, setSettings] = useState<StudioSettings | null>(null);

  useEffect(() => {
    if (id) setProject(getProject(id));
    setSettings(getStudioSettings());
  }, [id]);

  // Title drives the printed PDF filename/metadata.
  useEffect(() => {
    if (project) {
      document.title = `${project.property.address} Design & Install Guide`;
    }
  }, [project]);

  if (!project || !settings) {
    return (
      <div className="p-8 text-center text-gray-500">
        Loading or project not found...
      </div>
    );
  }

  const pages = buildPageList(project);
  const pageCount = pages.length;

  return (
    <div className="min-h-screen bg-[#E9E6E0] font-sans text-[#2B2B2B] print:bg-white">
      {/* Toolbar (hidden in print) */}
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <button
          onClick={() => window.history.back()}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          ← Back to Project
        </button>
        <div className="text-sm font-medium text-gray-900">
          Install Guide Preview · {pageCount} pages
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-[#2B2B2B] px-4 py-2 text-sm font-medium text-white hover:bg-black"
        >
          Print / Save as PDF
        </button>
      </div>

      <style jsx global>{`
        @page {
          size: letter landscape;
          margin: 0.5in;
        }
        .guide-page {
          position: relative;
          width: 10in;
          height: 7.49in;
          background: #ffffff;
          overflow: hidden;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @media screen {
          .guide-pages {
            padding: 2.5rem 1rem 4rem;
          }
          .guide-page {
            margin: 0 auto 2rem;
            border-radius: 2px;
            box-shadow: 0 4px 24px rgba(43, 43, 43, 0.18);
          }
        }
        @media print {
          body {
            background: #ffffff;
          }
          .guide-pages {
            padding: 0;
          }
          .guide-page {
            margin: 0;
            border-radius: 0;
            box-shadow: none;
            page-break-after: always;
            break-after: page;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .guide-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>

      <main className="guide-pages">
        {pages.map((page, index) => (
          <PageRenderer
            key={`${page.kind}-${index}`}
            page={page}
            pageNumber={index + 1}
            pageCount={pageCount}
            project={project}
            settings={settings}
          />
        ))}
      </main>
    </div>
  );
}

function PageRenderer({
  page,
  pageNumber,
  pageCount,
  project,
  settings,
}: {
  page: GuidePageDescriptor;
  pageNumber: number;
  pageCount: number;
  project: Project;
  settings: StudioSettings;
}) {
  switch (page.kind) {
    case "cover":
      return <CoverPage project={project} pageNumber={pageNumber} pageCount={pageCount} />;
    case "floor-plan":
      return <FloorPlanPage project={project} pageNumber={pageNumber} pageCount={pageCount} />;
    case "room-board":
      return (
        <RoomBoardPage
          descriptor={page}
          property={project.property}
          pageNumber={pageNumber}
          pageCount={pageCount}
        />
      );
    case "ai-render":
      return <AiRenderPage descriptor={page} pageNumber={pageNumber} pageCount={pageCount} />;
    case "bathroom":
      return (
        <BathroomPage
          descriptor={page}
          property={project.property}
          pageNumber={pageNumber}
          pageCount={pageCount}
        />
      );
    case "exterior":
      return <ExteriorPage descriptor={page} pageNumber={pageNumber} pageCount={pageCount} />;
    case "curtains-art":
      return <CurtainsArtPage pageNumber={pageNumber} pageCount={pageCount} />;
    case "rug-textiles":
      return <RugTextilesPage pageNumber={pageNumber} pageCount={pageCount} />;
    case "ordering-tips":
      return <OrderingTipsPage pageNumber={pageNumber} pageCount={pageCount} />;
    case "pre-install":
      return <PreInstallPage pageNumber={pageNumber} pageCount={pageCount} />;
    case "install-execution":
      return <InstallExecutionPage pageNumber={pageNumber} pageCount={pageCount} />;
    case "contact":
      return (
        <ContactPage
          project={project}
          settings={settings}
          pageNumber={pageNumber}
          pageCount={pageCount}
        />
      );
    default:
      return null;
  }
}
