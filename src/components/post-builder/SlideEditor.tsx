"use client";

import type { Slide } from "@/lib/post-templates";

interface Props {
  slide: Slide;
  onChange: (next: Slide) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

// Generic textarea that edits an array of strings via newline-separated text.
function Lines({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  rows?: number;
}) {
  return (
    <label className="block text-xs text-gray-600">
      {label}
      <textarea
        value={value.join("\n")}
        onChange={(e) =>
          onChange(e.target.value.split("\n").map((l) => l.trim()).filter(Boolean))
        }
        rows={rows}
        className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
      />
    </label>
  );
}

function Text({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs text-gray-600">
      {label}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
      />
    </label>
  );
}

export default function SlideEditor({
  slide,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: Props) {
  function patch<T extends Slide>(p: Partial<T>) {
    onChange({ ...(slide as T), ...p } as Slide);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          Slide type: <span className="font-semibold text-gray-800">{slide.type}</span>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!onMoveUp}
            className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 disabled:opacity-40"
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!onMoveDown}
            className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 disabled:opacity-40"
            title="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {slide.type === "hook-opener" && (
        <>
          <Text
            label="Headline"
            value={slide.headline}
            onChange={(v) => patch({ headline: v })}
          />
          <Lines
            label="Preview items (numbered, optional)"
            value={slide.items ?? []}
            onChange={(v) => patch({ items: v })}
          />
          <Lines
            label="Footer lines (optional)"
            value={slide.footer ?? []}
            onChange={(v) => patch({ footer: v })}
          />
        </>
      )}

      {slide.type === "personal-story" && (
        <Lines
          label="Paragraphs (one per line, **bold** supported)"
          value={slide.paragraphs}
          onChange={(v) => patch({ paragraphs: v })}
          rows={6}
        />
      )}

      {slide.type === "criteria-bullets" && (
        <>
          <Text
            label="Heading"
            value={slide.heading}
            onChange={(v) => patch({ heading: v })}
          />
          <Lines
            label="Bullets"
            value={slide.bullets}
            onChange={(v) => patch({ bullets: v })}
          />
          <Text
            label="Footer (optional)"
            value={slide.footer ?? ""}
            onChange={(v) => patch({ footer: v })}
          />
        </>
      )}

      {slide.type === "market-detail" && (
        <>
          <label className="block text-xs text-gray-600">
            Rank
            <input
              type="number"
              value={slide.rank}
              onChange={(e) => patch({ rank: Number(e.target.value) || 1 })}
              className="mt-1 w-24 rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </label>
          <Text label="Title" value={slide.title} onChange={(v) => patch({ title: v })} />
          <Text
            label="Subtitle"
            value={slide.subtitle ?? ""}
            onChange={(v) => patch({ subtitle: v })}
          />
          <Lines label="Bullets" value={slide.bullets} onChange={(v) => patch({ bullets: v })} />
          <Lines
            label="Stats (format: Label|Value per line)"
            value={(slide.stats ?? []).map((s) => `${s.label}|${s.value}`)}
            onChange={(v) =>
              patch({
                stats: v.map((line) => {
                  const [label, value] = line.split("|");
                  return { label: (label ?? "").trim(), value: (value ?? "").trim() };
                }),
              })
            }
          />
        </>
      )}

      {slide.type === "numbered-list" && (
        <>
          <Text
            label="Heading"
            value={slide.heading}
            onChange={(v) => patch({ heading: v })}
          />
          <Lines label="Items" value={slide.items} onChange={(v) => patch({ items: v })} />
        </>
      )}

      {slide.type === "plain-text" && (
        <Lines
          label="Paragraphs"
          value={slide.paragraphs}
          onChange={(v) => patch({ paragraphs: v })}
        />
      )}

      {slide.type === "cta" && (
        <Lines
          label="Paragraphs (**bold** for the DM keyword)"
          value={slide.paragraphs}
          onChange={(v) => patch({ paragraphs: v })}
        />
      )}
    </div>
  );
}
