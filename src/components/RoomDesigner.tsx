"use client";

import { useEffect, useState } from "react";
import AiSceneStudio from "./AiSceneStudio";
import ItemSelection from "./ItemSelection";
import TabHelp from "./TabHelp";
import type { Project, Room } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

/**
 * Per-room design: one linear panel per room.
 *
 * Layout (top-to-bottom):
 *   1. Horizontal room picker — click chip → switch rooms
 *   2. Sub-view toggle: "Design Board" | "Item Selection"
 *   3. AI Scene Studio OR Item Selection for the active room
 *
 * No catalog sidebar, no manual drag canvas. Items land in the masterlist
 * via the AI flow's Approve button — the scene is a by-product. If a designer
 * wants a manual pick, they use the Items tab.
 */
export default function RoomDesigner({ project, onUpdate }: Props) {
  const [selectedRoomId, setSelectedRoomId] = useState<string>(
    () => project.rooms[0]?.id ?? ""
  );
  const [subView, setSubView] = useState<"design" | "items">("design");

  // If current room is deleted elsewhere, fall back to first room
  useEffect(() => {
    if (!project.rooms.find((r) => r.id === selectedRoomId)) {
      setSelectedRoomId(project.rooms[0]?.id ?? "");
    }
  }, [project.rooms, selectedRoomId]);

  if (project.rooms.length === 0) {
    return (
      <div className="card text-center py-12">
        <div className="text-4xl mb-3">📐</div>
        <p className="text-brand-600">Add rooms first to start designing.</p>
      </div>
    );
  }

  const room = project.rooms.find((r) => r.id === selectedRoomId) ?? project.rooms[0];

  // Group rooms by floor for the picker
  const floors = Array.from(new Set(project.rooms.map((r) => r.floor))).sort(
    (a, b) => a - b
  );

  // Compute lock-in stats for the active room
  const roomFurniture = room.furniture ?? [];
  const lockedCount = roomFurniture.filter(f => f.lockedIn).length;
  const totalItems = roomFurniture.length;

  return (
    <div>
      {/* Room picker — horizontal scrollable chip strip, one row per floor */}
      <div className="mb-4 space-y-2">
        {floors.map((floor) => {
          const floorRooms = project.rooms.filter((r) => r.floor === floor);
          return (
            <div key={floor} className="flex items-center gap-2">
              {floors.length > 1 && (
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-brand-600 w-14">
                  Floor {floor}
                </span>
              )}
              <div className="flex gap-1.5 overflow-x-auto flex-1 pb-1">
                {floorRooms.map((r) => (
                  <RoomChip
                    key={r.id}
                    room={r}
                    active={r.id === selectedRoomId}
                    onClick={() => setSelectedRoomId(r.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sub-view toggle: Design Board | Item Selection */}
      {totalItems > 0 && (
        <div className="flex items-center gap-1 mb-4 p-1 bg-brand-900/[0.03] rounded-lg w-fit">
          <button
            onClick={() => setSubView("design")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              subView === "design"
                ? "bg-white text-brand-900 shadow-sm"
                : "text-brand-600 hover:text-brand-900"
            }`}
          >
            Design Board
          </button>
          <button
            onClick={() => setSubView("items")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
              subView === "items"
                ? "bg-white text-brand-900 shadow-sm"
                : "text-brand-600 hover:text-brand-900"
            }`}
          >
            Item Selection
            {totalItems > 0 && (
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                lockedCount === totalItems
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}>
                {lockedCount}/{totalItems}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Active surface */}
      {subView === "design" ? (
        <>
          <TabHelp tabId="design-board" title="How the Design Board works">
            Drop a photo of your room. Pick a style. Click the magic button.
            The AI makes a picture of your room with furniture. Then click
            "Extract Items" to put each piece on the board. You can move them around.
          </TabHelp>
          <AiSceneStudio key={room.id} project={project} room={room} onUpdate={onUpdate} />
        </>
      ) : (
        <ItemSelection key={`items-${room.id}`} project={project} room={room} onUpdate={onUpdate} />
      )}
    </div>
  );
}

interface RoomChipProps {
  room: Room;
  active: boolean;
  onClick: () => void;
}

function RoomChip({ room, active, onClick }: RoomChipProps) {
  const itemCount = room.furniture?.length ?? 0;
  const approvedCount =
    room.furniture?.filter(
      (f) => f.status === "approved" || f.status === "ordered" || f.status === "delivered"
    ).length ?? 0;
  const done = itemCount > 0 && approvedCount === itemCount;
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition flex items-center gap-1.5 border ${
        active
          ? "bg-brand-900 text-white border-brand-900"
          : "bg-white text-brand-700 border-brand-900/10 hover:border-amber/40 hover:bg-amber/5"
      }`}
      title={`${room.name} · ${room.widthFt}' × ${room.lengthFt}'`}
    >
      <span className="truncate max-w-[160px]">{room.name}</span>
      {itemCount > 0 && (
        <span
          className={`text-[10px] rounded-full px-1.5 py-0.5 ${
            done
              ? active
                ? "bg-emerald-500 text-white"
                : "bg-emerald-100 text-emerald-700"
              : active
              ? "bg-white/20 text-white"
              : "bg-brand-900/5 text-brand-600"
          }`}
        >
          {approvedCount}/{itemCount}
        </span>
      )}
    </button>
  );
}
