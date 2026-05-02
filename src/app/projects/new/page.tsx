"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { createEmptyProject, saveProject, logActivity, generateId } from "@/lib/store";
import { TEMPLATES } from "@/lib/project-templates";
import type { DesignStyle, Room, ProjectType, FloorPlan } from "@/lib/types";

// ── Styles (kept for later in the flow) ─────────────────────────────────
const STYLES: { value: DesignStyle; label: string }[] = [
  { value: "modern", label: "Modern" },
  { value: "farmhouse", label: "Farmhouse" },
  { value: "coastal", label: "Coastal" },
  { value: "bohemian", label: "Bohemian" },
  { value: "industrial", label: "Industrial" },
  { value: "mid-century", label: "Mid-Century" },
  { value: "scandinavian", label: "Scandinavian" },
  { value: "rustic", label: "Rustic" },
  { value: "contemporary", label: "Contemporary" },
  { value: "transitional", label: "Transitional" },
  { value: "mountain-lodge", label: "Mountain Lodge" },
  { value: "traditional", label: "Traditional" },
];

// V1 project types — focused on furnishing only
const V1_PROJECT_TYPES: { value: ProjectType; label: string; desc: string }[] = [
  { value: "furnish-only", label: "Furnish Only", desc: "Property is move-in ready. Just need furniture and decor." },
  { value: "full-redesign", label: "Airbnb-Ready Refresh", desc: "Light updates + full furnishing plan for STR launch." },
];

type EntryMode = null | "link" | "upload" | "manual";
type FlowStep = "choose" | "link-input" | "upload-input" | "details";

export default function NewProjectPage() {
  const router = useRouter();
  const [project, setProject] = useState(() => createEmptyProject());
  const [error, setError] = useState("");
  const [entryMode, setEntryMode] = useState<EntryMode>(null);
  const [step, setStep] = useState<FlowStep>("choose");

  // Link-based flow
  const [listingUrl, setListingUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<{
    ok: boolean;
    reason?: string;
    title?: string;
    address?: string;
    bedrooms?: number;
    bathrooms?: number;
    sqft?: number;
    galleryImages?: string[];
    floorPlanImages?: string[];
    matterportModelId?: string;
  } | null>(null);

  // Upload-based flow
  const [floorPlanFiles, setFloorPlanFiles] = useState<{ file: File; preview: string }[]>([]);
  const [roomPhotoFiles, setRoomPhotoFiles] = useState<{ file: File; preview: string }[]>([]);
  const floorPlanInputRef = useRef<HTMLInputElement>(null);
  const roomPhotoInputRef = useRef<HTMLInputElement>(null);

  // Template recommendation (shown after project skeleton is built)
  const [showTemplateRec, setShowTemplateRec] = useState(false);

  const MAX_UPLOAD_MB = 3;
  const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

  // ── Helpers ─────────────────────────────────────────────────────────────

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function update(path: string, value: string | number) {
    setProject((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");
      if (keys.length === 0 || !keys[0]) return prev;
      let obj: Record<string, unknown> = next as unknown as Record<string, unknown>;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]] || typeof obj[keys[i]] !== "object") return prev;
        obj = obj[keys[i]] as Record<string, unknown>;
      }
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  }

  // ── Option A: Paste Link ────────────────────────────────────────────────

  async function handleScrapeListing() {
    if (!listingUrl.trim()) return;
    setScraping(true);
    setScrapeResult(null);
    try {
      const res = await fetch("/api/scrape-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: listingUrl.trim() }),
      });
      const data = await res.json();
      setScrapeResult(data);

      // Auto-populate project from scraped data
      if (data.title) update("name", data.title);
      if (data.address) update("property.address", data.address);
      if (data.matterportModelId) update("property.matterportModelId", data.matterportModelId);
      if (data.bedrooms) update("property.bedrooms", data.bedrooms);
      if (data.bathrooms) update("property.bathrooms", data.bathrooms);
      if (data.sqft) update("property.squareFootage", data.sqft);

      // If scrape succeeded, move to details step
      if (data.ok) {
        setStep("details");
        setShowTemplateRec(true);
      }
    } catch {
      setScrapeResult({ ok: false, reason: "Network error. Try uploading files directly." });
    } finally {
      setScraping(false);
    }
  }

  // ── Option B: Upload ────────────────────────────────────────────────────

  async function handleFloorPlanFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(
      (f) => (f.type.startsWith("image/") || f.type === "application/pdf") && f.size <= MAX_UPLOAD_BYTES
    );
    const withPreviews = await Promise.all(
      arr.map(async (file) => ({
        file,
        preview: file.type.startsWith("image/") ? await fileToDataUrl(file) : "",
      }))
    );
    setFloorPlanFiles((prev) => [...prev, ...withPreviews]);
  }

  async function handleRoomPhotoFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(
      (f) => f.type.startsWith("image/") && f.size <= MAX_UPLOAD_BYTES
    );
    const withPreviews = await Promise.all(
      arr.map(async (file) => ({
        file,
        preview: await fileToDataUrl(file),
      }))
    );
    setRoomPhotoFiles((prev) => [...prev, ...withPreviews]);
  }

  function proceedFromUpload() {
    setStep("details");
    setShowTemplateRec(true);
  }

  // ── Template application ────────────────────────────────────────────────

  function applyTemplate(tpl: typeof TEMPLATES[0]) {
    const rooms: Room[] = tpl.rooms.map((r) => ({
      id: generateId(),
      ...r,
      selectedBedConfig: null,
      furniture: [],
      accentWall: null,
      notes: "",
    }));
    setProject((prev) => ({
      ...prev,
      name: prev.name || tpl.name,
      projectType: "furnish-only",
      style: tpl.style,
      targetGuests: tpl.targetGuests,
      rooms,
      property: {
        ...prev.property,
        bedrooms: tpl.rooms.filter((r) =>
          ["primary-bedroom", "bedroom", "loft", "bonus-room"].includes(r.type)
        ).length || prev.property.bedrooms,
        bathrooms: tpl.rooms.filter((r) => r.type === "bathroom").length || prev.property.bathrooms,
        floors: Math.max(...tpl.rooms.map((r) => r.floor), 1),
      },
    }));
    setShowTemplateRec(false);
  }

  // ── Create project ──────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!project.name.trim()) {
      setError("Please enter a project name.");
      return;
    }

    const finalProject = { ...project };
    if (!finalProject.property.floorPlans) finalProject.property.floorPlans = [];

    // Attach floor plans
    for (const { file } of floorPlanFiles) {
      const dataUrl = await fileToDataUrl(file);
      const plan: FloorPlan = {
        id: generateId(),
        name: file.name.replace(/\.[^.]+$/, ""),
        url: dataUrl,
        type: file.type === "application/pdf" ? "pdf" : "image",
        uploadedAt: new Date().toISOString(),
        notes: "",
        sizeBytes: file.size,
        isPrimary: finalProject.property.floorPlans.length === 0 ? true : undefined,
      };
      finalProject.property.floorPlans.push(plan);
    }

    // Attach room photos
    for (const { file } of roomPhotoFiles) {
      const dataUrl = await fileToDataUrl(file);
      const plan: FloorPlan = {
        id: generateId(),
        name: `Room Photo - ${file.name.replace(/\.[^.]+$/, "")}`,
        url: dataUrl,
        type: "image",
        uploadedAt: new Date().toISOString(),
        notes: "room-photo",
        sizeBytes: file.size,
      };
      finalProject.property.floorPlans.push(plan);
    }

    // Store listing URL if provided
    if (listingUrl.trim()) {
      finalProject.property.matterportLink = finalProject.property.matterportLink || listingUrl.trim();
    }

    saveProject(finalProject);
    logActivity(finalProject.id, "created", `Created project: ${finalProject.name}`);
    if (floorPlanFiles.length > 0) {
      logActivity(finalProject.id, "floor_plans_added", `Added ${floorPlanFiles.length} floor plan(s) at creation`);
    }
    if (roomPhotoFiles.length > 0) {
      logActivity(finalProject.id, "room_photos_added", `Added ${roomPhotoFiles.length} room photo(s) at creation`);
    }
    router.push(`/projects/${finalProject.id}`);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-cream">
      <Navbar />
      <main className="mx-auto max-w-2xl px-6 py-8 animate-in">
        <button
          onClick={() => router.back()}
          className="mb-6 text-sm text-brand-600 hover:text-brand-900 transition"
        >
          &larr; Back to Projects
        </button>

        {/* ═══ STEP 1: Choose Entry Mode ═══ */}
        {step === "choose" && (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-brand-900 mb-2">
              Start New Design Project
            </h1>
            <p className="text-sm text-brand-600 mb-8">
              How would you like to get started?
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              {/* Option A: Paste Link */}
              <button
                onClick={() => { setEntryMode("link"); setStep("link-input"); }}
                className="card text-left p-6 hover:border-amber/60 hover:shadow-md transition group"
              >
                <div className="text-3xl mb-3">🔗</div>
                <h3 className="font-semibold text-brand-900 group-hover:text-amber-dark mb-1">
                  Paste Listing / Matterport Link
                </h3>
                <p className="text-xs text-brand-600">
                  Best for speed. We&apos;ll auto-extract property info, photos, and room data.
                </p>
                <div className="mt-3 text-[10px] font-medium text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5 inline-block">
                  Recommended
                </div>
              </button>

              {/* Option B: Upload */}
              <button
                onClick={() => { setEntryMode("upload"); setStep("upload-input"); }}
                className="card text-left p-6 hover:border-amber/60 hover:shadow-md transition group"
              >
                <div className="text-3xl mb-3">📷</div>
                <h3 className="font-semibold text-brand-900 group-hover:text-amber-dark mb-1">
                  Upload Photos / Floor Plan
                </h3>
                <p className="text-xs text-brand-600">
                  For projects without a listing. Upload what you have and we&apos;ll build from there.
                </p>
              </button>

              {/* Option C: Manual */}
              <button
                onClick={() => { setEntryMode("manual"); setStep("details"); setShowTemplateRec(true); }}
                className="card text-left p-6 hover:border-amber/60 hover:shadow-md transition group"
              >
                <div className="text-3xl mb-3">✏️</div>
                <h3 className="font-semibold text-brand-900 group-hover:text-amber-dark mb-1">
                  Start Manually
                </h3>
                <p className="text-xs text-brand-600">
                  Fill in project details yourself. Good for custom or unusual properties.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 2A: Paste Link ═══ */}
        {step === "link-input" && (
          <div>
            <h1 className="text-2xl font-bold text-brand-900 mb-2">
              Paste Your Listing Link
            </h1>
            <p className="text-sm text-brand-600 mb-6">
              Paste a real estate listing, Matterport, or property page URL. We&apos;ll extract everything we can.
            </p>

            <div className="card p-6">
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="https://www.airbnb.com/rooms/... or Matterport link"
                  value={listingUrl}
                  onChange={(e) => setListingUrl(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleScrapeListing(); } }}
                />
                <button
                  onClick={handleScrapeListing}
                  disabled={scraping || !listingUrl.trim()}
                  className="btn-primary whitespace-nowrap"
                >
                  {scraping ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Extracting...
                    </span>
                  ) : "Extract"}
                </button>
              </div>

              {scrapeResult && (
                <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${
                  scrapeResult.ok
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                    : "bg-amber-50 border border-amber-200 text-amber-700"
                }`}>
                  {scrapeResult.ok ? (
                    <div>
                      <div className="font-semibold mb-1">Found property data:</div>
                      <ul className="text-xs space-y-0.5">
                        {scrapeResult.title && <li>Title: {scrapeResult.title}</li>}
                        {scrapeResult.address && <li>Address: {scrapeResult.address}</li>}
                        {(scrapeResult.galleryImages?.length ?? 0) > 0 && (
                          <li>{scrapeResult.galleryImages!.length} photos extracted</li>
                        )}
                        {scrapeResult.matterportModelId && <li>Matterport scan detected</li>}
                      </ul>
                    </div>
                  ) : (
                    <div>
                      {scrapeResult.reason || "Could not extract data from this URL."}
                      <button
                        onClick={() => { setStep("upload-input"); setEntryMode("upload"); }}
                        className="block mt-2 text-xs underline hover:no-underline"
                      >
                        Try uploading photos instead
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!scrapeResult && (
                <p className="text-xs text-brand-600/60 mt-3">
                  Supports: Airbnb, VRBO, Zillow, Realtor, Matterport, Bluegrass, and most listing sites.
                </p>
              )}
            </div>

            <div className="mt-4 flex justify-between">
              <button onClick={() => setStep("choose")} className="btn-secondary text-sm">
                &larr; Back
              </button>
              {scrapeResult?.ok && (
                <button onClick={() => setStep("details")} className="btn-primary text-sm">
                  Continue &rarr;
                </button>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP 2B: Upload Photos ═══ */}
        {step === "upload-input" && (
          <div>
            <h1 className="text-2xl font-bold text-brand-900 mb-2">
              Upload Your Property Files
            </h1>
            <p className="text-sm text-brand-600 mb-6">
              Upload floor plans, room photos, or anything you have. These power the AI room detection and design generation.
            </p>

            <div className="space-y-6">
              {/* Floor Plan Upload */}
              <div className="card p-6">
                <label className="label mb-3 text-sm font-semibold">Floor Plan</label>
                <div
                  onClick={() => floorPlanInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFloorPlanFiles(e.dataTransfer.files); }}
                  className="border-2 border-dashed border-brand-900/20 rounded-xl p-6 text-center cursor-pointer hover:border-amber/40 transition"
                >
                  <div className="text-2xl mb-2">📐</div>
                  <p className="text-sm text-brand-600">Drag &amp; drop floor plan here, or click to browse</p>
                  <p className="text-xs text-brand-600/60 mt-1">SVG (best), PNG, JPG, or PDF — max {MAX_UPLOAD_MB}MB each</p>
                  <input
                    ref={floorPlanInputRef}
                    type="file"
                    accept="image/*,.pdf,.svg"
                    multiple
                    className="hidden"
                    onChange={(e) => { if (e.target.files) handleFloorPlanFiles(e.target.files); e.target.value = ""; }}
                  />
                </div>
                {floorPlanFiles.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {floorPlanFiles.map((f, i) => (
                      <div key={i} className="relative group">
                        {f.preview ? (
                          <img src={f.preview} alt={f.file.name} className="w-20 h-20 object-cover rounded-lg border border-brand-900/10" />
                        ) : (
                          <div className="w-20 h-20 rounded-lg border border-brand-900/10 flex items-center justify-center bg-brand-900/5 text-xs text-brand-600">PDF</div>
                        )}
                        <button
                          type="button"
                          onClick={() => setFloorPlanFiles((prev) => prev.filter((_, j) => j !== i))}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Room Photos Upload */}
              <div className="card p-6">
                <label className="label mb-3 text-sm font-semibold">Room Photos</label>
                <div
                  onClick={() => roomPhotoInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleRoomPhotoFiles(e.dataTransfer.files); }}
                  className="border-2 border-dashed border-brand-900/20 rounded-xl p-6 text-center cursor-pointer hover:border-amber/40 transition"
                >
                  <div className="text-2xl mb-2">📷</div>
                  <p className="text-sm text-brand-600">Drag &amp; drop room photos here, or click to browse</p>
                  <p className="text-xs text-brand-600/60 mt-1">Photos from photographer, Matterport screenshots, etc.</p>
                  <input
                    ref={roomPhotoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => { if (e.target.files) handleRoomPhotoFiles(e.target.files); e.target.value = ""; }}
                  />
                </div>
                {roomPhotoFiles.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {roomPhotoFiles.map((f, i) => (
                      <div key={i} className="relative group">
                        <img src={f.preview} alt={f.file.name} className="w-20 h-20 object-cover rounded-lg border border-brand-900/10" />
                        <button
                          type="button"
                          onClick={() => setRoomPhotoFiles((prev) => prev.filter((_, j) => j !== i))}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-between">
              <button onClick={() => setStep("choose")} className="btn-secondary text-sm">
                &larr; Back
              </button>
              <button
                onClick={proceedFromUpload}
                disabled={floorPlanFiles.length === 0 && roomPhotoFiles.length === 0}
                className="btn-primary text-sm disabled:opacity-40"
              >
                Continue &rarr;
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 3: Project Details (all paths converge here) ═══ */}
        {step === "details" && (
          <form onSubmit={handleCreate} className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-brand-900 mb-1">
                Project Details
              </h1>
              <p className="text-sm text-brand-600">
                {entryMode === "link"
                  ? "We pre-filled what we could. Review and adjust below."
                  : entryMode === "upload"
                    ? "Tell us about the property. The AI will use your uploads + these details."
                    : "Fill in your project details below."}
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Template Recommendation */}
            {showTemplateRec && (
              <div className="card border-amber/30 bg-amber/5 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-brand-900">Quick Start: Use a Template?</h3>
                    <p className="text-xs text-brand-600 mt-0.5">
                      Templates pre-fill rooms, dimensions, and guest capacity. You can always edit later.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTemplateRec(false)}
                    className="text-brand-600 hover:text-brand-900 text-sm"
                  >
                    &times;
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {TEMPLATES.filter(t =>
                    !t.id.includes("remodel") && !t.id.includes("reno") && !t.id.includes("adu")
                  ).slice(0, 6).map(tpl => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyTemplate(tpl)}
                      className="text-left rounded-lg border border-brand-900/10 p-3 hover:border-amber/40 hover:bg-amber/5 transition"
                    >
                      <div className="text-xs font-semibold text-brand-900">{tpl.name}</div>
                      <div className="text-[10px] text-brand-600 mt-0.5">{tpl.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Project Info */}
            <section className="card">
              <h2 className="text-lg font-semibold mb-4">Project Info</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label">Project Name</label>
                  <input
                    className="input"
                    placeholder='e.g., "Lakehouse Retreat Design"'
                    value={project.name}
                    onChange={(e) => update("name", e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label">Design Style</label>
                  <select
                    className="select"
                    value={project.style}
                    onChange={(e) => update("style", e.target.value)}
                  >
                    {STYLES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Target Guests</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    value={project.targetGuests || ""}
                    onChange={(e) => update("targetGuests", parseInt(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="label">Furnishing Budget ($)</label>
                  <input
                    type="number"
                    className="input"
                    min={0}
                    placeholder="Optional"
                    value={project.budget || ""}
                    onChange={(e) => update("budget", parseInt(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="label">Project Type</label>
                  <div className="flex gap-2">
                    {V1_PROJECT_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => update("projectType", t.value)}
                        className={`flex-1 rounded-lg border-2 p-3 text-left transition text-xs ${
                          project.projectType === t.value
                            ? "border-amber bg-amber/5"
                            : "border-brand-900/10 hover:border-amber/40"
                        }`}
                      >
                        <div className="font-semibold text-brand-900">{t.label}</div>
                        <div className="text-[10px] text-brand-600 mt-0.5">{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Property Details */}
            <section className="card">
              <h2 className="text-lg font-semibold mb-4">Property Details</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label">Address</label>
                  <input
                    className="input"
                    placeholder="123 Mountain View Dr"
                    value={project.property.address}
                    onChange={(e) => update("property.address", e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">City</label>
                  <input
                    className="input"
                    placeholder="Gatlinburg"
                    value={project.property.city}
                    onChange={(e) => update("property.city", e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">State</label>
                  <input
                    className="input"
                    placeholder="TN"
                    value={project.property.state}
                    onChange={(e) => update("property.state", e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Square Footage</label>
                  <input
                    type="number"
                    className="input"
                    min={0}
                    value={project.property.squareFootage || ""}
                    onChange={(e) => update("property.squareFootage", parseInt(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="label">Bedrooms</label>
                  <input
                    type="number"
                    className="input"
                    min={0}
                    value={project.property.bedrooms || ""}
                    onChange={(e) => update("property.bedrooms", parseInt(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="label">Bathrooms</label>
                  <input
                    type="number"
                    className="input"
                    min={0}
                    step={0.5}
                    value={project.property.bathrooms || ""}
                    onChange={(e) => update("property.bathrooms", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="label">Floors</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    value={project.property.floors || ""}
                    onChange={(e) => update("property.floors", parseInt(e.target.value) || 1)}
                  />
                </div>
              </div>
            </section>

            {/* Client Info (collapsible — not required) */}
            <details className="card group">
              <summary className="cursor-pointer text-lg font-semibold flex items-center justify-between">
                Client Information
                <span className="text-xs font-normal text-brand-600 group-open:hidden">(optional — add later)</span>
              </summary>
              <div className="grid gap-4 sm:grid-cols-2 mt-4">
                <div>
                  <label className="label">Client Name</label>
                  <input
                    className="input"
                    placeholder="John Doe"
                    value={project.client.name}
                    onChange={(e) => update("client.name", e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="john@example.com"
                    value={project.client.email}
                    onChange={(e) => update("client.email", e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input
                    className="input"
                    placeholder="(555) 123-4567"
                    value={project.client.phone}
                    onChange={(e) => update("client.phone", e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Preferences / Notes</label>
                  <textarea
                    className="input min-h-[80px] resize-y"
                    placeholder="Style preferences, color likes/dislikes, special requests..."
                    value={project.client.preferences}
                    onChange={(e) => update("client.preferences", e.target.value)}
                  />
                </div>
              </div>
            </details>

            {/* 3D Scan Links (collapsible) */}
            <details className="card group">
              <summary className="cursor-pointer text-lg font-semibold flex items-center justify-between">
                3D Scan Links
                <span className="text-xs font-normal text-brand-600 group-open:hidden">(optional)</span>
              </summary>
              <div className="grid gap-4 mt-4">
                <div>
                  <label className="label">Matterport Link</label>
                  <input
                    className="input"
                    placeholder="https://my.matterport.com/show/?m=..."
                    value={project.property.matterportLink}
                    onChange={(e) => update("property.matterportLink", e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Polycam Link</label>
                  <input
                    className="input"
                    placeholder="https://poly.cam/capture/..."
                    value={project.property.polycamLink}
                    onChange={(e) => update("property.polycamLink", e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Spoak Link</label>
                  <input
                    className="input"
                    placeholder="https://spoak.com/project/..."
                    value={project.property.spoakLink}
                    onChange={(e) => update("property.spoakLink", e.target.value)}
                  />
                </div>
              </div>
            </details>

            {/* Submit */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (entryMode === "link") setStep("link-input");
                  else if (entryMode === "upload") setStep("upload-input");
                  else setStep("choose");
                }}
                className="btn-secondary"
              >
                &larr; Back
              </button>
              <button type="submit" className="btn-primary">
                Create Project
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
