"use client";

import { useState } from "react";
import { saveProject, getProject as getProjectFromStore, generateId, logActivity } from "@/lib/store";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

interface InspirationItem {
  id: string;
  url: string;
  source: "pinterest" | "instagram" | "houzz" | "spoak" | "custom" | "client";
  notes: string;
  tags: string[];
  room?: string;
  addedAt: string;
}

const SOURCE_LABELS = {
  pinterest: "Pinterest",
  instagram: "Instagram",
  houzz: "Houzz",
  spoak: "Spoak",
  custom: "Custom URL",
  client: "Client Provided",
};

const SOURCE_COLORS = {
  pinterest: "bg-red-100 text-red-700",
  instagram: "bg-pink-100 text-pink-700",
  houzz: "bg-green-100 text-green-700",
  spoak: "bg-purple-100 text-purple-700",
  custom: "bg-blue-100 text-blue-700",
  client: "bg-amber-100 text-amber-700",
};

const QUICK_TAGS = [
  "Color Scheme", "Furniture Style", "Wall Treatment", "Lighting",
  "Outdoor", "Kitchen", "Bedroom", "Living Room", "Bathroom",
  "Texture", "Layout", "Accent Piece", "Rug", "Art",
];

export default function InspirationBoard({ project, onUpdate }: Props) {
  const [items, setItems] = useState<InspirationItem[]>(() => {
    try {
      const stored = localStorage.getItem(`inspiration_${project.id}`);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [showForm, setShowForm] = useState(false);
  const [filterTag, setFilterTag] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [form, setForm] = useState({
    url: "",
    source: "client" as InspirationItem["source"],
    notes: "",
    tags: [] as string[],
    room: "",
  });

  function saveItems(updated: InspirationItem[]) {
    setItems(updated);
    localStorage.setItem(`inspiration_${project.id}`, JSON.stringify(updated));
  }

  function addItem(e: React.FormEvent) {
    e.preventDefault();
    const item: InspirationItem = {
      id: generateId(),
      url: form.url,
      source: form.source,
      notes: form.notes,
      tags: form.tags,
      room: form.room || undefined,
      addedAt: new Date().toISOString(),
    };
    const updated = [item, ...items];
    saveItems(updated);
    logActivity(project.id, "inspiration_added", `Added ${form.source} inspiration`);
    setShowForm(false);
    setForm({ url: "", source: "client", notes: "", tags: [], room: "" });
  }

  function removeItem(id: string) {
    saveItems(items.filter(i => i.id !== id));
  }

  function toggleTag(tag: string) {
    setForm(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag],
    }));
  }

  const allTags = Array.from(new Set(items.flatMap(i => i.tags)));
  const filtered = items.filter(i => {
    if (filterTag && !i.tags.includes(filterTag)) return false;
    if (filterSource && i.source !== filterSource) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Client Inspiration</h2>
          <p className="text-sm text-brand-600">
            Collect inspiration from Pinterest, Instagram, Houzz, Spoak, and client references.
            Tag and organize by room or design element.
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          + Add Inspiration
        </button>
      </div>

      {/* Filters */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Source filter */}
          <select
            className="select text-xs w-auto"
            value={filterSource}
            onChange={e => setFilterSource(e.target.value)}
          >
            <option value="">All Sources</option>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          {/* Tag filter */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setFilterTag("")}
                className={`text-xs rounded-full px-2.5 py-1 transition ${
                  !filterTag ? "bg-brand-900 text-white" : "bg-brand-900/5 text-brand-600 hover:bg-brand-900/10"
                }`}
              >
                All
              </button>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setFilterTag(filterTag === tag ? "" : tag)}
                  className={`text-xs rounded-full px-2.5 py-1 transition ${
                    filterTag === tag ? "bg-brand-900 text-white" : "bg-brand-900/5 text-brand-600 hover:bg-brand-900/10"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {items.length === 0 && !showForm && (
        <div className="card text-center py-12">
          <div className="mx-auto mb-3 text-4xl">&#128161;</div>
          <p className="text-brand-600 mb-2">No inspiration collected yet.</p>
          <p className="text-xs text-brand-600/60 mb-4 max-w-md mx-auto">
            Add Pinterest pins, Instagram posts, Houzz photos, or any links your client shares.
            Tag them by room or design element for easy reference.
          </p>
          <button onClick={() => setShowForm(true)} className="btn-secondary">
            Add First Inspiration
          </button>
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(item => (
            <div key={item.id} className="card group">
              {/* Source badge */}
              <div className="flex items-center justify-between mb-3">
                <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${SOURCE_COLORS[item.source]}`}>
                  {SOURCE_LABELS[item.source]}
                </span>
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"
                >
                  Remove
                </button>
              </div>

              {/* Link */}
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mb-3 rounded-lg bg-brand-900/5 px-3 py-2 text-xs text-amber-dark hover:bg-amber/5 truncate transition"
                >
                  {item.url}
                </a>
              )}

              {/* Notes */}
              {item.notes && (
                <p className="text-sm text-brand-700 mb-3">{item.notes}</p>
              )}

              {/* Tags */}
              {item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {item.tags.map(tag => (
                    <span key={tag} className="badge-neutral text-[9px]">{tag}</span>
                  ))}
                </div>
              )}

              {/* Room */}
              {item.room && (
                <div className="text-[10px] text-brand-600/60">
                  Room: {item.room}
                </div>
              )}

              <div className="text-[10px] text-brand-600/40 mt-2">
                {new Date(item.addedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Add Inspiration</h2>

            <form onSubmit={addItem} className="space-y-4">
              <div>
                <label className="label">Source</label>
                <select
                  className="select"
                  value={form.source}
                  onChange={e => setForm({ ...form, source: e.target.value as InspirationItem["source"] })}
                >
                  {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">URL (optional)</label>
                <input
                  className="input"
                  placeholder="https://pinterest.com/pin/..."
                  value={form.url}
                  onChange={e => setForm({ ...form, url: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Notes</label>
                <textarea
                  className="input min-h-[80px] resize-y"
                  placeholder="What stands out about this? Client said they love the color combo..."
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                />
              </div>

              <div>
                <label className="label">For Room (optional)</label>
                <select
                  className="select"
                  value={form.room}
                  onChange={e => setForm({ ...form, room: e.target.value })}
                >
                  <option value="">General / All Rooms</option>
                  {project.rooms.map(r => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Tags</label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_TAGS.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`text-xs rounded-full px-2.5 py-1 border transition ${
                        form.tags.includes(tag)
                          ? "border-amber bg-amber/10 text-amber-dark"
                          : "border-brand-900/10 text-brand-600 hover:border-amber/30"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary btn-sm">
                  Cancel
                </button>
                <button type="submit" className="btn-primary btn-sm">
                  Add Inspiration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
