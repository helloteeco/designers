import { isPhotoFallback, type ExteriorDescriptor } from "./page-list";
import { BoardPlaceholder, FurnitureList, GuidePage, PageTitle } from "./chrome";

/**
 * Exterior / outdoor-space board page — image only, no key legend and no
 * floor-plan thumbnail.
 */
export default function ExteriorPage({
  descriptor,
  pageNumber,
  pageCount,
}: {
  descriptor: ExteriorDescriptor;
  pageNumber: number;
  pageCount: number;
}) {
  const { room, displayName, boardImageUrl } = descriptor;

  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <PageTitle
        overline={isPhotoFallback(room, boardImageUrl) ? "Room Photo — Design Board to Follow" : "Design Board"}
        title={displayName}
      />

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

      <div className="mt-3">
        <FurnitureList room={room} />
      </div>
    </GuidePage>
  );
}
