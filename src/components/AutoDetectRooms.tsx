"use client";

import { useState } from "react";
import { saveProject, getProject as getProjectFromStore, generateId, logActivity } from "@/lib/store";
import { detectRoomsFromImage, matchDetectedToExisting, type DetectedRoom, type RoomMatch } from "@/lib/floor-plan-ocr";
import { detectRoomsFromSvg, isSvgSource, readSvgText, type SvgDetectedRoom } from "@/lib/floor-plan-svg";
import { useToast } from "./Toast";
import type { Project, FloorPlan, Room, RoomType } from "@/lib/types";

interface Props {
  project: Project;
  plan: FloorPlan;
  onUpdate: () => void;
  onClose: () => void;
}

/**
 * Auto-detect rooms from a Matterport-style floor plan using OCR.
 * Extracts labels + dimensions from clearly typeset plans.
 * Designer reviews each detection, can edit before applying.
 * Falls back to manual annotation if OCR produces wrong results.
 */
export default function AutoDetectRooms({ project, plan, onUpdate, onClose }: Props) {
  const toast = useToast();
  const [phase, setPhase] = useState<"ready" | "scanning" | "review" | "error">("ready");
  const [progress, setProgress] = useState({ pct: 0, status: "" });
  const [detected, setDetected] = useState<DetectedRoom[]>([]);
  const [matches, setMatches] = useState<RoomMatch[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [sourceKind, setSourceKind] = useState<"svg" | "ocr">("ocr");
  const [replaceAll, setReplaceAll] = useState(false);

  async function runDetection() {
    if (plan.type !== "image") {
      toast.error("Can only auto-detect from image floor plans. Export your PDF as PNG (or SVG) first.");
      return;
    }

    setPhase("scanning");
    setProgress({ pct: 0, status: "Starting..." });

    try {
      // Matterport schematic SVG: parse text nodes directly — no OCR needed.
      // Way faster + exact, since SVG text isn't recognized, it's literal.
      const isSvg = isSvgSource(plan.url);
      setSourceKind(isSvg ? "svg" : "ocr");
      let rooms: DetectedRoom[];
      if (isSvg) {
        setProgress({ pct: 30, status: "Reading SVG text + dimensions..." });
        rooms = await detectRoomsFromSvg(plan.url);
        setProgress({ pct: 100, status: `Found ${rooms.length} rooms` });
      } else {
        rooms = await detectRoomsFromImage(plan.url, (pct, status) => {
          setProgress({ pct, status });
        });
      }

      if (rooms.length === 0) {
        setPhase("error");
        setErrorMsg(
          "Couldn't find any room labels + dimensions on this plan. " +
          "The OCR works best on Matterport-style plans with clear typeset text like 'BEDROOM 13'8\" x 11'7\"'. " +
          "Try: (1) a higher-res image, (2) a Matterport Floor Plan Service export, or (3) use manual annotation instead."
        );
        return;
      }

      setDetected(rooms);
      setMatches(matchDetectedToExisting(
        rooms,
        project.rooms.map(r => ({ id: r.id, name: r.name, type: r.type }))
      ));
      setPhase("review");
    } catch (err) {
      setPhase("error");
      setErrorMsg("OCR failed: " + (err instanceof Error ? err.message : "unknown error"));
    }
  }

  function updateMatchAction(idx: number, action: RoomMatch["action"]) {
    setMatches(prev => prev.map((m, i) => i === idx ? { ...m, action } : m));
  }

  function updateExistingRoomId(idx: number, roomId: string) {
    setMatches(prev => prev.map((m, i) => i === idx
      ? { ...m, existingRoomId: roomId || null, action: roomId ? "update" : "create" }
      : m
    ));
  }

  function updateDetectedField<K extends keyof DetectedRoom>(idx: number, field: K, value: DetectedRoom[K]) {
    setMatches(prev => prev.map((m, i) => i === idx
      ? { ...m, detected: { ...m.detected, [field]: value } }
      : m
    ));
  }

  async function applyChanges() {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;

    // If we ran the SVG path, persist the raw SVG once at the property level
    // so the Space Planner backdrop can crop it per-room.
    if (sourceKind === "svg") {
      try {
        const svgText = await readSvgText(plan.url);
        fresh.property.floorPlanSvgContent = svgText;
      } catch {
        // Non-fatal — we still apply the room dimensions.
      }
    }

    // Replace-all wipes existing rooms before creating any. Forces every
    // detected match to "create" so we don't try to update a room we just
    // deleted. This is the path Jeff uses when starting from a template
    // project that came pre-populated with template rooms.
    let removed = 0;
    if (replaceAll) {
      removed = fresh.rooms.length;
      fresh.rooms = [];
    }

    let created = 0;
    let updated = 0;

    for (const m of matches) {
      if (m.action === "skip") continue;
      const svgBBox = (m.detected as SvgDetectedRoom).svgBBox;
      // After replaceAll, no existing room can be a target — coerce to create.
      const action = replaceAll ? "create" : m.action;

      if (action === "update" && m.existingRoomId) {
        const room = fresh.rooms.find(r => r.id === m.existingRoomId);
        if (!room) continue;
        room.widthFt = m.detected.widthFt;
        room.lengthFt = m.detected.lengthFt;
        if (svgBBox) room.svgBBox = svgBBox;
        // Don't overwrite name if user has set one — but update type if still default
        if (room.type !== m.detected.guessedType) {
          // Leave existing type; OCR type is just a guess
        }
        updated++;
      } else if (action === "create") {
        const newRoom: Room = {
          id: generateId(),
          name: m.detected.label,
          type: m.detected.guessedType,
          widthFt: m.detected.widthFt,
          lengthFt: m.detected.lengthFt,
          ceilingHeightFt: 9,
          floor: 1,
          features: [],
          selectedBedConfig: null,
          furniture: [],
          accentWall: null,
          notes: "",
          ...(svgBBox ? { svgBBox } : {}),
        };
        fresh.rooms.push(newRoom);
        created++;
      }
    }

    saveProject(fresh);
    logActivity(project.id, "ocr_applied", `Auto-detect: ${created} created, ${updated} updated, ${removed} removed from plan`);
    toast.success(
      replaceAll
        ? `Replaced ${removed} old room${removed === 1 ? "" : "s"} with ${created} from the floor plan`
        : `Applied: ${created} new room${created === 1 ? "" : "s"}, ${updated} updated`
    );
    onUpdate();
    onClose();
  }

  /**
   * One-click "use this SVG as the source of truth": flip every match to
   * Create, turn on Replace All, then apply. Skips the per-row review step
   * because SVG text is exact (no recognition uncertainty).
   */
  function applyAsSourceOfTruth() {
    setReplaceAll(true);
    setMatches(prev => prev.map(m => ({ ...m, action: "create", existingRoomId: null })));
    // Defer apply to the next tick so the state changes flush first.
    setTimeout(() => applyChanges(), 0);
  }

  // ── Render ──

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-brand-900/10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-brand-900">🤖 Auto-Detect Rooms</h2>
              <p className="text-xs text-brand-600 mt-0.5">
                Plan: <span className="font-medium">{plan.name}</span>
              </p>
            </div>
            <button onClick={onClose} className="text-brand-600 hover:text-brand-900 text-xl leading-none">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {phase === "ready" && (() => {
            const isSvg = isSvgSource(plan.url);
            return (
              <div>
                <p className="text-sm text-brand-700 mb-3">
                  {isSvg ? (
                    <>Detected a <strong>Matterport SVG schematic</strong> — text + dimensions are vector elements, so we read them directly. Instant and exact.</>
                  ) : (
                    <>Reads room labels and dimensions directly off your floor plan using in-browser OCR. Works best on cleanly typeset plans (Matterport, architect exports).</>
                  )}
                </p>
                <div className="rounded-lg bg-brand-900/5 p-3 text-xs text-brand-700 mb-4">
                  <strong>What it does:</strong>
                  <ul className="list-disc list-inside space-y-0.5 mt-1">
                    <li>Finds labels like &quot;BEDROOM&quot;, &quot;KITCHEN&quot;, &quot;PRIMARY SUITE&quot;</li>
                    <li>Extracts dimensions like <code className="bg-white px-1 rounded">13&apos;8&quot; × 11&apos;7&quot;</code></li>
                    <li>Matches to your existing rooms (or creates new ones)</li>
                    <li>You review and edit before anything is saved</li>
                  </ul>
                </div>
                <p className="text-xs text-brand-600 mb-4">
                  🔒 Runs entirely in your browser. Nothing is uploaded to a server.
                  {!isSvg && <> May take 10-30 seconds on first run (loads OCR engine).</>}
                </p>
                <button onClick={runDetection} className="btn-primary w-full">
                  {isSvg ? "⚡ Parse SVG" : "🔍 Scan this Floor Plan"}
                </button>
                {!isSvg && (
                  <p className="text-[11px] text-brand-600/70 mt-3 text-center">
                    💡 Tip: a Matterport <strong>Schematic Floor Plan SVG export</strong> parses instantly and more accurately than a PNG.
                  </p>
                )}
              </div>
            );
          })()}

          {phase === "scanning" && (
            <div className="text-center py-8">
              <div className="text-5xl mb-3 animate-pulse">🔍</div>
              <h3 className="font-semibold text-brand-900 mb-1">{progress.status}</h3>
              <p className="text-xs text-brand-600 mb-4">First run takes longer (downloads OCR engine, ~4MB)</p>
              <div className="mx-auto max-w-sm h-2 rounded-full bg-brand-900/5 overflow-hidden">
                <div
                  className="h-full bg-amber transition-all"
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
              <div className="text-[10px] text-brand-600 mt-2">{Math.round(progress.pct)}%</div>
            </div>
          )}

          {phase === "error" && (
            <div>
              <div className="rounded-lg bg-red-50 border border-red-200 p-4 mb-4">
                <h3 className="font-semibold text-red-900 mb-1">Detection didn&apos;t find what we needed</h3>
                <p className="text-sm text-red-700">{errorMsg}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setPhase("ready")} className="btn-secondary btn-sm">
                  Try Again
                </button>
                <button onClick={onClose} className="btn-primary btn-sm">
                  Close &amp; Annotate Manually
                </button>
              </div>
            </div>
          )}

          {phase === "review" && (() => {
            // Sniff for the classic OCR failure mode where every detected room
            // has the same dimensions — usually means OCR lifted one stamped
            // dimension from the page and stuck it on every label.
            const dimKeys = detected.map(d => `${Math.round(d.widthFt * 10)}-${Math.round(d.lengthFt * 10)}`);
            const allSame = detected.length > 1 && dimKeys.every(k => k === dimKeys[0]);
            return (
            <div>
              <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="font-semibold text-emerald-900 text-sm">
                    Found {detected.length} room{detected.length === 1 ? "" : "s"}
                  </div>
                  <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                    sourceKind === "svg" ? "bg-emerald-600 text-white" : "bg-amber-200 text-amber-900"
                  }`}>
                    {sourceKind === "svg" ? "⚡ SVG · exact" : "🔍 OCR · approximate"}
                  </span>
                </div>
                <p className="text-xs text-emerald-800">
                  Review each below. Toggle Update/Create/Skip. Edit the label or dimensions if {sourceKind === "svg" ? "anything looks wrong" : "OCR got them wrong"}.
                </p>
              </div>

              {allSame && sourceKind === "ocr" && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                  <div className="font-semibold text-red-900 text-sm mb-1">⚠ Every room has the same dimensions</div>
                  <p className="text-xs text-red-800">
                    OCR likely picked up one stamped dimension on the page and pasted it onto every label.
                    The fix: in Matterport, click <strong>Export → Schematic Floor Plan → SVG</strong>, then upload
                    the .svg file. SVG text is parsed directly with no recognition errors. You can also fix the
                    dimensions inline below before applying.
                  </p>
                </div>
              )}

              {/* Big primary action when SVG path AND project has existing rooms.
                  Designer overwhelmingly wants "wipe template, use SVG". Make
                  that a one-click action they can't miss. */}
              {sourceKind === "svg" && project.rooms.length > 0 && !replaceAll && (
                <div className="mb-4 rounded-lg bg-amber/15 border-2 border-amber px-4 py-3">
                  <div className="font-semibold text-brand-900 text-sm mb-1">
                    💡 Make this SVG the source of truth
                  </div>
                  <p className="text-xs text-brand-700 mb-3">
                    This project already has {project.rooms.length} room{project.rooms.length === 1 ? "" : "s"} from
                    a template. Replace them all with the {detected.length} room{detected.length === 1 ? "" : "s"}
                    {" "}from your SVG in one click — no per-row review needed since SVG text is exact.
                  </p>
                  <button
                    onClick={applyAsSourceOfTruth}
                    className="w-full rounded-lg bg-amber px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-dark"
                  >
                    ⚡ Replace all rooms with this SVG
                  </button>
                </div>
              )}

              <div className="space-y-2 mb-4">
                {matches.map((m, idx) => (
                  <RoomMatchCard
                    key={idx}
                    match={m}
                    existingRooms={project.rooms}
                    onActionChange={(a) => updateMatchAction(idx, a)}
                    onExistingChange={(id) => updateExistingRoomId(idx, id)}
                    onLabelChange={(label) => updateDetectedField(idx, "label", label)}
                    onWidthChange={(v) => updateDetectedField(idx, "widthFt", v)}
                    onLengthChange={(v) => updateDetectedField(idx, "lengthFt", v)}
                    onTypeChange={(t) => updateDetectedField(idx, "guessedType", t)}
                  />
                ))}
              </div>

              {/* Replace-all option — wipes existing rooms before applying */}
              <label className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-900 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={replaceAll}
                  onChange={e => setReplaceAll(e.target.checked)}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-semibold">Replace all existing rooms</div>
                  <div className="text-[11px] text-red-800 mt-0.5">
                    Deletes the {project.rooms.length} room{project.rooms.length === 1 ? "" : "s"} currently in this project (including any leftover template rooms) and creates fresh ones from the floor plan. Furniture in deleted rooms is also removed.
                  </div>
                </div>
              </label>

              <div className="rounded-lg bg-amber/10 border border-amber/30 px-3 py-2 text-xs text-brand-700 mb-4">
                <strong>Didn&apos;t find a room?</strong> Close this dialog and use the manual{" "}
                <strong>📐 Annotate Floor Plan</strong> tool to click-drag rooms onto the plan.
              </div>
            </div>
            );
          })()}
        </div>

        {/* Footer */}
        {phase === "review" && (
          <div className="px-6 py-4 border-t border-brand-900/10 flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-brand-600">
              {replaceAll ? (
                <span className="text-red-700 font-semibold">
                  ⚠ Will delete {project.rooms.length} existing room{project.rooms.length === 1 ? "" : "s"}, then create {matches.filter(m => m.action !== "skip").length}
                </span>
              ) : (
                <>
                  {matches.filter(m => m.action === "create").length} to create ·{" "}
                  {matches.filter(m => m.action === "update").length} to update ·{" "}
                  {matches.filter(m => m.action === "skip").length} to skip
                </>
              )}
            </div>
            <div className="flex gap-2 items-center">
              {sourceKind === "svg" && project.rooms.length > 0 && !replaceAll && (
                <button
                  onClick={applyAsSourceOfTruth}
                  className="text-xs text-amber-dark hover:underline font-medium"
                  title="Wipe existing rooms and use this SVG as the single source of truth"
                >
                  ⚡ Use SVG as source of truth
                </button>
              )}
              <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
              <button onClick={applyChanges} className={replaceAll ? "btn-sm bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded font-medium" : "btn-primary btn-sm"}>
                {replaceAll ? "Replace All Rooms" : "Apply Changes"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Single row card ──

const ALL_TYPES: RoomType[] = [
  "primary-bedroom", "bedroom", "loft", "bonus-room",
  "living-room", "dining-room", "kitchen", "den", "office",
  "game-room", "media-room", "bathroom", "hallway", "outdoor",
];

function RoomMatchCard({
  match,
  existingRooms,
  onActionChange,
  onExistingChange,
  onLabelChange,
  onWidthChange,
  onLengthChange,
  onTypeChange,
}: {
  match: RoomMatch;
  existingRooms: Room[];
  onActionChange: (a: RoomMatch["action"]) => void;
  onExistingChange: (id: string) => void;
  onLabelChange: (s: string) => void;
  onWidthChange: (v: number) => void;
  onLengthChange: (v: number) => void;
  onTypeChange: (t: RoomType) => void;
}) {
  const isLowConfidence = match.detected.confidence < 0.6;
  return (
    <div className={`rounded-lg border p-3 ${
      match.action === "skip"
        ? "border-brand-900/10 bg-brand-900/5 opacity-60"
        : match.action === "update"
          ? "border-blue-200 bg-blue-50"
          : "border-emerald-200 bg-emerald-50"
    }`}>
      <div className="flex items-start gap-3">
        {/* Action toggle */}
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => onActionChange(match.existingRoomId ? "update" : "create")}
            className={`text-[10px] px-2 py-1 rounded font-semibold ${
              match.action !== "skip" ? "bg-brand-900 text-white" : "bg-white text-brand-600 border border-brand-900/10"
            }`}
          >
            {match.existingRoomId ? "UPDATE" : "CREATE"}
          </button>
          <button
            onClick={() => onActionChange("skip")}
            className={`text-[10px] px-2 py-1 rounded font-semibold ${
              match.action === "skip" ? "bg-brand-900 text-white" : "bg-white text-brand-600 border border-brand-900/10"
            }`}
          >
            SKIP
          </button>
        </div>

        {/* Editable fields */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2">
          <div className="sm:col-span-2">
            <input
              className="input text-sm"
              value={match.detected.label}
              onChange={e => onLabelChange(e.target.value)}
            />
            <div className="text-[9px] text-brand-600/70 mt-0.5 truncate font-mono">
              OCR: &quot;{match.detected.rawText}&quot;
              {isLowConfidence && <span className="ml-2 text-amber-dark">⚠ low confidence</span>}
            </div>
          </div>
          <div>
            <input
              type="number"
              step="0.1"
              className="input text-sm"
              value={match.detected.widthFt}
              onChange={e => onWidthChange(parseFloat(e.target.value) || 0)}
            />
            <div className="text-[9px] text-brand-600/70 mt-0.5">Width (ft)</div>
          </div>
          <div>
            <input
              type="number"
              step="0.1"
              className="input text-sm"
              value={match.detected.lengthFt}
              onChange={e => onLengthChange(parseFloat(e.target.value) || 0)}
            />
            <div className="text-[9px] text-brand-600/70 mt-0.5">Length (ft)</div>
          </div>
        </div>
      </div>

      {/* Existing-room picker for updates */}
      {match.action !== "skip" && existingRooms.length > 0 && (
        <div className="mt-2 pt-2 border-t border-current/10 flex items-center gap-2">
          <span className="text-[10px] text-brand-600">Target:</span>
          <select
            className="select text-xs flex-1"
            value={match.existingRoomId ?? ""}
            onChange={e => onExistingChange(e.target.value)}
          >
            <option value="">➕ Create new room</option>
            {existingRooms.map(r => (
              <option key={r.id} value={r.id}>
                Update: {r.name} ({r.widthFt}&apos; × {r.lengthFt}&apos;)
              </option>
            ))}
          </select>
          <select
            className="select text-xs w-auto"
            value={match.detected.guessedType}
            onChange={e => onTypeChange(e.target.value as RoomType)}
          >
            {ALL_TYPES.map(t => (
              <option key={t} value={t}>{t.replace(/-/g, " ")}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

