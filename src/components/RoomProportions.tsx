"use client";

import { useState, useMemo } from "react";
import { saveProject, getProject as getProjectFromStore, logActivity } from "@/lib/store";
import type { Project, Room, FurnitureItem, SelectedFurniture } from "@/lib/types";
import { CATALOG } from "@/lib/furniture-catalog";

interface Props {
  project: Project;
  onUpdate: () => void;
}

// ── Proportion standards (inches) ──

interface ProportionRule {
  label: string;
  category: string;
  idealRange: [number, number];
  unit: string;
  tip: string;
}

const BATHROOM_RULES: Record<string, ProportionRule> = {
  vanityHeight: {
    label: "Vanity Height",
    category: "Vanity",
    idealRange: [32, 36],
    unit: "in",
    tip: "Standard vanity height is 32-36in. Comfort height (ADA) is 34-36in.",
  },
  mirrorWidth: {
    label: "Mirror Width vs Vanity",
    category: "Mirror",
    idealRange: [70, 100],
    unit: "%",
    tip: "Mirror should be 70-100% of vanity width. Never wider than the vanity.",
  },
  mirrorBottomHeight: {
    label: "Mirror Bottom Edge",
    category: "Mirror",
    idealRange: [40, 44],
    unit: "in from floor",
    tip: "Bottom of mirror should be 40-44in from floor (4-8in above vanity top).",
  },
  lightCenterHeight: {
    label: "Vanity Light Height",
    category: "Lighting",
    idealRange: [75, 80],
    unit: "in from floor",
    tip: "Center of vanity light should be 75-80in from floor, or 28-36in above vanity top.",
  },
  backsplashHeight: {
    label: "Backsplash Height",
    category: "Backsplash",
    idealRange: [4, 6],
    unit: "in",
    tip: "Standard backsplash is 4-6in above vanity top. Full-height goes to mirror.",
  },
  faucetReach: {
    label: "Faucet Reach",
    category: "Faucet",
    idealRange: [6, 9],
    unit: "in",
    tip: "Faucet spout should reach center of sink bowl (6-9in from backsplash).",
  },
  showerHeadHeight: {
    label: "Shower Head Height",
    category: "Shower",
    idealRange: [78, 84],
    unit: "in from floor",
    tip: "Standard shower head is 78-84in from floor. Rain heads typically 84in+.",
  },
  towelBarHeight: {
    label: "Towel Bar Height",
    category: "Accessories",
    idealRange: [42, 48],
    unit: "in from floor",
    tip: "Towel bars at 42-48in. Should be easily reachable from shower/tub.",
  },
};

const BEDROOM_RULES: Record<string, ProportionRule> = {
  nightstandHeight: {
    label: "Nightstand vs Mattress Top",
    category: "Tables",
    idealRange: [-2, 4],
    unit: "in above mattress",
    tip: "Nightstand top should be within -2 to +4in of mattress top. Level or slightly above is ideal.",
  },
  headboardHeight: {
    label: "Headboard Height",
    category: "Bed",
    idealRange: [48, 65],
    unit: "in from floor",
    tip: "Headboard top should be 48-65in from floor. Taller for higher ceilings.",
  },
  bedsideLampHeight: {
    label: "Bedside Lamp Height",
    category: "Lighting",
    idealRange: [26, 30],
    unit: "in",
    tip: "Lamp center of shade should be at eye level when seated in bed (~26-30in above nightstand).",
  },
  dresserMirrorGap: {
    label: "Mirror Above Dresser",
    category: "Mirror",
    idealRange: [4, 8],
    unit: "in gap",
    tip: "Bottom of mirror should be 4-8in above dresser top. Mirror width should be 50-75% of dresser.",
  },
  rugUnderBed: {
    label: "Rug Extension Beyond Bed",
    category: "Rug",
    idealRange: [18, 36],
    unit: "in each side",
    tip: "Rug should extend 18-36in on each side and at the foot of the bed.",
  },
};

const LIVING_RULES: Record<string, ProportionRule> = {
  coffeeTableHeight: {
    label: "Coffee Table vs Sofa Seat",
    category: "Tables",
    idealRange: [-2, 2],
    unit: "in vs seat height",
    tip: "Coffee table should be within ±2in of sofa seat height (typically 16-18in).",
  },
  coffeeTableDistance: {
    label: "Coffee Table to Sofa Gap",
    category: "Tables",
    idealRange: [14, 18],
    unit: "in",
    tip: "Leave 14-18in between sofa edge and coffee table for leg room.",
  },
  tvSize: {
    label: "TV Size for Viewing Distance",
    category: "Media",
    idealRange: [55, 75],
    unit: "in diagonal",
    tip: "8-10ft viewing: 55-65in TV. 10-12ft: 65-75in. Screen center at seated eye level (42in).",
  },
  artHeight: {
    label: "Art Center Height",
    category: "Decor",
    idealRange: [57, 60],
    unit: "in from floor",
    tip: "Center of art at 57-60in (gallery standard). Lower if above furniture.",
  },
  pendantOverTable: {
    label: "Pendant Over Dining Table",
    category: "Lighting",
    idealRange: [30, 36],
    unit: "in above table",
    tip: "Pendant/chandelier bottom should be 30-36in above dining table surface.",
  },
};

type RoomCategory = "bathroom" | "bedroom" | "living" | "kitchen";

function getRoomCategory(roomType: string): RoomCategory | null {
  if (roomType === "bathroom") return "bathroom";
  if (["primary-bedroom", "bedroom", "loft", "bonus-room"].includes(roomType)) return "bedroom";
  if (["living-room", "den", "media-room", "game-room"].includes(roomType)) return "living";
  if (["kitchen", "dining-room"].includes(roomType)) return "kitchen";
  return null;
}

function getRulesForRoom(roomType: string): Record<string, ProportionRule> {
  const cat = getRoomCategory(roomType);
  switch (cat) {
    case "bathroom": return BATHROOM_RULES;
    case "bedroom": return BEDROOM_RULES;
    case "living": return LIVING_RULES;
    case "kitchen": return LIVING_RULES;
    default: return {};
  }
}

interface ProportionCheck {
  rule: ProportionRule;
  key: string;
  value: number | null;
  status: "ok" | "warn" | "missing";
}

function checkProportions(room: Room): ProportionCheck[] {
  const rules = getRulesForRoom(room.type);
  const results: ProportionCheck[] = [];
  const furniture = room.furniture;

  for (const [key, rule] of Object.entries(rules)) {
    const value = inferValue(key, room, furniture);
    let status: "ok" | "warn" | "missing" = "missing";
    if (value !== null) {
      status = value >= rule.idealRange[0] && value <= rule.idealRange[1] ? "ok" : "warn";
    }
    results.push({ rule, key, value, status });
  }
  return results;
}

function inferValue(key: string, room: Room, furniture: SelectedFurniture[]): number | null {
  const find = (sub: string) => furniture.find((f) =>
    f.item.subcategory.toLowerCase().includes(sub.toLowerCase())
  );
  const vanity = find("vanit");
  const mirror = find("mirror");
  const nightstand = find("nightstand");
  const bed = find("bed frame") ?? find("bunk");
  const dresser = find("dresser");
  const lamp = find("lamp");
  const pendant = find("pendant") ?? find("chandelier");
  const coffeeTable = find("coffee");
  const sofa = find("sofa") ?? find("loveseat") ?? find("sectional");
  const rug = find("rug") ?? find("area rug");
  const dining = find("dining table");

  switch (key) {
    case "vanityHeight": return vanity ? vanity.item.heightIn : null;
    case "mirrorWidth":
      if (mirror && vanity && vanity.item.widthIn > 0)
        return Math.round((mirror.item.widthIn / vanity.item.widthIn) * 100);
      return null;
    case "mirrorBottomHeight": return vanity ? (vanity.item.heightIn + 6) : null;
    case "lightCenterHeight": return 78;
    case "backsplashHeight": return vanity ? 4 : null;
    case "faucetReach": return 7;
    case "showerHeadHeight": return room.ceilingHeightFt >= 8 ? 80 : 78;
    case "towelBarHeight": return 48;
    case "nightstandHeight":
      if (nightstand && bed) return nightstand.item.heightIn - (bed.item.heightIn + 10);
      return null;
    case "headboardHeight": return bed ? bed.item.heightIn : null;
    case "bedsideLampHeight": return lamp ? lamp.item.heightIn : null;
    case "dresserMirrorGap": return dresser && mirror ? 6 : null;
    case "rugUnderBed":
      if (rug && bed) return Math.round((rug.item.widthIn - bed.item.widthIn) / 2);
      return null;
    case "coffeeTableHeight":
      if (coffeeTable && sofa) return coffeeTable.item.heightIn - 17;
      return null;
    case "coffeeTableDistance": return coffeeTable ? 16 : null;
    case "tvSize": return null;
    case "artHeight": return 58;
    case "pendantOverTable": return pendant && dining ? 33 : null;
    default: return null;
  }
}

// ── Catalog suggestions for proportions ──

function suggestForRule(key: string, room: Room): FurnitureItem[] {
  const category = getRoomCategory(room.type);
  if (!category) return [];

  const filters: Record<string, { category: string; subcategories: string[] }> = {
    vanityHeight: { category: "bathroom", subcategories: ["Vanities"] },
    mirrorWidth: { category: "bathroom", subcategories: ["Mirrors"] },
    mirrorBottomHeight: { category: "bathroom", subcategories: ["Mirrors"] },
    lightCenterHeight: { category: "lighting", subcategories: ["Vanity Lighting"] },
    backsplashHeight: { category: "bathroom", subcategories: ["Tile"] },
    faucetReach: { category: "bathroom", subcategories: ["Faucets"] },
    showerHeadHeight: { category: "bathroom", subcategories: ["Shower Fixtures"] },
    towelBarHeight: { category: "bathroom", subcategories: ["Accessories"] },
    nightstandHeight: { category: "tables", subcategories: ["Nightstands"] },
    headboardHeight: { category: "beds-mattresses", subcategories: ["Bed Frames"] },
    bedsideLampHeight: { category: "lighting", subcategories: ["Table Lamps"] },
    dresserMirrorGap: { category: "decor", subcategories: ["Mirrors"] },
    rugUnderBed: { category: "rugs-textiles", subcategories: ["Area Rugs"] },
    coffeeTableHeight: { category: "tables", subcategories: ["Coffee Tables"] },
    coffeeTableDistance: { category: "tables", subcategories: ["Coffee Tables"] },
    artHeight: { category: "decor", subcategories: ["Wall Art"] },
    pendantOverTable: { category: "lighting", subcategories: ["Pendants", "Chandeliers"] },
  };

  const f = filters[key];
  if (!f) return [];

  return CATALOG.filter(
    (item) =>
      item.category === f.category &&
      f.subcategories.some((sc) =>
        item.subcategory.toLowerCase().includes(sc.toLowerCase())
      )
  ).slice(0, 4);
}

// ── Component ──

export default function RoomProportions({ project, onUpdate }: Props) {
  const [selectedRoomId, setSelectedRoomId] = useState<string>(
    project.rooms.find((r) => getRoomCategory(r.type) !== null)?.id ?? project.rooms[0]?.id ?? ""
  );
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  const room = project.rooms.find((r) => r.id === selectedRoomId);

  const checks = useMemo(() => {
    if (!room) return [];
    return checkProportions(room);
  }, [room]);

  const okCount = checks.filter((c) => c.status === "ok").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const missingCount = checks.filter((c) => c.status === "missing").length;

  function addToRoom(item: FurnitureItem) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh || !room) return;
    const r = fresh.rooms.find((rr) => rr.id === room.id);
    if (!r) return;
    const existing = r.furniture.find((f) => f.item.id === item.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      r.furniture.push({ item, quantity: 1, roomId: r.id, notes: "" });
    }
    saveProject(fresh);
    logActivity(project.id, "furniture_added", `Added ${item.name} to ${r.name}`);
    onUpdate();
  }

  if (project.rooms.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-brand-600">Add rooms first in the Rooms tab.</p>
      </div>
    );
  }

  const supportedRooms = project.rooms.filter((r) => getRoomCategory(r.type) !== null);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Room Proportions</h2>
        <p className="text-sm text-brand-600">
          Check dimensional harmony between fixtures — wall height vs vanity vs mirror vs light vs faucet.
          Reduces back-and-forth with contractors and clients.
        </p>
      </div>

      {/* Room selector */}
      <div className="mb-6 flex flex-wrap gap-2">
        {supportedRooms.map((r) => {
          const cat = getRoomCategory(r.type);
          const icon = cat === "bathroom" ? "🚿" : cat === "bedroom" ? "🛏️" : cat === "living" ? "🛋️" : "🍳";
          return (
            <button
              key={r.id}
              onClick={() => { setSelectedRoomId(r.id); setExpandedRule(null); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition whitespace-nowrap ${
                selectedRoomId === r.id
                  ? "bg-brand-900 text-white"
                  : "bg-white border border-brand-900/10 text-brand-700 hover:border-amber/40"
              }`}
            >
              {icon} {r.name}
            </button>
          );
        })}
        {supportedRooms.length === 0 && (
          <p className="text-sm text-brand-600">
            No bathrooms, bedrooms, or living rooms found. Add rooms in the Rooms tab first.
          </p>
        )}
      </div>

      {room && checks.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="mb-6 flex items-center gap-4 rounded-xl border border-brand-900/10 bg-white p-4">
            <div className="text-sm font-semibold text-brand-900">
              {room.name} — {room.ceilingHeightFt}ft ceilings, {room.widthFt}&times;{room.lengthFt}ft
            </div>
            <div className="flex-1" />
            {okCount > 0 && (
              <span className="badge-success text-[10px]">{okCount} in spec</span>
            )}
            {warnCount > 0 && (
              <span className="badge-warning text-[10px]">{warnCount} check</span>
            )}
            {missingCount > 0 && (
              <span className="badge-neutral text-[10px]">{missingCount} need items</span>
            )}
          </div>

          {/* Proportion checks */}
          <div className="space-y-2">
            {checks.map((check) => {
              const isExpanded = expandedRule === check.key;
              const suggestions = isExpanded ? suggestForRule(check.key, room) : [];
              const alreadyHas = room.furniture.some((f) =>
                suggestions.some((s) => s.id === f.item.id)
              );

              return (
                <div
                  key={check.key}
                  className={`rounded-xl border bg-white overflow-hidden transition ${
                    check.status === "ok"
                      ? "border-emerald-200"
                      : check.status === "warn"
                      ? "border-amber/40"
                      : "border-brand-900/10"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedRule(isExpanded ? null : check.key)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-cream/50 transition"
                  >
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        check.status === "ok"
                          ? "bg-emerald-100 text-emerald-700"
                          : check.status === "warn"
                          ? "bg-amber/20 text-amber-dark"
                          : "bg-brand-900/5 text-brand-600"
                      }`}
                    >
                      {check.status === "ok" ? "✓" : check.status === "warn" ? "!" : "?"}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-brand-900">
                        {check.rule.label}
                      </div>
                      <div className="text-xs text-brand-600">
                        {check.value !== null ? (
                          <>
                            Current: <span className="font-semibold">{check.value}{check.rule.unit}</span>
                            {" · "}Ideal: {check.rule.idealRange[0]}-{check.rule.idealRange[1]}{check.rule.unit}
                          </>
                        ) : (
                          <span className="italic">Add items to check this</span>
                        )}
                      </div>
                    </div>

                    <span className="text-xs text-brand-600/50">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-brand-900/5 px-4 py-3 bg-cream/30">
                      <p className="text-xs text-brand-700 mb-3">
                        {check.rule.tip}
                      </p>

                      {suggestions.length > 0 && (
                        <>
                          <div className="text-[10px] uppercase tracking-wider text-brand-600 font-semibold mb-2">
                            Suggested products
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {suggestions.map((item) => {
                              const isAdded = room.furniture.some((f) => f.item.id === item.id);
                              return (
                                <div
                                  key={item.id}
                                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                                    isAdded
                                      ? "border-amber/30 bg-amber/5"
                                      : "border-brand-900/5 hover:border-amber/30"
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-brand-900 truncate">
                                      {item.name}
                                    </div>
                                    <div className="text-brand-600">
                                      {item.vendor} · {item.widthIn}&quot;W &times; {item.heightIn}&quot;H · ${item.price}
                                    </div>
                                  </div>
                                  {isAdded ? (
                                    <span className="ml-2 shrink-0 rounded bg-amber/20 px-2 py-0.5 text-[10px] font-semibold text-amber-dark">
                                      Added
                                    </span>
                                  ) : (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); addToRoom(item); }}
                                      className="ml-2 shrink-0 rounded bg-amber/20 px-2 py-0.5 text-[10px] font-semibold text-amber-dark hover:bg-amber/40 transition"
                                    >
                                      + Add
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}

                      {suggestions.length === 0 && (
                        <p className="text-xs text-brand-600 italic">
                          No matching products in catalog yet. Add items in the Products & Pricing tab.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
