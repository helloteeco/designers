"use client";

import { useRef, useState } from "react";
import { saveProject, getProject as getProjectFromStore, generateId, logActivity } from "@/lib/store";
import { useToast } from "./Toast";
import type { Project, FloorPlan } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
  compact?: boolean;
}

const MAX_UPLOAD_MB = 3;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

// Common floor plan labels so users don't have to think
const SUGGESTED_LABELS = [
  "Existing Plan",
  "Demo Plan",
  "New Plan",
  "Electrical Plan",
  "Plumbing Plan",
  "Kitchen Detail",
  "Bath Detail",
  "Elevation",
];

export default function FloorPlansPanel({ project, onUpdate, compact }: Props) {
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [preview, setPreview] = useState<FloorPlan | null>(null);
  const [form, setForm] = useState({ name: "", url: "", notes: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const floorPlans = project.property?.floorPlans ?? [];

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(
        `File is ${(file.size / 1024 / 1024).toFixed(1)}MB. Max ${MAX_UPLOAD_MB}MB for local upload. ` +
        `Host big PDFs on Google Drive/Dropbox and paste the share URL instead.`
      );
      e.target.value = "";
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      const type: FloorPlan["type"] = file.type === "application/pdf" ? "pdf" : "image";
      const defaultName = file.name.replace(/\.[^.]+$/, "");

      const plan: FloorPlan = {
        id: generateId(),
        name: form.name.trim() || defaultName,
        url: dataUrl,
        type,
        uploadedAt: new Date().toISOString(),
        notes: form.notes,
        sizeBytes: file.size,
      };

      addFloorPlan(plan);
    } catch (err) {
      toast.error("Upload failed: " + (err instanceof Error ? err.message : "unknown"));
    } finally {
      e.target.value = "";
    }
  }

  function handleUrlAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.url.trim()) {
      toast.error("Paste a URL first.");
      return;
    }
    const url = form.url.trim();
    const isPdf = /\.pdf(\?|#|$)/i.test(url);
    const isImage = /\.(png|jpg|jpeg|gif|webp|svg)(\?|#|$)/i.test(url);
    const plan: FloorPlan = {
      id: generateId(),
      name: form.name.trim() || "Floor Plan",
      url,
      type: isImage ? "image" : isPdf ? "pdf" : "link",
      uploadedAt: new Date().toISOString(),
      notes: form.notes,
    };
    addFloorPlan(plan);
  }

  function addFloorPlan(plan: FloorPlan) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    if (!fresh.property.floorPlans) fresh.property.floorPlans = [];
    fresh.property.floorPlans.push(plan);
    saveProject(fresh);
    logActivity(project.id, "floor_plan_added", `Added floor plan: ${plan.name}`);
    toast.success(`Floor plan "${plan.name}" added`);
    setShowForm(false);
    setForm({ name: "", url: "", notes: "" });
    onUpdate();
  }

  function removePlan(id: string) {
    const plan = floorPlans.find(p => p.id === id);
    if (!confirm(`Remove "${plan?.name ?? "this floor plan"}"?`)) return;
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    fresh.property.floorPlans = (fresh.property.floorPlans ?? []).filter(p => p.id !== id);
    saveProject(fresh);
    toast.info("Floor plan removed");
    onUpdate();
  }

  function renamePlan(id: string, name: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const p = (fresh.property.floorPlans ?? []).find(p => p.id === id);
    if (!p) return;
    p.name = name;
    saveProject(fresh);
    onUpdate();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">
          Floor Plans ({floorPlans.length})
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="text-xs text-amber-dark hover:underline font-medium"
        >
          + Add Plan
        </button>
      </div>

      {floorPlans.length === 0 && !showForm && (
        <div className="rounded-lg bg-brand-900/5 px-3 py-3 text-xs text-brand-600">
          No floor plans yet. Upload an architect&apos;s PDF, marked-up sketch, or paste a Google Drive / Dropbox link.
        </div>
      )}

      {floorPlans.length > 0 && (
        <div className={compact ? "grid grid-cols-2 gap-2" : "grid sm:grid-cols-2 gap-2"}>
          {floorPlans.map(plan => (
            <div
              key={plan.id}
              className="group relative rounded-lg border border-brand-900/10 bg-white overflow-hidden hover:border-amber/40 transition"
            >
              {/* Preview / thumb */}
              <button
                onClick={() => {
                  if (plan.type === "pdf" || plan.type === "link") {
                    window.open(plan.url, "_blank");
                  } else {
                    setPreview(plan);
                  }
                }}
                className="block w-full aspect-video bg-brand-900/5 overflow-hidden"
              >
                {plan.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={plan.url}
                    alt={plan.name}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-3xl">
                    {plan.type === "pdf" ? "📄" : "🔗"}
                  </div>
                )}
              </button>

              {/* Meta */}
              <div className="p-2">
                <div className="flex items-center justify-between gap-2">
                  <input
                    className="flex-1 text-xs font-medium text-brand-900 bg-transparent outline-none focus:bg-amber/10 px-1 rounded"
                    value={plan.name}
                    onChange={e => renamePlan(plan.id, e.target.value)}
                  />
                  <button
                    onClick={() => removePlan(plan.id)}
                    className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 shrink-0"
                  >
                    ×
                  </button>
                </div>
                <div className="text-[9px] text-brand-600/60 mt-0.5">
                  {plan.type === "pdf" ? "PDF" : plan.type === "image" ? "Image" : "Link"}
                  {plan.sizeBytes && ` · ${(plan.sizeBytes / 1024).toFixed(0)} KB`}
                  {` · ${new Date(plan.uploadedAt).toLocaleDateString()}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Add Floor Plan</h2>
              <button
                onClick={() => { setShowForm(false); setForm({ name: "", url: "", notes: "" }); }}
                className="text-brand-600 hover:text-brand-900 text-xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Mode toggle */}
            <div className="flex gap-1 mb-4 rounded-xl bg-brand-900/5 p-1">
              <button
                onClick={() => setMode("upload")}
                className={`flex-1 text-xs font-medium rounded-lg px-3 py-1.5 transition ${
                  mode === "upload" ? "bg-white shadow-sm text-brand-900" : "text-brand-600"
                }`}
              >
                📤 Upload File
              </button>
              <button
                onClick={() => setMode("url")}
                className={`flex-1 text-xs font-medium rounded-lg px-3 py-1.5 transition ${
                  mode === "url" ? "bg-white shadow-sm text-brand-900" : "text-brand-600"
                }`}
              >
                🔗 Paste URL
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="label">Label</label>
                <input
                  className="input"
                  placeholder='e.g. "Existing Plan", "New Kitchen Layout"'
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  list="floorplan-suggestions"
                />
                <datalist id="floorplan-suggestions">
                  {SUGGESTED_LABELS.map(l => <option key={l} value={l} />)}
                </datalist>
              </div>

              {mode === "upload" ? (
                <div>
                  <label className="label">Choose file (PDF or Image, max {MAX_UPLOAD_MB}MB)</label>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-lg border-2 border-dashed border-brand-900/20 hover:border-amber/40 px-4 py-8 text-center transition"
                  >
                    <div className="text-3xl mb-1">📐</div>
                    <div className="text-sm font-medium text-brand-900">Click to browse</div>
                    <div className="text-[10px] text-brand-600 mt-0.5">
                      PDF · JPG · PNG · WebP — stored locally in this browser
                    </div>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              ) : (
                <form onSubmit={handleUrlAdd} className="space-y-3">
                  <div>
                    <label className="label">Public URL</label>
                    <input
                      className="input"
                      placeholder="https://drive.google.com/... or https://dropbox.com/..."
                      value={form.url}
                      onChange={e => setForm({ ...form, url: e.target.value })}
                    />
                    <div className="text-[10px] text-brand-600 mt-1">
                      Paste any Google Drive, Dropbox, or direct image/PDF URL. The client view will link to it.
                    </div>
                  </div>

                  <div>
                    <label className="label">Notes (optional)</label>
                    <textarea
                      className="input min-h-[60px]"
                      placeholder="What's shown? E.g. 'Existing footprint before demo'"
                      value={form.notes}
                      onChange={e => setForm({ ...form, notes: e.target.value })}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setShowForm(false)} className="btn-secondary btn-sm">Cancel</button>
                    <button type="submit" className="btn-primary btn-sm">Add Link</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {preview && preview.type === "image" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setPreview(null)}
        >
          <div className="max-w-6xl max-h-full overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-white rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-brand-900/5">
                <span className="text-sm font-medium text-brand-900">{preview.name}</span>
                <div className="flex gap-3">
                  <a
                    href={preview.url}
                    download={`${preview.name}.${preview.url.includes("png") ? "png" : "jpg"}`}
                    className="text-xs text-amber-dark hover:underline"
                  >
                    Download
                  </a>
                  <button onClick={() => setPreview(null)} className="text-brand-600 hover:text-brand-900">
                    ×
                  </button>
                </div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.url} alt={preview.name} className="max-w-full max-h-[85vh] object-contain" />
              {preview.notes && (
                <div className="px-4 py-2 text-xs text-brand-700 border-t border-brand-900/5">
                  {preview.notes}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
