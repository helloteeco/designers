"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { createEmptyProject, saveProject, logActivity, generateId } from "@/lib/store";
import { TEMPLATES } from "@/lib/project-templates";
import type { DesignStyle, Room, ProjectType, FloorPlan } from "@/lib/types";

const PROJECT_TYPES: { value: ProjectType; label: string; desc: string; icon: string }[] = [
  { value: "furnish-only", label: "Furnish Only", desc: "Property is move-in ready. Just need furniture and decor.", icon: "🛋️" },
  { value: "renovation", label: "Renovation", desc: "Updating kitchens, bathrooms, flooring, paint, or finishes.", icon: "🏗️" },
  { value: "full-redesign", label: "Full Redesign", desc: "Gut + furnish. Contractor work plus design package.", icon: "🔨" },
  { value: "new-construction", label: "New Construction", desc: "Building from scratch — full spec from the ground up.", icon: "🏡" },
];

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

export default function NewProjectPage() {
  const router = useRouter();
  const [project, setProject] = useState(() => createEmptyProject());
  const [error, setError] = useState("");

  // Upload-first flow state
  const [floorPlanFiles, setFloorPlanFiles] = useState<{ file: File; preview: string }[]>([]);
  const [roomPhotoFiles, setRoomPhotoFiles] = useState<{ file: File; preview: string }[]>([]);
  const [listingUrl, setListingUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<{ ok: boolean; reason?: string; title?: string; address?: string; galleryImages?: string[]; floorPlanImages?: string[]; matterportModelId?: string } | null>(null);
  const floorPlanInputRef = useRef<HTMLInputElement>(null);
  const roomPhotoInputRef = useRef<HTMLInputElement>(null);

  const MAX_UPLOAD_MB = 3;
  const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

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
      if (data.title && !project.name) {
        update("name", data.title);
      }
      if (data.address) {
        update("property.address", data.address);
      }
      if (data.matterportModelId) {
        update("property.matterportModelId", data.matterportModelId);
      }
    } catch {
      setScrapeResult({ ok: false, reason: "Network error. Try uploading files directly." });
    } finally {
      setScraping(false);
    }
  }

  function update(path: string, value: string | number) {
    setProject((prev) => {
      // Use JSON parse/stringify for safe deep clone (broader browser support)
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

  function applyTemplate(tpl: typeof TEMPLATES[0], projectType: ProjectType) {
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
      projectType,
      style: tpl.style,
      targetGuests: tpl.targetGuests,
      rooms,
      property: {
        ...prev.property,
        bedrooms: tpl.rooms.filter((r) =>
          ["primary-bedroom", "bedroom", "loft", "bonus-room"].includes(r.type)
        ).length,
        bathrooms: tpl.rooms.filter((r) => r.type === "bathroom").length,
        floors: Math.max(...tpl.rooms.map((r) => r.floor), 1),
      },
    }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!project.name.trim()) {
      setError("Please enter a project name.");
      return;
    }

    // Attach uploaded floor plans to the project before saving
    const finalProject = { ...project };
    if (!finalProject.property.floorPlans) finalProject.property.floorPlans = [];

    for (const { file } of floorPlanFiles) {
      const dataUrl = await fileToDataUrl(file);
      const isSvg = file.type === "image/svg+xml";
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

    // Attach room photos as reference images on rooms (or store for later assignment)
    // For now, store them as additional floor plans tagged as room photos
    // The designer can assign them to specific rooms in the project workspace
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

  return (
    <div className="min-h-screen bg-cream">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 py-8 animate-in">
        <button
          onClick={() => router.back()}
          className="mb-6 text-sm text-brand-600 hover:text-brand-900 transition"
        >
          &larr; Back to Projects
        </button>

        <h1 className="text-2xl font-bold text-brand-900 mb-4">
          New Design Project
        </h1>

        {/* Templates */}
        <div className="mb-8">
          <p className="text-sm text-brand-600 mb-3">
            Start from a template or create from scratch:
          </p>

          {/* Furnish-Only Templates */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
                Furnish-Only (STR / Vacation Rental)
              </span>
              <div className="flex-1 h-px bg-brand-900/10" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TEMPLATES.filter(t => !t.id.includes("remodel") && !t.id.includes("reno") && !t.id.includes("adu") && !t.id.includes("refresh")).map(tpl => (
                <TemplateCard
                  key={tpl.id}
                  tpl={tpl}
                  projectType="furnish-only"
                  onSelect={() => applyTemplate(tpl, "furnish-only")}
                />
              ))}
            </div>
          </div>

          {/* Renovation Templates */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
                Renovation &amp; Remodel
              </span>
              <div className="flex-1 h-px bg-brand-900/10" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TEMPLATES.filter(t => t.id.includes("remodel") || t.id.includes("reno") || t.id.includes("adu") || t.id.includes("refresh")).map(tpl => (
                <TemplateCard
                  key={tpl.id}
                  tpl={tpl}
                  projectType="renovation"
                  onSelect={() => applyTemplate(tpl, "renovation")}
                />
              ))}
            </div>
          </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-8">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Project Type */}
          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Project Type</h2>
            <p className="text-sm text-brand-600 mb-4">
              This determines which tabs and tools show up in your project workspace.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PROJECT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => update("projectType", t.value)}
                  className={`rounded-xl border-2 p-4 text-left transition ${
                    project.projectType === t.value
                      ? "border-amber bg-amber/5"
                      : "border-brand-900/10 hover:border-amber/40"
                  }`}
                >
                  <div className="text-2xl mb-2">{t.icon}</div>
                  <div className="font-semibold text-brand-900 text-sm">{t.label}</div>
                  <div className="text-[11px] text-brand-600 mt-1">{t.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Project Info */}
          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Project Details</h2>
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
                  onChange={(e) =>
                    update("targetGuests", parseInt(e.target.value) || 0)
                  }
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
                  onChange={(e) =>
                    update("budget", parseInt(e.target.value) || 0)
                  }
                />
              </div>
              {(project.projectType === "renovation" || project.projectType === "full-redesign" || project.projectType === "new-construction") && (
                <div>
                  <label className="label">Renovation Budget ($)</label>
                  <input
                    type="number"
                    className="input"
                    min={0}
                    placeholder="Labor + materials"
                    value={project.renovationBudget || ""}
                    onChange={(e) =>
                      update("renovationBudget", parseInt(e.target.value) || 0)
                    }
                  />
                </div>
              )}
            </div>
          </section>

          {/* Client Info */}
          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Client Information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
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
                <label className="label">Client Preferences / Notes</label>
                <textarea
                  className="input min-h-[80px] resize-y"
                  placeholder="Style preferences, color likes/dislikes, special requests..."
                  value={project.client.preferences}
                  onChange={(e) =>
                    update("client.preferences", e.target.value)
                  }
                />
              </div>
            </div>
          </section>

          {/* Property Info */}
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
                  onChange={(e) =>
                    update(
                      "property.squareFootage",
                      parseInt(e.target.value) || 0
                    )
                  }
                />
              </div>
              <div>
                <label className="label">Bedrooms</label>
                <input
                  type="number"
                  className="input"
                  min={0}
                  value={project.property.bedrooms || ""}
                  onChange={(e) =>
                    update(
                      "property.bedrooms",
                      parseInt(e.target.value) || 0
                    )
                  }
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
                  onChange={(e) =>
                    update(
                      "property.bathrooms",
                      parseFloat(e.target.value) || 0
                    )
                  }
                />
              </div>
              <div>
                <label className="label">Floors</label>
                <input
                  type="number"
                  className="input"
                  min={1}
                  value={project.property.floors || ""}
                  onChange={(e) =>
                    update("property.floors", parseInt(e.target.value) || 1)
                  }
                />
              </div>
            </div>
          </section>

          {/* Upload Floor Plans & Room Photos */}
          <section className="card">
            <h2 className="text-lg font-semibold mb-2">Floor Plans &amp; Room Photos</h2>
            <p className="text-sm text-brand-600 mb-4">
              Upload your floor plan (SVG, PNG, PDF) and room photos. These power the auto-room detection and composite board generation.
            </p>

            {/* Floor Plan Upload */}
            <div className="mb-6">
              <label className="label mb-2">Floor Plan</label>
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
                        <img src={f.preview} alt={f.file.name} className="w-24 h-24 object-cover rounded-lg border border-brand-900/10" />
                      ) : (
                        <div className="w-24 h-24 rounded-lg border border-brand-900/10 flex items-center justify-center bg-brand-900/5 text-xs text-brand-600">PDF</div>
                      )}
                      <button
                        type="button"
                        onClick={() => setFloorPlanFiles((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      >
                        &times;
                      </button>
                      <p className="text-[10px] text-brand-600 mt-1 truncate w-24">{f.file.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Room Photos Upload */}
            <div>
              <label className="label mb-2">Room Photos</label>
              <div
                onClick={() => roomPhotoInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleRoomPhotoFiles(e.dataTransfer.files); }}
                className="border-2 border-dashed border-brand-900/20 rounded-xl p-6 text-center cursor-pointer hover:border-amber/40 transition"
              >
                <div className="text-2xl mb-2">📷</div>
                <p className="text-sm text-brand-600">Drag &amp; drop room photos here, or click to browse</p>
                <p className="text-xs text-brand-600/60 mt-1">Photos from the photographer, Matterport screenshots, etc.</p>
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
                      <img src={f.preview} alt={f.file.name} className="w-24 h-24 object-cover rounded-lg border border-brand-900/10" />
                      <button
                        type="button"
                        onClick={() => setRoomPhotoFiles((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      >
                        &times;
                      </button>
                      <p className="text-[10px] text-brand-600 mt-1 truncate w-24">{f.file.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Listing URL Shortcut */}
          <section className="card">
            <h2 className="text-lg font-semibold mb-2">Listing URL <span className="text-xs font-normal text-brand-600">(optional shortcut)</span></h2>
            <p className="text-sm text-brand-600 mb-4">
              Paste a real estate listing or Matterport link. We&apos;ll try to auto-extract photos and property info.
            </p>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="https://listings.bluegrassrealestatemedia.com/..."
                value={listingUrl}
                onChange={(e) => setListingUrl(e.target.value)}
              />
              <button
                type="button"
                onClick={handleScrapeListing}
                disabled={scraping || !listingUrl.trim()}
                className="btn-secondary whitespace-nowrap"
              >
                {scraping ? "Extracting..." : "Extract"}
              </button>
            </div>
            {scrapeResult && (
              <div className={`mt-3 rounded-lg px-4 py-3 text-sm ${
                scrapeResult.ok
                  ? "bg-green-50 border border-green-200 text-green-700"
                  : "bg-amber-50 border border-amber-200 text-amber-700"
              }`}>
                {scrapeResult.ok ? (
                  <>
                    Found {scrapeResult.galleryImages?.length || 0} photos
                    {scrapeResult.floorPlanImages && scrapeResult.floorPlanImages.length > 0 && (
                      <>, {scrapeResult.floorPlanImages.length} floor plan(s)</>)}
                    {scrapeResult.matterportModelId && <>, Matterport ID: {scrapeResult.matterportModelId}</>}
                    {scrapeResult.title && <> — &ldquo;{scrapeResult.title}&rdquo;</>}
                  </>
                ) : (
                  <>{scrapeResult.reason || "Could not extract data."} Upload your files directly above.</>)}
              </div>
            )}
          </section>

          {/* Scan Links */}
          <section className="card">
            <h2 className="text-lg font-semibold mb-2">3D Scan Links</h2>
            <p className="text-sm text-brand-600 mb-4">
              Link your Matterport, Polycam, or Spoak project.
            </p>
            <div className="grid gap-4">
              <div>
                <label className="label">Matterport Link</label>
                <input
                  className="input"
                  placeholder="https://my.matterport.com/show/?m=..."
                  value={project.property.matterportLink}
                  onChange={(e) =>
                    update("property.matterportLink", e.target.value)
                  }
                />
              </div>
              <div>
                <label className="label">Polycam Link</label>
                <input
                  className="input"
                  placeholder="https://poly.cam/capture/..."
                  value={project.property.polycamLink}
                  onChange={(e) =>
                    update("property.polycamLink", e.target.value)
                  }
                />
              </div>
              <div>
                <label className="label">Spoak Link</label>
                <input
                  className="input"
                  placeholder="https://spoak.com/project/..."
                  value={project.property.spoakLink}
                  onChange={(e) =>
                    update("property.spoakLink", e.target.value)
                  }
                />
              </div>
            </div>
          </section>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Create Project
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function TemplateCard({
  tpl,
  projectType,
  onSelect,
}: {
  tpl: typeof import("@/lib/project-templates").TEMPLATES[0];
  projectType: ProjectType;
  onSelect: () => void;
}) {
  const isReno = projectType === "renovation";

  // Real-estate style counts — bedrooms + bathrooms, not raw "rooms"
  const bedroomTypes = ["primary-bedroom", "bedroom", "loft", "bonus-room"];
  const bedrooms = tpl.rooms.filter(r => bedroomTypes.includes(r.type)).length;
  const bathrooms = tpl.rooms.filter(r => r.type === "bathroom").length;
  const totalSqft = tpl.rooms.reduce((s, r) => s + r.widthFt * r.lengthFt, 0);

  // For reno templates, describe what's included instead
  const renoScopes = tpl.rooms.map(r => r.type);
  const hasKitchen = renoScopes.includes("kitchen");
  const renoSummary = (() => {
    if (!isReno) return null;
    if (bathrooms > 0 && !hasKitchen && bedrooms === 0) {
      return `${bathrooms} bath${bathrooms === 1 ? "" : "s"}`;
    }
    if (hasKitchen && bathrooms === 0) {
      return "Kitchen";
    }
    if (bedrooms > 0 && bathrooms > 0) {
      return `${bedrooms}BR / ${bathrooms}BA`;
    }
    return `${tpl.rooms.length} space${tpl.rooms.length === 1 ? "" : "s"}`;
  })();

  return (
    <button
      type="button"
      onClick={onSelect}
      className="card text-left hover:border-amber/40 transition group"
    >
      <div className="flex items-start justify-between mb-1">
        <h3 className="font-semibold text-brand-900 group-hover:text-amber-dark text-sm">
          {tpl.name}
        </h3>
        {isReno && (
          <span className="text-[9px] bg-amber/20 text-amber-dark rounded px-1.5 py-0.5 font-semibold uppercase tracking-wider shrink-0 ml-2">
            Reno
          </span>
        )}
      </div>
      <p className="text-xs text-brand-600 mt-1">{tpl.description}</p>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
        {isReno ? (
          <>
            {renoSummary && <span className="badge-neutral">{renoSummary}</span>}
            <span className="badge-neutral capitalize">{tpl.style.replace(/-/g, " ")}</span>
            {totalSqft > 0 && <span className="badge-neutral">~{totalSqft} sqft</span>}
          </>
        ) : (
          <>
            {tpl.targetGuests > 0 && (
              <span className="badge-neutral">Sleeps {tpl.targetGuests}</span>
            )}
            {bedrooms > 0 && bathrooms > 0 && (
              <span className="badge-neutral">{bedrooms}BR / {bathrooms}BA</span>
            )}
            <span className="badge-neutral capitalize">{tpl.style.replace(/-/g, " ")}</span>
          </>
        )}
      </div>
    </button>
  );
}
