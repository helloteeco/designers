"use client";

import { useState, useEffect } from "react";
import { saveProject, getProject as getProjectFromStore, logActivity } from "@/lib/store";
import { useToast } from "./Toast";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

interface MatterportRoomPano {
  id: string;
  label: string;
  sweepCount: number;
  suggestedPanoUrl: string | null;
}

/**
 * Matterport integration card — lets the designer paste a Model ID once
 * per project, then pull per-room panoramas from the Matterport API to
 * use as AI reference photos. Requires MATTERPORT_TOKEN_ID + SECRET env
 * vars on the server.
 *
 * Lives on the Brief tab alongside the floor plan uploader.
 */
export default function MatterportLink({ project, onUpdate }: Props) {
  const toast = useToast();
  const [modelIdDraft, setModelIdDraft] = useState(project.property.matterportModelId ?? "");
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState<MatterportRoomPano[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"unknown" | "ready" | "no-tokens" | "bad-tokens">("unknown");

  // Health-check Matterport setup on mount so designer sees whether the
  // API is wired up before trying to pull rooms.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/matterport/list-models")
      .then(r => r.json())
      .then((data: { ok: boolean; error?: string; count?: number }) => {
        if (cancelled) return;
        if (data.ok) setStatus("ready");
        else if (data.error?.includes("not set")) setStatus("no-tokens");
        else setStatus("bad-tokens");
      })
      .catch(() => { if (!cancelled) setStatus("bad-tokens"); });
    return () => { cancelled = true; };
  }, []);

  function saveModelId(id: string) {
    const trimmed = id.trim();
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    fresh.property.matterportModelId = trimmed || undefined;
    saveProject(fresh);
    logActivity(project.id, "matterport_linked", `Linked Matterport model ${trimmed || "(cleared)"}`);
    onUpdate();
  }

  async function pullRooms() {
    const id = modelIdDraft.trim() || project.property.matterportModelId;
    if (!id) {
      toast.error("Paste a Matterport Model ID first (the string after ?m= in your Matterport URL)");
      return;
    }
    setLoading(true);
    setError(null);
    setRooms(null);
    try {
      const res = await fetch(`/api/matterport/model-rooms?modelId=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      setRooms(data.rooms as MatterportRoomPano[]);
      if (!project.property.matterportModelId) saveModelId(id);
      toast.success(`Found ${data.count} room${data.count === 1 ? "" : "s"} in your Matterport model`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function applyPanoToRoom(matterportLabel: string, panoUrl: string) {
    // Find the project room by name (case-insensitive, partial match allowed)
    const norm = matterportLabel.toLowerCase().trim();
    const target = project.rooms.find(r => r.name.toLowerCase() === norm)
      ?? project.rooms.find(r => r.name.toLowerCase().includes(norm))
      ?? project.rooms.find(r => norm.includes(r.name.toLowerCase()));

    if (!target) {
      toast.info(`No project room matches "${matterportLabel}" yet. Add a room with that name first, or manually upload to the Design tab.`);
      return;
    }

    // Fetch the panorama and turn it into a data URL so it survives
    // backup/restore and doesn't depend on Matterport CDN availability
    try {
      const res = await fetch(panoUrl);
      if (!res.ok) throw new Error(`Pano fetch HTTP ${res.status}`);
      const blob = await res.blob();
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Couldn't read pano blob"));
        reader.readAsDataURL(blob);
      });
      const fresh = getProjectFromStore(project.id);
      if (!fresh) return;
      const r = fresh.rooms.find(r => r.id === target.id);
      if (!r) return;
      r.sceneBackgroundUrl = dataUrl;
      saveProject(fresh);
      logActivity(project.id, "pano_applied", `Pulled Matterport pano to ${r.name}`);
      toast.success(`Loaded pano onto ${r.name} — head to Design tab to use as reference`);
      onUpdate();
    } catch (err) {
      toast.error("Couldn't load panorama: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-brand-900 flex items-center gap-2 flex-wrap">
            📷 Matterport — auto-pull reference photos
            {status === "ready" && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                ● API ready
              </span>
            )}
            {status === "no-tokens" && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                ● tokens not set
              </span>
            )}
            {status === "bad-tokens" && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                ● tokens invalid
              </span>
            )}
            {status === "unknown" && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-brand-900/10 text-brand-600">
                ● checking…
              </span>
            )}
          </h3>
          <p className="text-xs text-brand-600 mt-1">
            Paste your Matterport Model ID and the app pulls a panorama per room to use as the AI reference photo in the Design tab.
            Massively better than text-to-image — generated scenes match the real architecture.
          </p>
        </div>
      </div>

      {status === "no-tokens" && (
        <div className="mt-3 rounded-lg bg-amber/10 border border-amber/30 px-3 py-2 text-xs text-brand-700">
          <strong>Not wired yet.</strong> In Vercel → design-studio → Settings → Environment Variables, add
          {" "}<code className="bg-white px-1 rounded">MATTERPORT_TOKEN_ID</code> +
          {" "}<code className="bg-white px-1 rounded">MATTERPORT_TOKEN_SECRET</code> from Matterport → Account → Developer Tools. Redeploy, then refresh.
        </div>
      )}

      {/* Model ID field + pull button */}
      <div className="mt-3 flex gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Paste Matterport Model ID (e.g. 13co1gz9Kga)"
          className="input flex-1 text-xs min-w-[200px]"
          value={modelIdDraft}
          onChange={e => setModelIdDraft(e.target.value)}
          onBlur={() => {
            if (modelIdDraft.trim() !== (project.property.matterportModelId ?? "")) {
              saveModelId(modelIdDraft);
            }
          }}
          disabled={status === "no-tokens"}
        />
        <button
          onClick={pullRooms}
          disabled={loading || status === "no-tokens" || !modelIdDraft.trim()}
          className="rounded-lg bg-amber px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-dark disabled:opacity-50"
        >
          {loading ? "Pulling rooms..." : "Pull rooms from Matterport"}
        </button>
      </div>
      <div className="mt-1.5 text-[10px] text-brand-600/70">
        Find the Model ID in your Matterport share URL: <code>my.matterport.com/show/?m=<strong>XXXXX</strong></code>
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-900 break-words">
          {error}
        </div>
      )}

      {rooms && rooms.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-2">
            {rooms.length} Matterport room{rooms.length === 1 ? "" : "s"} — click to apply pano to matching project room
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {rooms.map(r => (
              <div key={r.id} className="rounded-lg border border-brand-900/10 bg-white p-2">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="text-xs font-medium text-brand-900 truncate">{r.label}</div>
                  <div className="text-[10px] text-brand-600 shrink-0">
                    {r.sweepCount} sweep{r.sweepCount === 1 ? "" : "s"}
                  </div>
                </div>
                {r.suggestedPanoUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.suggestedPanoUrl}
                      alt={r.label}
                      className="w-full h-20 object-cover rounded border border-brand-900/10"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <button
                      onClick={() => applyPanoToRoom(r.label, r.suggestedPanoUrl!)}
                      className="mt-2 w-full text-[10px] font-medium rounded bg-amber/10 text-amber-dark hover:bg-amber/20 px-2 py-1"
                    >
                      Apply to {r.label}
                    </button>
                  </>
                ) : (
                  <div className="text-[10px] text-brand-600/70 italic">No panorama available</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {rooms && rooms.length === 0 && (
        <div className="mt-3 rounded-lg bg-brand-900/5 px-3 py-2 text-xs text-brand-600">
          Model found but Matterport returned no rooms. Double-check the Model ID, or your token may only see
          Sandbox demos — apply for Private Use in Matterport → Developer Tools to access your own scans.
        </div>
      )}
    </div>
  );
}
