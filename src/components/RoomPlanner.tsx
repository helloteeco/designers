"use client";

import { useState } from "react";
import { saveProject, generateId, getProject as getProjectFromStore, logActivity } from "@/lib/store";
import FloorPlanReference from "./FloorPlanReference";
import FloorPlanAnnotator from "./FloorPlanAnnotator";
import AutoDetectRooms from "./AutoDetectRooms";
import RoomLabeler from "./RoomLabeler";
import { findDuplicateNames } from "@/lib/smart-label";
import type { Project, Room, RoomType, WindowSpec } from "@/lib/types";

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: "primary-bedroom", label: "Primary Bedroom" },
  { value: "bedroom", label: "Bedroom" },
  { value: "loft", label: "Loft" },
  { value: "bonus-room", label: "Bonus Room" },
  { value: "living-room", label: "Living Room" },
  { value: "dining-room", label: "Dining Room" },
  { value: "kitchen", label: "Kitchen" },
  { value: "den", label: "Den" },
  { value: "office", label: "Office" },
  { value: "media-room", label: "Media Room" },
  { value: "game-room", label: "Game Room" },
  { value: "bathroom", label: "Bathroom" },
  { value: "hallway", label: "Hallway" },
  { value: "outdoor", label: "Outdoor Space" },
];

const FEATURES = [
  "Window",
  "Closet",
  "En-suite",
  "Balcony",
  "Fireplace",
  "Vaulted Ceiling",
  "Skylight",
  "Walk-in Closet",
  "Bay Window",
  "Built-in Shelving",
];

interface Props {
  project: Project;
  onUpdate: () => void;
}

export default function RoomPlanner({ project, onUpdate }: Props) {
  const [showAnnotator, setShowAnnotator] = useState(false);
  const [showAutoDetect, setShowAutoDetect] = useState(false);
  const [showLabeler, setShowLabeler] = useState(false);
  const imagePlans = (project.property?.floorPlans ?? []).filter(p => p.type === "image");
  const hasImagePlans = imagePlans.length > 0;
  const [showForm, setShowForm] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineName, setInlineName] = useState("");
  const duplicates = findDuplicateNames(project.rooms);

  function emptyForm() {
    return {
      name: "",
      type: "bedroom" as RoomType,
      widthFt: 12,
      lengthFt: 12,
      ceilingHeightFt: 9,
      floor: 1,
      features: [] as string[],
      notes: "",
      accentWallEnabled: false,
      accentWallColor: "#787060",
      accentWallTreatment: "paint" as "paint" | "wallpaper" | "shiplap" | "stone" | "wood-panel" | "tile",
      accentWallSide: "north" as "north" | "south" | "east" | "west",
      windows: [] as WindowSpec[],
    };
  }

  function openNew() {
    setEditingRoom(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(room: Room) {
    setEditingRoom(room);
    setForm({
      name: room.name,
      type: room.type,
      widthFt: room.widthFt,
      lengthFt: room.lengthFt,
      ceilingHeightFt: room.ceilingHeightFt,
      floor: room.floor,
      accentWallEnabled: !!room.accentWall,
      accentWallColor: room.accentWall?.color ?? "#787060",
      accentWallTreatment: room.accentWall?.treatment ?? "paint",
      accentWallSide: room.accentWall?.wall ?? "north",
      features: [...room.features],
      notes: room.notes,
      windows: room.windows ? [...room.windows] : [],
    });
    setShowForm(true);
  }

  function handleSave() {
    if (!form.name.trim()) return;
    // Validate dimensions
    const width = Math.max(4, form.widthFt || 4);
    const length = Math.max(4, form.lengthFt || 4);
    const ceiling = Math.max(7, form.ceilingHeightFt || 8);
    const floor = Math.max(1, form.floor || 1);

    const accentWall = form.accentWallEnabled
      ? {
          color: form.accentWallColor,
          treatment: form.accentWallTreatment,
          wall: form.accentWallSide,
        }
      : null;

    const roomData = {
      name: form.name.trim(),
      type: form.type,
      widthFt: width,
      lengthFt: length,
      ceilingHeightFt: ceiling,
      floor,
      features: form.features,
      notes: form.notes,
      accentWall,
      windows: form.windows,
    };

    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;

    if (editingRoom) {
      const idx = fresh.rooms.findIndex((r) => r.id === editingRoom.id);
      if (idx >= 0) {
        fresh.rooms[idx] = {
          ...fresh.rooms[idx],
          ...roomData,
        };
      }
    } else {
      const room: Room = {
        id: generateId(),
        ...roomData,
        selectedBedConfig: null,
        furniture: [],
      };
      fresh.rooms.push(room);
      logActivity(project.id, "room_added", `Added room: ${roomData.name}`);
    }
    saveProject(fresh);
    setShowForm(false);
    setForm(emptyForm());
    onUpdate();
  }

  function handleDelete(roomId: string) {
    if (!confirm("Delete this room?")) return;
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const roomName = fresh.rooms.find((r) => r.id === roomId)?.name ?? "room";
    fresh.rooms = fresh.rooms.filter((r) => r.id !== roomId);
    saveProject(fresh);
    logActivity(project.id, "room_deleted", `Removed room: ${roomName}`);
    onUpdate();
  }

  function startInlineEdit(room: Room, e: React.MouseEvent) {
    e.stopPropagation();
    setInlineEditId(room.id);
    setInlineName(room.name);
  }

  function commitInlineEdit() {
    if (!inlineEditId) return;
    const name = inlineName.trim();
    if (!name) {
      setInlineEditId(null);
      return;
    }
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const room = fresh.rooms.find((r) => r.id === inlineEditId);
    if (room && room.name !== name) {
      room.name = name;
      saveProject(fresh);
      logActivity(project.id, "room_updated", `Renamed room to "${name}"`);
      onUpdate();
    }
    setInlineEditId(null);
  }

  function cancelInlineEdit() {
    setInlineEditId(null);
    setInlineName("");
  }

  function toggleFeature(feat: string) {
    setForm((prev) => ({
      ...prev,
      features: prev.features.includes(feat)
        ? prev.features.filter((f) => f !== feat)
        : [...prev.features, feat],
    }));
  }

  function quickAddRooms() {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    // Guard: if rooms already exist, warn before piling on more.
    if (fresh.rooms.length > 0) {
      if (!confirm(`This project already has ${fresh.rooms.length} room(s). Quick Setup will add more — continue?`)) return;
    }
    const bedrooms = Math.max(1, fresh.property.bedrooms || 3);
    const bathrooms = Math.max(1, fresh.property.bathrooms || 2);
    const floors = Math.max(1, fresh.property.floors || 1);

    // Primary bedroom
    fresh.rooms.push({
      id: generateId(),
      name: "Primary Bedroom",
      type: "primary-bedroom",
      widthFt: 14,
      lengthFt: 16,
      ceilingHeightFt: 9,
      floor: 1,
      features: ["En-suite", "Closet", "Window"],
      selectedBedConfig: null,
      furniture: [],
      accentWall: null,
      notes: "",
    });

    // Additional bedrooms
    for (let i = 2; i <= bedrooms; i++) {
      fresh.rooms.push({
        id: generateId(),
        name: `Bedroom ${i}`,
        type: "bedroom",
        widthFt: 12,
        lengthFt: 12,
        ceilingHeightFt: 9,
        floor: Math.min(i <= Math.ceil(bedrooms / floors) ? 1 : 2, floors),
        features: ["Closet", "Window"],
        selectedBedConfig: null,
        furniture: [],
        accentWall: null,
        notes: "",
      });
    }

    // Living room
    fresh.rooms.push({
      id: generateId(),
      name: "Living Room",
      type: "living-room",
      widthFt: 18,
      lengthFt: 16,
      ceilingHeightFt: 9,
      floor: 1,
      features: ["Window", "Fireplace"],
      selectedBedConfig: null,
      furniture: [],
      accentWall: null,
      notes: "",
    });

    // Kitchen
    fresh.rooms.push({
      id: generateId(),
      name: "Kitchen",
      type: "kitchen",
      widthFt: 14,
      lengthFt: 12,
      ceilingHeightFt: 9,
      floor: 1,
      features: [],
      selectedBedConfig: null,
      furniture: [],
      accentWall: null,
      notes: "",
    });

    // Dining
    fresh.rooms.push({
      id: generateId(),
      name: "Dining Room",
      type: "dining-room",
      widthFt: 14,
      lengthFt: 12,
      ceilingHeightFt: 9,
      floor: 1,
      features: ["Window"],
      selectedBedConfig: null,
      furniture: [],
      accentWall: null,
      notes: "",
    });

    // Bathrooms
    for (let i = 1; i <= Math.floor(bathrooms); i++) {
      fresh.rooms.push({
        id: generateId(),
        name: i === 1 ? "Primary Bathroom" : `Bathroom ${i}`,
        type: "bathroom",
        widthFt: i === 1 ? 10 : 8,
        lengthFt: i === 1 ? 8 : 6,
        ceilingHeightFt: 9,
        floor: Math.min(i <= Math.ceil(bathrooms / floors) ? 1 : 2, floors),
        features: [],
        selectedBedConfig: null,
        furniture: [],
        accentWall: null,
        notes: "",
      });
    }

    saveProject(fresh);
    logActivity(project.id, "room_added", `Quick setup: added ${fresh.rooms.length} rooms`);
    onUpdate();
  }

  return (
    <div>
      {/* Floor plan reference strip */}
      <FloorPlanReference project={project} defaultExpanded={project.rooms.length === 0} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">
            Rooms ({project.rooms.length})
          </h2>
          <p className="text-sm text-brand-600">
            Define rooms with dimensions for sleeping optimization.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {project.rooms.length > 0 && (
            <button
              onClick={() => setShowLabeler(true)}
              className="btn-accent btn-sm"
              title="Bulk-rename rooms with AI suggestions"
            >
              ✨ Label Rooms
              {duplicates.size > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] px-1.5 py-0.5 font-semibold">
                  {duplicates.size}
                </span>
              )}
            </button>
          )}
          {hasImagePlans && (
            <>
              <button onClick={() => setShowAutoDetect(true)} className="btn-secondary btn-sm">
                🤖 Auto-Detect from Plan
              </button>
              <button onClick={() => setShowAnnotator(true)} className="btn-secondary btn-sm">
                📐 Annotate Manually
              </button>
            </>
          )}
          {project.rooms.length === 0 && !hasImagePlans && (
            <button onClick={quickAddRooms} className="btn-secondary btn-sm">
              Quick Setup from Property
            </button>
          )}
          <button onClick={openNew} className="btn-primary btn-sm">
            + Add Room
          </button>
        </div>
      </div>

      {/* Annotator modal */}
      {showAnnotator && (
        <FloorPlanAnnotator
          project={project}
          onUpdate={onUpdate}
          onClose={() => setShowAnnotator(false)}
        />
      )}

      {/* Auto-detect modal — uses first image plan */}
      {showAutoDetect && imagePlans[0] && (
        <AutoDetectRooms
          project={project}
          plan={imagePlans[0]}
          onUpdate={onUpdate}
          onClose={() => setShowAutoDetect(false)}
        />
      )}

      {/* Room labeler modal */}
      {showLabeler && (
        <RoomLabeler
          project={project}
          onUpdate={onUpdate}
          onClose={() => setShowLabeler(false)}
        />
      )}

      {/* Room List */}
      {project.rooms.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-brand-600 mb-4">
            No rooms added yet. Add rooms manually or use Quick Setup.
          </p>
          <button onClick={quickAddRooms} className="btn-secondary">
            Quick Setup
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {getFloors(project.rooms).map((floor) => {
            const floorRooms = project.rooms.filter((r) => r.floor === floor);
            return (
              <div key={floor}>
                {getFloors(project.rooms).length > 1 && (
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-2">
                    Floor {floor} ({floorRooms.length} room{floorRooms.length !== 1 ? "s" : ""})
                  </h3>
                )}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {floorRooms.map((room) => (
            <div
              key={room.id}
              className="card group cursor-pointer transition hover:border-amber/40"
              onClick={() => openEdit(room)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  {inlineEditId === room.id ? (
                    <input
                      autoFocus
                      className="input text-sm py-1 font-semibold text-brand-900 w-full"
                      value={inlineName}
                      onChange={(e) => setInlineName(e.target.value)}
                      onBlur={commitInlineEdit}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") commitInlineEdit();
                        else if (e.key === "Escape") cancelInlineEdit();
                      }}
                    />
                  ) : (
                    <h3
                      className={`font-semibold text-brand-900 truncate cursor-text hover:text-amber-dark ${
                        duplicates.has(room.id) ? "text-red-600" : ""
                      }`}
                      onClick={(e) => startInlineEdit(room, e)}
                      title="Click to rename"
                    >
                      {room.name}
                      {duplicates.has(room.id) && (
                        <span className="ml-1.5 text-[10px] text-red-500 font-normal">
                          dup
                        </span>
                      )}
                    </h3>
                  )}
                  <p className="text-xs text-brand-600 capitalize">
                    {room.type.replace(/-/g, " ")} &middot; Floor {room.floor}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(room.id);
                  }}
                  className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition ml-2"
                >
                  Delete
                </button>
              </div>

              <div className="text-sm text-brand-700 mb-2">
                {room.widthFt}&apos; &times; {room.lengthFt}&apos; &middot;{" "}
                {room.ceilingHeightFt}&apos; ceiling
              </div>

              {room.selectedBedConfig && (
                <div className="text-xs text-amber-dark font-medium">
                  {room.selectedBedConfig.name} — Sleeps{" "}
                  {room.selectedBedConfig.totalSleeps}
                </div>
              )}

              {room.accentWall && (
                <div className="flex items-center gap-1.5 mt-1">
                  <div
                    className="h-3 w-3 rounded-full border border-brand-900/10"
                    style={{ backgroundColor: room.accentWall.color }}
                  />
                  <span className="text-xs text-brand-600 capitalize">
                    {room.accentWall.treatment} accent wall
                  </span>
                </div>
              )}

              {room.furniture.length > 0 && (
                <div className="text-xs text-brand-600 mt-1">
                  {room.furniture.length} furniture item
                  {room.furniture.length !== 1 ? "s" : ""}
                </div>
              )}

              {room.features.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {room.features.map((f) => (
                    <span key={f} className="badge-neutral text-[10px]">
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">
              {editingRoom ? "Edit Room" : "Add Room"}
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Room Name</label>
                  <input
                    className="input"
                    placeholder='e.g. "Primary Bedroom"'
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label">Room Type</label>
                  <select
                    className="select"
                    value={form.type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        type: e.target.value as RoomType,
                      })
                    }
                  >
                    {ROOM_TYPES.map((rt) => (
                      <option key={rt.value} value={rt.value}>
                        {rt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Floor</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    value={form.floor}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        floor: parseInt(e.target.value) || 1,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">Width (ft)</label>
                  <input
                    type="number"
                    className="input"
                    min={4}
                    step={0.5}
                    value={form.widthFt}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        widthFt: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">Length (ft)</label>
                  <input
                    type="number"
                    className="input"
                    min={4}
                    step={0.5}
                    value={form.lengthFt}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        lengthFt: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">Ceiling (ft)</label>
                  <input
                    type="number"
                    className="input"
                    min={7}
                    step={0.5}
                    value={form.ceilingHeightFt}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        ceilingHeightFt: parseFloat(e.target.value) || 8,
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="label">Room Area</label>
                <div className="text-sm text-brand-700 font-medium">
                  {(form.widthFt * form.lengthFt).toFixed(0)} sqft
                </div>
              </div>

              <div>
                <label className="label">Features</label>
                <div className="flex flex-wrap gap-2">
                  {FEATURES.map((feat) => (
                    <button
                      key={feat}
                      type="button"
                      onClick={() => toggleFeature(feat)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        form.features.includes(feat)
                          ? "bg-amber text-brand-900"
                          : "bg-brand-900/5 text-brand-600 hover:bg-brand-900/10"
                      }`}
                    >
                      {feat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Accent Wall */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="accentWall"
                    checked={form.accentWallEnabled}
                    onChange={(e) =>
                      setForm({ ...form, accentWallEnabled: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-brand-900/20 text-amber accent-amber"
                  />
                  <label htmlFor="accentWall" className="label mb-0">
                    Accent Wall
                  </label>
                </div>
                {form.accentWallEnabled && (
                  <div className="grid grid-cols-3 gap-3 pl-6">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-brand-600">
                        Color
                      </label>
                      <input
                        type="color"
                        className="h-9 w-full rounded border border-brand-900/20 cursor-pointer"
                        value={form.accentWallColor}
                        onChange={(e) =>
                          setForm({ ...form, accentWallColor: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-brand-600">
                        Treatment
                      </label>
                      <select
                        className="select text-xs"
                        value={form.accentWallTreatment}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            accentWallTreatment: e.target.value as typeof form.accentWallTreatment,
                          })
                        }
                      >
                        <option value="paint">Paint</option>
                        <option value="wallpaper">Wallpaper</option>
                        <option value="shiplap">Shiplap</option>
                        <option value="stone">Stone</option>
                        <option value="wood-panel">Wood Panel</option>
                        <option value="tile">Tile</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-brand-600">
                        Wall
                      </label>
                      <select
                        className="select text-xs"
                        value={form.accentWallSide}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            accentWallSide: e.target.value as typeof form.accentWallSide,
                          })
                        }
                      >
                        <option value="north">North</option>
                        <option value="south">South</option>
                        <option value="east">East</option>
                        <option value="west">West</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Windows & Blinds — optional, per-window measurements for sourcing
                  rattan shades, curtains, etc. Off Matterport ruler or tape measure. */}
              <WindowsSection
                windows={form.windows}
                onChange={(windows) => setForm({ ...form, windows })}
                projectId={project.id}
                roomId={editingRoom?.id}
                onAfterShop={onUpdate}
              />

              <div>
                <label className="label">Notes</label>
                <textarea
                  className="input min-h-[60px] resize-y"
                  placeholder="Any special notes about this room..."
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button onClick={handleSave} className="btn-primary btn-sm">
                {editingRoom ? "Save Changes" : "Add Room"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getFloors(rooms: Room[]): number[] {
  const floors = Array.from(new Set(rooms.map((r) => r.floor)));
  return floors.sort((a, b) => a - b);
}

// ── Windows & Blinds sub-component ───────────────────────────────────
//
// Manual measurement capture (off Matterport ruler or tape measure) + one-click
// blind sourcing via existing /api/source-item. No new API, no new tab, no new
// storage — windows live on the Room, sourced blinds go into room.furniture so
// the masterlist xlsx picks them up automatically.

interface WindowsSectionProps {
  windows: WindowSpec[];
  onChange: (windows: WindowSpec[]) => void;
  projectId: string;
  roomId: string | undefined;     // only set when editing an existing room
  onAfterShop: () => void;
}

interface BlindOption {
  name: string;
  vendor: string;
  price: number | null;
  url: string;
  imageUrl?: string;
  dimensions?: string;
}

function WindowsSection({ windows, onChange, projectId, roomId, onAfterShop }: WindowsSectionProps) {
  const [expanded, setExpanded] = useState(windows.length > 0);
  const [draft, setDraft] = useState<{ label: string; widthIn: string; heightIn: string; mountType: "inside" | "outside"; notes: string } | null>(null);
  const [shoppingId, setShoppingId] = useState<string | null>(null);
  const [shopOptions, setShopOptions] = useState<BlindOption[] | null>(null);
  const [shopError, setShopError] = useState<string | null>(null);
  const [shopStyleChips, setShopStyleChips] = useState<Set<string>>(new Set(["🪵 Woven / rattan"]));

  // Preset material / safety / install chips that tack onto the sourcing query.
  // Same pattern as AiSceneStudio's STR chips so sourcing feels consistent.
  const CHIPS = [
    { label: "🪵 Woven / rattan", qualifier: "natural woven bamboo or rattan material" },
    { label: "☀️ Light-filtering", qualifier: "light-filtering semi-sheer" },
    { label: "🌙 Blackout lining", qualifier: "with blackout liner for sleep rooms" },
    { label: "🚫 Cordless (child-safe)", qualifier: "cordless and child-safe" },
    { label: "📏 Inside mount", qualifier: "inside-mount compatible" },
    { label: "💧 Moisture-resistant", qualifier: "moisture-resistant for bathrooms and kitchens" },
  ];

  function toggleChip(label: string) {
    setShopStyleChips(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function addWindow() {
    if (!draft) return;
    const w: WindowSpec = {
      id: generateId(),
      label: draft.label.trim() || `Window ${windows.length + 1}`,
      widthIn: Math.max(1, parseFloat(draft.widthIn) || 0),
      heightIn: Math.max(1, parseFloat(draft.heightIn) || 0),
      mountType: draft.mountType,
      notes: draft.notes.trim(),
    };
    if (w.widthIn <= 0 || w.heightIn <= 0) return;
    onChange([...windows, w]);
    setDraft(null);
  }

  function removeWindow(id: string) {
    onChange(windows.filter(w => w.id !== id));
  }

  function updateWindow(id: string, patch: Partial<WindowSpec>) {
    onChange(windows.map(w => w.id === id ? { ...w, ...patch } : w));
  }

  async function shopBlinds(win: WindowSpec) {
    setShoppingId(win.id);
    setShopOptions(null);
    setShopError(null);
    try {
      // Mount-type math: inside mount subtracts ¼" deadwood, outside adds ~2.5"
      // each side + 2" top overlap. Matches industry standard sizing.
      const isInside = win.mountType === "inside";
      const orderWidth = isInside ? Math.max(1, win.widthIn - 0.25) : win.widthIn + 5;
      const orderHeight = isInside ? Math.max(1, win.heightIn - 0.25) : win.heightIn + 2;
      const chipQualifiers = CHIPS.filter(c => shopStyleChips.has(c.label)).map(c => c.qualifier).join(", ");
      const description = `Window shade sized ${orderWidth.toFixed(1)}" W × ${orderHeight.toFixed(1)}" H for ${isInside ? "inside" : "outside"}-mount installation${chipQualifiers ? `, ${chipQualifiers}` : ""}`.trim();

      const res = await fetch("/api/source-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          estimatedSize: `${orderWidth.toFixed(1)}x${orderHeight.toFixed(1)} inches`,
        }),
      });
      const payload = (await res.json()) as { options?: BlindOption[]; error?: string };
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
      setShopOptions(payload.options ?? []);
    } catch (err) {
      setShopError(err instanceof Error ? err.message : "Sourcing failed");
    }
  }

  function commitBlindPick(win: WindowSpec, opt: BlindOption) {
    if (!roomId) return;
    const fresh = getProjectFromStore(projectId);
    if (!fresh) return;
    const room = fresh.rooms.find(r => r.id === roomId);
    if (!room) return;

    // Push as a SelectedFurniture row. Category "decor" + subcategory "Window Treatment"
    // so masterlist + UI treat it naturally.
    const itemId = `win-${generateId()}`;
    room.furniture.push({
      item: {
        id: itemId,
        name: opt.name,
        category: "decor",
        subcategory: "Window Treatment",
        widthIn: win.widthIn,
        depthIn: 2,
        heightIn: win.heightIn,
        price: opt.price ?? 0,
        vendor: opt.vendor,
        vendorUrl: opt.url,
        imageUrl: opt.imageUrl ?? "",
        color: "",
        material: "",
        style: fresh.style,
      },
      quantity: 1,
      roomId,
      notes: `Window "${win.label}" — ${win.mountType} mount`,
      status: "specced",
    });

    // Link the window to this furniture row so we can show "✓ blind picked"
    const updated = windows.map(w => w.id === win.id ? { ...w, sourcedFurnitureId: itemId } : w);
    // Also persist the updated windows on the saved room
    room.windows = updated;
    saveProject(fresh);
    onChange(updated);
    setShoppingId(null);
    setShopOptions(null);
    onAfterShop();
  }

  const totalSourced = windows.filter(w => w.sourcedFurnitureId).length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left hover:text-amber-dark transition"
      >
        <span className="label mb-0">
          🪟 Windows &amp; Blinds
          {windows.length > 0 && (
            <span className="ml-1 font-normal normal-case text-brand-600">
              ({windows.length} window{windows.length === 1 ? "" : "s"}
              {totalSourced > 0 ? ` · ${totalSourced} blind${totalSourced === 1 ? "" : "s"} picked` : ""})
            </span>
          )}
        </span>
        <span className="text-xs text-brand-600">{expanded ? "▼" : "▶"}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 rounded-lg border border-brand-900/10 p-3 bg-cream/40">
          <p className="text-[11px] text-brand-600">
            Enter measurements from the Matterport ruler or a tape measure. Inside-mount
            subtracts ¼" deadwood; outside-mount adds ~2.5" each side + 2" top overlap automatically.
          </p>

          {/* Window list */}
          {windows.map(w => {
            const picked = !!w.sourcedFurnitureId;
            return (
              <div key={w.id} className="rounded-lg bg-white border border-brand-900/10 p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="input py-1 text-xs flex-1 min-w-[120px]"
                    value={w.label}
                    onChange={(e) => updateWindow(w.id, { label: e.target.value })}
                    placeholder="Label"
                  />
                  <input
                    type="number"
                    step="0.25"
                    className="input py-1 text-xs w-20"
                    value={w.widthIn || ""}
                    onChange={(e) => updateWindow(w.id, { widthIn: parseFloat(e.target.value) || 0 })}
                    placeholder='W "'
                  />
                  <span className="text-brand-600 text-xs">×</span>
                  <input
                    type="number"
                    step="0.25"
                    className="input py-1 text-xs w-20"
                    value={w.heightIn || ""}
                    onChange={(e) => updateWindow(w.id, { heightIn: parseFloat(e.target.value) || 0 })}
                    placeholder='H "'
                  />
                  <select
                    className="select py-1 text-xs w-24"
                    value={w.mountType}
                    onChange={(e) => updateWindow(w.id, { mountType: e.target.value as "inside" | "outside" })}
                  >
                    <option value="inside">Inside</option>
                    <option value="outside">Outside</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => shopBlinds(w)}
                    disabled={shoppingId === w.id}
                    className="text-xs rounded-lg bg-amber/20 px-2.5 py-1 font-semibold text-amber-dark hover:bg-amber/40 disabled:opacity-50"
                  >
                    {shoppingId === w.id ? "⏳ Shopping..." : picked ? "✓ Re-shop" : "🛍 Shop blinds"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeWindow(w.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                    title="Remove window"
                  >
                    ✕
                  </button>
                </div>

                {/* Style chips — only shown while shopping this window */}
                {shoppingId === w.id && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {CHIPS.map(c => {
                      const active = shopStyleChips.has(c.label);
                      return (
                        <button
                          key={c.label}
                          type="button"
                          onClick={() => toggleChip(c.label)}
                          className={`text-[10px] rounded-full border px-2 py-0.5 transition ${
                            active ? "border-amber bg-amber/15 text-amber-dark" : "border-brand-900/15 text-brand-600 hover:border-amber/40"
                          }`}
                        >
                          {c.label}{active ? " ✓" : ""}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => shopBlinds(w)}
                      className="text-[10px] rounded-full border border-brand-900 bg-brand-900 text-white px-2 py-0.5"
                    >
                      ↻ Re-search with chips
                    </button>
                  </div>
                )}

                {/* Shop results / errors */}
                {shoppingId === w.id && shopError && (
                  <div className="mt-2 text-xs text-red-500">{shopError}</div>
                )}
                {shoppingId === w.id && shopOptions && shopOptions.length === 0 && (
                  <div className="mt-2 text-xs text-brand-600">No products found — try fewer chips or a simpler description.</div>
                )}
                {shoppingId === w.id && shopOptions && shopOptions.length > 0 && (
                  <div className="mt-2 grid sm:grid-cols-3 gap-2">
                    {shopOptions.map((opt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => commitBlindPick(w, opt)}
                        disabled={!roomId}
                        className="text-left rounded-lg border border-brand-900/10 bg-white p-2 text-xs hover:border-amber/40 disabled:opacity-60"
                        title={!roomId ? "Save the room first before picking a blind" : undefined}
                      >
                        <div className="font-semibold text-brand-900 truncate">{opt.name}</div>
                        <div className="text-brand-600">{opt.vendor}{opt.price ? ` · $${opt.price}` : ""}</div>
                        {opt.dimensions && <div className="text-[10px] text-brand-600/70">{opt.dimensions}</div>}
                      </button>
                    ))}
                  </div>
                )}
                {shoppingId === w.id && !roomId && (
                  <div className="mt-2 text-[11px] text-amber-dark">
                    Save the room first ↑ — the blind needs a room to attach to.
                  </div>
                )}

                {w.notes && (
                  <div className="mt-1.5 text-[11px] text-brand-600">📝 {w.notes}</div>
                )}
              </div>
            );
          })}

          {/* Add new window — inline draft row */}
          {draft ? (
            <div className="rounded-lg bg-amber/5 border border-amber/30 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  autoFocus
                  className="input py-1 text-xs flex-1 min-w-[120px]"
                  placeholder="Label (e.g. Over sink)"
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                />
                <input
                  type="number"
                  step="0.25"
                  className="input py-1 text-xs w-20"
                  placeholder='W "'
                  value={draft.widthIn}
                  onChange={(e) => setDraft({ ...draft, widthIn: e.target.value })}
                />
                <span className="text-brand-600 text-xs">×</span>
                <input
                  type="number"
                  step="0.25"
                  className="input py-1 text-xs w-20"
                  placeholder='H "'
                  value={draft.heightIn}
                  onChange={(e) => setDraft({ ...draft, heightIn: e.target.value })}
                />
                <select
                  className="select py-1 text-xs w-24"
                  value={draft.mountType}
                  onChange={(e) => setDraft({ ...draft, mountType: e.target.value as "inside" | "outside" })}
                >
                  <option value="inside">Inside</option>
                  <option value="outside">Outside</option>
                </select>
                <button type="button" onClick={addWindow} className="text-xs btn-primary btn-sm">
                  Add
                </button>
                <button type="button" onClick={() => setDraft(null)} className="text-xs text-brand-600 hover:text-brand-900">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDraft({ label: "", widthIn: "", heightIn: "", mountType: "inside", notes: "" })}
              className="w-full text-xs rounded-lg border border-dashed border-brand-900/20 py-2 text-brand-600 hover:border-amber/40 hover:text-brand-900"
            >
              + Add window
            </button>
          )}
        </div>
      )}
    </div>
  );
}
