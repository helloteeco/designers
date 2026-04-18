"use client";

import { useRef, useState } from "react";
import { saveProject, getProject as getProjectFromStore, generateId, logActivity } from "@/lib/store";
import { useToast } from "./Toast";
import AutoDetectRooms from "./AutoDetectRooms";
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
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [autoDetectPlan, setAutoDetectPlan] = useState<FloorPlan | null>(null);
  const [showAllPlans, setShowAllPlans] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Only hide overlay if leaving the panel itself (not a child)
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    await processFiles(files);
  }

  const floorPlans = project.property?.floorPlans ?? [];

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(Array.from(files));
    e.target.value = "";
  }

  async function processFiles(files: File[]) {
    // Filter and validate
    const accepted: File[] = [];
    const rejected: { name: string; reason: string }[] = [];

    for (const file of files) {
      const isValidType = file.type === "application/pdf" || file.type.startsWith("image/");
      if (!isValidType) {
        rejected.push({ name: file.name, reason: "not a PDF or image" });
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        rejected.push({ name: file.name, reason: `${(file.size / 1024 / 1024).toFixed(1)}MB > ${MAX_UPLOAD_MB}MB limit` });
        continue;
      }
      accepted.push(file);
    }

    if (rejected.length > 0) {
      toast.warning(
        `Skipped ${rejected.length} file${rejected.length === 1 ? "" : "s"}: ${rejected.slice(0, 2).map(r => `${r.name} (${r.reason})`).join(", ")}${rejected.length > 2 ? "..." : ""}`
      );
    }

    if (accepted.length === 0) return;

    setUploading(true);
    const newlyAdded: FloorPlan[] = [];
    try {
      const fresh = getProjectFromStore(project.id);
      if (!fresh) return;
      if (!fresh.property.floorPlans) fresh.property.floorPlans = [];

      const hadPlansBefore = fresh.property.floorPlans.length > 0;
      const useCustomLabel = accepted.length === 1 && form.name.trim();
      for (let i = 0; i < accepted.length; i++) {
        const file = accepted[i];
        setUploadProgress({ current: i + 1, total: accepted.length, name: file.name });
        const dataUrl = await fileToDataUrl(file);
        const type: FloorPlan["type"] = file.type === "application/pdf" ? "pdf" : "image";
        const defaultName = file.name.replace(/\.[^.]+$/, "");
        const plan: FloorPlan = {
          id: generateId(),
          name: useCustomLabel ? form.name.trim() : defaultName,
          url: dataUrl,
          type,
          uploadedAt: new Date().toISOString(),
          notes: form.notes,
          sizeBytes: file.size,
          // First-ever plan is auto-primary so the Install Guide cover and
          // Space Planner reference have something to lock onto.
          isPrimary: !hadPlansBefore && i === 0 && type === "image" ? true : undefined,
        };
        fresh.property.floorPlans.push(plan);
        newlyAdded.push(plan);
      }

      saveProject(fresh);
      logActivity(project.id, "floor_plans_added", `Added ${accepted.length} floor plan${accepted.length === 1 ? "" : "s"}`);
      toast.success(
        accepted.length === 1
          ? `Floor plan added`
          : `${accepted.length} floor plans added — rename any of them inline`
      );
      setShowForm(false);
      setForm({ name: "", url: "", notes: "" });
      onUpdate();

      // Auto-trigger room detection on a fresh image plan. Skips PDFs (OCR
      // requires an image) and skips when many plans were uploaded at once
      // (the designer is probably importing a set, not a single primary plan).
      const candidate = newlyAdded.find(p => p.type === "image");
      if (candidate && newlyAdded.length === 1) {
        setAutoDetectPlan(candidate);
      }
    } catch (err) {
      toast.error("Upload failed: " + (err instanceof Error ? err.message : "unknown"));
    } finally {
      setUploading(false);
      setUploadProgress(null);
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

  function setPrimaryPlan(id: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const plans = fresh.property.floorPlans ?? [];
    for (const p of plans) p.isPrimary = p.id === id ? true : undefined;
    saveProject(fresh);
    toast.success("Primary plan updated");
    onUpdate();
  }

  // Resolve the primary plan: explicit flag wins, else fall back to the most
  // recent image plan (same rule InstallGuide / SpacePlanner use).
  const primaryPlan =
    floorPlans.find(p => p.isPrimary) ??
    [...floorPlans].filter(p => p.type === "image").sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0] ??
    null;
  const otherPlans = floorPlans.filter(p => p.id !== primaryPlan?.id);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative"
    >
      {/* Drag overlay — shows when user drags files over the whole panel */}
      {isDragOver && !showForm && (
        <div className="absolute inset-0 z-20 rounded-lg border-2 border-dashed border-amber bg-amber/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-4xl mb-2">📥</div>
            <div className="text-sm font-semibold text-amber-dark">Drop to add floor plans</div>
            <div className="text-[11px] text-brand-600 mt-1">Multiple files OK</div>
          </div>
        </div>
      )}

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
        <div className="rounded-lg border-2 border-dashed border-brand-900/10 px-4 py-6 text-center">
          <div className="text-2xl mb-1">📐</div>
          <p className="text-xs text-brand-600 mb-1">
            Drag &amp; drop floor plan files here
          </p>
          <p className="text-[10px] text-brand-600/60">
            PDF or image — multiple at once OK
          </p>
        </div>
      )}

      {/* Inline upload progress when dropping without opening modal */}
      {uploading && uploadProgress && !showForm && (
        <div className="mb-3 rounded-lg bg-amber/10 border border-amber/30 px-3 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-brand-900 font-medium">
              Uploading {uploadProgress.current} of {uploadProgress.total}
            </span>
            <span className="text-brand-600 truncate ml-2">{uploadProgress.name}</span>
          </div>
          <div className="h-1 w-full mt-1 rounded-full bg-brand-900/10 overflow-hidden">
            <div
              className="h-full bg-amber transition-all"
              style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {floorPlans.length > 0 && (
        <div className="space-y-3">
          {/* Primary plan — shown big */}
          {primaryPlan && (
            <PlanCard
              plan={primaryPlan}
              isPrimary
              canSetPrimary={false}
              isOnly={otherPlans.length === 0}
              onPreview={() => primaryPlan.type === "image" ? setPreview(primaryPlan) : window.open(primaryPlan.url, "_blank")}
              onRename={(n) => renamePlan(primaryPlan.id, n)}
              onRemove={() => removePlan(primaryPlan.id)}
              onSetPrimary={() => {}}
              onAutoDetect={primaryPlan.type === "image" ? () => setAutoDetectPlan(primaryPlan) : undefined}
            />
          )}

          {/* Other plans — collapsed by default */}
          {otherPlans.length > 0 && (
            <div>
              <button
                onClick={() => setShowAllPlans(s => !s)}
                className="text-xs text-brand-600 hover:text-brand-900 underline"
              >
                {showAllPlans ? "Hide" : "+ Show"} {otherPlans.length} other plan{otherPlans.length === 1 ? "" : "s"}
              </button>
              {showAllPlans && (
                <div className={compact ? "mt-2 grid grid-cols-2 gap-2" : "mt-2 grid sm:grid-cols-2 gap-2"}>
                  {otherPlans.map(plan => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      isPrimary={false}
                      canSetPrimary={plan.type === "image"}
                      isOnly={false}
                      onPreview={() => plan.type === "image" ? setPreview(plan) : window.open(plan.url, "_blank")}
                      onRename={(n) => renamePlan(plan.id, n)}
                      onRemove={() => removePlan(plan.id)}
                      onSetPrimary={() => setPrimaryPlan(plan.id)}
                      onAutoDetect={plan.type === "image" ? () => setAutoDetectPlan(plan) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Auto-detect modal — opens automatically after a fresh single upload */}
      {autoDetectPlan && (
        <AutoDetectRooms
          project={project}
          plan={autoDetectPlan}
          onUpdate={onUpdate}
          onClose={() => setAutoDetectPlan(null)}
        />
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
                  <label className="label">
                    Drop files here or click to browse
                    <span className="text-brand-600 font-normal ml-1">(PDF/Image, max {MAX_UPLOAD_MB}MB each, multiple OK)</span>
                  </label>
                  <div
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => !uploading && fileInputRef.current?.click()}
                    className={`w-full rounded-lg border-2 border-dashed px-4 py-10 text-center transition cursor-pointer select-none ${
                      isDragOver
                        ? "border-amber bg-amber/10 scale-[1.01]"
                        : uploading
                          ? "border-amber/40 bg-amber/5"
                          : "border-brand-900/20 hover:border-amber/40"
                    }`}
                  >
                    {uploading && uploadProgress ? (
                      <>
                        <div className="text-3xl mb-2">⏳</div>
                        <div className="text-sm font-medium text-brand-900">
                          Uploading {uploadProgress.current} of {uploadProgress.total}...
                        </div>
                        <div className="text-[11px] text-brand-600 mt-1 truncate max-w-xs mx-auto">
                          {uploadProgress.name}
                        </div>
                        <div className="h-1 w-32 mx-auto mt-3 rounded-full bg-brand-900/10 overflow-hidden">
                          <div
                            className="h-full bg-amber transition-all"
                            style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                          />
                        </div>
                      </>
                    ) : isDragOver ? (
                      <>
                        <div className="text-4xl mb-2">📥</div>
                        <div className="text-sm font-semibold text-amber-dark">Drop to upload</div>
                      </>
                    ) : (
                      <>
                        <div className="text-3xl mb-1">📐</div>
                        <div className="text-sm font-medium text-brand-900">
                          Drag &amp; drop your plans here
                        </div>
                        <div className="text-[11px] text-brand-600 mt-1">
                          or click to browse — select multiple files at once
                        </div>
                        <div className="text-[10px] text-brand-600/60 mt-2">
                          PDF · JPG · PNG · WebP — stored locally in this browser
                        </div>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/*"
                    multiple
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

function PlanCard({
  plan,
  isPrimary,
  canSetPrimary,
  isOnly,
  onPreview,
  onRename,
  onRemove,
  onSetPrimary,
  onAutoDetect,
}: {
  plan: FloorPlan;
  isPrimary: boolean;
  canSetPrimary: boolean;
  isOnly: boolean;
  onPreview: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onSetPrimary: () => void;
  onAutoDetect?: () => void;
}) {
  return (
    <div
      className={`group relative rounded-lg border bg-white overflow-hidden transition ${
        isPrimary
          ? "border-amber/60 shadow-sm"
          : "border-brand-900/10 hover:border-amber/40"
      }`}
    >
      {isPrimary && (
        <div className="absolute top-2 left-2 z-10 rounded-full bg-amber px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white shadow">
          Primary
        </div>
      )}
      <button
        onClick={onPreview}
        className={`block w-full bg-brand-900/5 overflow-hidden ${isPrimary ? "aspect-[16/9]" : "aspect-video"}`}
      >
        {plan.type === "image" ? (
          /* eslint-disable-next-line @next/next/no-img-element */
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

      <div className="p-2">
        <div className="flex items-center justify-between gap-2">
          <input
            className="flex-1 text-xs font-medium text-brand-900 bg-transparent outline-none focus:bg-amber/10 px-1 rounded"
            value={plan.name}
            onChange={e => onRename(e.target.value)}
          />
          {!isOnly && (
            <button
              onClick={onRemove}
              className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 shrink-0"
              title="Remove plan"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex items-center justify-between mt-1">
          <div className="text-[9px] text-brand-600/60">
            {plan.type === "pdf" ? "PDF" : plan.type === "image" ? "Image" : "Link"}
            {plan.sizeBytes && ` · ${(plan.sizeBytes / 1024).toFixed(0)} KB`}
            {` · ${new Date(plan.uploadedAt).toLocaleDateString()}`}
          </div>
          <div className="flex gap-2">
            {onAutoDetect && (
              <button
                onClick={onAutoDetect}
                className="text-[10px] text-amber-dark hover:underline font-medium"
                title="Extract rooms + dimensions from this plan"
              >
                🤖 Detect Rooms
              </button>
            )}
            {canSetPrimary && (
              <button
                onClick={onSetPrimary}
                className="text-[10px] text-brand-600 hover:text-amber-dark hover:underline"
                title="Use this plan for Install Guide cover and as Space Planner reference"
              >
                Set as Primary
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
