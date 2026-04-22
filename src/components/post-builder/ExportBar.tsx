"use client";

import { useState } from "react";
import { toPng } from "html-to-image";
import JSZip from "jszip";

interface Props {
  getSlideNodes: () => (HTMLElement | null)[];
  slideCount: number;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function nodeToBlob(node: HTMLElement): Promise<Blob> {
  // Wait a tick so any images finish loading, then render.
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: 1,
    width: 1080,
    height: 1080,
    style: { transform: "none" },
  });
  const resp = await fetch(dataUrl);
  return await resp.blob();
}

export default function ExportBar({ getSlideNodes, slideCount }: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  async function downloadAll() {
    const nodes = getSlideNodes();
    if (nodes.length === 0) return;
    setBusy(true);
    try {
      const zip = new JSZip();
      for (let i = 0; i < nodes.length; i++) {
        setProgress(`Rendering slide ${i + 1}/${nodes.length}`);
        const node = nodes[i];
        if (!node) continue;
        const blob = await nodeToBlob(node);
        const buf = await blob.arrayBuffer();
        zip.file(`slide-${String(i + 1).padStart(2, "0")}.png`, buf);
      }
      setProgress("Zipping…");
      const zipBlob = await zip.generateAsync({ type: "blob" });
      download(zipBlob, "carousel.zip");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function downloadEach() {
    const nodes = getSlideNodes();
    setBusy(true);
    try {
      for (let i = 0; i < nodes.length; i++) {
        setProgress(`Rendering slide ${i + 1}/${nodes.length}`);
        const node = nodes[i];
        if (!node) continue;
        const blob = await nodeToBlob(node);
        download(blob, `slide-${String(i + 1).padStart(2, "0")}.png`);
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const disabled = busy || slideCount === 0;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={downloadAll}
        disabled={disabled}
        className="rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-black disabled:opacity-50"
      >
        Download all (zip)
      </button>
      <button
        type="button"
        onClick={downloadEach}
        disabled={disabled}
        className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
      >
        Download each
      </button>
      {progress && <span className="text-xs text-gray-500">{progress}</span>}
    </div>
  );
}
