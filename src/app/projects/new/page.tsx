"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { createEmptyProject, saveProject, logActivity, generateId } from "@/lib/store";
import { TEMPLATES } from "@/lib/project-templates";
import type { DesignStyle, Room } from "@/lib/types";

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

const TEMPLATE_ICONS: Record<string, string> = {
  "mountain-cabin-8": "🏔️",
  "large-cabin-16": "🛖",
  "beach-house-12": "🏖️",
  "lakehouse-12": "🛶",
  "urban-condo-6": "🏙️",
  "farmhouse-20": "🚜",
};

export default function NewProjectPage() {
  const router = useRouter();
  const [project, setProject] = useState(() => createEmptyProject());
  const [error, setError] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  function applyTemplate(templateId: string) {
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    const rooms: Room[] = tpl.rooms.map((r) => ({
      id: generateId(),
      ...r,
      selectedBedConfig: null,
      furniture: [],
      accentWall: null,
      notes: "",
    }));
    const floorNums = tpl.rooms.map((r) => r.floor);
    const floorCount =
      floorNums.length > 0
        ? Math.max(...floorNums) - Math.min(...floorNums) + 1
        : 1;
    setProject((prev) => ({
      ...prev,
      name: prev.name || tpl.name,
      style: tpl.style,
      targetGuests: tpl.targetGuests,
      rooms,
      property: {
        ...prev.property,
        bedrooms: tpl.rooms.filter((r) =>
          ["primary-bedroom", "bedroom", "loft", "bonus-room"].includes(r.type)
        ).length,
        bathrooms: tpl.rooms.filter((r) => r.type === "bathroom").length,
        floors: floorCount,
      },
    }));
    setSelectedTemplateId(templateId);
  }

  function clearTemplate() {
    const fresh = createEmptyProject();
    // Preserve anything the user already typed into the form
    setProject((prev) => ({
      ...fresh,
      id: prev.id,
      name: prev.name,
      budget: prev.budget,
      client: prev.client,
      property: {
        ...fresh.property,
        address: prev.property.address,
        city: prev.property.city,
        state: prev.property.state,
        squareFootage: prev.property.squareFootage,
        matterportLink: prev.property.matterportLink,
        polycamLink: prev.property.polycamLink,
        spoakLink: prev.property.spoakLink,
      },
    }));
    setSelectedTemplateId(null);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmedName = project.name.trim();
    if (!trimmedName) {
      setError("Please enter a project name.");
      return;
    }
    setSubmitting(true);
    try {
      const toSave = { ...project, name: trimmedName };
      saveProject(toSave);
      logActivity(toSave.id, "created", `Created project: ${toSave.name}`);
      router.push(`/projects/${toSave.id}`);
    } catch (err) {
      console.error(err);
      setError("Something went wrong saving the project. Please try again.");
      setSubmitting(false);
    }
  }

  const selectedTemplate = selectedTemplateId
    ? TEMPLATES.find((t) => t.id === selectedTemplateId) ?? null
    : null;

  return (
    <div className="min-h-screen bg-cream">
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-8 animate-in pb-24">
        {/* Back */}
        <button
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-1.5 rounded-lg border border-brand-900/10 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 shadow-sm transition hover:border-brand-900/20 hover:text-brand-900"
        >
          <span aria-hidden>&larr;</span> Back to Projects
        </button>

        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-brand-900">
            New Design Project
          </h1>
          <p className="mt-1 text-sm text-brand-600">
            Pick a starting point below, or skip straight to a blank project.
            You can change any detail later.
          </p>
        </div>

        {/* Template picker */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-600">
              Start from a template
            </h2>
            {selectedTemplate && (
              <button
                type="button"
                onClick={clearTemplate}
                className="text-xs font-medium text-amber-dark hover:underline"
              >
                Clear selection
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Blank Project tile */}
            <button
              type="button"
              onClick={clearTemplate}
              aria-pressed={selectedTemplateId === null}
              className={`group flex h-full flex-col rounded-xl border bg-white p-5 text-left shadow-sm transition ${
                selectedTemplateId === null
                  ? "border-amber ring-2 ring-amber/30"
                  : "border-dashed border-brand-900/20 hover:border-amber/50 hover:shadow"
              }`}
            >
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-brand-900/5 text-lg">
                +
              </div>
              <h3 className="text-sm font-semibold text-brand-900 group-hover:text-amber-dark">
                Blank project
              </h3>
              <p className="mt-1 flex-1 text-xs text-brand-600">
                Start from scratch and build the whole property room by room.
              </p>
              {selectedTemplateId === null && (
                <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber/20 px-2 py-0.5 text-[10px] font-semibold text-amber-dark">
                  <span aria-hidden>✓</span> Selected
                </span>
              )}
            </button>

            {TEMPLATES.map((tpl) => {
              const isSelected = selectedTemplateId === tpl.id;
              const bedroomCount = tpl.rooms.filter((r) =>
                ["primary-bedroom", "bedroom", "loft", "bonus-room"].includes(
                  r.type
                )
              ).length;
              const bathroomCount = tpl.rooms.filter(
                (r) => r.type === "bathroom"
              ).length;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl.id)}
                  aria-pressed={isSelected}
                  className={`group flex h-full flex-col rounded-xl border bg-white p-5 text-left shadow-sm transition ${
                    isSelected
                      ? "border-amber ring-2 ring-amber/30"
                      : "border-brand-900/10 hover:border-amber/40 hover:shadow"
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-parchment text-base">
                      {TEMPLATE_ICONS[tpl.id] ?? "🏠"}
                    </div>
                    {isSelected && (
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber text-[10px] font-bold text-brand-900"
                        aria-label="Selected"
                      >
                        ✓
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-semibold leading-snug text-brand-900 group-hover:text-amber-dark">
                    {tpl.name}
                  </h3>

                  <p className="mt-1 flex-1 text-xs leading-relaxed text-brand-600">
                    {tpl.description}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="badge-neutral whitespace-nowrap text-[10px]">
                      Sleeps {tpl.targetGuests}
                    </span>
                    <span className="badge-neutral whitespace-nowrap text-[10px]">
                      {bedroomCount} BR · {bathroomCount} BA
                    </span>
                    <span className="badge-neutral whitespace-nowrap text-[10px] capitalize">
                      {tpl.style.replace(/-/g, " ")}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[10px] text-brand-600/80">
                    {tpl.rooms.length} total spaces (incl. living, kitchen, outdoor)
                  </div>
                </button>
              );
            })}
          </div>

          {/* Applied-template banner */}
          {selectedTemplate && (() => {
            const brCount = selectedTemplate.rooms.filter((r) =>
              ["primary-bedroom", "bedroom", "loft", "bonus-room"].includes(r.type)
            ).length;
            const baCount = selectedTemplate.rooms.filter(
              (r) => r.type === "bathroom"
            ).length;
            return (
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-amber/30 bg-amber/5 px-4 py-3">
                <span className="text-xl" aria-hidden>
                  {TEMPLATE_ICONS[selectedTemplate.id] ?? "🏠"}
                </span>
                <div className="flex-1 text-xs text-brand-700">
                  <span className="font-semibold text-brand-900">
                    {selectedTemplate.name}
                  </span>{" "}
                  applied — {brCount} BR · {baCount} BA, sleeps{" "}
                  {selectedTemplate.targetGuests},{" "}
                  <span className="capitalize">
                    {selectedTemplate.style.replace(/-/g, " ")}
                  </span>{" "}
                  style. Edit any field below.
                </div>
              </div>
            );
          })()}
        </section>

        <form id="new-project-form" onSubmit={handleCreate} className="space-y-6">
          {error && (
            <div
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Project Info */}
          <section className="card">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-lg" aria-hidden>📝</span>
              <h2 className="text-lg font-semibold">Project Details</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="project-name">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="project-name"
                  className="input"
                  placeholder='e.g., "Lakehouse Retreat Design"'
                  value={project.name}
                  onChange={(e) => update("name", e.target.value)}
                  maxLength={120}
                  required
                  aria-required="true"
                />
              </div>
              <div>
                <label className="label" htmlFor="project-style">Design Style</label>
                <select
                  id="project-style"
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
                <label className="label" htmlFor="project-guests">Target Guests</label>
                <input
                  id="project-guests"
                  type="number"
                  className="input"
                  min={1}
                  max={99}
                  value={project.targetGuests || ""}
                  onChange={(e) =>
                    update("targetGuests", parseInt(e.target.value) || 0)
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="project-budget">
                  Budget <span className="font-normal normal-case text-brand-600">(optional)</span>
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-brand-600">
                    $
                  </span>
                  <input
                    id="project-budget"
                    type="number"
                    className="input pl-7"
                    min={0}
                    placeholder="e.g. 25000"
                    value={project.budget || ""}
                    onChange={(e) =>
                      update("budget", parseInt(e.target.value) || 0)
                    }
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Client Info */}
          <section className="card">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-lg" aria-hidden>👤</span>
              <h2 className="text-lg font-semibold">Client Information</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="client-name">Client Name</label>
                <input
                  id="client-name"
                  className="input"
                  placeholder="Jane Doe"
                  value={project.client.name}
                  onChange={(e) => update("client.name", e.target.value)}
                  maxLength={120}
                />
              </div>
              <div>
                <label className="label" htmlFor="client-email">Email</label>
                <input
                  id="client-email"
                  type="email"
                  className="input"
                  placeholder="jane@example.com"
                  value={project.client.email}
                  onChange={(e) => update("client.email", e.target.value)}
                  maxLength={200}
                />
              </div>
              <div>
                <label className="label" htmlFor="client-phone">Phone</label>
                <input
                  id="client-phone"
                  type="tel"
                  className="input"
                  placeholder="(555) 123-4567"
                  value={project.client.phone}
                  onChange={(e) => update("client.phone", e.target.value)}
                  maxLength={40}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="client-prefs">
                  Client Preferences / Notes
                </label>
                <textarea
                  id="client-prefs"
                  className="input min-h-[80px] resize-y"
                  placeholder="Style preferences, color likes/dislikes, special requests..."
                  value={project.client.preferences}
                  onChange={(e) =>
                    update("client.preferences", e.target.value)
                  }
                  maxLength={2000}
                />
              </div>
            </div>
          </section>

          {/* Property Info */}
          <section className="card">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-lg" aria-hidden>🏠</span>
              <h2 className="text-lg font-semibold">Property Details</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="prop-address">Address</label>
                <input
                  id="prop-address"
                  className="input"
                  placeholder="123 Mountain View Dr"
                  value={project.property.address}
                  onChange={(e) => update("property.address", e.target.value)}
                  maxLength={200}
                />
              </div>
              <div>
                <label className="label" htmlFor="prop-city">City</label>
                <input
                  id="prop-city"
                  className="input"
                  placeholder="Gatlinburg"
                  value={project.property.city}
                  onChange={(e) => update("property.city", e.target.value)}
                  maxLength={80}
                />
              </div>
              <div>
                <label className="label" htmlFor="prop-state">State</label>
                <input
                  id="prop-state"
                  className="input"
                  placeholder="TN"
                  value={project.property.state}
                  onChange={(e) => update("property.state", e.target.value)}
                  maxLength={40}
                />
              </div>
              <div>
                <label className="label" htmlFor="prop-sqft">Square Footage</label>
                <input
                  id="prop-sqft"
                  type="number"
                  className="input"
                  min={0}
                  max={100000}
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
                <label className="label" htmlFor="prop-beds">Bedrooms</label>
                <input
                  id="prop-beds"
                  type="number"
                  className="input"
                  min={0}
                  max={50}
                  value={project.property.bedrooms || ""}
                  onChange={(e) =>
                    update("property.bedrooms", parseInt(e.target.value) || 0)
                  }
                />
              </div>
              <div>
                <label className="label" htmlFor="prop-baths">Bathrooms</label>
                <input
                  id="prop-baths"
                  type="number"
                  className="input"
                  min={0}
                  max={50}
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
                <label className="label" htmlFor="prop-floors">Floors</label>
                <input
                  id="prop-floors"
                  type="number"
                  className="input"
                  min={1}
                  max={20}
                  value={project.property.floors || ""}
                  onChange={(e) =>
                    update("property.floors", parseInt(e.target.value) || 1)
                  }
                />
              </div>
            </div>
          </section>

          {/* Scan Links */}
          <section className="card">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg" aria-hidden>🎥</span>
              <h2 className="text-lg font-semibold">3D Scan Links</h2>
            </div>
            <p className="mb-4 text-sm text-brand-600">
              Optional — link your Matterport, Polycam, or Spoak project so the
              whole team can walk through it.
            </p>
            <div className="grid gap-4">
              <div>
                <label className="label" htmlFor="scan-matterport">Matterport Link</label>
                <input
                  id="scan-matterport"
                  type="url"
                  className="input"
                  placeholder="https://my.matterport.com/show/?m=..."
                  value={project.property.matterportLink}
                  onChange={(e) =>
                    update("property.matterportLink", e.target.value)
                  }
                />
              </div>
              <div>
                <label className="label" htmlFor="scan-polycam">Polycam Link</label>
                <input
                  id="scan-polycam"
                  type="url"
                  className="input"
                  placeholder="https://poly.cam/capture/..."
                  value={project.property.polycamLink}
                  onChange={(e) =>
                    update("property.polycamLink", e.target.value)
                  }
                />
              </div>
              <div>
                <label className="label" htmlFor="scan-spoak">Spoak Link</label>
                <input
                  id="scan-spoak"
                  type="url"
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
        </form>

        {/* Sticky submit bar */}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-900/10 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-6 py-3">
            <div className="min-w-0 truncate text-xs text-brand-600">
              {project.name.trim() ? (
                <>
                  Creating:{" "}
                  <span className="font-medium text-brand-900">
                    {project.name.trim()}
                  </span>
                </>
              ) : (
                <span>Enter a project name to continue</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="new-project-form"
                disabled={submitting || !project.name.trim()}
                className="btn-primary btn-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Creating…" : "Create Project"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
