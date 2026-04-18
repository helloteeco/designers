"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { saveProject, getProject, logActivity } from "@/lib/store";
import { buildSmartLabels, findDuplicateNames } from "@/lib/smart-label";
import type { Project, Room, RoomType } from "@/lib/types";

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: "primary-bedroom", label: "Primary Bedroom" },
  { value: "bedroom", label: "Bedroom" },
  { value: "living-room", label: "Living Room" },
  { value: "dining-room", label: "Dining Room" },
  { value: "kitchen", label: "Kitchen" },
  { value: "bathroom", label: "Bathroom" },
  { value: "closet", label: "Closet" },
  { value: "hallway", label: "Hallway" },
  { value: "laundry", label: "Laundry" },
  { value: "storage", label: "Storage" },
  { value: "office", label: "Office" },
  { value: "den", label: "Den" },
  { value: "loft", label: "Loft" },
  { value: "bonus-room", label: "Bonus Room" },
  { value: "media-room", label: "Media Room" },
  { value: "game-room", label: "Game Room" },
  { value: "outdoor", label: "Outdoor" },
];

interface Props {
  project: Project;
  onUpdate: () => void;
  onClose: () => void;
}

type Draft = {
  id: string;
  name: string;
  type: RoomType;
};

export default function RoomLabeler({ project, onUpdate, onClose }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>(
    () =>
      project.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
      }))
  );
  const [showReasons, setShowReasons] = useState(false);
  const suggestions = useMemo(() => buildSmartLabels(project.rooms), [project.rooms]);
  const duplicates = useMemo(() => {
    const pseudoRooms = drafts.map((d) => ({ ...d } as unknown as Room));
    return findDuplicateNames(pseudoRooms);
  }, [drafts]);

  const firstInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    firstInputRef.current?.focus();
    firstInputRef.current?.select();
  }, []);

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function applySuggestion(id: string) {
    const s = suggestions.get(id);
    if (!s) return;
    updateDraft(id, { name: s.name, type: s.type });
  }

  function applyAllSuggestions() {
    setDrafts((prev) =>
      prev.map((d) => {
        const s = suggestions.get(d.id);
        if (!s) return d;
        return { ...d, name: s.name, type: s.type };
      })
    );
  }

  function handleSave() {
    const fresh = getProject(project.id);
    if (!fresh) return;
    let renameCount = 0;
    drafts.forEach((d) => {
      const existing = fresh.rooms.find((r) => r.id === d.id);
      if (!existing) return;
      const name = d.name.trim();
      if (!name) return;
      if (existing.name !== name || existing.type !== d.type) renameCount += 1;
      existing.name = name;
      existing.type = d.type;
    });
    saveProject(fresh);
    if (renameCount > 0) {
      logActivity(
        project.id,
        "room_updated",
        `Labeled ${renameCount} room${renameCount === 1 ? "" : "s"}`
      );
    }
    onUpdate();
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent, roomId: string) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Move to next row's name input
      const idx = drafts.findIndex((d) => d.id === roomId);
      const nextId = drafts[idx + 1]?.id;
      if (nextId) {
        const nextInput = document.querySelector<HTMLInputElement>(
          `[data-room-name="${nextId}"]`
        );
        nextInput?.focus();
        nextInput?.select();
      } else {
        handleSave();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  // Group by floor for clarity
  const floors = Array.from(new Set(project.rooms.map((r) => r.floor))).sort(
    (a, b) => a - b
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-6 border-b border-brand-900/10">
          <div>
            <h2 className="text-lg font-semibold">Label Rooms</h2>
            <p className="text-sm text-brand-600 mt-1">
              {project.rooms.length} rooms detected. Rename in one pass — Tab/Enter to move down.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReasons((v) => !v)}
              className="btn-secondary btn-sm"
              title="Show/hide suggestion reasoning"
            >
              {showReasons ? "Hide" : "Show"} reasons
            </button>
            <button onClick={applyAllSuggestions} className="btn-accent btn-sm">
              ✨ Smart-Label All
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {floors.map((floor) => {
            const floorDrafts = drafts.filter((d) => {
              const r = project.rooms.find((x) => x.id === d.id);
              return r?.floor === floor;
            });
            return (
              <div key={floor} className="mb-6 last:mb-0">
                {floors.length > 1 && (
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-2">
                    Floor {floor}
                  </h3>
                )}
                <div className="overflow-hidden rounded-lg border border-brand-900/10">
                  <table className="w-full text-sm">
                    <thead className="bg-brand-900/5 text-xs uppercase tracking-wider text-brand-600">
                      <tr>
                        <th className="px-3 py-2 text-left w-[40%]">Name</th>
                        <th className="px-3 py-2 text-left w-[22%]">Type</th>
                        <th className="px-3 py-2 text-left w-[18%]">Size</th>
                        <th className="px-3 py-2 text-left w-[20%]">Suggest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {floorDrafts.map((d, rowIdx) => {
                        const room = project.rooms.find((r) => r.id === d.id);
                        if (!room) return null;
                        const suggestion = suggestions.get(d.id);
                        const isDup = duplicates.has(d.id);
                        const matchesSuggestion =
                          suggestion &&
                          d.name.trim().toLowerCase() === suggestion.name.toLowerCase() &&
                          d.type === suggestion.type;
                        const isFirstRow = rowIdx === 0 && floor === floors[0];
                        return (
                          <tr
                            key={d.id}
                            className="border-t border-brand-900/10 hover:bg-amber/5"
                          >
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <input
                                  ref={isFirstRow ? firstInputRef : undefined}
                                  data-room-name={d.id}
                                  className={`input text-sm py-1.5 ${
                                    isDup ? "ring-1 ring-red-400" : ""
                                  }`}
                                  value={d.name}
                                  onChange={(e) => updateDraft(d.id, { name: e.target.value })}
                                  onKeyDown={(e) => handleKeyDown(e, d.id)}
                                  placeholder="Room name"
                                />
                                {isDup && (
                                  <span
                                    className="text-[10px] text-red-500"
                                    title="Another room has the same name"
                                  >
                                    dup
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <select
                                className="select text-xs py-1.5"
                                value={d.type}
                                onChange={(e) =>
                                  updateDraft(d.id, { type: e.target.value as RoomType })
                                }
                              >
                                {ROOM_TYPES.map((rt) => (
                                  <option key={rt.value} value={rt.value}>
                                    {rt.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-brand-600 text-xs">
                              {room.widthFt.toFixed(1)}&apos; × {room.lengthFt.toFixed(1)}&apos;
                              <span className="text-brand-500 ml-1">
                                ({(room.widthFt * room.lengthFt).toFixed(0)} sqft)
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              {suggestion && !matchesSuggestion ? (
                                <button
                                  onClick={() => applySuggestion(d.id)}
                                  className="text-xs text-amber-dark hover:text-amber bg-amber/10 hover:bg-amber/20 px-2 py-1 rounded transition text-left w-full"
                                  title={showReasons ? undefined : suggestion.reason}
                                >
                                  <div className="font-medium truncate">{suggestion.name}</div>
                                  {showReasons && (
                                    <div className="text-[10px] text-brand-500 mt-0.5 truncate">
                                      {suggestion.reason}
                                    </div>
                                  )}
                                </button>
                              ) : matchesSuggestion ? (
                                <span className="text-xs text-emerald-600">✓ applied</span>
                              ) : (
                                <span className="text-xs text-brand-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between p-6 border-t border-brand-900/10 bg-brand-900/2">
          <div className="text-xs text-brand-600">
            {duplicates.size > 0 && (
              <span className="text-red-500">
                {duplicates.size} duplicate name{duplicates.size === 1 ? "" : "s"} — add distinguishers
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="btn-secondary btn-sm">
              Cancel
            </button>
            <button onClick={handleSave} className="btn-primary btn-sm">
              Save {drafts.length} Labels
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
