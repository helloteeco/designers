"use client";

import { useEffect, useState } from "react";
import { getProject as getProjectFromStore, saveProject, logActivity } from "@/lib/store";
import { getStudioSettings } from "@/lib/studio-settings";
import { renderWithNanoBanana, buildRoomPrompt } from "@/lib/nano-banana";
import { useToast } from "./Toast";
import type { Project, Room } from "@/lib/types";

interface Props {
  project: Project;
  room: Room;
  /** Reference to the scene canvas DOM element for screenshotting */
  canvasRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onUpdate: () => void;
}

/**
 * AI Render modal — Nano Banana (Gemini 2.5 Flash Image).
 * Takes current Scene Designer composition, screenshots it, sends to Gemini
 * with a descriptive prompt. Returns photorealistic render.
 * Saves result to room.sceneSnapshot → flows into Install Guide.
 */
export default function SceneAIRender({ project, room, canvasRef, onClose, onUpdate }: Props) {
  const toast = useToast();
  const settings = getStudioSettings();
  const [phase, setPhase] = useState<"ready" | "screenshotting" | "rendering" | "done" | "error">("ready");
  const [prompt, setPrompt] = useState(() => buildRoomPrompt(project, room));
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [result, setResult] = useState<{ imageDataUrl: string; elapsedMs: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [useReference, setUseReference] = useState(true);

  const hasApiKey = !!settings.googleApiKey?.trim();

  useEffect(() => {
    // Take screenshot of scene on mount so the designer can see what's being sent
    captureScreenshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function captureScreenshot() {
    if (!canvasRef.current) return;
    setPhase("screenshotting");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(canvasRef.current, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#f0ede6",
        scale: 1,
        logging: false,
      });
      const dataUrl = canvas.toDataURL("image/png");
      setScreenshot(dataUrl);
      setPhase("ready");
    } catch (err) {
      console.error("Screenshot failed:", err);
      setPhase("ready");
      // Not fatal — can still render from prompt alone
    }
  }

  async function runRender() {
    if (!hasApiKey) {
      setPhase("error");
      setErrorMsg("Add your Google API key in Settings → AI Render first.");
      return;
    }
    setPhase("rendering");
    setErrorMsg("");
    try {
      const res = await renderWithNanoBanana({
        apiKey: settings.googleApiKey,
        prompt,
        referenceImageDataUrl: useReference && screenshot ? screenshot : undefined,
      });
      setResult({ imageDataUrl: res.imageDataUrl, elapsedMs: res.elapsedMs });
      setPhase("done");
    } catch (err) {
      console.error("Render failed:", err);
      setPhase("error");
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
    }
  }

  function saveToRoom() {
    if (!result) return;
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const r = fresh.rooms.find(r => r.id === room.id);
    if (!r) return;
    r.sceneSnapshot = result.imageDataUrl;
    saveProject(fresh);
    logActivity(project.id, "ai_render_saved", `AI render saved for ${r.name}`);
    toast.success(`Render saved as ${r.name} snapshot — flows into Install Guide`);
    onUpdate();
    onClose();
  }

  function downloadRender() {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.imageDataUrl;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, "-")}-${room.name.toLowerCase().replace(/\s+/g, "-")}-render.png`;
    a.click();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-brand-900/10 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-brand-900">🎨 AI Render — Nano Banana</h2>
            <p className="text-xs text-brand-600 mt-0.5">
              Gemini 2.5 Flash Image · {room.name} · ~$0.039 per render
            </p>
          </div>
          <button onClick={onClose} className="text-brand-600 hover:text-brand-900 text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {!hasApiKey && (
            <div className="mb-4 rounded-lg bg-amber/10 border border-amber/30 p-4">
              <h3 className="font-semibold text-brand-900 mb-1 text-sm">Google API key needed</h3>
              <p className="text-xs text-brand-700 mb-2">
                Get one free at{" "}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-amber-dark underline font-medium">
                  aistudio.google.com/apikey
                </a>
                , then paste it in <strong>Settings → AI Render</strong>.
              </p>
              <p className="text-[10px] text-brand-600">
                Gemini 2.5 Flash Image includes a generous free tier. Paid: ~$0.039/render.
              </p>
            </div>
          )}

          {phase === "error" && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {/* Left: input */}
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-brand-600">Scene Reference</label>
                  <label className="flex items-center gap-1.5 text-[10px] text-brand-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useReference}
                      onChange={e => setUseReference(e.target.checked)}
                      className="h-3 w-3"
                    />
                    Send as reference
                  </label>
                </div>
                <div className="rounded-lg border border-brand-900/10 bg-brand-900/5 aspect-video overflow-hidden flex items-center justify-center">
                  {phase === "screenshotting" ? (
                    <div className="text-xs text-brand-600">📸 Capturing scene...</div>
                  ) : screenshot ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={screenshot} alt="Scene reference" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-xs text-brand-600/60 text-center p-4">
                      No scene captured yet. Render will use prompt only.
                    </div>
                  )}
                </div>
                {screenshot && useReference && (
                  <p className="text-[10px] text-brand-600 mt-1">
                    Nano Banana will preserve this layout and make it photorealistic.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-1 block">
                  Prompt
                </label>
                <textarea
                  className="input min-h-[120px] text-xs"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                />
                <div className="flex items-center justify-between mt-1">
                  <button
                    onClick={() => setPrompt(buildRoomPrompt(project, room))}
                    className="text-[10px] text-amber-dark hover:underline"
                  >
                    Reset to auto-generated
                  </button>
                  <span className="text-[10px] text-brand-600/60">{prompt.length} chars</span>
                </div>
              </div>

              <button
                onClick={runRender}
                disabled={phase === "rendering" || phase === "screenshotting" || !hasApiKey}
                className="btn-primary w-full"
              >
                {phase === "rendering" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Rendering...
                  </span>
                ) : (
                  "🎨 Generate Photorealistic Render"
                )}
              </button>
              <p className="text-[10px] text-brand-600/60 text-center">
                Typically takes 8-15 seconds. One render = ~$0.039.
              </p>
            </div>

            {/* Right: result */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-1 block">
                  AI Render Result
                </label>
                <div className="rounded-lg border border-brand-900/10 bg-brand-900/5 aspect-video overflow-hidden flex items-center justify-center">
                  {phase === "rendering" ? (
                    <div className="text-center">
                      <div className="text-5xl mb-3 animate-pulse">🎨</div>
                      <div className="text-sm text-brand-700">Nano Banana is rendering...</div>
                      <div className="text-[10px] text-brand-600 mt-1">Usually 8-15 seconds</div>
                    </div>
                  ) : result ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={result.imageDataUrl} alt="AI render" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-xs text-brand-600/60 text-center p-4">
                      Render appears here
                    </div>
                  )}
                </div>
                {result && (
                  <div className="text-[10px] text-brand-600 mt-1 text-right">
                    Rendered in {(result.elapsedMs / 1000).toFixed(1)}s
                  </div>
                )}
              </div>

              {result && (
                <div className="flex gap-2 flex-wrap">
                  <button onClick={saveToRoom} className="btn-primary btn-sm flex-1">
                    Save to {room.name}
                  </button>
                  <button onClick={downloadRender} className="btn-secondary btn-sm">
                    Download
                  </button>
                  <button onClick={runRender} className="btn-secondary btn-sm">
                    🔄 Regenerate
                  </button>
                </div>
              )}

              {result && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900">
                  <strong>Next:</strong> Save this to the room → it&apos;ll appear as the scene on the {room.name} page of the Install Guide automatically.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
