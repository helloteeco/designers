import type { Property } from "@/lib/types";
import {
  BATHROOM_HEIGHT_TIPS,
  isPhotoFallback,
  parseTipLines,
  type BathroomDescriptor,
} from "./page-list";
import {
  BoardPlaceholder,
  GuidePage,
  KeyLegend,
  PageTitle,
  PlanThumb,
  TipsBlock,
} from "./chrome";

/**
 * Bathroom page — reference layout (p18–19): centered title, the board
 * spanning nearly the full width, and a bottom band with the room-cropped
 * plan thumbnail at left, the towel-line "KEY:" beside it, and the
 * install-height TIPS bullets at right.
 */
export default function BathroomPage({
  descriptor,
  property,
  pageNumber,
  pageCount,
}: {
  descriptor: BathroomDescriptor;
  property: Property;
  pageNumber: number;
  pageCount: number;
}) {
  const { room, displayName, boardImageUrl } = descriptor;
  const tipLines = room.installTips?.trim()
    ? parseTipLines(room.installTips, 5)
    : BATHROOM_HEIGHT_TIPS;

  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <PageTitle
        title={displayName}
        note={
          isPhotoFallback(room, boardImageUrl)
            ? "Room Photo — Design Board to Follow"
            : undefined
        }
      />

      {/* Board image — near-full width, fixed-height area */}
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

      {/* Bottom band: plan crop · expanded towel key · height tips */}
      <div className="mt-2 flex items-start gap-[0.35in]">
        <PlanThumb property={property} room={room} width="1.55in" height="1.45in" />
        <KeyLegend variant="bath" className="shrink-0 pt-1" />
        <TipsBlock lines={tipLines} maxWidth="4in" />
      </div>
    </GuidePage>
  );
}
