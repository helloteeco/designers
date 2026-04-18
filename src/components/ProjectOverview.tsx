"use client";

import { useEffect, useState } from "react";
import { getProject, saveProject } from "@/lib/store";
import ProjectChecklist from "./ProjectChecklist";
import FloorPlansPanel from "./FloorPlansPanel";
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

  const hasScans = !!(project.property.matterportLink || project.property.polycamLink || project.property.spoakLink);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Checklist */}
      <div className="lg:col-span-2">
        <ProjectChecklist project={project} />
      </div>

      {/* Missing-scans nudge */}
      {!hasScans && (
        <div className="lg:col-span-2 card bg-amber/10 border-amber/30">
          <div className="flex items-start gap-3">
            <div className="text-2xl">📐</div>
            <div className="flex-1">
              <h3 className="font-semibold text-brand-900 text-sm">
                Link your 3D scan for best results
              </h3>
              <p className="text-xs text-brand-700 mt-1 mb-2">
                The AI workflow and space planner use real dimensions from your Matterport, Polycam, or Spoak scan. Paste any URL below.
              </p>
              <div className="text-[10px] text-brand-600/80">
                No scan yet?&nbsp;
                <a href="https://matterport.com" target="_blank" rel="noopener noreferrer" className="text-amber-dark underline">Matterport</a>
                &nbsp;·&nbsp;
                <a href="https://poly.cam" target="_blank" rel="noopener noreferrer" className="text-amber-dark underline">Polycam (free iPhone app)</a>
                &nbsp;·&nbsp;
                <a href="https://www.spoak.com" target="_blank" rel="noopener noreferrer" className="text-amber-dark underline">Spoak</a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Property */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Property</h2>
          {!editingProperty ? (
            <button
              onClick={() => { setPropertyForm(project.property); setEditingProperty(true); }}
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

        {/* 3D Scans */}
        <div className="mt-4 pt-4 border-t border-brand-900/5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">3D Scans &amp; Design Links</div>
            <span className="text-[10px] text-brand-600/60">Paste URLs below</span>
          </div>
          <div className="space-y-2">
            <ScanInput label="Matterport" icon="📐" placeholder="https://my.matterport.com/show/?m=..." url={editingProperty ? propertyForm.matterportLink : project.property.matterportLink} onChange={editingProperty ? (v) => setPropertyForm({ ...propertyForm, matterportLink: v }) : (v) => { const fresh = getProject(project.id); if (!fresh) return; fresh.property.matterportLink = v; saveProject(fresh); onUpdate(); }} color="blue" />
            <ScanInput label="Polycam" icon="📱" placeholder="https://poly.cam/capture/..." url={editingProperty ? propertyForm.polycamLink : project.property.polycamLink} onChange={editingProperty ? (v) => setPropertyForm({ ...propertyForm, polycamLink: v }) : (v) => { const fresh = getProject(project.id); if (!fresh) return; fresh.property.polycamLink = v; saveProject(fresh); onUpdate(); }} color="emerald" />
            <ScanInput label="Spoak" icon="🎨" placeholder="https://www.spoak.com/..." url={editingProperty ? propertyForm.spoakLink : project.property.spoakLink} onChange={editingProperty ? (v) => setPropertyForm({ ...propertyForm, spoakLink: v }) : (v) => { const fresh = getProject(project.id); if (!fresh) return; fresh.property.spoakLink = v; saveProject(fresh); onUpdate(); }} color="purple" />
          </div>
        </div>

        {/* Floor Plans */}
        <div className="mt-4 pt-4 border-t border-brand-900/5">
          <FloorPlansPanel project={project} onUpdate={onUpdate} />
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

function ScanInput({ label, icon, placeholder, url, onChange, color }: { label: string; icon: string; placeholder: string; url: string; onChange: (v: string) => void; color: string }) {
  const [value, setValue] = useState(url);
  const [focused, setFocused] = useState(false);
  const colorDot = { blue: "bg-blue-500", emerald: "bg-emerald-500", purple: "bg-purple-500" }[color] ?? "bg-gray-400";

  useEffect(() => { setValue(url); }, [url]);

  function handleBlur() {
    setFocused(false);
    if (value !== url) onChange(value);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-base" aria-hidden>{icon}</span>
      <div className="flex items-center gap-1.5 w-24 shrink-0">
        <div className={`h-1.5 w-1.5 rounded-full ${colorDot}`} />
        <span className="text-xs font-medium text-brand-700">{label}</span>
      </div>
      <input type="url" className="input flex-1 text-xs py-1.5" placeholder={placeholder} value={value} onChange={e => setValue(e.target.value)} onBlur={handleBlur} onFocus={() => setFocused(true)} />
      {url && !focused && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-dark hover:underline shrink-0" title={`Open ${label}`}>Open →</a>
      )}
    </div>
  );
}
