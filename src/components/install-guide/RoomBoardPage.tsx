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
