import type { Property } from "@/lib/types";
import {
  BATHROOM_HEIGHT_TIPS,
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
    ? parseTipLines(room.installTips)
    : BATHROOM_HEIGHT_TIPS;

  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <PageTitle overline="Design Board" title={displayName} />

      <div className="mt-3 flex min-h-0 flex-1 gap-[0.4in]">
        {/* Board image */}
        <div className="relative min-h-0 flex-1">
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

        {/* Sidebar: install heights, expanded key, plan thumbnail */}
        <aside className="flex w-[2.5in] shrink-0 flex-col gap-5 pt-1">
          <TipsBlock heading="Tips" lines={tipLines} />
          <KeyLegend expanded vertical />
          <div className="mt-auto flex justify-end">
            <PlanThumb property={property} room={room} />
          </div>
        </aside>
      </div>
    </GuidePage>
  );
}
