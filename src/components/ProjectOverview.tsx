"use client";

import { useEffect, useState } from "react";
import { getProject, saveProject } from "@/lib/store";
import ProjectChecklist from "./ProjectChecklist";
import FloorPlansPanel from "./FloorPlansPanel";
import MatterportLink from "./MatterportLink";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

/**
 * Property + Client + Scans + Floor Plans — the core project detail card.
 * Extracted from project/[id]/page.tsx so multiple hubs can use it.
 */
export default function ProjectOverview({ project, onUpdate }: Props) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(project.notes);
  const [editingProperty, setEditingProperty] = useState(false);
  const [editingClient, setEditingClient] = useState(false);
  const [propertyForm, setPropertyForm] = useState(project.property);
  const [budgetForm, setBudgetForm] = useState<number>(project.budget || 0);
  const [clientForm, setClientForm] = useState(project.client);

  function saveNotes() {
    const fresh = getProject(project.id);
    if (!fresh) return;
    fresh.notes = notes;
    saveProject(fresh);
    setEditingNotes(false);
    onUpdate();
  }

  function saveProperty() {
    const fresh = getProject(project.id);
    if (!fresh) return;
    fresh.property = { ...propertyForm };
    fresh.budget = budgetForm > 0 ? budgetForm : 0;
    saveProject(fresh);
    setEditingProperty(false);
    onUpdate();
  }

  function saveClient() {
    const fresh = getProject(project.id);
    if (!fresh) return;
    fresh.client = { ...clientForm };
    saveProject(fresh);
    setEditingClient(false);
    onUpdate();
  }

  const hasFloorPlan = (project.property.floorPlans ?? []).length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Checklist */}
      <div className="lg:col-span-2">
        <ProjectChecklist project={project} />
      </div>

      {/* Floor plan = the centerpiece. SVG upload becomes the entire wall feature
          when the project has nothing yet, so designers can't miss it. */}
      <div className="lg:col-span-2 card bg-amber/10 border-amber/30">
        <div className="flex items-start gap-3">
          <div className="text-2xl">📐</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-brand-900 text-sm">
              {hasFloorPlan ? "Floor plan" : "Start by dropping a floor plan"}
            </h3>
            <p className="text-xs text-brand-700 mt-1 mb-3">
              {hasFloorPlan
                ? "Upload an SVG to auto-replace rooms. PNG/PDF works too — review pops up for those."
                : <>From your Matterport space: <strong>Export → Schematic Floor Plan → SVG</strong>. Drop the SVG below and rooms get created automatically with exact dimensions, walls, doors, and windows.</>
              }
            </p>
            <FloorPlansPanel project={project} onUpdate={onUpdate} />
          </div>
        </div>
      </div>

      {/* Matterport Model ID — unlocks auto-pulling panoramas per room */}
      <div className="lg:col-span-2">
        <MatterportLink project={project} onUpdate={onUpdate} />
      </div>

      {/* Property */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Property</h2>
          {!editingProperty ? (
            <button
              onClick={() => { setPropertyForm(project.property); setBudgetForm(project.budget || 0); setEditingProperty(true); }}
              className="text-xs text-amber-dark hover:underline"
            >
              Edit
            </button>
          ) : (
            <div className="flex gap-3 text-xs">
              <button onClick={() => setEditingProperty(false)} className="text-brand-600 hover:text-brand-900">Cancel</button>
              <button onClick={saveProperty} className="text-amber-dark hover:underline font-medium">Save</button>
            </div>
          )}
        </div>

        {editingProperty ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2"><label className="label">Address</label><input className="input" value={propertyForm.address} onChange={e => setPropertyForm({ ...propertyForm, address: e.target.value })} /></div>
            <div><label className="label">City</label><input className="input" value={propertyForm.city} onChange={e => setPropertyForm({ ...propertyForm, city: e.target.value })} /></div>
            <div><label className="label">State</label><input className="input" value={propertyForm.state} onChange={e => setPropertyForm({ ...propertyForm, state: e.target.value })} /></div>
            <div><label className="label">Square Footage</label><input type="number" className="input" value={propertyForm.squareFootage || ""} onChange={e => setPropertyForm({ ...propertyForm, squareFootage: parseInt(e.target.value) || 0 })} /></div>
            <div><label className="label">Floors</label><input type="number" className="input" min={1} value={propertyForm.floors || ""} onChange={e => setPropertyForm({ ...propertyForm, floors: parseInt(e.target.value) || 1 })} /></div>
            <div><label className="label">Bedrooms</label><input type="number" className="input" min={0} value={propertyForm.bedrooms || ""} onChange={e => setPropertyForm({ ...propertyForm, bedrooms: parseInt(e.target.value) || 0 })} /></div>
            <div><label className="label">Bathrooms</label><input type="number" className="input" min={0} step={0.5} value={propertyForm.bathrooms || ""} onChange={e => setPropertyForm({ ...propertyForm, bathrooms: parseFloat(e.target.value) || 0 })} /></div>
            <div className="col-span-2"><label className="label">Design Budget ($)</label><input type="number" className="input" min={0} step={100} value={budgetForm || ""} placeholder="e.g. 25000" onChange={e => setBudgetForm(parseInt(e.target.value) || 0)} /></div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Address" value={project.property.address} />
            <Field label="Location" value={`${project.property.city}, ${project.property.state}`} />
            <Field label="Size" value={project.property.squareFootage ? `${project.property.squareFootage.toLocaleString()} sqft` : "—"} />
            <Field label="Layout" value={`${project.property.bedrooms} bd / ${project.property.bathrooms} ba`} />
            <Field label="Floors" value={project.property.floors || "—"} />
            <Field label="Design Budget" value={project.budget ? `$${project.budget.toLocaleString()}` : "Not set"} />
          </dl>
        )}

        {/* Hero image (for Install Guide cover) */}
        <div className="mt-4 pt-4 border-t border-brand-900/5">
          <HeroImageUploader project={project} onUpdate={onUpdate} />
        </div>
      </div>

      {/* Client */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Client</h2>
          {!editingClient ? (
            <button onClick={() => { setClientForm(project.client); setEditingClient(true); }} className="text-xs text-amber-dark hover:underline">Edit</button>
          ) : (
            <div className="flex gap-3 text-xs">
              <button onClick={() => setEditingClient(false)} className="text-brand-600 hover:text-brand-900">Cancel</button>
              <button onClick={saveClient} className="text-amber-dark hover:underline font-medium">Save</button>
            </div>
          )}
        </div>

        {editingClient ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2"><label className="label">Client Name</label><input className="input" value={clientForm.name} onChange={e => setClientForm({ ...clientForm, name: e.target.value })} /></div>
            <div><label className="label">Email</label><input type="email" className="input" value={clientForm.email} onChange={e => setClientForm({ ...clientForm, email: e.target.value })} /></div>
            <div><label className="label">Phone</label><input className="input" value={clientForm.phone} onChange={e => setClientForm({ ...clientForm, phone: e.target.value })} /></div>
            <div className="col-span-2"><label className="label">Preferences / Notes</label><textarea className="input min-h-[80px]" value={clientForm.preferences} onChange={e => setClientForm({ ...clientForm, preferences: e.target.value })} placeholder="Style preferences, color likes/dislikes, special requests..." /></div>
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Name" value={project.client.name} />
              <Field label="Email" value={project.client.email} />
              <Field label="Phone" value={project.client.phone} />
            </dl>
            {project.client.preferences && (
              <div className="mt-4 pt-4 border-t border-brand-900/5">
                <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-1">Preferences</div>
                <p className="text-sm text-brand-700 whitespace-pre-wrap">{project.client.preferences}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Design Settings */}
      <div className="card lg:col-span-2">
        <h2 className="text-lg font-semibold mb-4">Design Settings</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Field label="Style" value={project.style.replace(/-/g, " ")} />
          <Field label="Target Guests" value={project.targetGuests} />
          <Field label="Budget" value={project.budget ? `$${project.budget.toLocaleString()}` : "Not set"} />
          <Field label="Status" value={project.status} />
        </dl>

        {project.moodBoards.length > 0 && (
          <div className="mt-4 pt-4 border-t border-brand-900/5">
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-2">Active Mood Board</div>
            <div className="flex h-10 overflow-hidden rounded-lg">
              {project.moodBoards[0].colorPalette.map((color, i) => (
                <div key={i} className="flex-1" style={{ backgroundColor: color }} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-brand-900/5">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">Project Notes</div>
            {!editingNotes ? (
              <button onClick={() => setEditingNotes(true)} className="text-xs text-amber-dark hover:underline">Edit</button>
            ) : (
              <button onClick={saveNotes} className="text-xs text-amber-dark hover:underline font-medium">Save</button>
            )}
          </div>
          {editingNotes ? (
            <textarea className="input min-h-[100px] resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add project notes, reminders, design decisions..." autoFocus />
          ) : (
            <p className="text-sm text-brand-700 whitespace-pre-wrap">{project.notes || "No notes yet. Click Edit to add some."}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-brand-600">{label}</dt>
      <dd className="font-medium text-brand-900 capitalize">{value || "—"}</dd>
    </div>
  );
}

function HeroImageUploader({ project, onUpdate }: { project: Project; onUpdate: () => void }) {
  const [urlInput, setUrlInput] = useState(project.property.heroImageUrl ?? "");

  function saveUrl(url: string) {
    const fresh = getProject(project.id);
    if (!fresh) return;
    fresh.property.heroImageUrl = url;
    saveProject(fresh);
    onUpdate();
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Hero image too large (>2MB). Use a URL instead for large photos.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setUrlInput(dataUrl);
      saveUrl(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">
          Hero Image (Install Guide cover)
        </div>
      </div>
      {project.property.heroImageUrl ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={project.property.heroImageUrl} alt="" className="h-16 w-24 object-cover rounded border border-brand-900/10" />
          <div className="flex-1">
            <div className="text-[10px] text-brand-600">Used on the Install Guide cover page.</div>
            <button
              onClick={() => saveUrl("")}
              className="text-[10px] text-red-400 hover:text-red-600 mt-1"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            className="input flex-1 text-xs"
            placeholder="Paste image URL or click Upload..."
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onBlur={() => urlInput.trim() && saveUrl(urlInput.trim())}
          />
          <label className="btn-secondary btn-sm cursor-pointer whitespace-nowrap">
            Upload
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </label>
        </div>
      )}
    </div>
  );
}

type ScanKind = "matterport" | "polycam" | "spoak";

const SCAN_META: Record<ScanKind, { label: string; icon: string; field: "matterportLink" | "polycamLink" | "spoakLink"; color: string }> = {
  matterport: { label: "Matterport", icon: "📐", field: "matterportLink", color: "bg-blue-500" },
  polycam: { label: "Polycam", icon: "📱", field: "polycamLink", color: "bg-emerald-500" },
  spoak: { label: "Spoak", icon: "🎨", field: "spoakLink", color: "bg-purple-500" },
};

function detectScanKind(url: string): ScanKind | null {
  const u = url.toLowerCase().trim();
  if (!u) return null;
  if (u.includes("matterport.com")) return "matterport";
  if (u.includes("poly.cam") || u.includes("polycam.com")) return "polycam";
  if (u.includes("spoak.com")) return "spoak";
  return null;
}

function SmartScanInput({
  project,
  editingProperty,
  propertyForm,
  setPropertyForm,
  onUpdate,
}: {
  project: Project;
  editingProperty: boolean;
  propertyForm: Project["property"];
  setPropertyForm: (p: Project["property"]) => void;
  onUpdate: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const links = editingProperty ? propertyForm : project.property;

  function commit(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return;
    const kind = detectScanKind(trimmed);
    if (!kind) {
      setError("Couldn't tell what kind of link that is. Paste a Matterport, Polycam, or Spoak URL.");
      return;
    }
    setError(null);
    if (editingProperty) {
      setPropertyForm({ ...propertyForm, [SCAN_META[kind].field]: trimmed });
    } else {
      const fresh = getProject(project.id);
      if (!fresh) return;
      (fresh.property as unknown as Record<string, string>)[SCAN_META[kind].field] = trimmed;
      saveProject(fresh);
      onUpdate();
    }
    setDraft("");
  }

  function clearLink(kind: ScanKind) {
    if (editingProperty) {
      setPropertyForm({ ...propertyForm, [SCAN_META[kind].field]: "" });
    } else {
      const fresh = getProject(project.id);
      if (!fresh) return;
      (fresh.property as unknown as Record<string, string>)[SCAN_META[kind].field] = "";
      saveProject(fresh);
      onUpdate();
    }
  }

  const linkedKinds: ScanKind[] = (Object.keys(SCAN_META) as ScanKind[]).filter(k => links[SCAN_META[k].field]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="url"
          className="input flex-1 text-xs py-2"
          placeholder="Paste a Matterport, Polycam, or Spoak link…"
          value={draft}
          onChange={e => { setDraft(e.target.value); setError(null); }}
          onBlur={() => commit(draft)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(draft); } }}
        />
      </div>
      {error && (
        <div className="text-[10px] text-red-500 mt-1">{error}</div>
      )}

      {linkedKinds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {linkedKinds.map(kind => {
            const meta = SCAN_META[kind];
            const url = links[meta.field];
            return (
              <div key={kind} className="inline-flex items-center gap-1.5 rounded-full bg-brand-900/5 px-2 py-1 text-[10px]">
                <span className={`h-1.5 w-1.5 rounded-full ${meta.color}`} />
                <span className="text-brand-700 font-medium">{meta.label}</span>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-dark hover:underline"
                  title={url}
                >
                  Open →
                </a>
                <button
                  onClick={() => clearLink(kind)}
                  className="text-brand-600/60 hover:text-red-500 ml-0.5"
                  title="Remove link"
                  aria-label={`Remove ${meta.label} link`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {linkedKinds.includes("matterport") && (
        <div className="mt-2 rounded-lg bg-amber/10 border border-amber/20 px-3 py-2 text-[10px] text-brand-700">
          <strong>📐 Matterport tip:</strong> from your Matterport space, click <strong>Export → Schematic Floor Plan</strong> and download the SVG or PNG. Upload it under Floor Plans below to auto-detect rooms + dimensions.
        </div>
      )}
    </div>
  );
}
