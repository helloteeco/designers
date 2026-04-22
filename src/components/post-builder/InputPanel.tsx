"use client";

import { useState } from "react";

export type InputMode = "screenshots" | "text" | "instagram" | "raw";

export interface InputState {
  mode: InputMode;
  topic: string;
  text: string;
  raw: string;
  igUrl: string;
  images: string[]; // data URLs
}

export const EMPTY_INPUT: InputState = {
  mode: "screenshots",
  topic: "",
  text: "",
  raw: "",
  igUrl: "",
  images: [],
};

interface Props {
  value: InputState;
  onChange: (next: InputState) => void;
  busy: boolean;
  onGenerate: () => void;
  onFetchIg: () => void;
  igStatus?: string | null;
}

const TABS: { id: InputMode; label: string }[] = [
  { id: "screenshots", label: "Screenshots" },
  { id: "text", label: "Paste text" },
  { id: "instagram", label: "Instagram URL" },
  { id: "raw", label: "My own text" },
];

export default function InputPanel({
  value,
  onChange,
  busy,
  onGenerate,
  onFetchIg,
  igStatus,
}: Props) {
  const [dragActive, setDragActive] = useState(false);

  function setField<K extends keyof InputState>(k: K, v: InputState[K]) {
    onChange({ ...value, [k]: v });
  }

  async function addFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const dataUrls = await Promise.all(
      arr.map(
        (f) =>
          new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.onerror = reject;
            r.readAsDataURL(f);
          }),
      ),
    );
    onChange({ ...value, images: [...value.images, ...dataUrls] });
  }

  function removeImage(i: number) {
    const next = value.images.slice();
    next.splice(i, 1);
    onChange({ ...value, images: next });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex gap-1 border-b border-gray-100">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setField("mode", t.id)}
            className={`rounded-t px-3 py-1.5 text-xs font-medium transition ${
              value.mode === t.id
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <label className="mb-3 block text-xs text-gray-600">
        Topic / angle (optional but helpful)
        <input
          type="text"
          value={value.topic}
          onChange={(e) => setField("topic", e.target.value)}
          placeholder="e.g. best rural Airbnb markets for 2026"
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </label>

      {value.mode === "screenshots" && (
        <div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
            }}
            className={`rounded-lg border-2 border-dashed p-6 text-center text-sm transition ${
              dragActive
                ? "border-gray-900 bg-gray-50"
                : "border-gray-300 text-gray-500"
            }`}
          >
            Drag screenshots here, or
            <label className="ml-1 cursor-pointer text-gray-900 underline">
              click to browse
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
            </label>
          </div>
          {value.images.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {value.images.map((src, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className="h-20 w-full rounded border border-gray-200 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[10px] text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {value.mode === "text" && (
        <textarea
          value={value.text}
          onChange={(e) => setField("text", e.target.value)}
          rows={8}
          placeholder="Paste the competitor's post text here…"
          className="w-full rounded border border-gray-300 p-2 text-sm"
        />
      )}

      {value.mode === "raw" && (
        <textarea
          value={value.raw}
          onChange={(e) => setField("raw", e.target.value)}
          rows={10}
          placeholder="Paste your own long-form content. Claude will compress it into your carousel template."
          className="w-full rounded border border-gray-300 p-2 text-sm"
        />
      )}

      {value.mode === "instagram" && (
        <div className="space-y-2">
          <input
            type="url"
            value={value.igUrl}
            onChange={(e) => setField("igUrl", e.target.value)}
            placeholder="https://www.instagram.com/p/..."
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={onFetchIg}
            disabled={!value.igUrl || busy}
            className="rounded bg-gray-200 px-3 py-1 text-xs font-medium text-gray-800 hover:bg-gray-300 disabled:opacity-50"
          >
            Resolve IG post
          </button>
          {igStatus && (
            <div className="text-xs text-gray-600 whitespace-pre-wrap">
              {igStatus}
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-gray-500">
            IG blocks most unauthenticated fetches. If this fails, switch to
            Screenshots — it always works.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onGenerate}
        disabled={busy}
        className="mt-4 w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
      >
        {busy ? "Generating…" : "Generate carousel"}
      </button>
    </div>
  );
}
