"use client";

import { useState, useEffect, useRef } from "react";
import { saveProject, getProject as getProjectFromStore, generateId, logActivity } from "@/lib/store";
import { STYLE_PRESETS } from "@/lib/style-presets";
import { placeFurniture } from "@/lib/space-planning";
import { compositeRoomScene } from "@/lib/composite-scene";
import { ensureHostedUrl, compactProjectImages, finalizeCutout } from "@/lib/scene-storage";
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
  // Reference image persists on room.referenceImageUrl so it survives
  // tab switches + reloads. The composite board uses this as its
  // backdrop (not a stripped AI render — the actual room photo).
  const [referenceImage, setReferenceImage] = useState<string | null>(() => room.referenceImageUrl ?? null);
  const [isDragOver, setIsDragOver] = useState(false);
  // Phase machine:
  //   idle      — nothing in flight, no preview to review
  //   generating — Gemini is rendering the scene image
  //   preview   — image is back, designer reviews + can re-roll, refine, or approve
  //   sourcing  — only used in cutout-bg mode; product search + cutouts running
  //   ready     — final state (approved + sourced if applicable)
  const [phase, setPhase] = useState<"idle" | "generating" | "preview" | "sourcing" | "ready">("idle");
  const [refineNotes, setRefineNotes] = useState("");

  // When a reference photo is uploaded for the first time, auto-flip the
  // mode chooser to Composite — that's the right path for "use my room as
  // the base architecture + layer real products on top." Designer can still
  // switch back to Realistic if they want a furnished render.
  const sawReferenceRef = useRef<boolean>(!!referenceImage);
  useEffect(() => {
    if (referenceImage && !sawReferenceRef.current) {
      sawReferenceRef.current = true;
      setRenderMode("cutout-bg");
    }
    if (!referenceImage) sawReferenceRef.current = false;
  }, [referenceImage]);

  // Click-to-edit on the preview image: when designer clicks a specific
  // item in the rendered scene, a popover opens with swap/source/remove
  // actions targeting just that item.
  const [clickEdit, setClickEdit] = useState<{
    xPct: number;
    yPct: number;
    state: "menu" | "swapping" | "removing" | "sourcing" | "options";
    swapInput?: string;
    identified?: string;
    options?: { name: string; vendor: string; price: number | null; url: string; imageUrl?: string; dimensions?: string }[];
    error?: string;
  } | null>(null);
  // Two render modes:
  //   "realistic" — fully furnished photorealistic render (designer/client hero
  //                 image, no cutout sourcing — what you actually see is what you get)
  //   "cutout-bg" — empty-room schematic for layering sourced product cutouts
  //                 on top (the install-guide composite workflow)
  const [renderMode, setRenderMode] = useState<"realistic" | "cutout-bg">("realistic");
  const [sourcedItems, setSourcedItems] = useState<SourcedItem[] | null>(null);
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Pick-first flow — designer picks real products BEFORE the composite is
  // built, so the final image and the masterlist ship identical items by
  // construction. Old reverse-sourcing flow stays for AI-seeded suggestions.
  const [pickQuery, setPickQuery] = useState<string>("");
  const [pickOptions, setPickOptions] = useState<{ description: string; options: SourcedOption[] } | null>(null);
  const [pickPhase, setPickPhase] = useState<"idle" | "searching" | "adding">("idle");
  const [urlQuery, setUrlQuery] = useState<string>("");
  const [composing, setComposing] = useState(false);
  const [selectedPlacedId, setSelectedPlacedId] = useState<string | null>(null);
  // When set, picking from the search result REPLACES this scene item in-place
  // instead of adding a new one. Clears on any pick/close.
  const [swappingId, setSwappingId] = useState<string | null>(null);
  const [wallPrompt, setWallPrompt] = useState<string>("");
  const [wallBusy, setWallBusy] = useState(false);
  const [tipsDraft, setTipsDraft] = useState<string>(room.installTips ?? "");
  // Staging list after "Turn into composite" identifies items in the render.
  // Designer picks which to KEEP vs REMOVE, maybe adds a custom item, then
  // hits "Place selected items" to actually composite.
  const [extractionReview, setExtractionReview] = useState<null | {
    sourceRender: string; // the original AI render we extracted from
    items: Array<{
      id: string;
      description: string;
      category: string;
      thumbnailDataUrl: string;
      boundingBoxPct: { x: number; y: number; w: number; h: number };
      keep: boolean;
    }>;
  }>(null);
  const [extractingReview, setExtractingReview] = useState(false);
  const [placingReviewed, setPlacingReviewed] = useState(false);
  const [compacting, setCompacting] = useState(false);

  /**
   * Jeff's "Storage full" escape hatch: walk the whole project, upload
   * every remaining base64 data URL to Supabase, swap localStorage for
   * the hosted URLs, save. Usually frees 10-30 MB on an active project
   * and fixes QuotaExceededError going forward.
   */
  async function freeUpStorage() {
    if (compacting) return;
    setCompacting(true);
    setLastError(null);
    try {
      const fresh = getProjectFromStore(project.id);
      if (!fresh) throw new Error("Project missing");
      const { uploaded } = await compactProjectImages(fresh);
      if (uploaded === 0) {
        toast.info("Already compact — no base64 images found to offload.");
      } else {
        saveProject(fresh);
        onUpdate();
        toast.success(`Moved ${uploaded} image${uploaded === 1 ? "" : "s"} to cloud storage. localStorage is leaner now.`);
      }
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Compact failed");
    } finally {
      setCompacting(false);
    }
  }

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

  // Auto-compact on mount: silently move any leftover base64 images from
  // localStorage to Supabase so storage never fills up. Skip if we've
  // already compacted this project this session — saves needless uploads.
  const compactedKey = `compacted:${project.id}`;
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(compactedKey) === "1") return;
    const run = async () => {
      try {
        const fresh = getProjectFromStore(project.id);
        if (!fresh) return;
        const { uploaded } = await compactProjectImages(fresh);
        if (uploaded > 0) {
          saveProject(fresh);
          onUpdate();
        }
        sessionStorage.setItem(compactedKey, "1");
      } catch {
        // fail quiet — worst case Jeff's localStorage still fills up
        // and the storage-full alert points at the manual escape hatch
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

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
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
      reader.readAsDataURL(file);
    });
    setReferenceImage(dataUrl);

    // Persist immediately — upload to Supabase so localStorage stays
    // small AND switching rooms / reloading keeps the reference around.
    const hosted = await ensureHostedUrl(dataUrl, "scenes");
    const fresh = getProjectFromStore(project.id);
    if (fresh) {
      const t = fresh.rooms.find(r => r.id === room.id);
      if (t) {
        t.referenceImageUrl = hosted ?? dataUrl;
        saveProject(fresh);
        // Keep component state in sync with what's persisted so downstream
        // code (placeReviewedItems, etc.) sees the hosted URL not the blob
        setReferenceImage(hosted ?? dataUrl);
        onUpdate();
      }
    }
  }

  // ── Main one-click pipeline ──────────────────────────────────────────

  /**
   * Phase 1: just render the scene image. Goes to "preview" so the
   * designer can review, refine, re-roll, or approve before the expensive
   * sourcing call. extraNotesOverride lets the refine flow append notes
   * to the prompt without going through state.
   */
  async function generateScene(extraNotesOverride?: string) {
    if (phase === "generating" || phase === "sourcing") return;
    setLastError(null);
    setPhase("generating");

    const notes = extraNotesOverride !== undefined ? extraNotesOverride : refineNotes;

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
          mode: renderMode === "realistic" ? "full-scene" : "install-guide-bg",
          extraNotes: notes?.trim() || undefined,
        }),
      });
      const raw = await res.text();
      let parsed: { imageDataUrl?: string; error?: string; errors?: Array<{ model: string; error: string }> } = {};
      try { parsed = JSON.parse(raw); } catch { /* keep raw */ }

      if (!res.ok) {
        const detail = parsed.error
          || (parsed.errors && parsed.errors.length > 0
            ? parsed.errors.map(e => `[${e.model}] ${e.error}`).join(" · ")
            : null)
          || raw.slice(0, 500)
          || `HTTP ${res.status}`;
        throw new Error(`HTTP ${res.status} — ${detail}`);
      }
      const imageDataUrl = parsed.imageDataUrl;
      if (!imageDataUrl) {
        throw new Error(`API returned 200 but no imageDataUrl. Raw response: ${raw.slice(0, 400)}`);
      }

      // Offload the big base64 blob to Supabase so localStorage doesn't
      // fill up after a few renders. Falls back to the data URL if upload
      // fails for any reason.
      const hostedUrl = await ensureHostedUrl(imageDataUrl, "scenes");

      // Persist immediately so reload survives + Install Guide hero updates
      const fresh = getProjectFromStore(project.id);
      if (!fresh) throw new Error("Project missing in localStorage");
      const t = fresh.rooms.find(r => r.id === room.id);
      if (!t) throw new Error(`Room ${room.id} missing in project`);
      t.sceneBackgroundUrl = hostedUrl;
      t.sceneSnapshot = hostedUrl;
      saveProject(fresh);
      onUpdate();

      setPhase("preview");
      // Clear any previous sourcing results since the scene changed
      setSourcedItems(null);
    } catch (err) {
      const msg = err instanceof Error && err.message
        ? err.message
        : `Image generation failed (${typeof err === "object" ? JSON.stringify(err).slice(0, 200) : String(err)})`;
      setLastError(msg);
      setPhase("idle");
    }
  }

  /**
   * Phase 2 (cutout-bg mode only): designer approved the preview, now
   * source 3 real product options per identified item + prefetch cutouts.
   */
  async function sourceProducts() {
    if (phase === "sourcing") return;
    if (!room.sceneBackgroundUrl) {
      setLastError("No scene to source from — generate one first.");
      return;
    }
    setLastError(null);
    setPhase("sourcing");
    try {
      const res = await fetch("/api/source-from-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: room.sceneBackgroundUrl,
          budget: remainingBudget || undefined,
          styleHint: preset.id,
        }),
      });
      const raw = await res.text();
      let parsed: { items?: SourcedItem[]; error?: string } = {};
      try { parsed = JSON.parse(raw); } catch { /* keep raw */ }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} — ${parsed.error || raw.slice(0, 500)}`);
      }
      const items = parsed.items;
      if (!items) {
        throw new Error(`API returned 200 but no items array. Raw: ${raw.slice(0, 400)}`);
      }
      setSourcedItems(
        items.map(i => ({
          ...i,
          chosenIndex: i.options.length > 0 ? 0 : null,
        }))
      );
      setPhase("ready");
      void prefetchCutouts(items);
    } catch (err) {
      const msg = err instanceof Error && err.message
        ? err.message
        : `Product sourcing failed (${typeof err === "object" ? JSON.stringify(err).slice(0, 200) : String(err)})`;
      setLastError(msg);
      setPhase("preview"); // back to preview so they can approve again or re-render
    }
  }

  /**
   * Convenience: realistic mode = generate + done.
   * Cutout-bg mode = generate + preview gate + (manual) approve → source.
   */
  async function designThisRoom() {
    setRefineNotes("");
    await generateScene("");
    // designThisRoom always goes via the preview gate now — designer
    // explicitly clicks "Approve & source" to proceed (cutout-bg mode)
    // or "Use this render" (realistic mode).
  }

  function approveAndContinue() {
    if (renderMode === "realistic") {
      setPhase("ready");
      toast.success(`${preset.label} render saved as room hero`);
    } else {
      void sourceProducts();
    }
  }

  /**
   * Step 1 of the AI-render → composite conversion: identify every item
   * in the render, crop a thumbnail of each one from the render itself,
   * and surface them as a REVIEW list. Designer ticks keep/remove (and
   * can add custom items) before anything gets placed on the backdrop.
   *
   * Why a review step: Jeff doesn't want to auto-place everything
   * blindly. The render often includes items he wouldn't ship
   * (existing chandelier he hates, throw pillows he'd skip, etc).
   * Cull first, THEN commit to the composite.
   */
  async function identifyItemsForReview() {
    if (extractingReview) return;
    const render = room.sceneBackgroundUrl;
    if (!render) {
      setLastError("Generate a render first, then extract items.");
      return;
    }
    setLastError(null);
    setExtractingReview(true);
    try {
      // 1. Get bounding boxes from Gemini vision
      const res = await fetch("/api/extract-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: render }),
      });
      const raw = await res.text();
      let payload: {
        items?: Array<{
          description: string;
          category: string;
          boundingBoxPct: { x: number; y: number; w: number; h: number };
        }>;
        error?: string;
      } = {};
      try { payload = JSON.parse(raw); } catch {}
      if (!res.ok) {
        throw new Error(payload.error || `HTTP ${res.status} — ${raw.slice(0, 300)}`);
      }
      const items = payload.items ?? [];
      if (items.length === 0) {
        throw new Error("AI couldn't identify items in this render. Try re-rolling the render first.");
      }

      // 2. Crop a thumbnail per item, client-side from the render
      const img = await loadImageEl(render);
      const thumbnails = await Promise.all(items.map(async it => {
        try {
          const thumbnailDataUrl = cropToDataUrl(img, it.boundingBoxPct);
          return {
            id: `rev-${generateId()}`,
            description: it.description,
            category: it.category,
            thumbnailDataUrl,
            boundingBoxPct: it.boundingBoxPct,
            keep: true,
          };
        } catch {
          return null;
        }
      }));
      const valid = thumbnails.filter((x): x is NonNullable<typeof x> => !!x);

      setExtractionReview({ sourceRender: render, items: valid });
      toast.info(`Found ${valid.length} items. Keep the ones you want, then place them on the backdrop.`);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtractingReview(false);
    }
  }

  function toggleReviewKeep(id: string) {
    setExtractionReview(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(it => it.id === id ? { ...it, keep: !it.keep } : it),
      };
    });
  }

  function removeReviewItem(id: string) {
    setExtractionReview(prev => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.filter(it => it.id !== id) };
    });
  }

  function cancelReview() {
    setExtractionReview(null);
  }

  /**
   * Step 2 of the AI-render → composite conversion: take the kept items
   * from the review list, strip the render to an empty backdrop, and
   * place each kept item as a cutout at its original bounding-box
   * position. In parallel, source a real product for each item so the
   * masterlist ships something actually buyable.
   *
   * The composite image ends up looking exactly like the AI render
   * (because the cutouts ARE cropped from it). The Excel sheet ships
   * real SKUs. Best of both.
   */
  async function placeReviewedItems() {
    if (!extractionReview || placingReviewed) return;
    const kept = extractionReview.items.filter(i => i.keep);
    if (kept.length === 0) {
      setLastError("Select at least one item to keep.");
      return;
    }
    setLastError(null);
    setPlacingReviewed(true);
    try {
      // 1. Backdrop: use the designer's ACTUAL uploaded room photo —
      //    that's the real empty room. Skip the strip-scene AI call
      //    entirely (expensive + often imprecise). If somehow the
      //    reference photo is gone, fall back to stripping the render.
      let backdrop = referenceImage ?? room.referenceImageUrl;
      if (!backdrop) {
        const stripRes = await fetch("/api/strip-scene", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: extractionReview.sourceRender }),
        });
        const stripPayload = (await stripRes.json()) as { imageDataUrl?: string; error?: string };
        if (!stripRes.ok || !stripPayload.imageDataUrl) {
          throw new Error(stripPayload.error || "No reference photo — and strip-fallback failed");
        }
        backdrop = stripPayload.imageDataUrl;
      }
      backdrop = (await ensureHostedUrl(backdrop, "scenes")) ?? backdrop;

      // 2. Persist the backdrop + clear any stale items
      const fresh = getProjectFromStore(project.id);
      if (!fresh) throw new Error("Project missing");
      const target = fresh.rooms.find(r => r.id === room.id);
      if (!target) throw new Error("Room missing");
      target.sceneBackgroundUrl = backdrop;
      target.sceneSnapshot = undefined;
      target.sceneItems = [];
      saveProject(fresh);
      onUpdate();
      toast.info(`Placing ${kept.length} items on your room photo... (~15s)`);

      // 3. For each kept item: clean bg-remove on the thumbnail + source real product
      //    Both run in parallel; we re-read project state per save to avoid races.
      await Promise.all(kept.map(async (item, idx) => {
        const [cutoutResult, sourceResult] = await Promise.allSettled([
          fetch("/api/generate-cutout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: item.description,
              imageUrl: item.thumbnailDataUrl,
            }),
          }).then(r => r.ok ? r.json() as Promise<{ imageUrl?: string; imageDataUrl?: string }> : null),
          fetch("/api/source-item", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: item.description,
              styleHint: preset.id,
              budget: remainingBudget || undefined,
              roomType: room.type,
            }),
          }).then(r => r.ok ? r.json() as Promise<{ options?: SourcedOption[] }> : null),
        ]);

        const rawCutoutUrl = cutoutResult.status === "fulfilled" && cutoutResult.value
          ? (cutoutResult.value.imageUrl ?? cutoutResult.value.imageDataUrl ?? item.thumbnailDataUrl)
          : item.thumbnailDataUrl;
        // Color-key white → transparent, then upload. Gives us real
        // cutouts (no white box around each item on the composite).
        const cutoutUrl = await finalizeCutout(rawCutoutUrl);

        const opt = sourceResult.status === "fulfilled" && sourceResult.value?.options?.[0]
          ? sourceResult.value.options[0]
          : null;

        // Re-fetch fresh project state so parallel saves don't clobber
        const next = getProjectFromStore(project.id);
        if (!next) return;
        const tt = next.rooms.find(r => r.id === room.id);
        if (!tt) return;
        if (!tt.sceneItems) tt.sceneItems = [];

        const category = mapCategory(item.category);
        const customItem: FurnitureItem = {
          id: `ext-${generateId()}`,
          name: opt?.name ?? item.description,
          category,
          subcategory: item.category,
          widthIn: parseFirstDim(opt?.dimensions) ?? 36,
          depthIn: parseSecondDim(opt?.dimensions) ?? 36,
          heightIn: parseThirdDim(opt?.dimensions) ?? 30,
          price: opt?.price ?? 0,
          vendor: opt?.vendor ?? "—",
          vendorUrl: opt?.url ?? "",
          imageUrl: cutoutUrl ?? item.thumbnailDataUrl,
          color: "",
          material: "",
          style: preset.designStyle,
        };
        const placed = placeFurniture(tt, customItem);
        placed.status = opt ? "approved" : "specced";
        tt.furniture.push(placed);

        // Position from the ORIGINAL bounding box — cutout lands where the
        // render showed the item. Designer can drag/rotate/flip from there.
        const bb = item.boundingBoxPct;
        tt.sceneItems.push({
          id: `scene-${generateId()}`,
          itemId: customItem.id,
          x: bb.x + bb.w / 2,
          y: bb.y + bb.h / 2,
          width: bb.w,
          height: bb.h,
          rotation: 0,
          zIndex: idx + 1,
        });
        saveProject(next);
        onUpdate();
      }));

      setExtractionReview(null);
      setPhase("ready");
      logActivity(project.id, "composite_from_render", `Placed ${kept.length} render-cutouts in ${room.name}`);
      toast.success(`Composite board ready — drag, rotate, flip, swap, or remove anything.`);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Placement failed");
    } finally {
      setPlacingReviewed(false);
    }
  }

  /**
   * Original one-shot connector — kept for the legacy preview-gate button
   * in case someone still has it. Superseded by identifyItemsForReview →
   * placeReviewedItems flow.
   */
  async function convertRenderToComposite() {
    if (phase === "generating" || phase === "sourcing") return;
    const originalRender = room.sceneBackgroundUrl;
    if (!originalRender) {
      setLastError("Generate a render first, then convert it.");
      return;
    }
    setLastError(null);
    setPhase("generating");
    try {
      // 1. Strip the original render to an empty backdrop
      const stripRes = await fetch("/api/strip-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: originalRender }),
      });
      const stripRaw = await stripRes.text();
      let stripPayload: { imageDataUrl?: string; error?: string } = {};
      try { stripPayload = JSON.parse(stripRaw); } catch {}
      if (!stripRes.ok || !stripPayload.imageDataUrl) {
        throw new Error(stripPayload.error || `Strip failed: HTTP ${stripRes.status}`);
      }
      const emptyBackdrop = await ensureHostedUrl(stripPayload.imageDataUrl, "scenes");

      // 2. Source products from the ORIGINAL render (the stripped one has nothing)
      setPhase("sourcing");
      const sourceRes = await fetch("/api/source-from-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: originalRender,
          budget: remainingBudget || undefined,
          styleHint: preset.id,
        }),
      });
      const sourceRaw = await sourceRes.text();
      let sourcePayload: { items?: SourcedItem[]; error?: string } = {};
      try { sourcePayload = JSON.parse(sourceRaw); } catch {}
      if (!sourceRes.ok) {
        throw new Error(sourcePayload.error || `Sourcing failed: HTTP ${sourceRes.status}`);
      }
      const items = sourcePayload.items ?? [];
      if (items.length === 0) {
        throw new Error("AI couldn't identify any items in the render. Try re-rolling the render first.");
      }

      // 3. Persist the stripped backdrop + clear old scene items
      const fresh = getProjectFromStore(project.id);
      if (!fresh) throw new Error("Project missing");
      const target = fresh.rooms.find(r => r.id === room.id);
      if (!target) throw new Error("Room missing");
      target.sceneBackgroundUrl = emptyBackdrop;
      target.sceneSnapshot = undefined;
      target.sceneItems = [];
      saveProject(fresh);
      onUpdate();
      toast.info(`Placing ${items.length} real products... (cutouts ~15s each, running in parallel)`);

      // 4. For each sourced item, generate a cutout + place on scene
      //    Promise.all keeps the wall-clock time reasonable; each save
      //    re-reads the latest project state so parallel saves don't clobber.
      await Promise.all(items.map(async item => {
        const opt = item.options?.[0];
        if (!opt) return;
        let cutoutUrl = opt.imageUrl || "";
        try {
          const cutRes = await fetch("/api/generate-cutout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: `${opt.name} (${item.category})`,
              imageUrl: opt.imageUrl || undefined,
              vendor: opt.vendor || undefined,
            }),
          });
          if (cutRes.ok) {
            const j = (await cutRes.json()) as { imageUrl?: string; imageDataUrl?: string };
            cutoutUrl = j.imageUrl ?? j.imageDataUrl ?? cutoutUrl;
          }
        } catch {
          // If cutout fails, fall back to the raw product image URL (proxy will still serve it)
        }
        cutoutUrl = (await finalizeCutout(cutoutUrl)) ?? cutoutUrl;
        const next = getProjectFromStore(project.id);
        if (!next) return;
        const tt = next.rooms.find(r => r.id === room.id);
        if (!tt) return;
        if (!tt.sceneItems) tt.sceneItems = [];
        const category = mapCategory(item.category);
        const customItem: FurnitureItem = {
          id: `auto-${generateId()}`,
          name: opt.name,
          category,
          subcategory: item.category,
          widthIn: parseFirstDim(opt.dimensions) ?? 36,
          depthIn: parseSecondDim(opt.dimensions) ?? 36,
          heightIn: parseThirdDim(opt.dimensions) ?? 30,
          price: opt.price ?? 0,
          vendor: opt.vendor,
          vendorUrl: opt.url,
          imageUrl: cutoutUrl,
          color: "",
          material: "",
          style: preset.designStyle,
        };
        const placed = placeFurniture(tt, customItem);
        placed.status = "approved";
        tt.furniture.push(placed);
        tt.sceneItems.push(defaultSceneItemFor(customItem, tt.sceneItems.length, category));
        saveProject(next);
        onUpdate();
      }));

      setSourcedItems(null);
      setPhase("ready");
      logActivity(project.id, "composite_converted", `Converted render to composite: ${items.length} items placed in ${room.name}`);
      toast.success(`Composite board ready — ${items.length} items placed. Drag, swap, or remove anything.`);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Conversion failed");
      setPhase("preview");
    }
  }

  /**
   * Legacy strip-only path kept for the "I just want the empty backdrop"
   * case. Runs in isolation — no auto-source, no auto-place.
   */
  async function stripToBackground() {
    if (phase === "generating" || phase === "sourcing") return;
    if (!room.sceneBackgroundUrl) {
      setLastError("No scene to strip — generate one first.");
      return;
    }
    setLastError(null);
    setPhase("generating");
    try {
      const res = await fetch("/api/strip-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: room.sceneBackgroundUrl }),
      });
      const raw = await res.text();
      let payload: { imageDataUrl?: string; error?: string } = {};
      try { payload = JSON.parse(raw); } catch { /* keep raw */ }
      if (!res.ok || !payload.imageDataUrl) {
        throw new Error(payload.error || `HTTP ${res.status} — ${raw.slice(0, 400)}`);
      }
      // Upload the stripped backdrop before persisting
      const hostedStrip = await ensureHostedUrl(payload.imageDataUrl, "scenes");
      const fresh = getProjectFromStore(project.id);
      if (!fresh) throw new Error("Project missing");
      const t = fresh.rooms.find(r => r.id === room.id);
      if (!t) throw new Error("Room missing");
      t.sceneBackgroundUrl = hostedStrip;
      t.sceneSnapshot = hostedStrip;
      // Wipe any existing scene cutouts since the underlying image changed
      t.sceneItems = [];
      saveProject(fresh);
      onUpdate();
      toast.success("Stripped to empty backdrop. Now sourcing products to layer on...");
      // Switch to cutout-bg flow and immediately source so the designer
      // gets the composite-ready experience without extra clicks
      setRenderMode("cutout-bg");
      await sourceProducts();
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : "Strip failed";
      setLastError(msg);
      setPhase("preview");
    }
  }

  // ── Click-to-edit handlers ───────────────────────────────────────────

  function onSceneClick(e: React.MouseEvent<HTMLImageElement>) {
    if (phase !== "preview" && phase !== "ready") return;
    if (clickEdit) return; // already have a popover open
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    setClickEdit({ xPct, yPct, state: "menu" });
  }

  function closeClickEdit() {
    setClickEdit(null);
  }

  async function performSwap() {
    if (!clickEdit || !room.sceneBackgroundUrl) return;
    const swapTo = (clickEdit.swapInput ?? "").trim();
    if (!swapTo) return;
    setClickEdit({ ...clickEdit, state: "swapping", error: undefined });
    try {
      const res = await fetch("/api/edit-scene-region", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: room.sceneBackgroundUrl,
          clickXPct: clickEdit.xPct,
          clickYPct: clickEdit.yPct,
          action: "swap",
          swapTo,
        }),
      });
      const raw = await res.text();
      let payload: { imageDataUrl?: string; identified?: string; error?: string } = {};
      try { payload = JSON.parse(raw); } catch { /* keep raw */ }

      if (!res.ok || !payload.imageDataUrl) {
        throw new Error(payload.error || `HTTP ${res.status} — ${raw.slice(0, 300)}`);
      }
      const hostedSwap = await ensureHostedUrl(payload.imageDataUrl, "scenes");
      const fresh = getProjectFromStore(project.id);
      if (!fresh) return;
      const t = fresh.rooms.find(r => r.id === room.id);
      if (!t) return;
      t.sceneBackgroundUrl = hostedSwap;
      t.sceneSnapshot = hostedSwap;
      saveProject(fresh);
      onUpdate();
      toast.success(`Swapped "${payload.identified ?? "item"}" → ${swapTo}`);
      closeClickEdit();
    } catch (err) {
      setClickEdit(prev => prev ? { ...prev, state: "menu", error: err instanceof Error ? err.message : String(err) } : prev);
    }
  }

  async function performRemove() {
    if (!clickEdit || !room.sceneBackgroundUrl) return;
    setClickEdit({ ...clickEdit, state: "removing", error: undefined });
    try {
      const res = await fetch("/api/edit-scene-region", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: room.sceneBackgroundUrl,
          clickXPct: clickEdit.xPct,
          clickYPct: clickEdit.yPct,
          action: "remove",
        }),
      });
      const raw = await res.text();
      let payload: { imageDataUrl?: string; identified?: string; error?: string } = {};
      try { payload = JSON.parse(raw); } catch { /* keep raw */ }

      if (!res.ok || !payload.imageDataUrl) {
        throw new Error(payload.error || `HTTP ${res.status} — ${raw.slice(0, 300)}`);
      }
      const hostedRemove = await ensureHostedUrl(payload.imageDataUrl, "scenes");
      const fresh = getProjectFromStore(project.id);
      if (!fresh) return;
      const t = fresh.rooms.find(r => r.id === room.id);
      if (!t) return;
      t.sceneBackgroundUrl = hostedRemove;
      t.sceneSnapshot = hostedRemove;
      saveProject(fresh);
      onUpdate();
      toast.success(`Removed "${payload.identified ?? "item"}" from scene`);
      closeClickEdit();
    } catch (err) {
      setClickEdit(prev => prev ? { ...prev, state: "menu", error: err instanceof Error ? err.message : String(err) } : prev);
    }
  }

  async function performSourceJustHere() {
    if (!clickEdit || !room.sceneBackgroundUrl) return;
    setClickEdit({ ...clickEdit, state: "sourcing", error: undefined });
    try {
      const res = await fetch("/api/source-region", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: room.sceneBackgroundUrl,
          clickXPct: clickEdit.xPct,
          clickYPct: clickEdit.yPct,
          styleHint: preset.id,
          budget: remainingBudget || undefined,
        }),
      });
      const raw = await res.text();
      let payload: { identified?: string; options?: typeof clickEdit.options; error?: string } = {};
      try { payload = JSON.parse(raw); } catch { /* keep raw */ }

      if (!res.ok) {
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      setClickEdit(prev => prev ? {
        ...prev,
        state: "options",
        identified: payload.identified,
        options: payload.options ?? [],
      } : prev);
    } catch (err) {
      setClickEdit(prev => prev ? { ...prev, state: "menu", error: err instanceof Error ? err.message : String(err) } : prev);
    }
  }

  function commitSourcedRegionPick(opt: { name: string; vendor: string; price: number | null; url: string; imageUrl?: string; dimensions?: string }) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const target = fresh.rooms.find(r => r.id === room.id);
    if (!target) return;
    const customItem: FurnitureItem = {
      id: `ai-${generateId()}`,
      name: opt.name,
      category: mapCategory(clickEdit?.identified ?? ""),
      subcategory: clickEdit?.identified ?? "Item",
      widthIn: parseFirstDim(opt.dimensions) ?? 36,
      depthIn: parseSecondDim(opt.dimensions) ?? 36,
      heightIn: parseThirdDim(opt.dimensions) ?? 30,
      price: opt.price ?? 0,
      vendor: opt.vendor,
      vendorUrl: opt.url,
      imageUrl: opt.imageUrl ?? "",
      color: "",
      material: "",
      style: preset.designStyle,
    };
    const placed = placeFurniture(target, customItem);
    placed.status = "approved";
    target.furniture.push(placed);
    saveProject(fresh);
    logActivity(project.id, "click_sourced", `Click-sourced ${opt.name} for ${target.name}`);
    toast.success(`${opt.name} added to ${target.name} masterlist`);
    onUpdate();
    closeClickEdit();
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
      cutoutUrl = (await finalizeCutout(cutoutUrl)) ?? cutoutUrl;
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

  // ── Pick-first workflow ─────────────────────────────────────────────
  //
  // Designer picks specific real products FIRST (by describing what they
  // need or pasting a URL), THEN the compositor layers the product
  // cutouts onto the empty-room backdrop. Image and masterlist ship
  // the same items by construction — no drift.

  async function searchForItem() {
    const q = pickQuery.trim();
    if (!q || pickPhase !== "idle") return;
    setLastError(null);
    setPickPhase("searching");
    setPickOptions(null);
    try {
      const res = await fetch("/api/source-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: q,
          styleHint: preset.id,
          budget: remainingBudget || undefined,
          roomType: room.type,
        }),
      });
      const raw = await res.text();
      let payload: { options?: SourcedOption[]; description?: string; error?: string } = {};
      try { payload = JSON.parse(raw); } catch { /* keep raw */ }
      if (!res.ok) {
        throw new Error(payload.error || `HTTP ${res.status} — ${raw.slice(0, 300)}`);
      }
      if (!payload.options || payload.options.length === 0) {
        throw new Error("No matches returned. Try a more specific description (material, size, color).");
      }
      setPickOptions({ description: payload.description ?? q, options: payload.options });
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setPickPhase("idle");
    }
  }

  async function addPickedOption(opt: SourcedOption, descHint: string) {
    if (pickPhase !== "idle") return;
    setPickPhase("adding");
    setLastError(null);
    try {
      // 1) Background-remove the product photo (cached across projects)
      let cutoutUrl = opt.imageUrl;
      try {
        const cutRes = await fetch("/api/generate-cutout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: `${opt.name} (${descHint})`,
            imageUrl: opt.imageUrl || undefined,
            vendor: opt.vendor || undefined,
          }),
        });
        if (cutRes.ok) {
          const json = (await cutRes.json()) as { imageUrl?: string; imageDataUrl?: string };
          cutoutUrl = json.imageUrl ?? json.imageDataUrl ?? opt.imageUrl;
        }
      } catch {}
      cutoutUrl = (await finalizeCutout(cutoutUrl)) ?? cutoutUrl;

      const fresh = getProjectFromStore(project.id);
      if (!fresh) throw new Error("Project missing");
      const target = fresh.rooms.find(r => r.id === room.id);
      if (!target) throw new Error("Room missing");
      if (!target.sceneItems) target.sceneItems = [];

      const category = mapCategory(descHint);

      // SWAP path: replace an existing placement, keep its position.
      if (swappingId) {
        const si = target.sceneItems.find(s => s.id === swappingId);
        if (!si) throw new Error("Item to swap missing");
        const oldItemId = si.itemId;
        const newItem: FurnitureItem = {
          id: `pick-${generateId()}`,
          name: opt.name,
          category,
          subcategory: descHint,
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
        target.furniture = target.furniture.filter(f => f.item.id !== oldItemId);
        const placed = placeFurniture(target, newItem);
        placed.status = "approved";
        target.furniture.push(placed);
        si.itemId = newItem.id;
        saveProject(fresh);
        logActivity(project.id, "item_swapped", `Swapped to ${opt.name} in ${target.name}`);
        toast.success(`Swapped to ${opt.name}`);
      } else {
        // ADD path: new item + new scene placement
        const customItem: FurnitureItem = {
          id: `pick-${generateId()}`,
          name: opt.name,
          category,
          subcategory: descHint,
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
        placed.status = "approved";
        target.furniture.push(placed);
        target.sceneItems.push(defaultSceneItemFor(customItem, target.sceneItems.length, category));
        saveProject(fresh);
        logActivity(project.id, "item_picked", `Picked ${opt.name} for ${target.name}`);
        toast.success(`${opt.name} added`);
      }

      setPickQuery("");
      setPickOptions(null);
      setSwappingId(null);
      onUpdate();
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setPickPhase("idle");
    }
  }

  /**
   * Change the wall/backdrop: wallpaper, paint color, time-of-day, lighting.
   * Calls edit-scene-region with a center-top anchor so the edit targets
   * a wall. Keeps the existing backdrop architecture (windows, floor, etc.).
   */
  async function applyWallTreatment() {
    const note = wallPrompt.trim();
    if (!note || wallBusy) return;
    if (!room.sceneBackgroundUrl) {
      setLastError("No backdrop yet — generate one first.");
      return;
    }
    setWallBusy(true);
    setLastError(null);
    try {
      const res = await fetch("/api/edit-scene-region", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: room.sceneBackgroundUrl,
          clickXPct: 50,
          clickYPct: 30,
          action: "swap",
          swapTo: `${note} — applied to the walls only. Keep windows, doors, floor, and ceiling exactly as-is.`,
        }),
      });
      const raw = await res.text();
      let payload: { imageDataUrl?: string; error?: string } = {};
      try { payload = JSON.parse(raw); } catch {}
      if (!res.ok || !payload.imageDataUrl) {
        throw new Error(payload.error || `HTTP ${res.status} — ${raw.slice(0, 300)}`);
      }
      const hostedWall = await ensureHostedUrl(payload.imageDataUrl, "scenes");
      const fresh = getProjectFromStore(project.id);
      if (!fresh) throw new Error("Project missing");
      const target = fresh.rooms.find(r => r.id === room.id);
      if (!target) throw new Error("Room missing");
      target.sceneBackgroundUrl = hostedWall;
      saveProject(fresh);
      toast.success("Walls updated. Rebuild the composite to refresh the deliverable.");
      setWallPrompt("");
      onUpdate();
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Wall treatment failed");
    } finally {
      setWallBusy(false);
    }
  }

  async function addFromUrl() {
    const url = urlQuery.trim();
    if (!url || pickPhase !== "idle") return;
    if (!/^https?:\/\//i.test(url)) {
      setLastError("URL must start with http(s)://");
      return;
    }
    setPickPhase("adding");
    setLastError(null);
    try {
      const domain = (() => {
        try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "direct"; }
      })();
      const vendor = prettyVendor(domain);
      const name = `Item from ${vendor}`;

      // Ask the cutout endpoint to background-remove the URL image
      let cutoutUrl: string | undefined;
      try {
        const cutRes = await fetch("/api/generate-cutout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: `product from ${vendor}`,
            imageUrl: url,
            vendor,
          }),
        });
        if (cutRes.ok) {
          const json = (await cutRes.json()) as { imageUrl?: string; imageDataUrl?: string };
          cutoutUrl = json.imageUrl ?? json.imageDataUrl;
        }
      } catch {}
      cutoutUrl = (await finalizeCutout(cutoutUrl)) ?? cutoutUrl;

      const fresh = getProjectFromStore(project.id);
      if (!fresh) throw new Error("Project missing");
      const target = fresh.rooms.find(r => r.id === room.id);
      if (!target) throw new Error("Room missing");
      if (!target.sceneItems) target.sceneItems = [];

      const category: FurnitureItem["category"] = "decor";
      const customItem: FurnitureItem = {
        id: `url-${generateId()}`,
        name,
        category,
        subcategory: "custom",
        widthIn: 36,
        depthIn: 24,
        heightIn: 30,
        price: 0,
        vendor,
        vendorUrl: url,
        imageUrl: cutoutUrl || url,
        color: "",
        material: "",
        style: preset.designStyle,
      };
      const placed = placeFurniture(target, customItem);
      placed.status = "specced"; // URL items aren't auto-approved until designer sets price
      target.furniture.push(placed);
      target.sceneItems.push(defaultSceneItemFor(customItem, target.sceneItems.length, category));
      saveProject(fresh);

      logActivity(project.id, "item_url_added", `URL-added item from ${vendor}`);
      toast.info(`Added. Edit name + price in the Items tab or Deliver → Order.`);

      setUrlQuery("");
      onUpdate();
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "URL add failed");
    } finally {
      setPickPhase("idle");
    }
  }

  function removePlacedItem(sceneItemId: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const target = fresh.rooms.find(r => r.id === room.id);
    if (!target || !target.sceneItems) return;
    const si = target.sceneItems.find(x => x.id === sceneItemId);
    if (!si) return;
    target.sceneItems = target.sceneItems.filter(x => x.id !== sceneItemId);
    target.furniture = target.furniture.filter(f => f.item.id !== si.itemId);
    saveProject(fresh);
    if (selectedPlacedId === sceneItemId) setSelectedPlacedId(null);
    onUpdate();
  }

  function saveTips(value: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const target = fresh.rooms.find(r => r.id === room.id);
    if (!target) return;
    target.installTips = value;
    saveProject(fresh);
    onUpdate();
  }

  /** Patch a placed cutout's position/size/orientation. Used by drag + resize + rotate + flip. */
  function updateScenePos(
    sceneItemId: string,
    patch: Partial<Pick<SceneItem, "x" | "y" | "width" | "height" | "rotation" | "flipX" | "flipY">>
  ) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const target = fresh.rooms.find(r => r.id === room.id);
    if (!target || !target.sceneItems) return;
    const si = target.sceneItems.find(x => x.id === sceneItemId);
    if (!si) return;
    Object.assign(si, patch);
    saveProject(fresh);
    onUpdate();
  }

  async function buildComposite() {
    if (composing) return;
    if (!room.sceneBackgroundUrl) {
      setLastError("Generate or upload a backdrop first (step 3).");
      return;
    }
    const items = room.sceneItems ?? [];
    if (items.length === 0) {
      setLastError("Add at least one item before building the composite.");
      return;
    }
    setComposing(true);
    setLastError(null);
    try {
      const placements = items
        .map(si => {
          const f = room.furniture.find(ff => ff.item.id === si.itemId);
          return f?.item.imageUrl ? { sceneItem: si, cutoutUrl: f.item.imageUrl } : null;
        })
        .filter((p): p is { sceneItem: typeof items[0]; cutoutUrl: string } => !!p);

      if (placements.length === 0) {
        throw new Error("No cutouts to composite — re-add items so cutouts can generate.");
      }

      const dataUrl = await compositeRoomScene({
        backdropUrl: room.sceneBackgroundUrl,
        placements,
        room,
        showTitle: true,
        showFloorPlan: true,
        tips: room.installTips || defaultTipsForRoom(room.type),
      });

      // The composite is the biggest single blob we produce — upload it
      // so the Install Guide + masterlist share a small URL, not a
      // multi-megabyte base64 string.
      const hostedSnapshot = await ensureHostedUrl(dataUrl, "snapshots");

      const fresh = getProjectFromStore(project.id);
      if (!fresh) throw new Error("Project missing");
      const target = fresh.rooms.find(r => r.id === room.id);
      if (!target) throw new Error("Room missing");
      target.sceneSnapshot = hostedSnapshot;
      saveProject(fresh);
      logActivity(project.id, "composite_built", `Built composite for ${target.name} (${placements.length} items)`);
      toast.success(`Composite built — flows into Install Guide + masterlist.`);
      onUpdate();
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Composite failed");
    } finally {
      setComposing(false);
    }
  }

  // Items currently placed on the scene, paired with their FurnitureItem
  interface PlacedRow { sceneItem: SceneItem; item: FurnitureItem; status: FurnitureItem["name"] extends never ? never : string | undefined }
  const placedItems: PlacedRow[] = (room.sceneItems ?? [])
    .map(si => {
      const f = room.furniture.find(ff => ff.item.id === si.itemId);
      return f ? { sceneItem: si, item: f.item, status: f.status as string | undefined } : null;
    })
    .filter((x): x is PlacedRow => !!x);

  const placedTotalCost = placedItems.reduce((s, p) => s + (p.item.price ?? 0), 0);

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
          1 · Room photo <span className="text-red-600/80 font-semibold">(required)</span>
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
                    : "Required — AI anchors the render to YOUR walls, windows, and finishes. Without it, you get a generic room."}
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

      {/* 3 · Generate CTA */}
      <div className="mb-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-1.5">
          3 · Generate AI render
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={designThisRoom}
            disabled={phase === "generating" || phase === "sourcing" || !referenceImage}
            title={!referenceImage ? "Upload a room photo above first — required to anchor the render to your real space." : undefined}
            className="rounded-lg bg-amber px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-dark disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {phase === "generating"
              ? "📸 Rendering your room... (~25s)"
              : phase === "sourcing"
                ? "🛒 Sourcing products... (~60s)"
                : !referenceImage
                  ? "👆 Upload a room photo first"
                  : hasScene && phase !== "preview"
                    ? `📸 Re-render (${preset.label})`
                    : `📸 Generate ${preset.label} render`}
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
        <div className="mt-1.5 text-[11px] text-brand-600">
          After the render appears, you&apos;ll extract the items into an editable composite board.
        </div>
      </div>
      {!referenceImage && hasScene && (
        <div className="mt-2 rounded-lg bg-amber/10 border border-amber/30 px-3 py-2 text-[11px] text-brand-900">
          ⚠️ <strong>Heads up:</strong> The render shown below is a leftover from a previous session and is NOT anchored to a real room. Drop your Matterport screenshot above to render YOUR space.
        </div>
      )}

      {/* Generating spinner — shown when a render is in flight so Jeff
          doesn't wonder if anything is happening. The existing scene (if
          any) sits underneath with reduced opacity so the designer has
          context while waiting. */}
      {phase === "generating" && (
        <div className="mt-4 rounded-lg border-2 border-amber bg-amber/10 p-6 text-center">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-amber-dark">
            <span className="inline-block h-4 w-4 rounded-full border-2 border-amber-dark border-t-transparent animate-spin" />
            Gemini is rendering your {preset.label} version of {room.name}...
          </div>
          <div className="mt-2 text-[11px] text-brand-600">
            Typically 25–45 seconds. The new render will replace whatever&apos;s below when it&apos;s ready.
          </div>
        </div>
      )}

      {/* Rendered scene preview + APPROVAL GATE */}
      {hasScene && room.sceneBackgroundUrl && (
        <div className={`mt-4 ${phase === "generating" ? "opacity-50" : ""}`}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
              {phase === "generating"
                ? "Previous render (being replaced)"
                : phase === "preview"
                  ? "Preview — approve, refine, or re-roll"
                  : "Rendered scene"}
            </div>
            {phase === "preview" && (
              <span className="text-[10px] text-amber-dark font-semibold">
                {renderMode === "realistic"
                  ? "Approve to use as room hero"
                  : "Approve to source 3 product options per piece"}
              </span>
            )}
          </div>
          <div
            data-scene-surface
            className="relative rounded-lg overflow-hidden border border-brand-900/10 bg-brand-900/5"
            onClick={() => setSelectedPlacedId(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={room.sceneBackgroundUrl}
              alt={`${room.name} render`}
              className={`w-full h-auto max-h-[520px] object-contain ${
                (phase === "preview" || phase === "ready") && !clickEdit ? "cursor-crosshair" : ""
              }`}
              onClick={onSceneClick}
            />

            {/* Placed cutouts — draggable, each represents a real product.
                Drag to reposition. Click-to-edit still works on empty backdrop. */}
            {placedItems.map(row => (
              <DraggableCutout
                key={row.sceneItem.id}
                sceneItem={row.sceneItem}
                imageUrl={row.item.imageUrl}
                selected={selectedPlacedId === row.sceneItem.id}
                onSelect={() => setSelectedPlacedId(row.sceneItem.id)}
                onMove={(x, y) => updateScenePos(row.sceneItem.id, { x, y })}
                onResize={(w, h) => updateScenePos(row.sceneItem.id, { width: w, height: h })}
                onRotate={deg => updateScenePos(row.sceneItem.id, { rotation: deg })}
                onFlip={axis => {
                  const cur = (room.sceneItems ?? []).find(s => s.id === row.sceneItem.id);
                  if (!cur) return;
                  if (axis === "x") updateScenePos(row.sceneItem.id, { flipX: !cur.flipX });
                  else updateScenePos(row.sceneItem.id, { flipY: !cur.flipY });
                }}
              />
            ))}

            {/* Click marker — shows where the designer clicked */}
            {clickEdit && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${clickEdit.xPct}%`,
                  top: `${clickEdit.yPct}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div className="h-4 w-4 rounded-full border-2 border-amber bg-amber/40 shadow-lg animate-pulse" />
              </div>
            )}

            {/* Action popover */}
            {clickEdit && (
              <ClickEditPopover
                clickEdit={clickEdit}
                onClose={closeClickEdit}
                onSwapInputChange={v => setClickEdit({ ...clickEdit, swapInput: v })}
                onSwap={performSwap}
                onRemove={performRemove}
                onSourceJustHere={performSourceJustHere}
                onPickOption={commitSourcedRegionPick}
              />
            )}
          </div>
          {(phase === "preview" || phase === "ready") && !clickEdit && (
            <div className="mt-1 text-[10px] text-brand-600/70">
              💡 Click any item in the image to swap, source 3 alternatives, or remove it.
            </div>
          )}

          {/* Review list — appears after "Turn this into composite board" identifies items.
              Designer ticks which to KEEP, optionally removes any entirely, then hits
              "Place selected" to commit to the composite board. */}
          {extractionReview && (
            <div className="mt-3 rounded-lg border-2 border-emerald-500 bg-emerald-50/60 p-3">
              <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                <div>
                  <div className="text-xs font-semibold text-emerald-900">
                    ✅ Found {extractionReview.items.length} items in your render
                  </div>
                  <div className="text-[11px] text-emerald-800 mt-0.5">
                    Toggle any you DON&apos;T want, then place the rest on the empty backdrop. You can still add/swap/drag after.
                  </div>
                </div>
                <div className="text-[10px] text-emerald-800">
                  {extractionReview.items.filter(i => i.keep).length} selected
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-3">
                {extractionReview.items.map(it => (
                  <div
                    key={it.id}
                    onClick={() => toggleReviewKeep(it.id)}
                    className={`relative cursor-pointer rounded-lg border-2 p-2 transition ${
                      it.keep
                        ? "border-emerald-500 bg-white"
                        : "border-brand-900/10 bg-white opacity-50"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.thumbnailDataUrl}
                      alt={it.description}
                      className="w-full h-24 object-contain bg-brand-900/5 rounded mb-1"
                    />
                    <div className="text-[11px] font-medium text-brand-900 line-clamp-2">{it.description}</div>
                    <div className="text-[9px] text-brand-600 uppercase tracking-wider mt-0.5">{it.category}</div>
                    <div className="absolute top-1 right-1 flex gap-1">
                      <span
                        className={`h-5 w-5 rounded flex items-center justify-center text-[10px] font-bold ${
                          it.keep ? "bg-emerald-500 text-white" : "bg-brand-900/10 text-brand-600"
                        }`}
                      >
                        {it.keep ? "✓" : ""}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); removeReviewItem(it.id); }}
                        className="h-5 w-5 rounded bg-red-100 text-red-600 text-[10px] font-bold hover:bg-red-200"
                        title="Remove entirely from this list"
                      >
                        ✗
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => void placeReviewedItems()}
                  disabled={placingReviewed || extractionReview.items.filter(i => i.keep).length === 0}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {placingReviewed
                    ? "🎨 Placing cutouts on backdrop..."
                    : `🎨 Place ${extractionReview.items.filter(i => i.keep).length} items on the composite board`}
                </button>
                <button
                  onClick={cancelReview}
                  disabled={placingReviewed}
                  className="rounded-lg border border-brand-900/15 px-3 py-2 text-xs font-medium text-brand-700 hover:bg-brand-900/5 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Turn the AI render into an editable composite board */}
          {phase === "preview" && (
            <div className="mt-3 space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
                4 · Extract items → Composite Board
              </div>
              <div className="text-[11px] text-brand-600">
                The AI render is inspiration. Click below to identify every item in it. You&apos;ll then pick which to keep and place them on an editable composite board.
              </div>
              <div className="flex gap-2 flex-wrap items-start">
                <button
                  onClick={() => void identifyItemsForReview()}
                  disabled={extractingReview || !!extractionReview}
                  className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                >
                  {extractingReview ? "🔎 Identifying items..." : "🎬 Extract items → Composite Board"}
                </button>
                <button
                  onClick={() => generateScene("")}
                  disabled={!referenceImage}
                  className="rounded-lg border border-amber px-3 py-2.5 text-xs font-medium text-amber-dark hover:bg-amber/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!referenceImage ? "Re-upload your room photo first" : "Try another render with the same style + photo"}
                >
                  🔄 Re-roll
                </button>
                <button
                  onClick={() => setPhase("idle")}
                  className="rounded-lg border border-brand-900/15 px-3 py-2.5 text-xs font-medium text-brand-700 hover:bg-brand-900/5"
                  title="Pick a different style and try again"
                >
                  🎨 Try a different style
                </button>
                <button
                  onClick={approveAndContinue}
                  className="rounded-lg border border-brand-900/15 px-3 py-2.5 text-xs font-medium text-brand-700 hover:bg-brand-900/5"
                  title="Skip the composite — just save this render as the room's hero image"
                >
                  ✓ Just use this render
                </button>
              </div>

              {/* Refine box — designer asks for changes in plain English */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-1">
                  Or refine — describe what to change (composite-style)
                </div>

                {/* Quick chips for the most common composite operations:
                    swap views, balance lighting, add wallpaper, etc. Clicking
                    a chip drops the prompt into the refine box so designer can
                    edit before submitting. */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    { label: "🌅 Sunny lake view", value: "replace the view through every window with a bright sunny lake at golden hour" },
                    { label: "🌸 Cherry blossoms", value: "replace the view through every window with cherry blossoms in bloom against a soft blue sky" },
                    { label: "❄️ Snowy mountains", value: "replace the view through every window with snowy mountain peaks under a clear winter sky" },
                    { label: "💡 Brighten lighting", value: "balance the lighting — bring up the interior exposure so the room is bright and airy while keeping detail in the window view" },
                    { label: "🌙 Cozy evening", value: "shift to a warm cozy evening: golden lamp light, sunset through the window, intimate mood" },
                    { label: "🌿 Wallpaper accent", value: "add a botanical wallpaper accent on the longest wall, keep all other walls in the existing paint color" },
                    { label: "🪵 Darker walls", value: "make the wall paint two shades darker and warmer" },
                    { label: "🛋 Curvier furniture", value: "swap any straight-edged furniture for curvier rounded silhouettes, keep colors and materials" },
                  ].map(chip => (
                    <button
                      key={chip.label}
                      onClick={() => setRefineNotes(chip.value)}
                      className="text-[10px] rounded-full border border-brand-900/15 px-2 py-1 hover:border-amber/40 hover:bg-amber/5"
                      title={chip.value}
                      type="button"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <input
                    type="text"
                    value={refineNotes}
                    onChange={e => setRefineNotes(e.target.value)}
                    placeholder='e.g. "add a green floral wallpaper accent wall" or "swap the sofa for something curved"'
                    className="input flex-1 text-xs min-w-[260px]"
                    onKeyDown={e => {
                      if (e.key === "Enter" && refineNotes.trim()) {
                        e.preventDefault();
                        void generateScene(refineNotes);
                      }
                    }}
                  />
                  <button
                    onClick={() => void generateScene(refineNotes)}
                    disabled={!refineNotes.trim() || !referenceImage}
                    title={!referenceImage ? "Re-upload your room photo first" : undefined}
                    className="rounded-lg bg-brand-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-700"
                  >
                    ✏️ Re-render with notes
                  </button>
                </div>
                <div className="mt-1 text-[10px] text-brand-600/70">
                  Tip: be specific — wallpaper patterns, paint colors, swap individual items, change the time of day, etc.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* The Composite Board — this is where every designer spends most of
          their time. Appears once a backdrop exists. Items get placed here
          (from render-extraction OR manual pick/URL), and all the editing
          tools (drag/rotate/flip/resize/swap/walls/tips) live in this block. */}
      {hasScene && (
        <div className="mt-4 pt-4 border-t border-brand-900/10">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div>
              <h4 className="text-xs font-semibold text-brand-900">🎬 Composite Board <span className="text-brand-600 font-normal">— {placedItems.length} item{placedItems.length === 1 ? "" : "s"}</span></h4>
              <p className="text-[10px] text-brand-600 mt-0.5">Drag, rotate, flip, resize on the scene above. Swap / add / remove below. Change walls. Build the final composite when ready.</p>
            </div>
            {placedItems.length > 0 && (
              <div className="text-[10px] text-brand-600">
                ${placedTotalCost.toLocaleString()} so far
              </div>
            )}
          </div>

          {/* Placed items — list with drag-on-scene + swap + remove. */}
          {placedItems.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {placedItems.map(row => {
                const isSelected = selectedPlacedId === row.sceneItem.id;
                const isSwapping = swappingId === row.sceneItem.id;
                return (
                  <div
                    key={row.sceneItem.id}
                    onClick={() => setSelectedPlacedId(row.sceneItem.id)}
                    className={`flex items-center gap-2 rounded-lg border p-2 cursor-pointer transition ${
                      isSwapping
                        ? "border-amber bg-amber/10"
                        : isSelected
                          ? "border-amber bg-white"
                          : "border-brand-900/10 bg-white hover:border-amber/40"
                    }`}
                  >
                    <div className="h-10 w-10 rounded border border-brand-900/10 bg-brand-900/5 overflow-hidden shrink-0">
                      {row.item.imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={row.item.imageUrl} alt="" className="h-full w-full object-contain" />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-brand-900 truncate">{row.item.name}</div>
                      <div className="text-[10px] text-brand-600 truncate">
                        {row.item.vendor}
                        {row.item.price ? ` · $${row.item.price.toLocaleString()}` : " · $0 (set price)"}
                      </div>
                    </div>
                    {row.item.vendorUrl && (
                      <a
                        href={row.item.vendorUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-[10px] text-amber-dark hover:underline px-1"
                      >
                        view
                      </a>
                    )}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (isSwapping) {
                          setSwappingId(null);
                        } else {
                          setSwappingId(row.sceneItem.id);
                          setPickQuery(row.item.subcategory || row.item.name);
                          setPickOptions(null);
                        }
                      }}
                      className={`text-[10px] px-2 py-1 rounded ${
                        isSwapping
                          ? "bg-amber text-white"
                          : "text-brand-700 hover:bg-brand-900/5 border border-brand-900/15"
                      }`}
                      title="Find 3 alternative products to replace this item (keeps position)"
                    >
                      {isSwapping ? "Cancel swap" : "🔄 Swap"}
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        removePlacedItem(row.sceneItem.id);
                      }}
                      className="text-[10px] text-red-600 hover:bg-red-50 px-2 py-1 rounded"
                      title="Remove from scene + masterlist"
                    >
                      ✗
                    </button>
                  </div>
                );
              })}
              {placedItems.length > 0 && (
                <div className="text-[10px] text-brand-600/70 italic pl-1">
                  💡 Drag items directly on the scene above to reposition. Click a placed item to show its resize handle.
                </div>
              )}
            </div>
          )}

          {/* Wall / wallpaper treatment — AI edits backdrop only, cutouts stay put */}
          <div className="rounded-lg bg-white border border-brand-900/10 p-2.5 mb-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-1.5">
              🧱 Walls & wallpaper
            </div>
            <div className="flex gap-2 flex-wrap mb-1.5">
              <input
                type="text"
                value={wallPrompt}
                onChange={e => setWallPrompt(e.target.value)}
                placeholder='e.g. "moody green paint", "botanical wallpaper accent wall"'
                className="input flex-1 text-xs min-w-[240px]"
                disabled={wallBusy}
                onKeyDown={e => {
                  if (e.key === "Enter" && wallPrompt.trim()) {
                    e.preventDefault();
                    void applyWallTreatment();
                  }
                }}
              />
              <button
                onClick={() => void applyWallTreatment()}
                disabled={!wallPrompt.trim() || wallBusy}
                className="rounded-lg border border-brand-900 px-3 py-2 text-xs font-medium text-brand-900 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-900/5"
              >
                {wallBusy ? "Applying..." : "Apply to walls"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {[
                { label: "Dark moody green", value: "rich dark forest green paint on all walls" },
                { label: "Warm plaster", value: "warm limewashed plaster walls in creamy beige" },
                { label: "Botanical wallpaper", value: "botanical floral wallpaper accent on the longest wall, keep other walls white" },
                { label: "Wood paneling", value: "vertical warm oak wood paneling on the back wall" },
                { label: "Terracotta", value: "soft terracotta paint with a matte finish" },
              ].map(c => (
                <button
                  key={c.label}
                  onClick={() => setWallPrompt(c.value)}
                  disabled={wallBusy}
                  className="text-[10px] rounded-full border border-brand-900/15 px-2 py-0.5 hover:border-amber/40 hover:bg-amber/5"
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-brand-600/70">
              Windows, doors, floor stay. Placed items stay. Rebuild the composite after to refresh the deliverable.
            </div>
          </div>

          {/* Add by description — AI suggests 3 real products.
              Doubles as the swap panel when swappingId is set. */}
          <div className={`rounded-lg bg-white border p-2.5 mb-2 ${swappingId ? "border-amber" : "border-brand-900/10"}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-1.5 flex items-center justify-between">
              <span>{swappingId ? "🔄 Swap for..." : "Add by description"}</span>
              {swappingId && (
                <button
                  onClick={() => { setSwappingId(null); setPickOptions(null); setPickQuery(""); }}
                  className="text-[10px] text-brand-600 hover:text-brand-900"
                >
                  Cancel
                </button>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <input
                type="text"
                value={pickQuery}
                onChange={e => setPickQuery(e.target.value)}
                placeholder='e.g. "curved boucle sectional sofa in cream"'
                className="input flex-1 text-xs min-w-[240px]"
                disabled={pickPhase !== "idle"}
                onKeyDown={e => {
                  if (e.key === "Enter" && pickQuery.trim()) {
                    e.preventDefault();
                    void searchForItem();
                  }
                }}
              />
              <button
                onClick={() => void searchForItem()}
                disabled={!pickQuery.trim() || pickPhase !== "idle"}
                className="rounded-lg bg-brand-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-700"
              >
                {pickPhase === "searching" ? "Searching..." : "🔍 Find 3 products"}
              </button>
            </div>

            {pickOptions && pickOptions.options.length > 0 && (
              <div className="mt-2 grid sm:grid-cols-3 gap-2">
                {pickOptions.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => void addPickedOption(opt, pickOptions.description)}
                    disabled={pickPhase !== "idle"}
                    className="text-left rounded-lg border border-brand-900/10 p-2 hover:border-amber/40 hover:bg-amber/5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {opt.imageUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={opt.imageUrl}
                        alt=""
                        className="w-full h-24 object-contain bg-white rounded mb-1.5"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <div className="text-[11px] font-semibold text-brand-900 line-clamp-2">{opt.name}</div>
                    <div className="text-[9px] text-brand-600 truncate">{opt.vendor}</div>
                    <div className="text-[11px] font-semibold text-brand-900 mt-0.5">
                      {opt.price !== null ? `$${opt.price.toLocaleString()}` : "—"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Add by URL — paste a direct product link */}
          <div className="rounded-lg bg-white border border-brand-900/10 p-2.5 mb-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-1.5">
              Or paste a product URL
            </div>
            <div className="flex gap-2 flex-wrap">
              <input
                type="url"
                value={urlQuery}
                onChange={e => setUrlQuery(e.target.value)}
                placeholder="https://www.wayfair.com/..."
                className="input flex-1 text-xs min-w-[240px]"
                disabled={pickPhase !== "idle"}
                onKeyDown={e => {
                  if (e.key === "Enter" && urlQuery.trim()) {
                    e.preventDefault();
                    void addFromUrl();
                  }
                }}
              />
              <button
                onClick={() => void addFromUrl()}
                disabled={!urlQuery.trim() || pickPhase !== "idle"}
                className="rounded-lg border border-brand-900 px-3 py-2 text-xs font-medium text-brand-900 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-900/5"
              >
                {pickPhase === "adding" ? "Adding..." : "+ Add from URL"}
              </button>
            </div>
          </div>

          {/* Install tips — appear in the composite bottom-left + on Install Guide page */}
          <div className="rounded-lg bg-white border border-brand-900/10 p-2.5 mb-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-1.5 flex items-center justify-between">
              <span>📝 Install tips</span>
              <span className="text-brand-600/60 font-normal normal-case">One tip per line · appears on the composite + PDF</span>
            </div>
            <textarea
              value={tipsDraft}
              onChange={e => setTipsDraft(e.target.value)}
              onBlur={() => saveTips(tipsDraft)}
              placeholder={defaultTipsForRoom(room.type)}
              rows={3}
              className="input w-full text-xs font-mono resize-y"
            />
            <div className="mt-1 text-[10px] text-brand-600/70">
              Leave blank to use the defaults for a {room.type.replace(/-/g, " ")}.
            </div>
          </div>

          {/* Build Composite — the whole point */}
          <button
            onClick={() => void buildComposite()}
            disabled={composing || placedItems.length === 0}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {composing
              ? "🎨 Building composite..."
              : placedItems.length === 0
                ? "Add items above, then build the composite"
                : `🎨 Build Composite (${placedItems.length} item${placedItems.length === 1 ? "" : "s"}) — saves to Install Guide`}
          </button>
          {room.sceneSnapshot && room.sceneSnapshot !== room.sceneBackgroundUrl && (
            <div className="mt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-1">
                Latest composite
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={room.sceneSnapshot}
                alt={`${room.name} composite`}
                className="w-full h-auto rounded-lg border border-brand-900/10"
              />
              <div className="mt-1 text-[10px] text-brand-600">
                This is what lands in the Install Guide PDF + matches the Excel masterlist 1:1.
              </div>
            </div>
          )}
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

// ── Click-to-edit popover ────────────────────────────────────────────

interface ClickEditState {
  xPct: number;
  yPct: number;
  state: "menu" | "swapping" | "removing" | "sourcing" | "options";
  swapInput?: string;
  identified?: string;
  options?: { name: string; vendor: string; price: number | null; url: string; imageUrl?: string; dimensions?: string }[];
  error?: string;
}

function ClickEditPopover({
  clickEdit,
  onClose,
  onSwapInputChange,
  onSwap,
  onRemove,
  onSourceJustHere,
  onPickOption,
}: {
  clickEdit: ClickEditState;
  onClose: () => void;
  onSwapInputChange: (v: string) => void;
  onSwap: () => void;
  onRemove: () => void;
  onSourceJustHere: () => void;
  onPickOption: (opt: NonNullable<ClickEditState["options"]>[number]) => void;
}) {
  // Position the popover near the click; flip to opposite side if it would
  // overflow the right or bottom edge of the image.
  const placeRight = clickEdit.xPct < 60;
  const placeDown = clickEdit.yPct < 60;
  const style: React.CSSProperties = {
    position: "absolute",
    left: placeRight ? `calc(${clickEdit.xPct}% + 16px)` : undefined,
    right: !placeRight ? `calc(${100 - clickEdit.xPct}% + 16px)` : undefined,
    top: placeDown ? `calc(${clickEdit.yPct}% + 16px)` : undefined,
    bottom: !placeDown ? `calc(${100 - clickEdit.yPct}% + 16px)` : undefined,
    maxWidth: "min(360px, 80%)",
    zIndex: 30,
  };

  const isBusy = clickEdit.state === "swapping" || clickEdit.state === "removing" || clickEdit.state === "sourcing";

  return (
    <div
      style={style}
      className="rounded-lg bg-white border border-brand-900/15 shadow-xl p-3"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
          {clickEdit.identified ? `What's here: ${clickEdit.identified}` : "Edit this item"}
        </div>
        <button
          onClick={onClose}
          className="text-brand-600 hover:text-brand-900 text-base leading-none"
          disabled={isBusy}
        >
          ×
        </button>
      </div>

      {clickEdit.error && (
        <div className="mb-2 rounded bg-red-50 border border-red-200 px-2 py-1 text-[10px] text-red-900 break-words">
          {clickEdit.error}
        </div>
      )}

      {clickEdit.state === "menu" && (
        <div className="space-y-2">
          <button
            onClick={onSourceJustHere}
            className="w-full text-left rounded border border-brand-900/10 px-2.5 py-2 text-xs hover:border-amber/40 hover:bg-amber/5"
          >
            <div className="font-semibold text-brand-900">🛒 Source 3 real alternatives</div>
            <div className="text-[10px] text-brand-600 mt-0.5">
              AI identifies what's here, then finds 3 buyable products.
            </div>
          </button>

          <div className="rounded border border-brand-900/10 px-2.5 py-2">
            <div className="text-xs font-semibold text-brand-900 mb-1">🔄 Swap with…</div>
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder='e.g. "curved velvet sectional"'
                value={clickEdit.swapInput ?? ""}
                onChange={e => onSwapInputChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && (clickEdit.swapInput ?? "").trim()) {
                    e.preventDefault();
                    onSwap();
                  }
                }}
                className="input flex-1 text-xs py-1"
              />
              <button
                onClick={onSwap}
                disabled={!(clickEdit.swapInput ?? "").trim()}
                className="rounded bg-brand-900 text-white text-xs px-2 py-1 disabled:opacity-40"
              >
                Swap
              </button>
            </div>
          </div>

          <button
            onClick={onRemove}
            className="w-full text-left rounded border border-red-200 px-2.5 py-2 text-xs hover:bg-red-50"
          >
            <div className="font-semibold text-red-700">✗ Remove from scene</div>
            <div className="text-[10px] text-red-600/80 mt-0.5">
              AI inpaints the area behind it.
            </div>
          </button>
        </div>
      )}

      {isBusy && (
        <div className="text-center py-3">
          <div className="text-xs font-medium text-brand-900">
            {clickEdit.state === "swapping" && "Swapping... (~25s)"}
            {clickEdit.state === "removing" && "Removing... (~25s)"}
            {clickEdit.state === "sourcing" && "Identifying + searching... (~20s)"}
          </div>
        </div>
      )}

      {clickEdit.state === "options" && (
        <div>
          {clickEdit.options && clickEdit.options.length > 0 ? (
            <div className="space-y-2">
              {clickEdit.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => onPickOption(opt)}
                  className="w-full text-left rounded border border-brand-900/10 p-2 hover:border-amber/40 hover:bg-amber/5"
                >
                  <div className="flex items-start gap-2">
                    {opt.imageUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={opt.imageUrl}
                        alt=""
                        className="h-12 w-12 rounded border border-brand-900/10 object-cover shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-brand-900 line-clamp-2">{opt.name}</div>
                      <div className="text-[10px] text-brand-600">{opt.vendor}</div>
                      <div className="text-[11px] font-semibold text-brand-900 mt-0.5">
                        {opt.price !== null ? `$${opt.price.toLocaleString()}` : "—"}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
              <div className="text-[10px] text-brand-600 italic">
                Click one to add it to the masterlist.
              </div>
            </div>
          ) : (
            <div className="text-xs text-brand-600 text-center py-3">
              No matches found. Try clicking more precisely on a piece, or use Swap with a custom description.
            </div>
          )}
        </div>
      )}
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

/**
 * Default position + size for a newly-picked item, tuned by category so
 * sofas land low-center-back, pendants hang top-center, rugs lay flat,
 * etc. Designer can drag to fine-tune later (v2 — drag/resize).
 */
function defaultSceneItemFor(
  item: FurnitureItem,
  index: number,
  category: FurnitureItem["category"]
): SceneItem {
  const p = categoryPlacement(category, index);
  return {
    id: `scene-${generateId()}`,
    itemId: item.id,
    x: p.x,
    y: p.y,
    width: p.w,
    height: p.h,
    rotation: 0,
    zIndex: index + 1,
  };
}

function categoryPlacement(
  category: FurnitureItem["category"],
  index: number
): { x: number; y: number; w: number; h: number } {
  // Offsets cycle so two of the same category don't stack
  const offset = (index % 3) * 10 - 10;
  switch (category) {
    case "seating":       return { x: 50 + offset, y: 62, w: 34, h: 26 };
    case "beds-mattresses": return { x: 50 + offset, y: 55, w: 42, h: 30 };
    case "tables":        return { x: 50 + offset, y: 72, w: 20, h: 14 };
    case "storage":       return { x: 80 + offset / 2, y: 55, w: 20, h: 32 };
    case "lighting":      return { x: 50 + offset * 2, y: 18, w: 10, h: 22 };
    case "rugs-textiles": return { x: 50, y: 82, w: 55, h: 18 };
    case "decor":         return { x: 78 + offset / 2, y: 40, w: 10, h: 14 };
    case "kitchen-dining": return { x: 30 + offset, y: 70, w: 18, h: 22 };
    case "bathroom":      return { x: 50 + offset, y: 55, w: 20, h: 28 };
    case "outdoor":       return { x: 50 + offset, y: 60, w: 30, h: 24 };
    default:              return { x: 50 + offset, y: 55, w: 20, h: 22 };
  }
}

function prettyVendor(domain: string): string {
  const parts = domain.split(".");
  const core = parts.length >= 2 ? parts[parts.length - 2] : domain;
  return core.charAt(0).toUpperCase() + core.slice(1);
}

/** Load an image into an HTMLImageElement. Used by the client-side cropper. */
function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for cropping"));
    img.src = src;
  });
}

/**
 * Crop a percentage-defined rectangle out of an image and return a PNG
 * data URL. Used to extract per-item thumbnails from an AI render — the
 * thumbnail then feeds the background-removal pipeline to produce a
 * clean cutout.
 */
function cropToDataUrl(
  img: HTMLImageElement,
  box: { x: number; y: number; w: number; h: number }
): string {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const sx = Math.max(0, Math.min(W, (box.x / 100) * W));
  const sy = Math.max(0, Math.min(H, (box.y / 100) * H));
  const sw = Math.max(1, Math.min(W - sx, (box.w / 100) * W));
  const sh = Math.max(1, Math.min(H - sy, (box.h / 100) * H));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/**
 * Fallback tips per room type — same copy as the Install Guide per-room
 * page. Used when the designer hasn't typed custom tips yet so the
 * composite never ships with an empty tips block.
 */
function defaultTipsForRoom(type: string): string {
  if (type === "living-room" || type === "den" || type === "media-room") {
    return [
      "Center the sofa, media center, and coffee table on the rug.",
      "Bend tree branches and plant leaves outward for realism.",
    ].join("\n");
  }
  if (type === "dining-room" || type === "kitchen") {
    return [
      "Feed cords through the wall where possible for clean lines.",
      "Center the dining table under the pendant fixture.",
    ].join("\n");
  }
  if (type === "bedroom" || type === "primary-bedroom" || type === "loft") {
    return [
      "Lay throw blankets across the bed from back to front.",
      "Karate-chop pillow tops for a magazine look.",
    ].join("\n");
  }
  if (type === "bathroom") {
    return [
      "Roll towels for the shelves, stack them for the counter.",
      "Keep counter clear except for one decorative tray.",
    ].join("\n");
  }
  return "Bend tree branches and plant leaves outward for realism.";
}

// ── Draggable cutout overlay ──────────────────────────────────────────
//
// A placed product rendered on top of the scene backdrop. Drag to move,
// corner handle to resize. Clicking it selects (shows the outline + handle).
// All coordinates are percentages of the scene image bounds.

interface DraggableCutoutProps {
  sceneItem: SceneItem;
  imageUrl: string;
  selected: boolean;
  onSelect: () => void;
  onMove: (xPct: number, yPct: number) => void;
  onResize: (widthPct: number, heightPct: number) => void;
  onRotate: (deg: number) => void;
  onFlip: (axis: "x" | "y") => void;
}

function DraggableCutout({
  sceneItem,
  imageUrl,
  selected,
  onSelect,
  onMove,
  onResize,
  onRotate,
  onFlip,
}: DraggableCutoutProps) {
  const [drag, setDrag] = useState<null | {
    mode: "move" | "resize" | "rotate";
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startRot: number;
    centerClientX: number;
    centerClientY: number;
    parentW: number;
    parentH: number;
  }>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, mode: "move" | "resize" | "rotate") {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    const parent = (e.currentTarget.closest("[data-scene-surface]") as HTMLElement | null);
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    // Center of the current item in client coords (needed for rotation math)
    const centerClientX = rect.left + (sceneItem.x / 100) * rect.width;
    const centerClientY = rect.top + (sceneItem.y / 100) * rect.height;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: sceneItem.x,
      startY: sceneItem.y,
      startW: sceneItem.width,
      startH: sceneItem.height,
      startRot: sceneItem.rotation ?? 0,
      centerClientX,
      centerClientY,
      parentW: rect.width,
      parentH: rect.height,
    });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    if (drag.mode === "move") {
      const dx = ((e.clientX - drag.startClientX) / drag.parentW) * 100;
      const dy = ((e.clientY - drag.startClientY) / drag.parentH) * 100;
      onMove(
        Math.max(2, Math.min(98, drag.startX + dx)),
        Math.max(2, Math.min(98, drag.startY + dy)),
      );
    } else if (drag.mode === "resize") {
      const dx = ((e.clientX - drag.startClientX) / drag.parentW) * 100;
      const dy = ((e.clientY - drag.startClientY) / drag.parentH) * 100;
      onResize(
        Math.max(4, Math.min(100, drag.startW + dx * 2)),
        Math.max(4, Math.min(100, drag.startH + dy * 2)),
      );
    } else {
      // Rotate: angle between center→start and center→current
      const startAngle = Math.atan2(
        drag.startClientY - drag.centerClientY,
        drag.startClientX - drag.centerClientX,
      );
      const nowAngle = Math.atan2(
        e.clientY - drag.centerClientY,
        e.clientX - drag.centerClientX,
      );
      const deltaDeg = ((nowAngle - startAngle) * 180) / Math.PI;
      onRotate(drag.startRot + deltaDeg);
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (drag) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      setDrag(null);
    }
  }

  const rotDeg = sceneItem.rotation ?? 0;
  const sx = sceneItem.flipX ? -1 : 1;
  const sy = sceneItem.flipY ? -1 : 1;
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${sceneItem.x}%`,
    top: `${sceneItem.y}%`,
    width: `${sceneItem.width}%`,
    height: `${sceneItem.height}%`,
    transform: `translate(-50%, -50%) rotate(${rotDeg}deg)`,
    cursor: drag?.mode === "move" ? "grabbing" : "grab",
    touchAction: "none",
    zIndex: sceneItem.zIndex ?? 1,
  };

  return (
    <div
      style={style}
      onPointerDown={e => onPointerDown(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={selected ? "outline outline-2 outline-amber outline-offset-1 rounded" : ""}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        draggable={false}
        className="w-full h-full object-contain pointer-events-none select-none"
        style={{
          filter: "drop-shadow(0 8px 10px rgba(0,0,0,0.22))",
          transform: `scale(${sx}, ${sy})`,
        }}
      />
      {selected && (
        <>
          {/* Resize handle — bottom-right corner */}
          <div
            onPointerDown={e => onPointerDown(e, "resize")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="absolute -bottom-1.5 -right-1.5 h-4 w-4 rounded-full bg-amber border-2 border-white shadow cursor-nwse-resize"
            title="Drag corner to resize"
          />
          {/* Rotation handle — above the top edge */}
          <div
            onPointerDown={e => onPointerDown(e, "rotate")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="absolute -top-5 left-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-emerald-500 border-2 border-white shadow cursor-grab"
            title="Drag to rotate"
          />
          {/* Flip buttons — above the rotation handle, as a floating toolbar */}
          <div
            className="absolute left-1/2 -translate-x-1/2 flex gap-1"
            style={{ top: "-36px" }}
            onPointerDown={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onFlip("x"); }}
              className="h-5 w-5 rounded bg-white border border-brand-900/20 shadow text-[10px] leading-none hover:bg-brand-900/5"
              title="Flip horizontally"
              style={{ transform: `rotate(${-rotDeg}deg)` }}
            >
              ⇆
            </button>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onFlip("y"); }}
              className="h-5 w-5 rounded bg-white border border-brand-900/20 shadow text-[10px] leading-none hover:bg-brand-900/5"
              title="Flip vertically"
              style={{ transform: `rotate(${-rotDeg}deg)` }}
            >
              ⇅
            </button>
          </div>
        </>
      )}
    </div>
  );
}
