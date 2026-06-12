"use client";

import { useState } from "react";
import FloorPlanAnnotator from "@/components/FloorPlanAnnotator";
import { getProject, saveProject, generateId } from "@/lib/store";
import { getConfigsForRoom, optimizeSleeping } from "@/lib/sleep-optimizer";
import type { Project, Room, RoomType } from "@/lib/types";
import { StepHeading, StepFooter, StepNotice } from "./StepShell";

interface Props {
  project: Project;
  onUpdate: () => void;
  onComplete: () => void;
  onBack: () => void;
  advanced: boolean;
}

const BEDROOM_TYPES = new Set<RoomType>(["primary-bedroom", "bedroom", "loft", "bonus-room"]);

/** Types that count against the listing's bedroom number for the sanity
 *  check (lofts/bonus rooms don't — listings don't count those as bedrooms). */
const LISTED_BEDROOM_TYPES = new Set<RoomType>(["primary-bedroom", "bedroom"]);

const TYPE_OPTIONS: { value: RoomType; label: string }[] = [
  { value: "primary-bedroom", label: "Primary bedroom" },
  { value: "bedroom", label: "Bedroom" },
  { value: "bathroom", label: "Bathroom" },
  { value: "living-room", label: "Living room" },
  { value: "kitchen", label: "Kitchen" },
  { value: "dining-room", label: "Dining room" },
  { value: "loft", label: "Loft" },
  { value: "den", label: "Den" },
  { value: "office", label: "Office" },
  { value: "bonus-room", label: "Bonus room" },
  { value: "game-room", label: "Game room" },
  { value: "media-room", label: "Media room" },
  { value: "outdoor", label: "Outdoor" },
  { value: "laundry", label: "Laundry" },
  { value: "hallway", label: "Hallway" },
  { value: "storage", label: "Storage" },
  { value: "closet", label: "Closet" },
];

export default function StepConfirmRooms({ project, onUpdate, onComplete, onBack, advanced }: Props) {
  const [showAnnotator, setShowAnnotator] = useState(false);
  const [redetecting, setRedetecting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /** Room currently hovered/focused in the list (or hovered on the plan) —
   *  drives the amber highlight on its plan outline so the designer can
   *  visually confirm "this row = this room on the plan". */
  const [highlightedRoomId, setHighlightedRoomId] = useState<string | null>(null);
  const rooms = project.rooms;

  // ── Plan side-panel: the primary plan, else the most recent image plan ──
  const plans = project.property.floorPlans ?? [];
  const panelPlan =
    plans.find(p => p.isPrimary && p.type !== "link") ??
    [...plans]
      .filter(p => p.type === "image")
      .sort((a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || ""))[0] ??
    null;
  const annotatedRooms =
    panelPlan && panelPlan.type === "image"
      ? rooms.filter(r => r.annotation?.floorPlanId === panelPlan.id)
      : [];

  // ── Sanity check: detected bed/bath counts vs what the listing says ──
  const listedBeds = project.property.bedrooms || 0;
  const listedBaths = project.property.bathrooms || 0;
  const foundBeds = rooms.filter(r => LISTED_BEDROOM_TYPES.has(r.type)).length;
  const foundBaths = rooms.filter(r => r.type === "bathroom").length;
  const countWarnings: string[] = [];
  if (rooms.length > 0) {
    if (listedBeds > 0 && foundBeds !== listedBeds) {
      countWarnings.push(
        foundBeds > listedBeds
          ? `the listing says ${listedBeds} bedroom${listedBeds === 1 ? "" : "s"} but we detected ${foundBeds} — remove the extra room or tap it to check it on the plan.`
          : `the listing says ${listedBeds} bedroom${listedBeds === 1 ? "" : "s"} but we only detected ${foundBeds} — add the missing room, or check if one got the wrong type.`
      );
    }
    // Half-baths are common ("2.5 baths"), so only flag counts that fall
    // outside the floor..ceil range of the listed number.
    if (listedBaths > 0 && (foundBaths < Math.floor(listedBaths) || foundBaths > Math.ceil(listedBaths))) {
      countWarnings.push(
        foundBaths > listedBaths
          ? `the listing says ${listedBaths} bathroom${listedBaths === 1 ? "" : "s"} but we detected ${foundBaths} — remove the extra room or tap it to check it on the plan.`
          : `the listing says ${listedBaths} bathroom${listedBaths === 1 ? "" : "s"} but we only detected ${foundBaths} — add the missing room, or check if one got the wrong type.`
      );
    }
  }

  function mutate(fn: (p: Project) => void) {
    const fresh = getProject(project.id);
    if (!fresh) return;
    fn(fresh);
    saveProject(fresh);
    onUpdate();
  }

  function updateRoom(roomId: string, patch: Partial<Room>) {
    mutate(p => {
      const r = p.rooms.find(r => r.id === roomId);
      if (r) Object.assign(r, patch);
    });
  }

  function removeRoom(roomId: string) {
    mutate(p => { p.rooms = p.rooms.filter(r => r.id !== roomId); });
  }

  function addRoom() {
    mutate(p => {
      p.rooms.push({
        id: generateId(),
        name: `Bedroom ${p.rooms.filter(r => BEDROOM_TYPES.has(r.type)).length + 1}`,
        type: "bedroom",
        widthFt: 12,
        lengthFt: 12,
        ceilingHeightFt: 9,
        floor: 1,
        features: [],
        selectedBedConfig: null,
        furniture: [],
        accentWall: null,
        notes: "",
      });
    });
  }

  /** Advanced: re-run AI detection against the primary floor plan. */
  async function redetect() {
    const plans = project.property.floorPlans ?? [];
    const plan = plans.find(p => p.isPrimary && p.type !== "link") ?? plans.find(p => p.type === "image") ?? plans.find(p => p.type === "pdf");
    if (!plan) {
      setNote("No floor plan to detect from — upload one in the previous step first.");
      return;
    }
    setRedetecting(true);
    setNote(null);
    try {
      const res = await fetch("/api/extract-floorplan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: plan.url }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok || !result.rooms?.length) {
        setNote("We couldn't read rooms off the plan this time. Your current room list is untouched.");
        return;
      }
      const M_TO_FT = 3.28084;
      mutate(p => {
        p.rooms = (result.rooms as Array<{ name: string; type: string; widthM: number; lengthM: number; floor: number; bboxPct?: { x: number; y: number; width: number; height: number } }>).map(r => ({
          id: generateId(),
          name: r.name,
          type: (TYPE_OPTIONS.some(t => t.value === r.type) ? r.type : "bedroom") as RoomType,
          widthFt: Math.round(r.widthM * M_TO_FT * 10) / 10,
          lengthFt: Math.round(r.lengthM * M_TO_FT * 10) / 10,
          ceilingHeightFt: 9,
          floor: r.floor || 1,
          features: [],
          selectedBedConfig: null,
          furniture: [],
          accentWall: null,
          notes: "",
          ...(r.bboxPct && plan.type === "image" ? { annotation: { floorPlanId: plan.id, ...r.bboxPct } } : {}),
        }));
      });
      setNote(`Re-detected ${result.rooms.length} rooms from the plan. The old list was replaced.`);
    } catch {
      setNote("Detection hit a snag. Your current room list is untouched — you can keep editing it by hand.");
    } finally {
      setRedetecting(false);
    }
  }

  function confirmRooms() {
    // Auto-assign a sensible bed setup to any bedroom that doesn't have one
    // yet, so the designer never has to think about bunk math unless they
    // want to (the picker lives behind Advanced).
    mutate(p => {
      const needsBeds = p.rooms.some(r => BEDROOM_TYPES.has(r.type) && !r.selectedBedConfig);
      if (!needsBeds) return;
      const result = optimizeSleeping(p.rooms, p.targetGuests || 8);
      for (const rr of result.roomResults) {
        const room = p.rooms.find(r => r.id === rr.roomId);
        if (room && BEDROOM_TYPES.has(room.type) && !room.selectedBedConfig && rr.recommended.totalSleeps > 0) {
          room.selectedBedConfig = rr.recommended;
        }
      }
    });
    onComplete();
  }

  const typeLabel = (t: RoomType) => TYPE_OPTIONS.find(o => o.value === t)?.label ?? t.replace(/-/g, " ");

  return (
    <div>
      <StepHeading
        title={rooms.length > 0 ? `We found ${rooms.length} room${rooms.length === 1 ? "" : "s"} — do these look right?` : "Add your rooms"}
        subtitle={rooms.length > 0
          ? "Rename anything, fix the sizes, and remove what doesn't belong. You can always come back."
          : "List the rooms you're designing. A name and rough size is all we need."}
      />

      <div className="space-y-4">
        {countWarnings.length > 0 && (
          <StepNotice tone="warn">Heads up: {countWarnings.join(" Also, ")}</StepNotice>
        )}
        {note && <StepNotice tone="info">{note}</StepNotice>}

        {/* Plan panel sits to the right on wide screens, on top on narrow
            ones, so the designer can verify the list against the plan.
            Without a plan, the list keeps its full width. */}
        <div className={panelPlan ? "flex flex-col-reverse gap-4 lg:flex-row lg:items-start" : undefined}>
        <div className={panelPlan ? "flex-1 min-w-0" : undefined}>
        <div className="card">
          {rooms.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">🛋️</div>
              <p className="text-sm text-brand-600">No rooms yet.</p>
              <button onClick={addRoom} className="mt-3 btn-accent btn-sm">+ Add your first room</button>
            </div>
          ) : (
            <div className="space-y-2">
              {rooms.map(room => (
                <div
                  key={room.id}
                  onMouseEnter={() => setHighlightedRoomId(room.id)}
                  onMouseLeave={() => setHighlightedRoomId(prev => (prev === room.id ? null : prev))}
                  onFocus={() => setHighlightedRoomId(room.id)}
                  onBlur={() => setHighlightedRoomId(prev => (prev === room.id ? null : prev))}
                  onClick={() => setHighlightedRoomId(room.id)}
                  className={`flex items-center gap-3 rounded-lg border px-3 sm:px-4 py-2.5 group flex-wrap sm:flex-nowrap transition-colors ${
                    highlightedRoomId === room.id ? "border-amber/60 bg-amber/5" : "border-brand-900/10"
                  }`}
                >
                  <input
                    className="flex-1 min-w-[120px] text-sm font-medium text-brand-900 bg-transparent border-none outline-none focus:ring-0 p-0"
                    defaultValue={room.name}
                    key={`name-${room.id}`}
                    onBlur={e => {
                      const v = e.target.value.trim();
                      if (v && v !== room.name) updateRoom(room.id, { name: v });
                      else e.target.value = room.name;
                    }}
                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  />

                  {/* Dimensions (ft) */}
                  <div className="flex items-center gap-1 text-[11px] text-brand-600 shrink-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-12 text-center bg-brand-900/5 rounded px-1 py-0.5 border-none outline-none focus:ring-1 focus:ring-amber/40"
                      defaultValue={room.widthFt}
                      key={`w-${room.id}-${room.widthFt}`}
                      onBlur={e => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) && v > 0) updateRoom(room.id, { widthFt: v });
                        else e.target.value = String(room.widthFt);
                      }}
                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    />
                    <span>&times;</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-12 text-center bg-brand-900/5 rounded px-1 py-0.5 border-none outline-none focus:ring-1 focus:ring-amber/40"
                      defaultValue={room.lengthFt}
                      key={`l-${room.id}-${room.lengthFt}`}
                      onBlur={e => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) && v > 0) updateRoom(room.id, { lengthFt: v });
                        else e.target.value = String(room.lengthFt);
                      }}
                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    />
                    <span className="text-[9px] text-brand-600/50">ft</span>
                  </div>

                  {/* Type pill (select styled as a pill) */}
                  <select
                    className="text-[10px] font-medium rounded-full bg-brand-900/5 text-brand-700 px-2.5 py-1 border-none outline-none cursor-pointer shrink-0 appearance-none"
                    value={room.type}
                    onChange={e => updateRoom(room.id, { type: e.target.value as RoomType, selectedBedConfig: null })}
                  >
                    {TYPE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>

                  {/* Advanced: bed setup picker for bedrooms */}
                  {advanced && BEDROOM_TYPES.has(room.type) && (
                    <select
                      className="text-[10px] text-brand-600 bg-amber/10 rounded px-1.5 py-1 border-none outline-none cursor-pointer shrink-0 max-w-[140px]"
                      value={room.selectedBedConfig?.id ?? ""}
                      onChange={e => {
                        const cfg = getConfigsForRoom(room).find(c => c.id === e.target.value) ?? null;
                        updateRoom(room.id, { selectedBedConfig: cfg });
                      }}
                      title="Bed setup"
                    >
                      <option value="">Beds: auto</option>
                      {getConfigsForRoom(room).map(c => (
                        <option key={c.id} value={c.id}>{c.name} (sleeps {c.totalSleeps})</option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={() => removeRoom(room.id)}
                    className="text-red-400/0 group-hover:text-red-400 hover:!text-red-600 transition text-sm shrink-0"
                    title={`Remove ${room.name}`}
                  >
                    &#x2715;
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
            {rooms.length > 0 ? (
              <button onClick={addRoom} className="text-xs text-amber-dark hover:text-brand-900 font-medium transition">
                + Add a room
              </button>
            ) : <span />}

            {advanced && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => void redetect()}
                  disabled={redetecting}
                  className="text-xs text-brand-600 hover:text-brand-900 underline decoration-brand-900/20 transition disabled:opacity-50"
                >
                  {redetecting ? "Re-detecting…" : "Re-detect from floor plan"}
                </button>
                <button
                  onClick={() => setShowAnnotator(true)}
                  className="text-xs text-brand-600 hover:text-brand-900 underline decoration-brand-900/20 transition"
                >
                  Open floor-plan annotator
                </button>
              </div>
            )}
          </div>
        </div>
        </div>

        {panelPlan && (
          <div className="lg:w-[340px] xl:w-[400px] shrink-0 lg:sticky lg:top-4">
            <div className="card">
              <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-2">
                Check against the plan
              </div>
              {panelPlan.type === "image" ? (
                <>
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={panelPlan.url}
                      alt={panelPlan.name}
                      className="w-full rounded-lg border border-brand-900/10 bg-white"
                      draggable={false}
                    />
                    {annotatedRooms.map(room => {
                      const ann = room.annotation!;
                      const hot = highlightedRoomId === room.id;
                      return (
                        <div
                          key={room.id}
                          onMouseEnter={() => setHighlightedRoomId(room.id)}
                          onMouseLeave={() => setHighlightedRoomId(prev => (prev === room.id ? null : prev))}
                          className={`absolute rounded border-2 transition-colors ${
                            hot ? "border-amber bg-amber/20 z-10" : "border-brand-900/25"
                          }`}
                          style={{
                            left: `${ann.x}%`,
                            top: `${ann.y}%`,
                            width: `${ann.width}%`,
                            height: `${ann.height}%`,
                          }}
                          title={`${room.name} · ${room.widthFt}' × ${room.lengthFt}'`}
                        >
                          <span
                            className={`absolute left-0 top-0 max-w-full truncate rounded-br px-1 py-px text-[9px] font-medium leading-snug ${
                              hot ? "bg-amber text-white" : "bg-white/85 text-brand-700"
                            }`}
                          >
                            {room.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-brand-600/60 mt-2">
                    {annotatedRooms.length > 0
                      ? "Hover or tap a room in the list to see where it sits on the plan."
                      : "Use the plan to double-check the room list looks right."}
                  </p>
                </>
              ) : (
                <div className="rounded-xl border border-brand-900/10 bg-brand-900/5 p-4 text-center">
                  <p className="text-sm text-brand-700 mb-2">PDF plan — open it side by side</p>
                  <a
                    href={panelPlan.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-amber-dark hover:underline"
                  >
                    Open {panelPlan.name}.pdf &rarr;
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>

      {showAnnotator && (
        <FloorPlanAnnotator
          project={project}
          onUpdate={onUpdate}
          onClose={() => setShowAnnotator(false)}
        />
      )}

      <StepFooter
        primaryLabel="Looks good"
        onPrimary={confirmRooms}
        primaryDisabled={rooms.length === 0}
        disabledReason="Add at least one room to keep going."
        onBack={onBack}
      />
    </div>
  );
}
