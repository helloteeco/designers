"use client";

import { useState } from "react";

interface Props {
  caption: string;
  hooks: string[];
  onCaptionChange: (v: string) => void;
  onHookChange: (i: number, v: string) => void;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // ignore
        }
      }}
      className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export default function CaptionPanel({
  caption,
  hooks,
  onCaptionChange,
  onHookChange,
}: Props) {
  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-700">Caption</div>
          <CopyButton text={caption} />
        </div>
        <textarea
          value={caption}
          onChange={(e) => onCaptionChange(e.target.value)}
          rows={6}
          className="w-full rounded border border-gray-300 p-2 text-sm"
          placeholder="Caption appears after generating…"
        />
      </div>

      <div>
        <div className="mb-1 text-sm font-semibold text-gray-700">Hook variations</div>
        <div className="space-y-2">
          {hooks.length === 0 && (
            <div className="text-xs text-gray-400">
              3 alternate first-slide hooks will appear here after generating.
            </div>
          )}
          {hooks.map((h, i) => (
            <div key={i} className="flex gap-2">
              <textarea
                value={h}
                onChange={(e) => onHookChange(i, e.target.value)}
                rows={2}
                className="flex-1 rounded border border-gray-300 p-2 text-sm"
              />
              <CopyButton text={h} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
