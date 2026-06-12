import { isPhotoFallback, type ExteriorDescriptor } from "./page-list";
import { BoardPlaceholder, FurnitureList, GuidePage, PageTitle } from "./chrome";

/**
 * Exterior / outdoor-space page — reference layout (p20): centered title,
 * the board filling the upper-left ~80% of the page, and (when a second
 * board image exists) a circular inset photo overlapping at the lower
 * right. No key legend and no floor-plan thumbnail.
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
  const { room, displayName, boardImageUrl, insetImageUrl } = descriptor;

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

      <div className="relative -mx-[0.45in] mt-2 min-h-0 flex-1 overflow-hidden">
        {boardImageUrl ? (
          insetImageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={boardImageUrl}
                alt={`${displayName} design board`}
                className="absolute left-0 top-0 h-[78%] w-[82%] object-contain object-left-top"
              />
              {/* Circular inset photo, lower right (reference p20) */}
              <div className="absolute bottom-[2%] right-[3%] h-[46%] aspect-square overflow-hidden rounded-full border-4 border-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={insetImageUrl}
                  alt={`${displayName} detail`}
                  className="h-full w-full object-cover"
                />
              </div>
            </>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={boardImageUrl}
              alt={`${displayName} design board`}
              className="absolute inset-0 h-full w-full object-contain"
            />
          )
        ) : (
          <BoardPlaceholder roomName={displayName} />
        )}
      </div>

      <div className="mt-2">
        <FurnitureList room={room} />
      </div>
    </GuidePage>
  );
}
