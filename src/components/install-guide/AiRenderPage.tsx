import type { AiRenderDescriptor } from "./page-list";
import { CHARCOAL, GuidePage, PageTitle } from "./chrome";

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
  const sideBySide = imageUrls.length > 1;

  return (
    <GuidePage pageNumber={pageNumber} pageCount={pageCount}>
      <PageTitle overline="Visualization" title={`${displayName} – AI Render`} />

      <div
        className={`mt-3 min-h-0 flex-1 ${
          sideBySide ? "grid grid-cols-2 gap-[0.3in]" : "relative"
        }`}
      >
        {imageUrls.map((url, i) =>
          sideBySide ? (
            <div key={i} className="relative min-h-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`${displayName} AI rendering ${i + 1}`}
                className="absolute inset-0 h-full w-full object-contain"
              />
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={i}
              src={url}
              alt={`${displayName} AI rendering`}
              className="absolute inset-0 h-full w-full object-contain"
            />
          )
        )}
      </div>

      <p className="mt-3 text-center text-[10px] italic" style={{ color: CHARCOAL }}>
        This rendering is AI generated and is not exact. Please refer to the
        floor plan for correct furniture placement.
      </p>
    </GuidePage>
  );
}
