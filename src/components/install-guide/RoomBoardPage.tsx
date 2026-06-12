import type { Property } from "@/lib/types";
import {
  DEFAULT_BEDROOM_TIPS,
  isPhotoFallback,
  parseTipLines,
  type RoomBoardDescriptor,
} from "./page-list";
import {
  BoardPlaceholder,
  GuidePage,
  KeyLegend,
  PageTitle,
  PlanThumb,
  TipsBlock,
} from "./chrome";

export default function RoomBoardPage({
  descriptor,
  property,
  pageNumber,
  pageCount,
}: {
  descriptor: RoomBoardDescriptor;
  property: Property;
  pageNumber: number;
  pageCount: number;
}) {
  const { room, displayName, boardImageUrl, boardIndex, boardCount, showTips } = descriptor;
  const photoFallback = isPhotoFallback(room, boardImageUrl);
  const overline = photoFallback
    ? "Room Photo — Design Board to Follow"
    : boardCount > 1
      ? `Design Board ${boardIndex + 1} of ${boardCount}`
      : "Design Board";
  const tipLines = showTips
    ? room.installTips?.trim()
      ? parseTipLines(room.installTips)
      : DEFAULT_BEDROOM_TIPS
    : [];

  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <PageTitle overline={overline} title={displayName} />

      {/* Board image — fixed-height area so pagination never overflows */}
      <div className="relative mt-3 min-h-0 flex-1">
        {boardImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={boardImageUrl}
            alt={`${displayName} design board`}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <BoardPlaceholder roomName={displayName} />
        )}
      </div>

      {/* Bottom bar: tips (bedrooms) / furniture list (others) · key · plan thumb */}
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-6">
        <div>
          {showTips ? (
            <TipsBlock lines={tipLines} />
          ) : (
            boardIndex === 0 && <FurnitureList room={room} />
          )}
        </div>
        <div className="flex justify-center pb-2">
          <KeyLegend />
        </div>
        <div className="flex justify-end">
          <PlanThumb property={property} room={room} />
        </div>
      </div>
    </GuidePage>
  );
}

/** Compact two-column item list so the page reads like a real install guide
 *  even before a styled board composite exists. First board page only. */
function FurnitureList({ room }: { room: RoomBoardDescriptor["room"] }) {
  const items = room.furniture ?? [];
  if (items.length === 0) return null;
  const MAX = 12;
  const shown = items.slice(0, MAX);
  return (
    <div className="max-w-[3.4in]">
      <div className="text-[8px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#A8987F" }}>
        Furniture &amp; Decor
      </div>
      <ul className="mt-1 columns-2 gap-4 text-[8px] leading-[1.5]" style={{ color: "#2B2B2B" }}>
        {shown.map((f, i) => (
          <li key={i} className="break-inside-avoid truncate">
            &middot; {f.item.name}
            {f.quantity > 1 ? ` ×${f.quantity}` : ""}
          </li>
        ))}
        {items.length > MAX && (
          <li className="break-inside-avoid opacity-60">…and {items.length - MAX} more (see Masterlist)</li>
        )}
      </ul>
    </div>
  );
}
