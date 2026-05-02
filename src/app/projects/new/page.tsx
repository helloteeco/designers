"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { createEmptyProject, saveProject, logActivity, generateId } from "@/lib/store";
import { TEMPLATES } from "@/lib/project-templates";
import { detectRoomsFromImage, type DetectedRoom } from "@/lib/floor-plan-ocr";
import { detectRoomsFromSvg, detectRoomsFromSvgDetailed, isSvgSource, readSvgText } from "@/lib/floor-plan-svg";
import type { DesignStyle, Room, ProjectType, FloorPlan } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────
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

const V1_PROJECT_TYPES: { value: ProjectType; label: string; desc: string }[] = [
  { value: "furnish-only", label: "Furnish Only", desc: "Move-in ready. Just furniture + decor." },
  { value: "full-redesign", label: "Airbnb-Ready Refresh", desc: "Light updates + full furnishing." },
];

const M_TO_FT = 3.28084;
const FT_TO_M = 1 / M_TO_FT;

type FlowStep = "import" | "confirm";
type DimUnit = "ft" | "m";

export default function NewProjectPage() {
  const router = useRouter();
  const [project, setProject] = useState(() => createEmptyProject());
  const [error, setError] = useState("");
  const [step, setStep] = useState<FlowStep>("import");

  // Import fields
  const [listingUrl, setListingUrl] = useState("");
  const [matterportUrl, setMatterportUrl] = useState("");
  const [floorPlanFiles, setFloorPlanFiles] = useState<{ file: File; preview: string }[]>([]);
  const floorPlanInputRef = useRef<HTMLInputElement>(null);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generatedRooms, setGeneratedRooms] = useState<Room[]>([]);
  const [extractionNote, setExtractionNote] = useState("");

  // Unit toggle for room dimensions display/input
  const [dimUnit, setDimUnit] = useState<DimUnit>("ft");

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

  /** Convert feet to display unit */
  function ftToDisplay(ft: number): number {
    if (dimUnit === "m") return Math.round(ft * FT_TO_M * 100) / 100;
    return ft;
  }

  /** Convert display unit input back to feet for storage */
  function displayToFt(val: number): number {
    if (dimUnit === "m") return Math.round(val * M_TO_FT * 10) / 10;
    return val;
  }

  /** Unit label */
  function unitLabel(): string {
    return dimUnit === "m" ? "m" : "ft";
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

  // ── Floor Plan Extraction ──────────────────────────────────────────────

  async function extractRoomsFromFloorPlans(): Promise<Room[]> {
    if (floorPlanFiles.length === 0) return [];

    const rooms: Room[] = [];
    let note = "";

    for (const { file, preview } of floorPlanFiles) {
      const dataUrl = preview || await fileToDataUrl(file);
      const isSvg = file.type === "image/svg+xml" || isSvgSource(dataUrl);

      if (isSvg) {
        // SVG path — exact, no OCR needed
        try {
          const result = await detectRoomsFromSvgDetailed(dataUrl);
          for (const r of result.rooms) {
            rooms.push({
              id: generateId(),
              name: r.label,
              type: r.guessedType,
              widthFt: r.widthFt,
              lengthFt: r.lengthFt,
              ceilingHeightFt: 9,
              floor: r.floor ?? 1,
              features: [],
              selectedBedConfig: null,
              furniture: [],
              accentWall: null,
              notes: "",
            });
          }
          if (result.rooms.length > 0) {
            note = `Extracted ${result.rooms.length} rooms from SVG floor plan (exact).`;
          }
        } catch {
          // Fall through to OCR
        }
      }

      if (rooms.length === 0 && file.type.startsWith("image/") && !isSvg) {
        // OCR path — approximate
        try {
          const detected: DetectedRoom[] = await detectRoomsFromImage(dataUrl, () => {});
          for (const r of detected) {
            rooms.push({
              id: generateId(),
              name: r.label,
              type: r.guessedType,
              widthFt: r.widthFt,
              lengthFt: r.lengthFt,
              ceilingHeightFt: 9,
              floor: 1,
              features: [],
              selectedBedConfig: null,
              furniture: [],
              accentWall: null,
              notes: "",
            });
          }
          if (detected.length > 0) {
            note = `Extracted ${detected.length} rooms via OCR — please verify dimensions.`;
          }
        } catch {
          // Extraction failed, will fall back to heuristic
        }
      }
    }

    setExtractionNote(note);
    return rooms;
  }

  // ── Generate Project Draft ──────────────────────────────────────────────

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Allow manual creation even without any import asset
    if (!listingUrl.trim() && !matterportUrl.trim() && floorPlanFiles.length === 0) {
      setStep("confirm");
      return;
    }

    setGenerating(true);

    try {
      // Try to scrape listing if URL provided
      const urlToScrape = listingUrl.trim() || matterportUrl.trim();
      if (urlToScrape) {
        const res = await fetch("/api/scrape-listing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urlToScrape }),
        });
        const data = await res.json();

        if (data.ok) {
          if (data.title && !project.name) {
            setProject(prev => ({ ...prev, name: data.title }));
          }
          if (data.address) {
            setProject(prev => ({
              ...prev,
              property: { ...prev.property, address: data.address },
            }));
          }
          if (data.bedrooms) {
            setProject(prev => ({
              ...prev,
              property: { ...prev.property, bedrooms: data.bedrooms },
            }));
          }
          if (data.bathrooms) {
            setProject(prev => ({
              ...prev,
              property: { ...prev.property, bathrooms: data.bathrooms },
            }));
          }
          if (data.sqft) {
            setProject(prev => ({
              ...prev,
              property: { ...prev.property, squareFootage: data.sqft },
            }));
          }
          if (data.matterportModelId) {
            setProject(prev => ({
              ...prev,
              property: { ...prev.property, matterportModelId: data.matterportModelId },
            }));
          }

          // Generate room list from scraped data (fallback if floor plan extraction doesn't work)
          const heuristicRooms = generateRoomList(data.bedrooms || project.property.bedrooms, data.bathrooms || project.property.bathrooms);
          setGeneratedRooms(heuristicRooms);
        }
      }

      // Try floor plan extraction — overrides heuristic rooms if successful
      if (floorPlanFiles.length > 0) {
        const extractedRooms = await extractRoomsFromFloorPlans();
        if (extractedRooms.length > 0) {
          setGeneratedRooms(extractedRooms);
          // Update bed/bath/floor counts from extracted rooms
          const bedCount = extractedRooms.filter(r =>
            ["primary-bedroom", "bedroom", "loft", "bonus-room"].includes(r.type)
          ).length;
          const bathCount = extractedRooms.filter(r => r.type === "bathroom").length;
          const floorCount = Math.max(...extractedRooms.map(r => r.floor), 1);
          setProject(prev => ({
            ...prev,
            property: {
              ...prev.property,
              bedrooms: bedCount || prev.property.bedrooms,
              bathrooms: bathCount || prev.property.bathrooms,
              floors: floorCount,
            },
          }));
        }
      }

      // If nothing produced rooms, generate from form values
      if (generatedRooms.length === 0) {
        const rooms = generateRoomList(project.property.bedrooms, project.property.bathrooms);
        setGeneratedRooms(rooms);
      }

      // Store matterport link
      if (matterportUrl.trim()) {
        setProject(prev => ({
          ...prev,
          property: { ...prev.property, matterportLink: matterportUrl.trim() },
        }));
      }

      setStep("confirm");
    } catch {
      setError("Something went wrong extracting property data. You can still fill in details manually.");
      setStep("confirm");
    } finally {
      setGenerating(false);
    }
  }

  /** Generate a reasonable room list from bed/bath counts */
  function generateRoomList(bedrooms: number, bathrooms: number): Room[] {
    const rooms: Room[] = [];

    rooms.push({
      id: generateId(),
      name: "Living Room",
      type: "living-room",
      widthFt: 18,
      lengthFt: 16,
      ceilingHeightFt: 9,
      floor: 1,
      features: ["Window"],
      selectedBedConfig: null,
      furniture: [],
      accentWall: null,
      notes: "",
    });
    rooms.push({
      id: generateId(),
      name: "Kitchen",
      type: "kitchen",
      widthFt: 14,
      lengthFt: 12,
      ceilingHeightFt: 9,
      floor: 1,
      features: [],
      selectedBedConfig: null,
      furniture: [],
      accentWall: null,
      notes: "",
    });
    rooms.push({
      id: generateId(),
      name: "Dining Area",
      type: "dining-room",
      widthFt: 12,
      lengthFt: 10,
      ceilingHeightFt: 9,
      floor: 1,
      features: [],
      selectedBedConfig: null,
      furniture: [],
      accentWall: null,
      notes: "",
    });

    const bedroomCount = Math.max(bedrooms || 2, 1);
    for (let i = 0; i < bedroomCount; i++) {
      const isPrimary = i === 0;
      rooms.push({
        id: generateId(),
        name: isPrimary ? "Primary Suite" : `Bedroom ${i + 1}`,
        type: isPrimary ? "primary-bedroom" : "bedroom",
        widthFt: isPrimary ? 14 : 12,
        lengthFt: isPrimary ? 14 : 12,
        ceilingHeightFt: 9,
        floor: bedroomCount > 3 && i >= 2 ? 2 : 1,
        features: isPrimary ? ["En-suite", "Closet", "Window"] : ["Closet", "Window"],
        selectedBedConfig: null,
        furniture: [],
        accentWall: null,
        notes: "",
      });
    }

    const bathroomCount = Math.max(bathrooms || 1, 1);
    for (let i = 0; i < bathroomCount; i++) {
      rooms.push({
        id: generateId(),
        name: i === 0 ? "Primary Bathroom" : `Bathroom ${i + 1}`,
        type: "bathroom",
        widthFt: i === 0 ? 10 : 8,
        lengthFt: i === 0 ? 8 : 6,
        ceilingHeightFt: 9,
        floor: 1,
        features: [],
        selectedBedConfig: null,
        furniture: [],
        accentWall: null,
        notes: "",
      });
    }

    if (bedroomCount >= 3) {
      rooms.push({
        id: generateId(),
        name: "Outdoor Deck",
        type: "outdoor",
        widthFt: 16,
        lengthFt: 12,
        ceilingHeightFt: 10,
        floor: 1,
        features: [],
        selectedBedConfig: null,
        furniture: [],
        accentWall: null,
        notes: "",
      });
    }

    return rooms;
  }

  // ── Room editing helpers ────────────────────────────────────────────────

  function removeRoom(id: string) {
    setGeneratedRooms(prev => prev.filter(r => r.id !== id));
  }

  function addRoom() {
    setGeneratedRooms(prev => [...prev, {
      id: generateId(),
      name: "New Room",
      type: "bedroom" as const,
      widthFt: 12,
      lengthFt: 12,
      ceilingHeightFt: 9,
      floor: 1,
      features: [],
      selectedBedConfig: null,
      furniture: [],
      accentWall: null,
      notes: "",
    }]);
  }

  function updateRoomName(id: string, name: string) {
    setGeneratedRooms(prev => prev.map(r => r.id === id ? { ...r, name } : r));
  }

  function updateRoomDimension(id: string, field: "widthFt" | "lengthFt", displayValue: number) {
    const ftValue = displayToFt(displayValue);
    setGeneratedRooms(prev => prev.map(r => r.id === id ? { ...r, [field]: ftValue } : r));
  }

  // ── Template shortcut ───────────────────────────────────────────────────

  function applyTemplate(tpl: typeof TEMPLATES[0]) {
    const rooms: Room[] = tpl.rooms.map((r) => ({
      id: generateId(),
      ...r,
      selectedBedConfig: null,
      furniture: [],
      accentWall: null,
      notes: "",
    }));
    setGeneratedRooms(rooms);
    setProject((prev) => ({
      ...prev,
      name: prev.name || tpl.name,
      style: tpl.style,
      targetGuests: tpl.targetGuests,
      property: {
        ...prev.property,
        bedrooms: tpl.rooms.filter((r) =>
          ["primary-bedroom", "bedroom", "loft", "bonus-room"].includes(r.type)
        ).length || prev.property.bedrooms,
        bathrooms: tpl.rooms.filter((r) => r.type === "bathroom").length || prev.property.bathrooms,
        floors: Math.max(...tpl.rooms.map((r) => r.floor), 1),
      },
    }));
  }

  // ── Final create ────────────────────────────────────────────────────────

  async function handleCreate() {
    setError("");
    if (!project.name.trim()) {
      setError("Please enter a project name.");
      return;
    }

    const finalProject = { ...project, rooms: generatedRooms };
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

    saveProject(finalProject);
    logActivity(finalProject.id, "created", `Created project: ${finalProject.name}`);
    if (floorPlanFiles.length > 0) {
      logActivity(finalProject.id, "floor_plans_added", `Added ${floorPlanFiles.length} floor plan(s) at creation`);
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

        {/* ═══════════════════════════════════════════════════════════════════
            SCREEN 1: Import Property
        ═══════════════════════════════════════════════════════════════════ */}
        {step === "import" && (
          <form onSubmit={handleGenerate} className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-brand-900 mb-1">
                New Design Project
              </h1>
              <p className="text-sm text-brand-600">
                Paste a listing or Matterport link and we&apos;ll auto-generate your project. Or fill in what you know.
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Import Section */}
            <section className="card">
              <h2 className="text-sm font-semibold text-brand-900 uppercase tracking-wider mb-4">
                Import Property
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="label">Listing URL</label>
                  <input
                    className="input"
                    placeholder="https://www.airbnb.com/rooms/... or any listing page"
                    value={listingUrl}
                    onChange={(e) => setListingUrl(e.target.value)}
                  />
                  <p className="text-[10px] text-brand-600/60 mt-1">Airbnb, VRBO, Zillow, Realtor, Bluegrass, etc.</p>
                </div>
                <div>
                  <label className="label">Matterport / 3D Scan Link</label>
                  <input
                    className="input"
                    placeholder="https://my.matterport.com/show/?m=..."
                    value={matterportUrl}
                    onChange={(e) => setMatterportUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Floor Plan <span className="text-brand-600/60 font-normal">(optional)</span></label>
                  <div
                    onClick={() => floorPlanInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFloorPlanFiles(e.dataTransfer.files); }}
                    className="border-2 border-dashed border-brand-900/15 rounded-xl p-4 text-center cursor-pointer hover:border-amber/40 transition"
                  >
                    {floorPlanFiles.length === 0 ? (
                      <>
                        <p className="text-sm text-brand-600">Drop floor plan here or click to upload</p>
                        <p className="text-[10px] text-brand-600/60 mt-1">SVG, PNG, JPG, or PDF — max {MAX_UPLOAD_MB}MB</p>
                      </>
                    ) : (
                      <div className="flex items-center justify-center gap-3">
                        {floorPlanFiles.map((f, i) => (
                          <div key={i} className="relative group">
                            {f.preview ? (
                              <img src={f.preview} alt="" className="w-16 h-16 object-cover rounded-lg border border-brand-900/10" />
                            ) : (
                              <div className="w-16 h-16 rounded-lg border border-brand-900/10 flex items-center justify-center bg-brand-900/5 text-[10px] text-brand-600">PDF</div>
                            )}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setFloorPlanFiles(prev => prev.filter((_, j) => j !== i)); }}
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                        <span className="text-xs text-brand-600">+ Add more</span>
                      </div>
                    )}
                    <input
                      ref={floorPlanInputRef}
                      type="file"
                      accept="image/*,.pdf,.svg"
                      multiple
                      className="hidden"
                      onChange={(e) => { if (e.target.files) handleFloorPlanFiles(e.target.files); e.target.value = ""; }}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Project Basics */}
            <section className="card">
              <h2 className="text-sm font-semibold text-brand-900 uppercase tracking-wider mb-4">
                Project Basics
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label">Project Type</label>
                  <div className="flex gap-3">
                    {V1_PROJECT_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => update("projectType", t.value)}
                        className={`flex-1 rounded-xl border-2 p-3 text-left transition ${
                          project.projectType === t.value
                            ? "border-amber bg-amber/5"
                            : "border-brand-900/10 hover:border-amber/40"
                        }`}
                      >
                        <div className="text-sm font-semibold text-brand-900">{t.label}</div>
                        <div className="text-[10px] text-brand-600 mt-0.5">{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Target Guest Count</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    placeholder="12"
                    value={project.targetGuests || ""}
                    onChange={(e) => update("targetGuests", parseInt(e.target.value) || 0)}
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
                  <label className="label">Furnishing Budget <span className="text-brand-600/60 font-normal">($, optional)</span></label>
                  <input
                    type="number"
                    className="input"
                    min={0}
                    placeholder="e.g. 25000"
                    value={project.budget || ""}
                    onChange={(e) => update("budget", parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            </section>

            {/* Generate Button */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={generating}
                className="btn-primary text-base px-8 py-3 disabled:opacity-60"
              >
                {generating ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Generating...
                  </span>
                ) : (
                  "Generate Project Draft"
                )}
              </button>
            </div>
          </form>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            SCREEN 2: Confirm Property Basics + Rooms
        ═══════════════════════════════════════════════════════════════════ */}
        {step === "confirm" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-brand-900 mb-1">
                Confirm Project Details
              </h1>
              <p className="text-sm text-brand-600">
                We generated a project draft. Review, edit, and confirm below.
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {extractionNote && (
              <div className="rounded-lg bg-sky-50 border border-sky-200 px-4 py-3 text-sm text-sky-700">
                {extractionNote}
              </div>
            )}

            {/* Property Basics */}
            <section className="card">
              <h2 className="text-sm font-semibold text-brand-900 uppercase tracking-wider mb-4">
                Property Basics
              </h2>
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
                <div className="sm:col-span-2">
                  <label className="label">Address</label>
                  <input
                    className="input"
                    placeholder="123 Mountain View Dr, Gatlinburg, TN"
                    value={project.property.address}
                    onChange={(e) => update("property.address", e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Square Footage</label>
                  <input
                    type="number"
                    className="input"
                    min={0}
                    placeholder="2400"
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

            {/* Design Settings (carried from Screen 1, editable) */}
            <section className="card">
              <h2 className="text-sm font-semibold text-brand-900 uppercase tracking-wider mb-4">
                Design Settings
              </h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="label">Style</label>
                  <select
                    className="select"
                    value={project.style}
                    onChange={(e) => update("style", e.target.value)}
                  >
                    {STYLES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
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
                  <label className="label">Budget ($)</label>
                  <input
                    type="number"
                    className="input"
                    min={0}
                    value={project.budget || ""}
                    onChange={(e) => update("budget", parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>

              {/* Template shortcut */}
              <details className="mt-4 group">
                <summary className="cursor-pointer text-xs text-brand-600 hover:text-brand-900 transition">
                  Or apply a template to pre-fill rooms...
                </summary>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {TEMPLATES.filter(t =>
                    !t.id.includes("remodel") && !t.id.includes("reno") && !t.id.includes("adu")
                  ).slice(0, 6).map(tpl => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyTemplate(tpl)}
                      className="text-left rounded-lg border border-brand-900/10 p-2.5 hover:border-amber/40 hover:bg-amber/5 transition"
                    >
                      <div className="text-xs font-semibold text-brand-900">{tpl.name}</div>
                      <div className="text-[10px] text-brand-600 mt-0.5">{tpl.description}</div>
                    </button>
                  ))}
                </div>
              </details>
            </section>

            {/* Room List */}
            <section className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-brand-900 uppercase tracking-wider">
                  Rooms ({generatedRooms.length})
                </h2>
                <div className="flex items-center gap-3">
                  {/* ft / m toggle */}
                  <div className="flex items-center rounded-lg border border-brand-900/10 overflow-hidden text-[10px]">
                    <button
                      type="button"
                      onClick={() => setDimUnit("ft")}
                      className={`px-2.5 py-1 transition font-medium ${
                        dimUnit === "ft"
                          ? "bg-brand-900 text-white"
                          : "text-brand-600 hover:bg-brand-900/5"
                      }`}
                    >
                      ft
                    </button>
                    <button
                      type="button"
                      onClick={() => setDimUnit("m")}
                      className={`px-2.5 py-1 transition font-medium ${
                        dimUnit === "m"
                          ? "bg-brand-900 text-white"
                          : "text-brand-600 hover:bg-brand-900/5"
                      }`}
                    >
                      m
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={addRoom}
                    className="text-xs text-amber-dark hover:text-brand-900 font-medium transition"
                  >
                    + Add Room
                  </button>
                </div>
              </div>

              {generatedRooms.length === 0 ? (
                <div className="text-center py-6 text-sm text-brand-600">
                  <p>No rooms generated yet.</p>
                  <p className="text-xs mt-1">Add bedrooms/bathrooms above, or click &ldquo;+ Add Room&rdquo; to build manually.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {generatedRooms.map((room) => (
                    <div
                      key={room.id}
                      className="flex items-center gap-3 rounded-lg border border-brand-900/10 px-4 py-2.5 group"
                    >
                      <span className="text-[9px] text-brand-600/60 uppercase tracking-wider w-20 shrink-0">
                        {room.type.replace(/-/g, " ")}
                      </span>
                      <input
                        className="flex-1 text-sm text-brand-900 bg-transparent border-none outline-none focus:ring-0 p-0"
                        value={room.name}
                        onChange={(e) => updateRoomName(room.id, e.target.value)}
                      />
                      {/* Editable dimensions */}
                      <div className="flex items-center gap-1 text-[11px] text-brand-600">
                        <input
                          type="number"
                          className="w-12 text-center bg-brand-900/5 rounded px-1 py-0.5 border-none outline-none focus:ring-1 focus:ring-amber/40"
                          value={ftToDisplay(room.widthFt)}
                          onChange={(e) => updateRoomDimension(room.id, "widthFt", parseFloat(e.target.value) || 0)}
                          step={dimUnit === "m" ? 0.1 : 1}
                          min={0}
                        />
                        <span>&times;</span>
                        <input
                          type="number"
                          className="w-12 text-center bg-brand-900/5 rounded px-1 py-0.5 border-none outline-none focus:ring-1 focus:ring-amber/40"
                          value={ftToDisplay(room.lengthFt)}
                          onChange={(e) => updateRoomDimension(room.id, "lengthFt", parseFloat(e.target.value) || 0)}
                          step={dimUnit === "m" ? 0.1 : 1}
                          min={0}
                        />
                        <span className="text-[9px] text-brand-600/50">{unitLabel()}</span>
                      </div>
                      {room.floor > 1 && (
                        <span className="text-[9px] text-brand-600/50 bg-brand-900/5 rounded px-1.5 py-0.5">
                          F{room.floor}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeRoom(room.id)}
                        className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition text-sm"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep("import")}
                className="btn-secondary"
              >
                &larr; Back
              </button>
              <button
                type="button"
                onClick={handleCreate}
                className="btn-primary text-base px-8 py-3"
              >
                Create Project
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
