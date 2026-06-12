import type { AiRenderDescriptor } from "./page-list";
import { CHARCOAL, GuidePage, PageTitle } from "./chrome";

/**
 * Verbatim AI-render disclaimer from the reference deliverable (p5/7/10/…),
 * printed tiny and italic across the bottom of every render page.
 */
export const AI_RENDER_DISCLAIMER =
  "*This rendering is AI generated and is not exact, but similar to the products selected showing a close to accurate image of design. Please refer to the floor plan for the correct furniture placement. Renderings are for visual inspiration only and may not reflect exact layout or proportions.";

/**
 * AI render page — reference layout: centered "<ROOM> - AI RENDER" title;
 * two renders form a staggered collage (one upper-left, one lower-right,
 * overlapping slightly, the lower one edged in white); a single render
 * sits large and centered. Fixed-height boxes + object-cover keep the
 * collage from ever overflowing the page.
 */
export default function AiRenderPage({
  descriptor,
  pageNumber,
  pageCount,
}: {
  descriptor: AiRenderDescriptor;
  pageNumber: number;
  pageCount: number;
}) {
  const { displayName, imageUrls } = descriptor;
  const staggered = imageUrls.length > 1;

  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <PageTitle title={`${displayName} - AI Render`} />

      <div className="relative -mx-[0.45in] mt-2 min-h-0 flex-1 overflow-hidden">
        {staggered ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrls[0]}
              alt={`${displayName} AI rendering 1`}
              className="absolute left-0 top-0 h-[64%] w-[60%] object-cover"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrls[1]}
              alt={`${displayName} AI rendering 2`}
              className="absolute bottom-0 right-0 h-[64%] w-[60%] border-l-4 border-t-4 border-white object-cover"
            />
          </>
        ) : (
          <div className="absolute inset-x-[0.6in] inset-y-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrls[0]}
              alt={`${displayName} AI rendering`}
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
        )}
      </div>

      <p
        className="mt-1.5 pr-[0.75in] text-[7px] italic leading-snug"
        style={{ color: CHARCOAL }}
      >
        {AI_RENDER_DISCLAIMER}
      </p>
    </GuidePage>
  );
}
