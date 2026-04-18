"use client";

import { useState, useEffect } from "react";
import { saveProject, getProject as getProjectFromStore, generateId, logActivity } from "@/lib/store";
import { STYLE_PRESETS } from "@/lib/style-presets";
import { placeFurniture } from "@/lib/space-planning";
import { useToast } from "./Toast";
import type { Project, Room, FurnitureItem, SceneItem } from "@/lib/types";

interface HealthCheck {
  ok: boolean;
  code: "READY" | "NO_KEY" | "CALL_FAILED" | "UNKNOWN";
  message?: string;
}

interface Props {
  project: Project;
  room: Room;
  onUpdate: () => void;
}

interface SourcedOption {
  name: string;
  vendor: string;
  price: number | null;
  url: string;
  imageUrl?: string;
  dimensions?: string;
}

interface SourcedItem {
  description: string;
  category: string;
  searchQuery: string;
  estimatedSize?: string;
  options: SourcedOption[];
  chosenIndex: number | null;
  /** Cutout image data URL (set after Gemini generates it) */
  cutoutUrl?: string;
  /** Whether this item has been committed to the room's masterlist + scene */
  committed?: boolean;
}

/**
 * AI Scene Studio — the linear per-room workflow.
 *
 * Designer's flow (top-to-bottom):
 *   1. Drop a Matterport screenshot (optional but strongly recommended —
 *      walking the model = familiarity with the space)
 *   2. Pick a style chip
 *   3. Click ⚡ Design This Room
 *   4. Review each item inline: Approve / Reject / Get 3 alternatives
 *   5. Approved items auto-flow into the masterlist + Scene canvas
 *
 * No sub-steps, no modals, no "generate" / "source" as separate buttons.
 * One CTA drives the whole pipeline. Advanced options (manual catalog,
 * regenerate-only, etc.) live in a collapsed accordion at the bottom.
 */
export default function AiSceneStudio({ project, room, onUpdate }: Props) {
  const toast = useToast();
  const [styleId, setStyleId] = useState<string>(() =>
    project.moodBoards.find(b => b.isLockedConcept)?.style
      ? matchStyleFromDesignStyle(project.moodBoards.find(b => b.isLockedConcept)!.style)
      : STYLE_PRESETS[0].id
  );
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [phase, setPhase] = useState<"idle" | "generating" | "sourcing" | "ready">("idle");
  const [sourcedItems, setSourcedItems] = useState<SourcedItem[] | null>(null);
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const preset = STYLE_PRESETS.find(p => p.id === styleId) ?? STYLE_PRESETS[0];
  const hasScene = !!room.sceneBackgroundUrl;

  // Budget math
  const budgetTotal = project.budget || 0;
  const approvedSpend = project.rooms.reduce(
    (s, r) =>
      s +
      r.furniture.reduce((fs, f) => {
        const st = f.status ?? "specced";
        if (st === "approved" || st === "ordered" || st === "delivered") {
          return fs + f.item.price * f.quantity;
        }
        return fs;
      }, 0),
    0
  );
  const remainingBudget = Math.max(0, budgetTotal - approvedSpend);

  // Health-check on mount
  useEffect(() => {
    let cancelled = false;
    fetch("/api/check-gemini")
      .then(r => r.json())
      .then((data: HealthCheck) => {
        if (!cancelled) setHealth(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setHealth({
            ok: false,
            code: "UNKNOWN",
            message: err instanceof Error ? err.message : "Health check failed",
          });
        }
      });
    return () => { cancelled = true; };
  }, []);

  async function loadReferenceFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Not an image — drop a PNG/JPG screenshot");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image > 5MB — screenshot at lower resolution");
      return;
    }
    const reader = new FileReader();
    await new Promise<void>((resolve, reject) => {
      reader.onload = () => {
        setReferenceImage(reader.result as string);
        resolve();
      };
      reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
      reader.readAsDataURL(file);
    });
  }

  // ── Main one-click pipeline ──────────────────────────────────────────

  async function designThisRoom() {
    if (phase !== "idle" && phase !== "ready") return;
    setLastError(null);

    // Phase 1: Generate background (install-guide-style empty-room or
    // image-to-image from reference photo)
    setPhase("generating");
    let backgroundUrl: string;
    try {
      const res = await fetch("/api/generate-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          styleId: preset.id,
          room: {
            name: room.name,
            type: room.type,
            widthFt: room.widthFt,
            lengthFt: room.lengthFt,
          },
          referenceImageDataUrl: referenceImage ?? undefined,
          mode: "install-guide-bg",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { imageDataUrl } = await res.json();
      if (!imageDataUrl) throw new Error("No background returned");
      backgroundUrl = imageDataUrl;

      // Save immediately so the background shows even while sourcing runs
      const fresh = getProjectFromStore(project.id);
      if (!fresh) throw new Error("Project missing");
      const t = fresh.rooms.find(r => r.id === room.id);
      if (!t) throw new Error("Room missing");
      t.sceneBackgroundUrl = backgroundUrl;
      t.sceneSnapshot = backgroundUrl;
      saveProject(fresh);
      onUpdate();
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Background generation failed");
      setPhase("idle");
      return;
    }

    // Phase 2: Source 3 options per identified item
    setPhase("sourcing");
    try {
      const res = await fetch("/api/source-from-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: backgroundUrl,
          budget: remainingBudget || undefined,
          styleHint: preset.id,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { items } = (await res.json()) as {
        items?: Array<{
          description: string;
          category: string;
          searchQuery: string;
          estimatedSize?: string;
          options: SourcedOption[];
        }>;
      };
      if (!items) throw new Error("No items returned from sourcing");
      setSourcedItems(
        items.map(i => ({
          ...i,
          chosenIndex: i.options.length > 0 ? 0 : null,
        }))
      );
      setPhase("ready");

      // Phase 3: pre-generate cutouts in the background so they're ready
      // when the designer approves items. Runs silently; if it finishes
      // before they approve, commit uses cached cutouts.
      void prefetchCutouts(items);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Product sourcing failed");
      setPhase("idle");
    }
  }

  async function prefetchCutouts(
    items: Array<{ description: string; category: string; options: SourcedOption[] }>
  ) {
    await Promise.all(
      items.map(async (it, idx) => {
        const opt = it.options[0];
        if (!opt) return;
        try {
          const res = await fetch("/api/generate-cutout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: `${it.description} (${it.category})`,
              imageUrl: opt.imageUrl || undefined,
              vendor: opt.vendor || undefined,
            }),
          });
          if (!res.ok) return;
          const json = (await res.json()) as { imageUrl?: string; imageDataUrl?: string };
          const url = json.imageUrl ?? json.imageDataUrl;
          if (!url) return;
          setSourcedItems(prev =>
            prev ? prev.map((s, i) => (i === idx ? { ...s, cutoutUrl: url } : s)) : prev
          );
        } catch {}
      })
    );
  }

  // ── Per-item actions ─────────────────────────────────────────────────

  function pickOption(itemIdx: number, optIdx: number | null) {
    setSourcedItems(prev =>
      prev
        ? prev.map((it, i) =>
            i === itemIdx ? { ...it, chosenIndex: optIdx, committed: false } : it
          )
        : prev
    );
  }

  async function approveItem(itemIdx: number) {
    if (!sourcedItems) return;
    const item = sourcedItems[itemIdx];
    if (item.chosenIndex === null) return;
    const opt = item.options[item.chosenIndex];
    if (!opt) return;

    // Make sure we have a cutout — generate on-demand if not prefetched yet.
    // The server handles caching via Supabase storage, so we just call the API.
    let cutoutUrl = item.cutoutUrl;
    if (!cutoutUrl) {
      try {
        const res = await fetch("/api/generate-cutout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: `${item.description} (${item.category})`,
            imageUrl: opt.imageUrl || undefined,
            vendor: opt.vendor || undefined,
          }),
        });
        if (res.ok) {
          const json = (await res.json()) as { imageUrl?: string; imageDataUrl?: string };
          cutoutUrl = json.imageUrl ?? json.imageDataUrl;
        }
      } catch {}
    }

    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const target = fresh.rooms.find(r => r.id === room.id);
    if (!target) return;

    if (!target.sceneItems) target.sceneItems = [];

    const customItem: FurnitureItem = {
      id: `ai-${generateId()}`,
      name: opt.name,
      category: mapCategory(item.category),
      subcategory: item.category,
      widthIn: parseFirstDim(opt.dimensions) ?? 36,
      depthIn: parseSecondDim(opt.dimensions) ?? 36,
      heightIn: parseThirdDim(opt.dimensions) ?? 30,
      price: opt.price ?? 0,
      vendor: opt.vendor,
      vendorUrl: opt.url,
      imageUrl: cutoutUrl || opt.imageUrl || "",
      color: "",
      material: "",
      style: preset.designStyle,
    };
    const placed = placeFurniture(target, customItem);
    // Mark as approved so it counts toward budget
    placed.status = "approved";
    target.furniture.push(placed);

    // Drop onto the scene canvas too
    const existingCount = target.sceneItems.length;
    const cols = 4;
    const row = Math.floor(existingCount / cols);
    const col = existingCount % cols;
    const sceneItem: SceneItem = {
      id: `scene-${generateId()}`,
      itemId: customItem.id,
      x: clamp(10 + (col * 80) / (cols - 1), 2, 80),
      y: clamp(55 + row * 15, 2, 85),
      width: Math.max(12, Math.min(22, (customItem.widthIn / 96) * 25)),
      height: Math.max(10, Math.min(22, (customItem.heightIn / 72) * 22)),
      rotation: 0,
      zIndex: existingCount + 1,
    };
    target.sceneItems.push(sceneItem);
    saveProject(fresh);

    setSourcedItems(prev =>
      prev ? prev.map((s, i) => (i === itemIdx ? { ...s, committed: true } : s)) : prev
    );
    logActivity(project.id, "item_approved", `${opt.name} approved for ${target.name}`);
    toast.success(`${opt.name} added to ${target.name}`);
    onUpdate();
  }

  function rejectItem(itemIdx: number) {
    setSourcedItems(prev =>
      prev
        ? prev.map((s, i) => (i === itemIdx ? { ...s, chosenIndex: null, committed: false } : s))
        : prev
    );
  }

  function clearAndRestart() {
    if (!confirm("Clear the scene background, items, and review list? The masterlist approvals stay.")) return;
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const target = fresh.rooms.find(r => r.id === room.id);
    if (!target) return;
    target.sceneBackgroundUrl = undefined;
    target.sceneSnapshot = undefined;
    target.sceneItems = [];
    saveProject(fresh);
    setSourcedItems(null);
    setPhase("idle");
    setLastError(null);
    onUpdate();
    toast.info("Scene cleared. Design again when ready.");
  }

  // ── Render ───────────────────────────────────────────────────────────

  const approvedCount = sourcedItems?.filter(s => s.committed).length ?? 0;
  const totalApprovedSpend =
    sourcedItems?.reduce((sum, s) => {
      if (!s.committed || s.chosenIndex === null) return sum;
      return sum + (s.options[s.chosenIndex]?.price ?? 0);
    }, 0) ?? 0;

  return (
    <div className="card bg-gradient-to-br from-amber/5 to-amber/0 border-amber/30 mb-4">
      {/* Title + health badge */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-brand-900 flex items-center gap-2 flex-wrap">
            🪄 AI Scene Studio
            <span className="text-[10px] font-normal text-brand-600/70">Gemini</span>
            {health && (
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  health.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                }`}
                title={health.message ?? ""}
              >
                {health.ok ? "● API ready" : `● ${health.code}`}
              </span>
            )}
          </h3>
          <p className="text-xs text-brand-600 mt-1">
            Drop a photo → pick a style → one-click design board. Review, approve, export.
          </p>
        </div>
      </div>

      {health && !health.ok && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-900">
          <div className="font-semibold mb-0.5">
            {health.code === "NO_KEY" ? "Gemini API key not set" : "Gemini API not responding"}
          </div>
          <div>{health.message}</div>
        </div>
      )}

      {lastError && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-900">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold mb-0.5">Last call failed</div>
              <div className="break-words whitespace-pre-wrap">{lastError}</div>
            </div>
            <button
              onClick={() => setLastError(null)}
              className="text-red-600 hover:text-red-900 text-sm leading-none shrink-0"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* 1 · Room photo */}
      <div className="mb-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-1.5">
          1 · Room photo <span className="text-brand-600/60">(optional but better)</span>
        </div>
        <div
          className={`rounded-lg border-2 border-dashed bg-white p-2.5 transition ${
            isDragOver ? "border-amber bg-amber/10" : "border-brand-900/15"
          }`}
          onDragEnter={e => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(true);
          }}
          onDragOver={e => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "copy";
            if (!isDragOver) setIsDragOver(true);
          }}
          onDragLeave={e => {
            e.preventDefault();
            e.stopPropagation();
            if (e.currentTarget === e.target) setIsDragOver(false);
          }}
          onDrop={async e => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (!file) return;
            await loadReferenceFile(file);
          }}
          onPaste={async e => {
            const item = Array.from(e.clipboardData?.items ?? []).find(i =>
              i.type.startsWith("image/")
            );
            if (!item) return;
            const file = item.getAsFile();
            if (!file) return;
            e.preventDefault();
            await loadReferenceFile(file);
          }}
          tabIndex={0}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              {referenceImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={referenceImage}
                  alt="Reference"
                  className="h-12 w-16 object-cover rounded border border-brand-900/10"
                />
              ) : (
                <div className="h-12 w-16 rounded border border-dashed border-brand-900/20 bg-brand-900/5 flex items-center justify-center text-lg">
                  🏠
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-brand-900">
                  {referenceImage
                    ? "Reference photo loaded"
                    : isDragOver
                      ? "Release to drop photo"
                      : "Drop, paste, or upload a room screenshot"}
                </div>
                <div className="text-[10px] text-brand-600 mt-0.5">
                  {referenceImage
                    ? "AI will keep walls/windows/doors from this photo, just restyle."
                    : "Walking the space first = familiarity. AI uses the photo as base architecture."}
                </div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <label className="cursor-pointer text-xs rounded-lg border border-brand-900/15 px-2.5 py-1.5 hover:border-amber/40 hover:bg-amber/5">
                {referenceImage ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    await loadReferenceFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {referenceImage && (
                <button
                  onClick={() => setReferenceImage(null)}
                  className="text-xs text-red-500 hover:underline px-1"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2 · Style */}
      <div className="mb-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-1.5">
          2 · Style
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {STYLE_PRESETS.map(p => {
            const active = p.id === styleId;
            return (
              <button
                key={p.id}
                onClick={() => setStyleId(p.id)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-left transition ${
                  active
                    ? "border-amber bg-amber/15 shadow-sm"
                    : "border-brand-900/10 bg-white hover:border-amber/40"
                }`}
                title={p.description}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-base">{p.emoji}</span>
                  <span className={`text-xs font-semibold ${active ? "text-brand-900" : "text-brand-700"}`}>
                    {p.label}
                  </span>
                </div>
                <div className="flex gap-0.5">
                  {p.palette.map((c, i) => (
                    <div key={i} className="h-3 w-3 rounded-sm" style={{ backgroundColor: c }} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 text-xs text-brand-700 italic">{preset.description}</div>
      </div>

      {/* 3 · The single CTA */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={designThisRoom}
          disabled={phase === "generating" || phase === "sourcing"}
          className="rounded-lg bg-amber px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-dark disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {phase === "generating"
            ? "⚡ Generating background..."
            : phase === "sourcing"
              ? "⚡ Sourcing 3 options per item..."
              : hasScene && sourcedItems
                ? `⚡ Re-Design This Room (${preset.label})`
                : `⚡ Design This Room (${preset.label})`}
        </button>
        {(hasScene || sourcedItems) && (
          <button
            onClick={clearAndRestart}
            className="rounded-lg border border-red-300 px-3 py-2.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            ↶ Clear & Restart
          </button>
        )}
      </div>
      {phase === "idle" && !sourcedItems && (
        <div className="mt-2 text-[10px] text-brand-600/70">
          Chains: generate background → source 6-10 real products with 3 options each → pre-generate cutouts. ~60-90s.
        </div>
      )}

      {/* Rendered scene preview */}
      {hasScene && room.sceneBackgroundUrl && (
        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-1.5">
            Rendered scene
          </div>
          <div className="relative rounded-lg overflow-hidden border border-brand-900/10 bg-brand-900/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={room.sceneBackgroundUrl}
              alt={`${room.name} render`}
              className="w-full h-auto max-h-[520px] object-contain"
            />
          </div>
        </div>
      )}

      {/* 4 · Review panel — inline, below the scene (no modal) */}
      {sourcedItems && sourcedItems.length > 0 && (
        <div className="mt-4 pt-4 border-t border-brand-900/10">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
              3 · Review + approve ({approvedCount}/{sourcedItems.length} approved)
            </div>
            {budgetTotal > 0 && (
              <div className="text-[10px] text-brand-600">
                ${totalApprovedSpend.toLocaleString()} added · ${remainingBudget.toLocaleString()} budget remaining
              </div>
            )}
          </div>
          <div className="space-y-2">
            {sourcedItems.map((item, itemIdx) => (
              <ItemReviewRow
                key={itemIdx}
                item={item}
                onPick={idx => pickOption(itemIdx, idx)}
                onApprove={() => approveItem(itemIdx)}
                onReject={() => rejectItem(itemIdx)}
              />
            ))}
          </div>
          <div className="mt-3 text-[11px] text-brand-600 italic">
            Approved items flow straight into the Deliver tab&apos;s masterlist as approved line items. Re-design if the picks miss the brief.
          </div>
        </div>
      )}

      {/* Advanced */}
      <div className="mt-4 pt-3 border-t border-brand-900/5">
        <button
          onClick={() => setShowAdvanced(s => !s)}
          className="text-[11px] text-brand-600 hover:text-brand-900"
        >
          {showAdvanced ? "▾" : "▸"} Advanced
        </button>
        {showAdvanced && (
          <div className="mt-2 text-[11px] text-brand-600 space-y-1">
            <div>
              • <strong>Matterport auto-pull</strong> available on the Brief tab — faster than walking the model but you miss the spatial familiarity.
            </div>
            <div>
              • <strong>Manual catalog browse</strong> lives on the <strong>Items</strong> tab if the AI picks miss the mark.
            </div>
            <div>
              • <strong>Cutouts cache</strong> across projects — same product won&apos;t re-bill Gemini.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Per-item review row ──────────────────────────────────────────────

function ItemReviewRow({
  item,
  onPick,
  onApprove,
  onReject,
}: {
  item: SourcedItem;
  onPick: (idx: number | null) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const chosen = item.chosenIndex !== null ? item.options[item.chosenIndex] : null;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-lg border p-2.5 transition ${
        item.committed
          ? "border-emerald-300 bg-emerald-50"
          : item.chosenIndex === null
            ? "border-red-200 bg-red-50 opacity-70"
            : "border-brand-900/10 bg-white"
      }`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        {/* Thumbnail */}
        <div className="h-12 w-12 rounded border border-brand-900/10 bg-brand-900/5 overflow-hidden shrink-0">
          {item.cutoutUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={item.cutoutUrl} alt="" className="h-full w-full object-contain" />
          ) : chosen?.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={chosen.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-brand-600/40 text-[10px]">
              …
            </div>
          )}
        </div>

        {/* Description + chosen product */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-brand-900 truncate">{item.description}</div>
          {chosen ? (
            <div className="text-[10px] text-brand-600 mt-0.5 truncate">
              <strong>{chosen.name}</strong> · {chosen.vendor} · ${chosen.price?.toLocaleString() ?? "?"}
            </div>
          ) : (
            <div className="text-[10px] text-red-600 mt-0.5">Rejected</div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 shrink-0">
          {item.committed ? (
            <span className="text-[10px] text-emerald-700 font-semibold px-2 py-1.5 rounded">
              ✓ Added
            </span>
          ) : (
            <>
              <button
                onClick={() => setExpanded(e => !e)}
                className="text-[10px] rounded border border-brand-900/15 px-2 py-1.5 text-brand-700 hover:bg-brand-900/5"
                title="See 3 options"
              >
                3 options
              </button>
              {item.chosenIndex === null ? (
                <button
                  onClick={() => onPick(0)}
                  className="text-[10px] rounded bg-brand-900/10 px-2 py-1.5 text-brand-700 hover:bg-brand-900/15"
                >
                  Restore
                </button>
              ) : (
                <button
                  onClick={onReject}
                  className="text-[10px] rounded bg-red-100 text-red-700 px-2 py-1.5 hover:bg-red-200"
                >
                  ✗ Reject
                </button>
              )}
              {item.chosenIndex !== null && (
                <button
                  onClick={onApprove}
                  className="text-[10px] rounded bg-emerald-600 text-white px-3 py-1.5 font-semibold hover:bg-emerald-700"
                >
                  ✓ Approve
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 3-options expansion */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-brand-900/5 grid grid-cols-3 gap-2">
          {item.options.map((opt, idx) => {
            const picked = item.chosenIndex === idx;
            return (
              <button
                key={idx}
                onClick={() => onPick(idx)}
                className={`text-left rounded-lg border p-2 transition ${
                  picked
                    ? "border-amber bg-amber/10 shadow-sm"
                    : "border-brand-900/10 bg-white hover:border-amber/40"
                }`}
              >
                <div className="text-[10px] font-medium text-brand-900 line-clamp-2">{opt.name}</div>
                <div className="text-[9px] text-brand-600 mt-0.5">{opt.vendor}</div>
                <div className="text-[11px] font-semibold text-brand-900 mt-0.5">
                  {opt.price !== null ? `$${opt.price.toLocaleString()}` : "—"}
                </div>
                {opt.url && (
                  <a
                    href={opt.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-[9px] text-amber-dark hover:underline mt-1 inline-block"
                  >
                    View →
                  </a>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function matchStyleFromDesignStyle(ds: string): string {
  const map: Record<string, string> = {
    scandinavian: "scandinavian",
    "mid-century": "mid-century-modern",
    coastal: "coastal",
    bohemian: "boho",
    traditional: "traditional",
    contemporary: "organic-modern",
    modern: "japandi",
    rustic: "mediterranean",
  };
  return map[ds] ?? "japandi";
}

function mapCategory(c: string): FurnitureItem["category"] {
  const s = c.toLowerCase();
  if (s.includes("bed") || s.includes("mattress")) return "beds-mattresses";
  if (s.includes("sofa") || s.includes("chair") || s.includes("seating") || s.includes("ottoman"))
    return "seating";
  if (s.includes("table") || s.includes("desk") || s.includes("nightstand")) return "tables";
  if (s.includes("storage") || s.includes("dresser") || s.includes("shelf") || s.includes("cabinet"))
    return "storage";
  if (s.includes("lamp") || s.includes("light") || s.includes("pendant") || s.includes("sconce"))
    return "lighting";
  if (s.includes("rug") || s.includes("textile") || s.includes("curtain") || s.includes("pillow"))
    return "rugs-textiles";
  if (s.includes("art") || s.includes("mirror") || s.includes("vase") || s.includes("plant"))
    return "decor";
  if (s.includes("outdoor") || s.includes("patio")) return "outdoor";
  if (s.includes("bathroom") || s.includes("towel")) return "bathroom";
  if (s.includes("kitchen") || s.includes("dinner")) return "kitchen-dining";
  return "decor";
}

function parseFirstDim(s?: string): number | null {
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:["]|in|inches)?/i);
  return m ? parseFloat(m[1]) : null;
}
function parseSecondDim(s?: string): number | null {
  if (!s) return null;
  const m = s.match(/\d+(?:\.\d+)?["\s]*[xX×]\s*(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}
function parseThirdDim(s?: string): number | null {
  if (!s) return null;
  const m = s.match(/\d+(?:\.\d+)?["\s]*[xX×]\s*\d+(?:\.\d+)?["\s]*[xX×]\s*(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}
