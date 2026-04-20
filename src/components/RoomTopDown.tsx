import type { Room, FurnitureItem, SelectedFurniture } from "@/lib/types";

interface PlacedItem extends SelectedFurniture {
  x: number;
  y: number;
  rotation: number;
}

interface Props {
  room: Room;
  /** SVG viewBox width/height in px. Aspect ratio matches room.widthFt × room.lengthFt. */
  size?: number;
  /** Show item names. Off for tiny insets. */
  showLabels?: boolean;
  /** Show room name as a title above the plan. */
  showTitle?: boolean;
  /** Background color for the floor. */
  floorColor?: string;
}

/**
 * Static SVG render of a room's space plan: room rectangle + furniture rectangles
 * positioned by saved x/y percentages. Used by Install Guide pages to show clients
 * the actual floor plan the designer built — no canvas/DOM, safe in print + thumbnails.
 */
export default function RoomTopDown({
  room,
  size = 320,
  showLabels = true,
  showTitle = false,
  floorColor = "#f0ede6",
}: Props) {
  const aspect = Math.max(0.1, room.widthFt) / Math.max(0.1, room.lengthFt);
  const width = aspect >= 1 ? size : size * aspect;
  const height = aspect >= 1 ? size / aspect : size;

  return (
    <div className="inline-flex flex-col items-center">
      {showTitle && (
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-700 mb-1">
          {room.name} · {room.widthFt}&apos; × {room.lengthFt}&apos;
        </div>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="block"
        style={{ backgroundColor: floorColor }}
      >
        {/* Walls */}
        <rect
          x={1}
          y={1}
          width={width - 2}
          height={height - 2}
          fill="none"
          stroke="#374151"
          strokeWidth={2}
        />
        {/* Furniture */}
        {room.furniture.map((f, i) => {
          const placed = f as PlacedItem;
          const rotation = placed.rotation ?? 0;
          const isRotated = rotation === 90 || rotation === 270;
          const itemWFt = (isRotated ? f.item.depthIn : f.item.widthIn) / 12;
          const itemHFt = (isRotated ? f.item.widthIn : f.item.depthIn) / 12;
          const w = (itemWFt / room.widthFt) * width;
          const h = (itemHFt / room.lengthFt) * height;
          const cx = ((placed.x ?? 50) / 100) * width;
          const cy = ((placed.y ?? 50) / 100) * height;
          const x = Math.max(0, Math.min(width - w, cx - w / 2));
          const y = Math.max(0, Math.min(height - h, cy - h / 2));
          const color = categoryColor(f.item);
          const fontSize = Math.max(5, Math.min(10, w / 6));
          const label = f.item.name.length > 14 ? f.item.name.slice(0, 12) + "…" : f.item.name;
          return (
            <g key={`${f.item.id}-${i}`}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={color + "CC"}
                stroke={color}
                strokeWidth={0.75}
                rx={1.5}
              />
              {showLabels && w > 24 && h > 12 && (
                <text
                  x={x + w / 2}
                  y={y + h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize={fontSize}
                  fontFamily="system-ui, sans-serif"
                  fontWeight={500}
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
        {/* Empty-state hint */}
        {room.furniture.length === 0 && (
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#9ca3af"
            fontSize={10}
            fontFamily="system-ui, sans-serif"
          >
            (no furniture placed)
          </text>
        )}
      </svg>
    </div>
  );
}

function categoryColor(item: FurnitureItem): string {
  const colors: Record<string, string> = {
    "beds-mattresses": "#8B7355",
    seating: "#6B8E6B",
    tables: "#7B6B5B",
    storage: "#8B7B6B",
    lighting: "#C4A56B",
    decor: "#A08070",
    "rugs-textiles": "#9B8B7B",
    outdoor: "#6B8B5B",
    "kitchen-dining": "#7B8B9B",
    bathroom: "#6B9BAB",
  };
  return colors[item.category] ?? "#8B7B6B";
}
