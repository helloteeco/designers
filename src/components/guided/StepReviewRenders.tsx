"use client";

import { useEffect, useRef, useState } from "react";
import { getProject, saveProject } from "@/lib/store";
import { autoDesignRoom } from "@/lib/auto-design";
import { ensureHostedUrl } from "@/lib/scene-storage";
import { setAdvancedMode } from "@/lib/studio-settings";
import type { Project, Room } from "@/lib/types";
import { StepHeading, StepFooter, StepNotice } from "./StepShell";
import { getGuidedPresetId } from "./guided-state";

interface Props {
  project: Project;
  onUpdate: () => void;
  onComplete: () => void;
  onBack: () => void;
  goToStep: (index: number) => void;
  advanced: boolean;
}

/** Room types we don't bother auto-furnishing. */
const SKIP_AUTOFILL = new Set(["hallway", "closet", "storage", "laundry"]);

interface RenderError {
  message: string;
  /** True when the failure was the reference photo — we offer a no-photo retry. */
  offerNoPhoto: boolean;
}

function friendlyRenderError(raw: string): string {
  if (/GEMINI_API_KEY/i.test(raw)) {
    return "AI rendering isn't connected yet — ask your admin to add the Gemini key.";
  }
  if (/quota|rate.?limit|429|resource.?exhausted/i.test(raw)) {
    return "The AI service is busy right now. Give it a minute, then try again.";
  }
  if (/timed? ?out|abort/i.test(raw)) {
    return "The render took too long and timed out. Try again — it usually works on the second go.";
  }
  return "The render didn't come through. Try again — this usually works on the second attempt.";
}

export default function StepReviewRenders({ project, onUpdate, onComplete, onBack, goToStep, advanced }: Props) {
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, RenderError>>({});
  const [autoFillNote, setAutoFillNote] = useState<string | null>(null);
  const autoFillRan = useRef(false);

  // Auto-fill furniture for empty rooms on entry, so the designer reviews
  // a starting point instead of staring at blank rooms.
  useEffect(() => {
    if (autoFillRan.current) return;
    autoFillRan.current = true;
    const fresh = getProject(project.id);
    if (!fresh) return;
    let filled = 0;
    for (const room of fresh.rooms) {
      if (room.furniture.length > 0 || SKIP_AUTOFILL.has(room.type)) continue;
      try {
        const picks = autoDesignRoom(fresh, room);
        if (picks.length > 0) {
          room.furniture = picks;
          filled++;
        }
      } catch { /* leave the room empty — the card still works */ }
    }
    if (filled > 0) {
      saveProject(fresh);
      onUpdate();
      setAutoFillNote(
        `We furnished ${filled} empty room${filled === 1 ? "" : "s"} in your style to get you started. Nothing's final — review below.`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  function thumbUrl(room: Room): string | undefined {
    return room.sceneSnapshot || room.originalRenderUrl || room.aiRenderUrls?.[0];
  }

  async function generateRender(roomId: string, opts?: { skipReference?: boolean }) {
    const fresh = getProject(project.id);
    const room = fresh?.rooms.find(r => r.id === roomId);
    if (!fresh || !room) return;

    setErrors(prev => { const n = { ...prev }; delete n[roomId]; return n; });
    setGenerating(prev => new Set(prev).add(roomId));

    try {
      // Reference photo (when the room has one) makes the render match the
      // real architecture. Always host it first so the API gets a stable URL.
      let referenceUrl: string | undefined;
      if (!opts?.skipReference && room.referenceImageUrl) {
        referenceUrl = await ensureHostedUrl(room.referenceImageUrl, "scenes");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 110_000);
      const res = await fetch("/api/generate-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          styleId: getGuidedPresetId(project),
          room: { name: room.name, type: room.type, widthFt: room.widthFt, lengthFt: room.lengthFt },
          mode: "full-scene",
          ...(referenceUrl
            ? { referenceImageDataUrl: referenceUrl, requireReference: true }
            : {}),
        }),
      });
      clearTimeout(timeout);

      const raw = await res.text();
      let parsed: { imageDataUrl?: string; error?: string; code?: string } = {};
      try { parsed = JSON.parse(raw); } catch { /* keep raw */ }

      if (res.status === 422 && /REFERENCE_UNAVAILABLE/i.test(parsed.code ?? parsed.error ?? "")) {
        setErrors(prev => ({
          ...prev,
          [roomId]: {
            message: "We couldn't use this room's photo as the reference. You can try again, or render without the photo.",
            offerNoPhoto: true,
          },
        }));
        return;
      }
      if (!res.ok || !parsed.imageDataUrl) {
        setErrors(prev => ({
          ...prev,
          [roomId]: { message: friendlyRenderError(parsed.error ?? raw), offerNoPhoto: false },
        }));
        return;
      }

      // Host the result so localStorage stays light, then persist onto the room.
      const hosted = (await ensureHostedUrl(parsed.imageDataUrl, "scenes")) ?? parsed.imageDataUrl;
      const current = getProject(project.id);
      const target = current?.rooms.find(r => r.id === roomId);
      if (!current || !target) return;
      target.originalRenderUrl = hosted;
      target.aiRenderUrls = [hosted];
      saveProject(current);
      onUpdate();
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      setErrors(prev => ({
        ...prev,
        [roomId]: {
          message: isAbort
            ? "The render took too long and timed out. Try again — it usually works on the second go."
            : friendlyRenderError(err instanceof Error ? err.message : String(err)),
          offerNoPhoto: false,
        },
      }));
    } finally {
      setGenerating(prev => { const n = new Set(prev); n.delete(roomId); return n; });
    }
  }

  function openAdvancedDesigner() {
    setAdvancedMode(true);
    // The project page listens for this and switches to the Design tab.
    window.dispatchEvent(new CustomEvent("navigate-tab", { detail: "design" }));
  }

  const missingRenders = project.rooms.filter(r => !thumbUrl(r)).length;

  return (
    <div>
      <StepHeading
        title="Review furniture & renders"
        subtitle="Each room comes pre-furnished in your style. Generate a render when you want to see the room come to life."
      />

      <div className="space-y-4">
        {autoFillNote && <StepNotice tone="success">{autoFillNote}</StepNotice>}

        {project.rooms.length === 0 && (
          <div className="card text-center py-10">
            <div className="text-3xl mb-2">🛋️</div>
            <p className="text-sm text-brand-600">
              There are no rooms to furnish yet.{" "}
              <button onClick={() => goToStep(1)} className="text-amber-dark font-medium underline">
                Go back and add your rooms
              </button>{" "}
              first.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {project.rooms.map(room => {
            const url = thumbUrl(room);
            const busy = generating.has(room.id);
            const error = errors[room.id];
            const items = room.furniture;
            return (
              <div key={room.id} className="rounded-xl border border-brand-900/10 bg-white overflow-hidden">
                {/* Render thumbnail / placeholder */}
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={`${room.name} render`} className="w-full aspect-video object-cover bg-brand-900/5" />
                ) : (
                  <div className="w-full aspect-video bg-parchment flex flex-col items-center justify-center gap-2">
                    {busy ? (
                      <>
                        <span className="inline-block h-6 w-6 rounded-full border-2 border-amber border-t-transparent animate-spin" />
                        <span className="text-xs text-brand-600">Rendering — takes about 30 seconds…</span>
                      </>
                    ) : (
                      <>
                        <span className="text-2xl opacity-40">🖼️</span>
                        <span className="text-xs text-brand-600">No render yet</span>
                        <button
                          onClick={() => void generateRender(room.id)}
                          className="text-xs font-semibold rounded-lg bg-amber px-3 py-1.5 text-white hover:bg-amber-dark transition"
                        >
                          Generate render
                        </button>
                      </>
                    )}
                  </div>
                )}

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-brand-900 truncate">{room.name}</div>
                      <div className="text-[10px] text-brand-600/70">
                        {items.length === 0 ? "No furniture yet" : `${items.length} item${items.length === 1 ? "" : "s"}`}
                        {room.selectedBedConfig && room.selectedBedConfig.totalSleeps > 0 && (
                          <> &middot; {room.selectedBedConfig.name}</>
                        )}
                      </div>
                    </div>
                    {url && (
                      <button
                        onClick={() => void generateRender(room.id)}
                        disabled={busy}
                        className="text-[11px] font-medium text-amber-dark hover:text-brand-900 transition shrink-0 disabled:opacity-50"
                      >
                        {busy ? "Rendering…" : "Regenerate"}
                      </button>
                    )}
                  </div>

                  {/* Short item list */}
                  {items.length > 0 && (
                    <ul className="text-[11px] text-brand-600 space-y-0.5">
                      {items.slice(0, 6).map((f, i) => (
                        <li key={i} className="truncate">
                          &middot; {f.item.name}{f.quantity > 1 ? ` ×${f.quantity}` : ""}
                        </li>
                      ))}
                      {items.length > 6 && (
                        <li className="text-brand-600/60">…and {items.length - 6} more</li>
                      )}
                    </ul>
                  )}

                  {/* Inline failure — never a dead end */}
                  {error && (
                    <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                      <p className="text-[11px] text-red-700">{error.message}</p>
                      <div className="mt-1.5 flex gap-3">
                        <button
                          onClick={() => void generateRender(room.id)}
                          className="text-[11px] font-semibold text-red-700 underline"
                        >
                          Retry
                        </button>
                        {error.offerNoPhoto && (
                          <button
                            onClick={() => void generateRender(room.id, { skipReference: true })}
                            className="text-[11px] font-semibold text-red-700 underline"
                          >
                            Render without the photo
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Power controls live in the Advanced workspace */}
                  {advanced && (
                    <button
                      onClick={openAdvancedDesigner}
                      className="mt-3 text-[11px] text-brand-600 hover:text-brand-900 underline decoration-brand-900/20 transition"
                    >
                      Swap items & tune prompts in the Design workspace &rarr;
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {missingRenders > 0 && (
          <p className="text-xs text-brand-600/70">
            {missingRenders} room{missingRenders === 1 ? "" : "s"} without a render — that&apos;s fine, the
            Install Guide simply skips the picture for those rooms. You can come back later.
          </p>
        )}
      </div>

      <StepFooter
        primaryLabel="Approve all & continue"
        onPrimary={onComplete}
        onBack={onBack}
      />
    </div>
  );
}
