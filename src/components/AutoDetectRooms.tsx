"use client";

import { useState } from "react";
import { saveProject, getProject as getProjectFromStore, generateId, logActivity } from "@/lib/store";
import { detectRoomsFromImage, matchDetectedToExisting, type DetectedRoom, type RoomMatch } from "@/lib/floor-plan-ocr";
import { detectRoomsFromSvg, isSvgSource } from "@/lib/floor-plan-svg";
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

  function applyChanges() {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;

    let created = 0;
    let updated = 0;

    for (const m of matches) {
      if (m.action === "skip") continue;

      if (m.action === "update" && m.existingRoomId) {
        const room = fresh.rooms.find(r => r.id === m.existingRoomId);
        if (!room) continue;
        room.widthFt = m.detected.widthFt;
        room.lengthFt = m.detected.lengthFt;
        // Don't overwrite name if user has set one — but update type if still default
        if (room.type !== m.detected.guessedType) {
          // Leave existing type; OCR type is just a guess
        }
        updated++;
      } else if (m.action === "create") {
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
          // No annotation here — designer can spatially pin via manual
          // annotator if they want. Auto-detect prioritizes name + dims.
        };
        fresh.rooms.push(newRoom);
        created++;
      }
    }

    saveProject(fresh);
    logActivity(project.id, "ocr_applied", `Auto-detect: ${created} created, ${updated} updated from plan`);
    toast.success(
      `Applied: ${created} new room${created === 1 ? "" : "s"}, ${updated} updated`
    );
    onUpdate();
    onClose();
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

          {phase === "review" && (
            <div>
              <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
                <div className="font-semibold text-emerald-900 text-sm mb-0.5">
                  Found {detected.length} room{detected.length === 1 ? "" : "s"}
                </div>
                <p className="text-xs text-emerald-800">
                  Review each below. Toggle Update/Create/Skip. Edit the label or dimensions if OCR got them wrong.
                </p>
              </div>

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

              <div className="rounded-lg bg-amber/10 border border-amber/30 px-3 py-2 text-xs text-brand-700 mb-4">
                <strong>Didn&apos;t find a room?</strong> Close this dialog and use the manual{" "}
                <strong>📐 Annotate Floor Plan</strong> tool to click-drag rooms onto the plan.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === "review" && (
          <div className="px-6 py-4 border-t border-brand-900/10 flex items-center justify-between">
            <div className="text-xs text-brand-600">
              {matches.filter(m => m.action === "create").length} to create ·{" "}
              {matches.filter(m => m.action === "update").length} to update ·{" "}
              {matches.filter(m => m.action === "skip").length} to skip
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
              <button onClick={applyChanges} className="btn-primary btn-sm">
                Apply Changes
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

