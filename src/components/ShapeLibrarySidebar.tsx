"use client";

import { useState } from "react";
import type { LayoutShapeType } from "@/lib/types";

interface ShapePreset {
  type: LayoutShapeType;
  label: string;
  widthIn: number;
  depthIn: number;
  color: string;
  category: string;
}

const SHAPE_PRESETS: ShapePreset[] = [
  // Beds
  { type: "bed", label: "King Bed", widthIn: 76, depthIn: 80, color: "#6B5B7B", category: "Beds" },
  { type: "bed", label: "Queen Bed", widthIn: 60, depthIn: 80, color: "#6B5B7B", category: "Beds" },
  { type: "bed", label: "Full Bed", widthIn: 54, depthIn: 75, color: "#6B5B7B", category: "Beds" },
  { type: "bed", label: "Twin Bed", widthIn: 38, depthIn: 75, color: "#6B5B7B", category: "Beds" },
  { type: "bed", label: "Bunk Bed", widthIn: 42, depthIn: 80, color: "#6B5B7B", category: "Beds" },
  { type: "bed", label: "Daybed", widthIn: 40, depthIn: 80, color: "#6B5B7B", category: "Beds" },

  // Sofas & Seating
  { type: "sofa", label: "3-Seat Sofa", widthIn: 84, depthIn: 36, color: "#5B7B6B", category: "Seating" },
  { type: "sofa", label: "2-Seat Sofa", widthIn: 60, depthIn: 34, color: "#5B7B6B", category: "Seating" },
  { type: "sofa", label: "Sectional L", widthIn: 108, depthIn: 84, color: "#5B7B6B", category: "Seating" },
  { type: "sofa", label: "Loveseat", widthIn: 52, depthIn: 34, color: "#5B7B6B", category: "Seating" },
  { type: "chair", label: "Accent Chair", widthIn: 30, depthIn: 32, color: "#7B8B5B", category: "Seating" },
  { type: "chair", label: "Dining Chair", widthIn: 18, depthIn: 20, color: "#7B8B5B", category: "Seating" },
  { type: "chair", label: "Office Chair", widthIn: 24, depthIn: 24, color: "#7B8B5B", category: "Seating" },
  { type: "chair", label: "Bar Stool", widthIn: 16, depthIn: 16, color: "#7B8B5B", category: "Seating" },

  // Tables
  { type: "table", label: "Dining Table 6", widthIn: 72, depthIn: 36, color: "#8B7355", category: "Tables" },
  { type: "table", label: "Dining Table 8", widthIn: 96, depthIn: 42, color: "#8B7355", category: "Tables" },
  { type: "table", label: "Round Table 48\"", widthIn: 48, depthIn: 48, color: "#8B7355", category: "Tables" },
  { type: "table", label: "Coffee Table", widthIn: 48, depthIn: 24, color: "#8B7355", category: "Tables" },
  { type: "table", label: "Side Table", widthIn: 20, depthIn: 20, color: "#8B7355", category: "Tables" },
  { type: "table", label: "Console Table", widthIn: 48, depthIn: 14, color: "#8B7355", category: "Tables" },
  { type: "table", label: "Desk", widthIn: 60, depthIn: 30, color: "#8B7355", category: "Tables" },
  { type: "table", label: "Nightstand", widthIn: 24, depthIn: 18, color: "#8B7355", category: "Tables" },

  // Rugs
  { type: "rug", label: "Rug 5x8", widthIn: 60, depthIn: 96, color: "#9B8B7B", category: "Rugs" },
  { type: "rug", label: "Rug 8x10", widthIn: 96, depthIn: 120, color: "#9B8B7B", category: "Rugs" },
  { type: "rug", label: "Rug 9x12", widthIn: 108, depthIn: 144, color: "#9B8B7B", category: "Rugs" },
  { type: "rug", label: "Runner 2.5x8", widthIn: 30, depthIn: 96, color: "#9B8B7B", category: "Rugs" },
  { type: "rug", label: "Round Rug 6'", widthIn: 72, depthIn: 72, color: "#9B8B7B", category: "Rugs" },

  // Storage
  { type: "storage", label: "Dresser", widthIn: 60, depthIn: 18, color: "#7B6B5B", category: "Storage" },
  { type: "storage", label: "Bookshelf", widthIn: 36, depthIn: 12, color: "#7B6B5B", category: "Storage" },
  { type: "storage", label: "TV Console", widthIn: 60, depthIn: 16, color: "#7B6B5B", category: "Storage" },
  { type: "storage", label: "Credenza", widthIn: 72, depthIn: 18, color: "#7B6B5B", category: "Storage" },

  // Fixtures
  { type: "fixture", label: "Door (36\")", widthIn: 36, depthIn: 4, color: "#4B5563", category: "Fixtures" },
  { type: "fixture", label: "Window (48\")", widthIn: 48, depthIn: 4, color: "#6B7280", category: "Fixtures" },
  { type: "fixture", label: "Toilet", widthIn: 18, depthIn: 28, color: "#9CA3AF", category: "Fixtures" },
  { type: "fixture", label: "Bathtub", widthIn: 30, depthIn: 60, color: "#9CA3AF", category: "Fixtures" },
  { type: "fixture", label: "Shower 36x36", widthIn: 36, depthIn: 36, color: "#9CA3AF", category: "Fixtures" },
  { type: "fixture", label: "Vanity 48\"", widthIn: 48, depthIn: 22, color: "#9CA3AF", category: "Fixtures" },

  // Game / Fun
  { type: "game", label: "Pool Table", widthIn: 54, depthIn: 96, color: "#2D5A27", category: "Games" },
  { type: "game", label: "Shuffleboard", widthIn: 24, depthIn: 144, color: "#5B4B3B", category: "Games" },
  { type: "game", label: "Foosball", widthIn: 30, depthIn: 56, color: "#5B4B3B", category: "Games" },
  { type: "game", label: "Air Hockey", widthIn: 48, depthIn: 84, color: "#3B4B5B", category: "Games" },
  { type: "game", label: "Ping Pong", widthIn: 60, depthIn: 108, color: "#2B5B4B", category: "Games" },
  { type: "game", label: "Arcade Cabinet", widthIn: 24, depthIn: 30, color: "#4B3B5B", category: "Games" },

  // Outdoor
  { type: "outdoor", label: "Hot Tub", widthIn: 84, depthIn: 84, color: "#3B7B9B", category: "Outdoor" },
  { type: "outdoor", label: "Fire Pit", widthIn: 48, depthIn: 48, color: "#9B4B2B", category: "Outdoor" },
  { type: "outdoor", label: "Lounge Chair", widthIn: 28, depthIn: 72, color: "#6B8B5B", category: "Outdoor" },
  { type: "outdoor", label: "Outdoor Sofa", widthIn: 72, depthIn: 32, color: "#6B8B5B", category: "Outdoor" },
  { type: "outdoor", label: "Outdoor Table", widthIn: 48, depthIn: 48, color: "#8B7355", category: "Outdoor" },
  { type: "outdoor", label: "Grill", widthIn: 48, depthIn: 24, color: "#4B4B4B", category: "Outdoor" },
];

const CATEGORIES = [...new Set(SHAPE_PRESETS.map(s => s.category))];

export default function ShapeLibrarySidebar() {
  const [search, setSearch] = useState("");
  const [expandedCat, setExpandedCat] = useState<string | null>("Beds");

  const filtered = search
    ? SHAPE_PRESETS.filter(s => s.label.toLowerCase().includes(search.toLowerCase()))
    : SHAPE_PRESETS;

  function handleDragStart(e: React.DragEvent, preset: ShapePreset) {
    e.dataTransfer.setData("application/layout-shape", JSON.stringify(preset));
    e.dataTransfer.effectAllowed = "copy";
  }

  return (
    <div className="w-56 shrink-0">
      <div className="card max-h-[80vh] overflow-y-auto sticky top-4">
        <h3 className="font-semibold text-sm mb-1">Furniture Shapes</h3>
        <p className="text-[10px] text-brand-600 mb-3">Drag onto the floor plan</p>

        <input
          className="input mb-3 text-xs"
          placeholder="Search shapes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {search ? (
          <div className="space-y-1">
            <div className="text-[10px] text-brand-600 mb-1">{filtered.length} results</div>
            {filtered.map((preset, i) => (
              <ShapeItem key={`${preset.label}-${i}`} preset={preset} onDragStart={handleDragStart} />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {CATEGORIES.map(cat => {
              const items = SHAPE_PRESETS.filter(s => s.category === cat);
              const isExpanded = expandedCat === cat;
              return (
                <div key={cat}>
                  <button
                    onClick={() => setExpandedCat(isExpanded ? null : cat)}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-xs font-medium text-brand-900 hover:bg-amber/10 transition"
                  >
                    <span>{cat} ({items.length})</span>
                    <span className="text-brand-600">{isExpanded ? "▾" : "▸"}</span>
                  </button>
                  {isExpanded && (
                    <div className="ml-1 space-y-0.5 mt-0.5">
                      {items.map((preset, i) => (
                        <ShapeItem key={`${preset.label}-${i}`} preset={preset} onDragStart={handleDragStart} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ShapeItem({ preset, onDragStart }: { preset: ShapePreset; onDragStart: (e: React.DragEvent, p: ShapePreset) => void }) {
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, preset)}
      className="flex items-center gap-2 rounded border border-brand-900/5 px-2 py-1.5 text-xs cursor-grab hover:border-amber/40 hover:bg-amber/5 transition active:cursor-grabbing"
    >
      <div
        className="w-5 h-4 rounded-sm shrink-0"
        style={{ backgroundColor: preset.color + "CC", border: `1px solid ${preset.color}` }}
      />
      <div className="min-w-0">
        <div className="font-medium text-brand-900 truncate">{preset.label}</div>
        <div className="text-[10px] text-brand-600">
          {preset.widthIn}&quot;×{preset.depthIn}&quot;
          {" "}({(preset.widthIn / 12).toFixed(1)}&apos;×{(preset.depthIn / 12).toFixed(1)}&apos;)
        </div>
      </div>
    </div>
  );
}
