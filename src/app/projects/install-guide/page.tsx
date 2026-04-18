"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getProject } from "@/lib/store";
import { getStudioSettings, type StudioSettings } from "@/lib/studio-settings";
import { getTotalSleeping } from "@/lib/sleep-optimizer";
import type { Project, Room } from "@/lib/types";

/**
 * Install Guide — matches Teeco's delivered format.
 * Access via /projects/install-guide?id=PROJECT_ID then Cmd+P / Ctrl+P for PDF.
 *
 * Structure (mirrors Teeco Willowood install guide):
 *  1. Cover (title + address + hero photo)
 *  2. How to hang curtains
 *  3. How to hang art
 *  4. Rug placement + throw pillows + throw blankets
 *  5. Client checklist (pre-install tasks)
 *  6. Tips (install process tips)
 *  7. Floor Plan (with occupancy + bed list + key)
 *  8. Per-room pages (scene render + tips + mini floor plan)
 *  9. Back cover (studio contact)
 */
export default function InstallGuidePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading install guide...</div>}>
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

  if (!project || !settings) {
    return <div className="p-8 text-center text-gray-500">Loading or project not found...</div>;
  }

  const sleepList = project.rooms
    .filter(r => r.selectedBedConfig && r.selectedBedConfig.totalSleeps > 0)
    .map((r, i) => ({
      n: i + 1,
      label: `Bed ${i + 1} — ${r.selectedBedConfig!.name} — ${r.selectedBedConfig!.totalSleeps} Guest${r.selectedBedConfig!.totalSleeps === 1 ? "" : "s"} (${r.name})`,
    }));
  const totalOccupancy = getTotalSleeping(project.rooms);

  const roomsForGuide = project.rooms.filter(r => r.type !== "hallway" && r.type !== "outdoor");
  const mainFloorPlan = project.property.floorPlans?.find(p => p.type === "image");

  return (
    <div className="bg-white text-gray-900">
      {/* Toolbar (hidden in print) */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <button onClick={() => window.history.back()} className="text-sm text-gray-600 hover:text-gray-900">
          ← Back to Project
        </button>
        <div className="text-sm font-medium text-gray-900">Install Guide Preview</div>
        <button onClick={() => window.print()} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          Print / Save as PDF
        </button>
      </div>

      <style jsx global>{`
        @page { size: letter landscape; margin: 0.5in; }
        @media print {
          body { background: white; }
          .page-break { page-break-before: always; }
          .no-break { page-break-inside: avoid; }
        }
        .guide-page {
          min-height: 7in;
          padding: 0.5in 0.75in;
          max-width: 10.5in;
          margin: 0 auto;
          background: white;
        }
      `}</style>

      {/* 1. Cover Page */}
      <div className="guide-page flex flex-col">
        <div className="flex-1 flex items-start justify-center mt-16">
          <div className="w-full max-w-3xl">
            <h1 className="text-6xl font-bold tracking-tight text-gray-900 text-center mb-3">
              INSTALL GUIDE
            </h1>
            <p className="text-lg text-gray-700 text-center mb-10">
              {project.property.address}
              {project.property.city && `, ${project.property.city}, ${project.property.state}`}
            </p>
            {project.property.heroImageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={project.property.heroImageUrl}
                alt=""
                className="w-full aspect-[16/10] object-cover rounded"
              />
            ) : (
              <div className="w-full aspect-[16/10] bg-gray-100 rounded flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <div className="text-4xl mb-2">🏠</div>
                  <div className="text-sm">Upload a hero image in Overview</div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          {settings.studioLogoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={settings.studioLogoUrl} alt={settings.studioName} className="h-6 inline-block" />
          ) : (
            <span className="text-sm font-semibold">{settings.studioName || "teeco"}</span>
          )}
        </div>
      </div>

      {/* 2. How to hang curtains + art */}
      <div className="guide-page page-break">
        <h2 className="text-2xl font-semibold text-center mb-4">HOW TO HANG CURTAINS:</h2>
        <p className="text-center text-gray-700 mb-8 max-w-3xl mx-auto">
          Hang curtains high and wide. 6-10&quot; from either side of window and hung to graze floor.
          Please have the rod overhang the bracket 3-4&quot;.
        </p>
        <div className="flex justify-around items-start mb-12">
          <CurtainDiagram variant="do" />
          <CurtainDiagram variant="dont" />
        </div>

        <h2 className="text-2xl font-semibold text-center mb-4 mt-8">HOW TO HANG ART:</h2>
        <p className="text-center text-gray-700 mb-8 max-w-3xl mx-auto">
          Position center of art at eye level (about 60&quot; from floor) or about 6-8&quot; from furniture.
          For side-by-side art, allow 3-4&quot; of space between each piece of art.
        </p>
        <div className="flex justify-around items-start">
          <ArtDiagram variant="over-sofa" />
          <ArtDiagram variant="wall-group" />
        </div>
      </div>

      {/* 3. Rug + pillows + blankets */}
      <div className="guide-page page-break">
        <h2 className="text-2xl font-semibold text-center mb-6">RUG PLACEMENT:</h2>
        <div className="grid grid-cols-2 gap-8 mb-12">
          <div className="text-center">
            <p className="text-gray-700 mb-4">Front legs of sofa and chairs should sit on the rug.</p>
            <RugDiagram variant="sofa" />
          </div>
          <div className="text-center">
            <p className="text-gray-700 mb-4">Position rug under the bottom two thirds of the bed.</p>
            <RugDiagram variant="bed" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8">
          <div className="text-center">
            <h3 className="text-xl font-semibold mb-2">THROW PILLOWS:</h3>
            <p className="text-gray-700 text-sm mb-3">
              Pillow inserts should be 1-2&quot; larger than the pillow cover. Fluff and karate chop.
            </p>
            <div className="aspect-[4/3] bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">
              [pillow placement reference]
            </div>
          </div>
          <div className="text-center">
            <h3 className="text-xl font-semibold mb-2">THROW BLANKETS:</h3>
            <p className="text-gray-700 text-sm mb-3">
              Fold and lay horizontally across the foot of the bed.
            </p>
            <div className="aspect-[4/3] bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">
              [blanket placement reference]
            </div>
          </div>
        </div>
      </div>

      {/* 4. Checklist */}
      <div className="guide-page page-break">
        <h2 className="text-3xl font-semibold text-center mb-10">CHECKLIST</h2>
        <ul className="space-y-4 text-lg max-w-2xl mx-auto">
          <li className="flex gap-3"><span>•</span><span>Please make sure all items not related to install are removed from the home</span></li>
          <li className="flex gap-3"><span>•</span><span>Please take down all existing window treatments including blinds and hardware so we know where touch ups are needed</span></li>
          <li className="flex gap-3"><span>•</span><span>Notate anything needed and communicate to the Designer to order ASAP</span></li>
          <li className="flex gap-3"><span>•</span><span>Remove <strong><u>all</u></strong> items from <strong><u>all</u></strong> boxes to be sure everything is accounted for</span></li>
          <li className="flex gap-3"><span>•</span><span>Start laundry ASAP</span></li>
        </ul>
      </div>

      {/* 5. Tips */}
      <div className="guide-page page-break">
        <h2 className="text-3xl font-semibold text-center mb-10">TIPS</h2>
        <ul className="space-y-4 text-lg max-w-2xl mx-auto">
          <li className="flex gap-3"><span>•</span><span>Focus on one room and complete. This will ensure an efficient process for both completion and accounting for any unforeseen situations or missing items.</span></li>
          <li className="flex gap-3"><span>•</span><span>Clean as you go/declutter. Try to keep anything not needed in a space contained in one area of a room as clutter and trash tends to deter from completing a space.</span></li>
          <li className="flex gap-3"><span>•</span><span>Keep boxes of items that may need to be returned to avoid having to pay for shipping materials.</span></li>
          <li className="flex gap-3"><span>•</span><span>Cords can be an eye sore! Try to hide as much as possible throughout! Tuck behind furniture or get cord covers if necessary.</span></li>
        </ul>
      </div>

      {/* 6. Floor Plan */}
      <div className="guide-page page-break">
        <h2 className="text-3xl font-semibold text-center mb-6">FLOOR PLAN</h2>
        <div className="grid grid-cols-[200px_1fr] gap-6">
          <div className="text-xs text-gray-700 space-y-4">
            {totalOccupancy > 0 && (
              <div>
                <div className="font-semibold mb-1">Occupancy: {totalOccupancy}</div>
                <ul className="space-y-1 text-[10px]">
                  {sleepList.map(b => (
                    <li key={b.n}>• {b.label}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <div className="font-semibold mb-1">KEY</div>
              <div className="flex items-center gap-2 text-[10px]">
                <span>Art -</span>
                <div className="h-1 w-6 bg-blue-400" />
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span>Mirror -</span>
                <div className="h-1 w-6 bg-yellow-400" />
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span>TV -</span>
                <div className="h-1 w-6 bg-red-400" />
              </div>
            </div>
          </div>
          <div className="border border-gray-200 rounded bg-gray-50 aspect-[4/3] flex items-center justify-center overflow-hidden">
            {mainFloorPlan ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={mainFloorPlan.url} alt={mainFloorPlan.name} className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="text-gray-400 text-sm">Upload a floor plan image in Overview → Floor Plans</div>
            )}
          </div>
        </div>
      </div>

      {/* 7. Per-room pages */}
      {roomsForGuide.map(room => (
        <RoomPage key={room.id} room={room} mainFloorPlan={mainFloorPlan?.url} />
      ))}

      {/* 8. Back cover */}
      <div className="guide-page page-break flex flex-col items-center justify-center text-center min-h-[7in]">
        <div className="max-w-md">
          {settings.studioLogoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={settings.studioLogoUrl} alt={settings.studioName} className="h-12 mx-auto mb-6" />
          ) : (
            <div className="text-3xl font-bold mb-6">{settings.studioName || "teeco"}</div>
          )}

          {settings.studioName && (
            <div className="text-sm text-gray-700 mb-2">
              <div className="font-semibold mb-1">Designer</div>
              <div>{settings.studioName}</div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-6 mt-10 text-sm">
            {settings.studioWebsite && (
              <div>
                <div className="font-semibold text-gray-900">Website</div>
                <div className="text-gray-700">{settings.studioWebsite.replace(/^https?:\/\//, "")}</div>
              </div>
            )}
            {settings.studioEmail && (
              <div>
                <div className="font-semibold text-gray-900">Email</div>
                <div className="text-gray-700 text-xs">{settings.studioEmail}</div>
              </div>
            )}
            {settings.studioPhone && (
              <div>
                <div className="font-semibold text-gray-900">Phone</div>
                <div className="text-gray-700">{settings.studioPhone}</div>
              </div>
            )}
          </div>

          {settings.briefFooterNote && (
            <p className="mt-10 text-xs text-gray-600 italic">{settings.briefFooterNote}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Per-room page ──

function RoomPage({ room, mainFloorPlan }: { room: Room; mainFloorPlan?: string }) {
  const scene = room.sceneSnapshot ?? room.sceneBackgroundUrl;
  const hasScene = !!scene;

  return (
    <div className="guide-page page-break">
      <h2 className="text-2xl font-semibold text-center mb-6">{room.name.toUpperCase()}</h2>

      {/* Main image — scene or placeholder */}
      <div className="mb-6">
        {hasScene ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={scene} alt={room.name} className="w-full aspect-[16/10] object-contain bg-gray-50 rounded" />
        ) : (
          <div className="w-full aspect-[16/10] bg-gray-100 rounded flex items-center justify-center text-gray-400 text-sm">
            <div className="text-center">
              <div className="text-3xl mb-2">🎨</div>
              <div>Build this room in Scene Designer to see the render here</div>
            </div>
          </div>
        )}
      </div>

      {/* Tips + mini floor plan */}
      <div className="grid grid-cols-[1fr_200px] gap-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">TIPS</div>
          {room.installTips ? (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{room.installTips}</p>
          ) : (
            <ul className="text-sm text-gray-700 space-y-1">
              {getDefaultTipsForRoom(room)}
            </ul>
          )}

          {/* Furniture list for reference */}
          {room.furniture.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Items in Room</div>
              <div className="text-[10px] text-gray-600 space-y-0.5">
                {room.furniture.slice(0, 8).map((f, i) => (
                  <div key={i}>• {f.item.name}{f.quantity > 1 ? ` (×${f.quantity})` : ""}</div>
                ))}
                {room.furniture.length > 8 && <div>• +{room.furniture.length - 8} more (see Masterlist)</div>}
              </div>
            </div>
          )}
        </div>

        {/* Mini floor plan inset */}
        <div className="border border-gray-200 rounded bg-gray-50 aspect-square flex items-center justify-center overflow-hidden">
          {mainFloorPlan ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={mainFloorPlan} alt="" className="max-w-full max-h-full object-contain" />
          ) : (
            <div className="text-[10px] text-gray-400 text-center p-2">Floor plan reference</div>
          )}
        </div>
      </div>
    </div>
  );
}

function getDefaultTipsForRoom(room: Room) {
  const type = room.type;
  const tips: string[] = [];

  if (type === "living-room" || type === "den" || type === "media-room") {
    tips.push("Try to center the sofa, media center, and coffee table as much as possible on the rug as the rug is shown.");
    tips.push("Bend the branches out on any tree and plant on the table to make it look more realistic.");
  }
  if (type === "dining-room" || type === "kitchen") {
    tips.push("Feed cords through the wall where possible for clean lines.");
    tips.push("Center the dining table under any pendant fixture.");
  }
  if (type === "bedroom" || type === "primary-bedroom" || type === "loft") {
    tips.push("Lay throw blankets across the bed from back to front.");
    tips.push("Fluff pillows and karate-chop the top for a magazine look.");
  }
  if (type === "bathroom") {
    tips.push("Fold towels into thirds and stack on the vanity or rack.");
    tips.push("Place toiletries in matching containers to hide branded packaging.");
  }

  if (tips.length === 0) {
    tips.push("See the floor plan for exact placement.");
  }

  return tips.map((t, i) => (
    <li key={i}>• {t}</li>
  ));
}

// ── Simple inline SVG diagrams (print-safe, no external assets) ──

function CurtainDiagram({ variant }: { variant: "do" | "dont" }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-sm font-semibold mb-2">{variant === "do" ? "DO:" : "DON'T:"}</div>
      <svg viewBox="0 0 200 240" className="w-32 h-40">
        {/* Window */}
        <rect x={variant === "do" ? 60 : 70} y={variant === "do" ? 70 : 90} width={variant === "do" ? 80 : 60} height={variant === "do" ? 110 : 80} fill="none" stroke="#9ca3af" strokeWidth="2" />
        <line x1={variant === "do" ? 100 : 100} y1={variant === "do" ? 70 : 90} x2={variant === "do" ? 100 : 100} y2={variant === "do" ? 180 : 170} stroke="#9ca3af" strokeWidth="1" />
        <line x1={variant === "do" ? 60 : 70} y1={variant === "do" ? 125 : 130} x2={variant === "do" ? 140 : 130} y2={variant === "do" ? 125 : 130} stroke="#9ca3af" strokeWidth="1" />
        {/* Curtain rod */}
        <line x1={variant === "do" ? 30 : 70} y1={variant === "do" ? 50 : 80} x2={variant === "do" ? 170 : 130} y2={variant === "do" ? 50 : 80} stroke="#374151" strokeWidth="3" />
        {/* Curtain panels */}
        <rect x={variant === "do" ? 30 : 70} y={variant === "do" ? 50 : 80} width="30" height={variant === "do" ? 180 : 100} fill="#d1d5db" stroke="#9ca3af" strokeWidth="1" />
        <rect x={variant === "do" ? 140 : 100} y={variant === "do" ? 50 : 80} width="30" height={variant === "do" ? 180 : 100} fill="#d1d5db" stroke="#9ca3af" strokeWidth="1" />
        {variant === "dont" && (
          <>
            <line x1="40" y1="40" x2="160" y2="200" stroke="#ef4444" strokeWidth="4" />
            <line x1="160" y1="40" x2="40" y2="200" stroke="#ef4444" strokeWidth="4" />
          </>
        )}
      </svg>
    </div>
  );
}

function ArtDiagram({ variant }: { variant: "over-sofa" | "wall-group" }) {
  if (variant === "over-sofa") {
    return (
      <svg viewBox="0 0 240 180" className="w-40 h-32">
        {/* Art */}
        <rect x="70" y="10" width="100" height="60" fill="none" stroke="#374151" strokeWidth="2" />
        <rect x="85" y="20" width="70" height="40" fill="#f3f4f6" />
        {/* Measurement lines */}
        <text x="15" y="45" fontSize="8" fill="#6b7280">6&quot;</text>
        <text x="40" y="72" fontSize="8" fill="#6b7280">8&quot;</text>
        {/* Sofa */}
        <rect x="40" y="90" width="160" height="60" fill="none" stroke="#374151" strokeWidth="2" />
        <rect x="50" y="100" width="140" height="30" fill="#f3f4f6" />
        <line x1="120" y1="100" x2="120" y2="130" stroke="#374151" strokeWidth="1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 280 200" className="w-44 h-32">
      <rect x="0" y="0" width="280" height="200" fill="#dbeafe" />
      {/* Single piece */}
      <rect x="60" y="50" width="60" height="75" fill="#fff" stroke="#374151" strokeWidth="1.5" />
      <text x="85" y="40" fontSize="7" fill="#374151">Center</text>
      <line x1="90" y1="100" x2="90" y2="180" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />
      <text x="77" y="170" fontSize="7" fill="#374151">60&quot;</text>
      {/* Pair */}
      <rect x="170" y="30" width="40" height="50" fill="#fff" stroke="#374151" strokeWidth="1.5" />
      <rect x="170" y="88" width="40" height="50" fill="#fff" stroke="#374151" strokeWidth="1.5" />
      <text x="180" y="25" fontSize="7" fill="#374151">Center</text>
      <line x1="190" y1="113" x2="190" y2="180" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />
      <text x="177" y="170" fontSize="7" fill="#374151">60&quot;</text>
    </svg>
  );
}

function RugDiagram({ variant }: { variant: "sofa" | "bed" }) {
  if (variant === "sofa") {
    return (
      <svg viewBox="0 0 240 160" className="w-48 h-32 mx-auto">
        {/* Rug */}
        <rect x="20" y="30" width="200" height="110" fill="none" stroke="#374151" strokeWidth="2" />
        <rect x="25" y="35" width="190" height="100" fill="none" stroke="#374151" strokeWidth="1" />
        {/* Sofa */}
        <rect x="70" y="40" width="100" height="50" fill="none" stroke="#374151" strokeWidth="2" />
        <line x1="120" y1="40" x2="120" y2="90" stroke="#374151" strokeWidth="1" />
        {/* Chairs */}
        <rect x="30" y="80" width="35" height="35" fill="none" stroke="#374151" strokeWidth="2" />
        <rect x="175" y="80" width="35" height="35" fill="none" stroke="#374151" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 240 160" className="w-48 h-32 mx-auto">
      {/* Nightstands */}
      <rect x="55" y="20" width="25" height="25" fill="none" stroke="#374151" strokeWidth="2" />
      <rect x="160" y="20" width="25" height="25" fill="none" stroke="#374151" strokeWidth="2" />
      {/* Bed headboard */}
      <rect x="90" y="30" width="60" height="10" fill="none" stroke="#374151" strokeWidth="2" />
      {/* Bed body */}
      <rect x="90" y="40" width="60" height="70" fill="none" stroke="#374151" strokeWidth="2" />
      {/* Bed fold */}
      <polygon points="145,45 150,45 150,50" fill="#374151" />
      {/* Rug under bottom 2/3 */}
      <rect x="40" y="60" width="160" height="90" fill="none" stroke="#374151" strokeWidth="2" />
      <rect x="45" y="65" width="150" height="80" fill="none" stroke="#374151" strokeWidth="1" />
    </svg>
  );
}
