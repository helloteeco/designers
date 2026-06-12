import type { Property } from "@/lib/types";
import {
  DEFAULT_BEDROOM_TIPS,
  isPhotoFallback,
  parseTipLines,
  type RoomBoardDescriptor,
} from "./page-list";
import {
  BoardPlaceholder,
  FurnitureList,
  GuidePage,
  KeyLegend,
  PageTitle,
  PlanThumb,
  TipsBlock,
} from "./chrome";

/**
 * Room design-board page — reference layout (p3/4/6/8/9/11…): centered
 * light title with no overline or "Design Board" label, the board filling
 * nearly the full page width/height, and a small KEY + room-cropped plan
 * thumbnail tucked in the bottom-right corner. Bedrooms carry the TIPS
 * block bottom-left; other rooms keep the tiny furniture list there.
 */
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
  const { room, displayName, boardImageUrl, boardIndex, showTips } = descriptor;
  const photoFallback = isPhotoFallback(room, boardImageUrl);
  const tipLines = showTips
    ? room.installTips?.trim()
      ? parseTipLines(room.installTips)
      : DEFAULT_BEDROOM_TIPS
    : [];

  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <PageTitle
        title={displayName}
        note={photoFallback ? "Room Photo — Design Board to Follow" : undefined}
      />

      {/* Board image — bleeds to the page edges like the reference; the
          fixed-height area keeps pagination from ever overflowing. */}
      <div className="relative -mx-[0.45in] mt-2 min-h-0 flex-1 overflow-hidden">
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

      {/* Bottom band: tips (bedrooms) / furniture list (others) on the
          left, tiny stacked KEY + cropped plan thumbnail bottom-right. */}
      <div className="mt-2 flex items-end justify-between gap-4">
        <div className="min-w-0">
          {showTips ? (
            <TipsBlock lines={tipLines} />
          ) : (
            boardIndex === 0 && <FurnitureList room={room} />
          )}
        </div>
        <div className="flex shrink-0 items-end gap-3">
          <KeyLegend className="pb-0.5" />
          <PlanThumb property={property} room={room} />
        </div>
      </div>
    </GuidePage>
  );
}
