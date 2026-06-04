"use client";

import { useEffect } from "react";
import {
  DEFAULT_PARAMS,
  LS_KEY_PARAMS,
  type PostBuilderParams,
} from "@/lib/post-templates";

interface Props {
  params: PostBuilderParams;
  onChange: (next: PostBuilderParams) => void;
}

export default function ParamsPanel({ params, onChange }: Props) {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY_PARAMS);
      if (raw) onChange({ ...DEFAULT_PARAMS, ...JSON.parse(raw) });
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(patch: Partial<PostBuilderParams>) {
    const next = { ...params, ...patch };
    onChange(next);
    try {
      localStorage.setItem(LS_KEY_PARAMS, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="text-sm font-semibold text-gray-700">Carousel params</div>

      <label className="block text-xs text-gray-600">
        Slide count
        <input
          type="number"
          min={3}
          max={15}
          value={params.slideCount}
          onChange={(e) =>
            update({ slideCount: Math.max(3, Math.min(15, Number(e.target.value) || 10)) })
          }
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </label>

      <label className="block text-xs text-gray-600">
        Reading level
        <input
          type="text"
          value={params.readingLevel}
          onChange={(e) => update({ readingLevel: e.target.value })}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </label>

      <label className="block text-xs text-gray-600">
        Audience
        <textarea
          value={params.audience}
          onChange={(e) => update({ audience: e.target.value })}
          rows={2}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </label>

      <label className="block text-xs text-gray-600">
        Tone
        <input
          type="text"
          value={params.tone}
          onChange={(e) => update({ tone: e.target.value })}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </label>

      <details className="text-xs text-gray-600">
        <summary className="cursor-pointer select-none font-medium">
          Per-slide budgets
        </summary>
        <div className="mt-2 space-y-2">
          <label className="block">
            Max body chars per slide
            <input
              type="number"
              value={params.maxCharsBody}
              onChange={(e) =>
                update({ maxCharsBody: Math.max(60, Number(e.target.value) || 280) })
              }
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="block">
            Max bullets per slide
            <input
              type="number"
              value={params.maxBullets}
              onChange={(e) =>
                update({ maxBullets: Math.max(2, Number(e.target.value) || 6) })
              }
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="block">
            Max chars per bullet
            <input
              type="number"
              value={params.maxCharsBullet}
              onChange={(e) =>
                update({ maxCharsBullet: Math.max(20, Number(e.target.value) || 60) })
              }
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            />
          </label>
        </div>
      </details>
    </div>
  );
}
