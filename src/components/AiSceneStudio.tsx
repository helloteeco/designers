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
  keyPrefix?: string;
  modelReply?: string;
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
  /** Index of chosen option, or null for rejected/pending */
  chosenIndex: number | null;
}

/**
 * AI Scene Studio — the 80→20 engine for per-room design.
 *
 * Flow:
 *   1. Designer picks a style preset (Japandi, Groovy, etc.)
 *   2. Click "Generate Scene" → Gemini 2.5 Flash Image creates a
 *      photorealistic interior in that style for the room type
 *   3. Generated image becomes the Scene Designer background
 *   4. Click "Source Items" → Gemini Vision identifies items in the
 *      scene + Google Search grounding finds 3 real products per piece
 *   5. Designer confirms 1 of 3 per item (or rejects) — confirmed items
 *      drop into the masterlist as custom FurnitureItems and flow to
 *      the Space Planner + Install Guide
 *
 * Budget-aware: total-of-picks vs remaining budget shown as a bar; if
 * picks exceed remaining, the Confirm button turns red.
 */
export default function AiSceneStudio({ project, room, onUpdate }: Props) {
  const toast = useToast();
  const [styleId, setStyleId] = useState<string>(
    project.moodBoards.find(b => b.isLockedConcept)?.style
      ? matchStyleFromDesignStyle(project.moodBoards.find(b => b.isLockedConcept)!.style)
      : STYLE_PRESETS[0].id
  );
  const [generating, setGenerating] = useState(false);
  const [sourcing, setSourcing] = useState(false);
  const [sourcedItems, setSourcedItems] = useState<SourcedItem[] | null>(null);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);

  // Health-check on mount so the designer sees up-front whether the API
  // is actually wired up, instead of only finding out after a failed
  // generate call.
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

  const preset = STYLE_PRESETS.find(p => p.id === styleId) ?? STYLE_PRESETS[0];
  const hasScene = !!room.sceneBackgroundUrl;

  // Budget math: approved-only vs total budget
  const budgetTotal = project.budget || 0;
  const approvedSpend = project.rooms.reduce((s, r) =>
    s + r.furniture.reduce((fs, f) => {
      const st = f.status ?? "specced";
      if (st === "approved" || st === "ordered" || st === "delivered") {
        return fs + f.item.price * f.quantity;
      }
      return fs;
    }, 0),
  0);
  const remainingBudget = Math.max(0, budgetTotal - approvedSpend);

  async function generateScene() {
    setGenerating(true);
    setLastError(null);
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
        }),
      });
      const rawText = await res.text();
      let payload: unknown;
      try { payload = JSON.parse(rawText); } catch { payload = { raw: rawText }; }

      if (!res.ok) {
        const errorMsg = (payload as { error?: string })?.error
          || `HTTP ${res.status} — ${rawText.slice(0, 200)}`;
        throw new Error(errorMsg);
      }

      const { imageDataUrl, modelUsed } = payload as { imageDataUrl?: string; modelUsed?: string };
      if (!imageDataUrl) {
        throw new Error("API returned no image. Response: " + JSON.stringify(payload).slice(0, 300));
      }
      if (modelUsed) {
        // eslint-disable-next-line no-console
        console.log(`[AI Scene Studio] rendered with ${modelUsed}`);
      }

      // Save as the room's scene background
      const fresh = getProjectFromStore(project.id);
      if (!fresh) {
        throw new Error("Couldn't load project from local storage to save the scene");
      }
      const target = fresh.rooms.find(r => r.id === room.id);
      if (!target) {
        throw new Error(`Room ${room.id} not found in project`);
      }
      target.sceneBackgroundUrl = imageDataUrl;
      target.sceneSnapshot = imageDataUrl;

      try {
        saveProject(fresh);
      } catch (saveErr) {
        const m = saveErr instanceof Error ? saveErr.message : String(saveErr);
        throw new Error(
          "Scene generated, but couldn't save to local storage. " +
          "Your browser localStorage is probably full (scenes are ~1-2 MB each). " +
          "Download a backup from Settings → Backup & Data, delete old projects, then try again. " +
          `Details: ${m}`
        );
      }

      logActivity(project.id, "scene_generated", `AI-generated ${preset.label} scene for ${target.name}`);
      toast.success(`${preset.label} scene ready for ${target.name}`);
      onUpdate();
      setSourcedItems(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setLastError(msg);
      toast.error("Scene generation failed — see panel for details");
    } finally {
      setGenerating(false);
    }
  }

  async function sourceItems() {
    if (!room.sceneBackgroundUrl) {
      toast.error("Generate a scene first, then I can source items from it.");
      return;
    }
    setSourcing(true);
    setShowSourceModal(true);
    setLastError(null);
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
      const rawText = await res.text();
      let payload: unknown;
      try { payload = JSON.parse(rawText); } catch { payload = { raw: rawText }; }

      if (!res.ok) {
        const errorMsg = (payload as { error?: string })?.error
          || `HTTP ${res.status} — ${rawText.slice(0, 200)}`;
        throw new Error(errorMsg);
      }
      const { items } = payload as {
        items?: Array<{
          description: string;
          category: string;
          searchQuery: string;
          estimatedSize?: string;
          options: SourcedOption[];
        }>;
      };
      if (!items) {
        throw new Error("API returned no items array. Response: " + JSON.stringify(payload).slice(0, 300));
      }
      setSourcedItems(
        items.map(i => ({
          ...i,
          chosenIndex: i.options.length > 0 ? 0 : null,
        }))
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setLastError(msg);
      toast.error("Sourcing failed — see panel for details");
      setShowSourceModal(false);
    } finally {
      setSourcing(false);
    }
  }

  /**
   * One-click "Design Whole Room" — chains the full pipeline:
   *   1. Generate install-guide-style background (empty room schematic)
   *   2. Auto-source 6-10 items via Gemini Vision + web search
   *   3. Auto-pick the first option per item (designer reviews after)
   *   4. Generate cutouts for each
   *   5. Auto-commit to the scene as draggable tiles
   * Takes ~60-90 seconds total. Designer then reviews by dragging + rejecting.
   */
  async function designWholeRoom() {
    if (generating || sourcing) return;
    setLastError(null);

    // 1. Generate the background (install-guide style, or use reference if present)
    setGenerating(true);
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
        const payload = await res.json().catch(() => ({ error: "Unknown" }));
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      const { imageDataUrl } = await res.json() as { imageDataUrl?: string };
      if (!imageDataUrl) throw new Error("No image returned from scene generation");

      const fresh = getProjectFromStore(project.id);
      if (!fresh) throw new Error("Project gone from localStorage");
      const target = fresh.rooms.find(r => r.id === room.id);
      if (!target) throw new Error("Room gone from project");
      target.sceneBackgroundUrl = imageDataUrl;
      target.sceneSnapshot = imageDataUrl;
      saveProject(fresh);
      onUpdate();
      toast.info("Background done. Sourcing items now...");
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Unknown error");
      toast.error("Auto-design failed at scene generation — see panel");
      setGenerating(false);
      return;
    }
    setGenerating(false);

    // 2. Auto-source items from the just-generated scene
    setSourcing(true);
    try {
      // Use a small delay + refetch so the latest sceneBackgroundUrl is read
      await new Promise(r => setTimeout(r, 300));
      const fresh = getProjectFromStore(project.id);
      const bg = fresh?.rooms.find(r => r.id === room.id)?.sceneBackgroundUrl;
      if (!bg) throw new Error("Scene didn't save");

      const res = await fetch("/api/source-from-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: bg,
          budget: remainingBudget || undefined,
          styleHint: preset.id,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: "Unknown" }));
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      const { items } = await res.json() as {
        items?: Array<{
          description: string;
          category: string;
          searchQuery: string;
          estimatedSize?: string;
          options: SourcedOption[];
        }>;
      };
      if (!items || items.length === 0) throw new Error("No items identified");

      // Auto-pick the first option per item
      const autoPicked: SourcedItem[] = items.map(i => ({
        ...i,
        chosenIndex: i.options.length > 0 ? 0 : null,
      }));
      setSourcedItems(autoPicked);
      toast.info(`Picked ${autoPicked.filter(i => i.chosenIndex !== null).length} items. Generating cutouts...`);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Unknown error");
      toast.error("Auto-design failed at sourcing — see panel");
      setSourcing(false);
      return;
    }
    setSourcing(false);

    // 3. Commit immediately (runs cutout generation in parallel, appends to scene)
    // commitChosen reads sourcedItems from state — which is now populated
    await new Promise(r => setTimeout(r, 100));
    commitChosen();
  }

  function clearScene() {
    if (!confirm("Clear the AI scene and all draggable items on it? The room's furniture-list entries stay; only the scene background + overlay tiles get removed.")) return;
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const target = fresh.rooms.find(r => r.id === room.id);
    if (!target) return;
    target.sceneBackgroundUrl = undefined;
    target.sceneSnapshot = undefined;
    target.sceneItems = [];
    saveProject(fresh);
    logActivity(project.id, "scene_cleared", `Cleared AI scene for ${target.name}`);
    toast.info(`Scene cleared for ${target.name}`);
    setSourcedItems(null);
    onUpdate();
  }

  function pickOption(itemIdx: number, optIdx: number | null) {
    setSourcedItems(prev => prev?.map((it, i) =>
      i === itemIdx ? { ...it, chosenIndex: optIdx } : it
    ) ?? null);
  }

  async function commitChosen() {
    if (!sourcedItems) return;
    const chosen = sourcedItems.filter(i => i.chosenIndex !== null);
    if (chosen.length === 0) return;

    // Close modal immediately and show a toast so the long cutout-generation
    // pass doesn't block the designer in a stuck state.
    setShowSourceModal(false);
    toast.info(`Generating ${chosen.length} product cutouts — keep working, they'll drop onto the scene shortly`);

    // Phase 1: generate cutouts in parallel with a small concurrency limit.
    // Each item either background-removes its source image or text-to-images
    // from scratch. Cached in localStorage so reruns are free.
    const cutoutMap = new Map<string, string>(); // itemIdx → cutout data URL
    await Promise.all(
      chosen.map(async (item) => {
        const opt = item.options[item.chosenIndex!];
        if (!opt) return;
        const cacheKey = `cutout:${opt.vendor}:${opt.name}`.slice(0, 200);
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            cutoutMap.set(String(sourcedItems!.indexOf(item)), cached);
            return;
          }
        } catch { /* localStorage can throw on quota/private mode */ }

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
          if (!res.ok) return;
          const { imageDataUrl } = await res.json() as { imageDataUrl?: string };
          if (!imageDataUrl) return;
          cutoutMap.set(String(sourcedItems!.indexOf(item)), imageDataUrl);
          try { localStorage.setItem(cacheKey, imageDataUrl); } catch { /* quota */ }
        } catch {
          // Silent fallback to original imageUrl
        }
      })
    );

    // Phase 2: now write everything to the project in one localStorage write
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const target = fresh.rooms.find(r => r.id === room.id);
    if (!target) return;

    if (!target.sceneItems) target.sceneItems = [];

    let added = 0;
    const cols = Math.ceil(Math.sqrt(chosen.length));

    chosen.forEach((item, idx) => {
      const opt = item.options[item.chosenIndex!];
      if (!opt) return;
      const chosenIdx = String(sourcedItems!.indexOf(item));
      // Prefer the freshly generated cutout, fall back to original search imageUrl
      const effectiveImage = cutoutMap.get(chosenIdx) || opt.imageUrl || "";

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
        imageUrl: effectiveImage,
        color: "",
        material: "",
        style: preset.designStyle,
      };
      target.furniture.push(placeFurniture(target, customItem));

      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const scenePositionX = 10 + (col * 80) / Math.max(1, cols - 1 || 1);
      const scenePositionY = 60 + row * 15;
      const sceneWidth = Math.max(12, Math.min(28, (customItem.widthIn / 96) * 30));
      const sceneHeight = Math.max(8, Math.min(28, (customItem.heightIn / 72) * 25));
      const sceneItem: SceneItem = {
        id: `scene-${generateId()}`,
        itemId: customItem.id,
        x: clamp(scenePositionX, 2, 100 - sceneWidth),
        y: clamp(scenePositionY, 2, 100 - sceneHeight),
        width: sceneWidth,
        height: sceneHeight,
        rotation: 0,
        zIndex: (target.sceneItems!.length ?? 0) + idx + 1,
      };
      target.sceneItems!.push(sceneItem);
      added++;
    });

    try {
      saveProject(fresh);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      toast.error(`Saved ${added} items to masterlist but scene overlays couldn't save (localStorage full): ${m.slice(0, 100)}`);
      onUpdate();
      setSourcedItems(null);
      return;
    }
    logActivity(project.id, "ai_sourced", `AI-sourced ${added} items for ${target.name} with cutouts`);
    toast.success(`${added} cutouts dropped onto the scene — drag them into position`);
    setSourcedItems(null);
    onUpdate();
  }

  const chosenTotal = sourcedItems?.reduce((s, i) => {
    if (i.chosenIndex === null) return s;
    const opt = i.options[i.chosenIndex];
    return s + (opt?.price ?? 0);
  }, 0) ?? 0;
  const overBudget = budgetTotal > 0 && chosenTotal > remainingBudget;

  return (
    <div className="card bg-gradient-to-br from-amber/5 to-amber/0 border-amber/30 mb-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-semibold text-brand-900 text-sm flex items-center gap-1.5 flex-wrap">
            🪄 AI Scene Studio
            <span className="text-[10px] font-normal text-brand-600/70">
              powered by Gemini
            </span>
            {health && (
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  health.ok
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700"
                }`}
                title={health.message ?? ""}
              >
                {health.ok ? `● API ready` : `● ${health.code}`}
              </span>
            )}
            {!health && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-brand-900/10 text-brand-600">
                ● checking API…
              </span>
            )}
          </h3>
          <p className="text-xs text-brand-600 mt-1">
            Pick a style, generate a photorealistic scene, then source real products from it.
          </p>
        </div>
      </div>

      {/* API-not-ready banner — shown only when the health check failed */}
      {health && !health.ok && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-900">
          <div className="font-semibold mb-0.5">
            {health.code === "NO_KEY" ? "Gemini API key not set" : "Gemini API not responding"}
          </div>
          <div>{health.message}</div>
          {health.code === "NO_KEY" && (
            <div className="mt-1.5 text-[11px]">
              After setting the env var in Vercel, trigger a redeploy — env changes don&apos;t take effect on existing deployments.
            </div>
          )}
        </div>
      )}

      {/* Last-error banner — sticky, visible, not a fleeting toast */}
      {lastError && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-900">
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

      {/* 3-step progress so designers immediately see where they are */}
      <div className="mt-3 flex items-center gap-2 text-[11px]">
        <StepChip n={1} label="Pick style" done={true} active={!hasScene} />
        <div className={`h-px w-6 ${hasScene ? "bg-emerald-500" : "bg-brand-900/10"}`} />
        <StepChip n={2} label="Generate scene" done={hasScene} active={!hasScene && !generating} loading={generating} />
        <div className={`h-px w-6 ${hasScene && room.furniture.length > 0 ? "bg-emerald-500" : "bg-brand-900/10"}`} />
        <StepChip n={3} label="Source real products" done={false} active={hasScene} loading={sourcing} />
      </div>

      {/* STEP 1 — Style presets */}
      <div className="mt-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-1.5">
          1 · Pick a style
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
        <div className="mt-2 text-xs text-brand-700 italic">{preset.description}</div>
      </div>

      {/* STEP 2 — Generate scene */}
      <div className="mt-4 pt-4 border-t border-brand-900/5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
              2 · Generate the scene
            </div>
            <div className="text-[11px] text-brand-600/80 mt-0.5">
              {referenceImage
                ? <>Using your reference photo — Gemini will keep the actual walls, windows, and door positions, just restyle the room in <strong>{preset.label}</strong>.</>
                : <>Gemini draws a photorealistic {preset.label.toLowerCase()} {room.type.replace(/-/g, " ")} from scratch. <strong>Upload a Matterport screenshot below</strong> for a more accurate scene that matches your actual room.</>
              }
            </div>
          </div>
          {hasScene && (
            <span className="text-[10px] text-emerald-700 font-semibold shrink-0">
              ✓ Scene ready
            </span>
          )}
        </div>

        {/* Reference photo drop — optional but high-leverage */}
        <div className="mb-3 rounded-lg border border-dashed border-brand-900/15 bg-white p-2.5">
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
                  {referenceImage ? "Reference photo loaded" : "Optional: drop a real photo of the empty room"}
                </div>
                <div className="text-[10px] text-brand-600 mt-0.5">
                  In Matterport → navigate to this room → top-right menu → <strong>Share → Screenshot</strong> → drop here.
                  Preserves actual walls / windows / doors in the generated scene.
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
                    if (file.size > 5 * 1024 * 1024) {
                      toast.error("Image > 5MB — please screenshot at lower resolution");
                      e.target.value = "";
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => setReferenceImage(reader.result as string);
                    reader.readAsDataURL(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {referenceImage && (
                <button
                  onClick={() => setReferenceImage(null)}
                  className="text-xs text-red-500 hover:underline px-1"
                  title="Remove reference photo"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={generateScene}
            disabled={generating || sourcing}
            className="rounded-lg bg-amber px-4 py-2 text-sm font-semibold text-white hover:bg-amber-dark disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {generating
              ? "Generating scene... (15–30s)"
              : hasScene
                ? `🎨 Re-generate in ${preset.label}${referenceImage ? " (using reference)" : ""}`
                : `🎨 Generate ${preset.label} Scene${referenceImage ? " (using reference)" : ""}`}
          </button>
          <button
            onClick={designWholeRoom}
            disabled={generating || sourcing}
            className="rounded-lg border-2 border-amber bg-white px-4 py-2 text-sm font-semibold text-amber-dark hover:bg-amber/10 disabled:opacity-60 disabled:cursor-not-allowed"
            title="One-click: generate background → source items → auto-place cutouts on scene"
          >
            {generating || sourcing ? "Designing..." : "⚡ Design Whole Room (one-click)"}
          </button>
        </div>
        {!generating && !sourcing && (
          <div className="mt-2 text-[10px] text-brand-600/70">
            <strong>Design Whole Room</strong> chains all 3 steps: generate background → source 6–10 items → drop as draggable cutouts. ~60–90 seconds total.
          </div>
        )}
      </div>

      {/* STEP 3 — Source real products — only unlocked after scene exists */}
      <div className={`mt-4 pt-4 border-t border-brand-900/5 ${!hasScene ? "opacity-60" : ""}`}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
              3 · Source real products from the scene
            </div>
            <div className="text-[11px] text-brand-600/80 mt-0.5">
              {hasScene
                ? <>Gemini scans the image, lists every item (sofa, lamp, rug…), and pulls <strong>3 real buyable options</strong> from Wayfair / West Elm / CB2 / Article / Target / etc. per piece. You pick the best fit — they land in the masterlist and Space Plan.</>
                : <>Generate a scene first, then this step unlocks.</>
              }
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={sourceItems}
            disabled={!hasScene || sourcing}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sourcing
              ? "Finding products... (30–60s)"
              : !hasScene
                ? "🛒 Source Real Products (disabled)"
                : "🛒 Find 3 Real Products per Item"}
          </button>
          {hasScene && (
            <button
              onClick={clearScene}
              className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
              title="Remove the AI scene + all draggable overlay tiles. Your masterlist items stay put."
            >
              ↶ Clear Scene
            </button>
          )}
        </div>

        {hasScene && (
          <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-[11px] text-blue-900">
            <strong>Step 4 (after sourcing):</strong> Each confirmed product drops onto the scene as a draggable tile.
            Drag to position · corner handles to resize · blue dot to rotate · Delete key to remove.
            Rearrange them to match the layout you want for the client render.
          </div>
        )}
      </div>

      {budgetTotal > 0 && (
        <div className="mt-4 pt-3 border-t border-brand-900/5 text-[11px] text-brand-600">
          <strong>Budget:</strong> ${approvedSpend.toLocaleString()} approved · ${remainingBudget.toLocaleString()} remaining of ${budgetTotal.toLocaleString()}
        </div>
      )}

      {/* Sourcing modal */}
      {showSourceModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-brand-900/10 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Source Real Products</h2>
                <p className="text-xs text-brand-600 mt-0.5">
                  3 options per item from the web. Pick one per row, or reject.
                </p>
              </div>
              <button
                onClick={() => setShowSourceModal(false)}
                className="text-brand-600 hover:text-brand-900 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {sourcing && (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3 animate-pulse">🔍</div>
                  <div className="text-sm font-medium text-brand-900">
                    Analyzing scene + searching the web...
                  </div>
                  <div className="text-xs text-brand-600 mt-1">
                    Gemini identifies each piece, then grounds each query in Google Search. 30–60 seconds.
                  </div>
                </div>
              )}

              {!sourcing && sourcedItems && sourcedItems.length === 0 && (
                <div className="text-center py-12 text-brand-600 text-sm">
                  Couldn&apos;t identify any items. Try regenerating the scene.
                </div>
              )}

              {!sourcing && sourcedItems && sourcedItems.length > 0 && (
                <div className="space-y-4">
                  {sourcedItems.map((item, itemIdx) => (
                    <div key={itemIdx} className="rounded-lg border border-brand-900/10 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="text-sm font-semibold text-brand-900">{item.description}</div>
                          <div className="text-[10px] text-brand-600">
                            {item.category} · {item.searchQuery}
                          </div>
                        </div>
                        <button
                          onClick={() => pickOption(itemIdx, null)}
                          className={`text-[10px] px-2 py-1 rounded ${
                            item.chosenIndex === null
                              ? "bg-red-100 text-red-700"
                              : "text-brand-600 hover:text-red-600"
                          }`}
                        >
                          Reject all
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {item.options.length === 0 && (
                          <div className="col-span-3 text-xs text-brand-600 italic">
                            No matches found for this piece.
                          </div>
                        )}
                        {item.options.map((opt, optIdx) => {
                          const picked = item.chosenIndex === optIdx;
                          return (
                            <button
                              key={optIdx}
                              onClick={() => pickOption(itemIdx, optIdx)}
                              className={`text-left rounded-lg border p-2 transition ${
                                picked
                                  ? "border-amber bg-amber/10 shadow-sm"
                                  : "border-brand-900/10 bg-white hover:border-amber/40"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-xs font-medium text-brand-900 line-clamp-2">
                                  {opt.name}
                                </div>
                                {picked && <span className="text-amber-dark shrink-0">✓</span>}
                              </div>
                              <div className="text-[10px] text-brand-600 mt-1">{opt.vendor}</div>
                              <div className="text-sm font-semibold text-brand-900 mt-1">
                                {opt.price !== null ? `$${opt.price.toLocaleString()}` : "—"}
                              </div>
                              {opt.dimensions && (
                                <div className="text-[9px] text-brand-600/70 mt-0.5">{opt.dimensions}</div>
                              )}
                              {opt.url && (
                                <a
                                  href={opt.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-[10px] text-amber-dark hover:underline mt-1 inline-block"
                                >
                                  View on {opt.vendor} →
                                </a>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!sourcing && sourcedItems && sourcedItems.length > 0 && (
              <div className="px-6 py-4 border-t border-brand-900/10 flex items-center justify-between flex-wrap gap-3">
                <div className="text-xs">
                  <div className="font-semibold text-brand-900">
                    Picks total: ${chosenTotal.toLocaleString()}
                    <span className="text-brand-600 font-normal ml-2">
                      ({sourcedItems.filter(i => i.chosenIndex !== null).length}/{sourcedItems.length} chosen)
                    </span>
                  </div>
                  {budgetTotal > 0 && (
                    <div className={overBudget ? "text-red-600" : "text-brand-600"}>
                      {overBudget
                        ? `Over remaining budget by $${(chosenTotal - remainingBudget).toLocaleString()}`
                        : `$${(remainingBudget - chosenTotal).toLocaleString()} budget left after confirming`}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowSourceModal(false)}
                    className="btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={commitChosen}
                    disabled={sourcedItems.every(i => i.chosenIndex === null)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed ${
                      overBudget ? "bg-red-600 hover:bg-red-700" : "bg-amber hover:bg-amber-dark"
                    }`}
                  >
                    Add {sourcedItems.filter(i => i.chosenIndex !== null).length} items to {room.name}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step chip for the 3-step header ────────────────────────────────────

function StepChip({
  n,
  label,
  done,
  active,
  loading,
}: {
  n: number;
  label: string;
  done: boolean;
  active: boolean;
  loading?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${
      done ? "text-emerald-700"
      : active ? "text-brand-900 font-semibold"
      : "text-brand-600/60"
    }`}>
      <span className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0 ${
        done ? "bg-emerald-500 text-white"
        : loading ? "bg-amber text-white animate-pulse"
        : active ? "bg-amber text-white"
        : "bg-brand-900/10 text-brand-600/60"
      }`}>
        {done ? "✓" : n}
      </span>
      <span className="text-[11px]">{label}</span>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function matchStyleFromDesignStyle(ds: string): string {
  const map: Record<string, string> = {
    "scandinavian": "scandinavian",
    "mid-century": "mid-century-modern",
    "coastal": "coastal",
    "bohemian": "boho",
    "traditional": "traditional",
    "contemporary": "organic-modern",
    "modern": "japandi",
    "rustic": "mediterranean",
  };
  return map[ds] ?? "japandi";
}

function mapCategory(c: string): FurnitureItem["category"] {
  const s = c.toLowerCase();
  if (s.includes("bed") || s.includes("mattress")) return "beds-mattresses";
  if (s.includes("sofa") || s.includes("chair") || s.includes("seating") || s.includes("ottoman")) return "seating";
  if (s.includes("table") || s.includes("desk") || s.includes("nightstand")) return "tables";
  if (s.includes("storage") || s.includes("dresser") || s.includes("shelf") || s.includes("cabinet")) return "storage";
  if (s.includes("lamp") || s.includes("light") || s.includes("pendant") || s.includes("sconce")) return "lighting";
  if (s.includes("rug") || s.includes("textile") || s.includes("curtain") || s.includes("pillow")) return "rugs-textiles";
  if (s.includes("art") || s.includes("mirror") || s.includes("vase") || s.includes("plant")) return "decor";
  if (s.includes("outdoor") || s.includes("patio")) return "outdoor";
  if (s.includes("bathroom") || s.includes("towel")) return "bathroom";
  if (s.includes("kitchen") || s.includes("dinner")) return "kitchen-dining";
  return "decor";
}

function parseFirstDim(s?: string): number | null {
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:\"|in|inches)?/i);
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
