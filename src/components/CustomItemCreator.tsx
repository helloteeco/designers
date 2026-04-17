"use client";

import { useState } from "react";
import { saveCustomItem, deleteCustomItem, getCustomItems } from "@/lib/studio-settings";
import { generateId } from "@/lib/store";
import VendorSearch from "./VendorSearch";
import type { FurnitureItem, FurnitureCategory, DesignStyle } from "@/lib/types";

interface Props {
  onItemAdded?: (item: FurnitureItem) => void;
  trigger?: React.ReactNode;
}

const CATEGORIES: { value: FurnitureCategory; label: string }[] = [
  { value: "beds-mattresses", label: "Beds & Mattresses" },
  { value: "seating", label: "Seating" },
  { value: "tables", label: "Tables" },
  { value: "storage", label: "Storage" },
  { value: "lighting", label: "Lighting" },
  { value: "decor", label: "Decor" },
  { value: "rugs-textiles", label: "Rugs & Textiles" },
  { value: "outdoor", label: "Outdoor" },
  { value: "kitchen-dining", label: "Kitchen & Dining" },
  { value: "bathroom", label: "Bathroom" },
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

const QUICK_VENDORS = [
  "Wayfair", "Amazon", "Target", "IKEA", "West Elm", "Article",
  "Crate & Barrel", "CB2", "Pottery Barn", "Ruggable", "Etsy",
  "Facebook Marketplace", "Craigslist", "Local Thrift", "Custom Build",
];

export default function CustomItemCreator({ onItemAdded, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [customItems, setCustomItems] = useState<FurnitureItem[]>(() => getCustomItems());
  const [form, setForm] = useState<Partial<FurnitureItem>>({
    id: "",
    name: "",
    category: "seating",
    subcategory: "",
    widthIn: 36,
    depthIn: 36,
    heightIn: 36,
    price: 0,
    vendor: "Wayfair",
    vendorUrl: "",
    imageUrl: "",
    color: "",
    material: "",
    style: "modern",
  });
  const [pasteUrl, setPasteUrl] = useState("");

  function resetForm() {
    setForm({
      id: "",
      name: "",
      category: "seating",
      subcategory: "",
      widthIn: 36,
      depthIn: 36,
      heightIn: 36,
      price: 0,
      vendor: "Wayfair",
      vendorUrl: "",
      imageUrl: "",
      color: "",
      material: "",
      style: "modern",
    });
    setPasteUrl("");
  }

  function detectVendorFromUrl(url: string): string {
    const u = url.toLowerCase();
    if (u.includes("wayfair.com")) return "Wayfair";
    if (u.includes("amazon.com") || u.includes("amzn.to")) return "Amazon";
    if (u.includes("target.com")) return "Target";
    if (u.includes("ikea.com")) return "IKEA";
    if (u.includes("westelm.com")) return "West Elm";
    if (u.includes("article.com")) return "Article";
    if (u.includes("crateandbarrel.com")) return "Crate & Barrel";
    if (u.includes("cb2.com")) return "CB2";
    if (u.includes("potterybarn.com")) return "Pottery Barn";
    if (u.includes("ruggable.com")) return "Ruggable";
    if (u.includes("etsy.com")) return "Etsy";
    if (u.includes("facebook.com/marketplace")) return "Facebook Marketplace";
    if (u.includes("craigslist.org")) return "Craigslist";
    return "";
  }

  function handlePasteUrl() {
    if (!pasteUrl.trim()) return;
    const vendor = detectVendorFromUrl(pasteUrl);
    setForm(prev => ({
      ...prev,
      vendorUrl: pasteUrl.trim(),
      vendor: vendor || prev.vendor,
    }));
  }

  function save() {
    if (!form.name?.trim()) {
      alert("Item name is required.");
      return;
    }
    const item: FurnitureItem = {
      id: form.id || `custom-${generateId()}`,
      name: form.name,
      category: form.category as FurnitureCategory,
      subcategory: form.subcategory ?? "",
      widthIn: form.widthIn ?? 36,
      depthIn: form.depthIn ?? 36,
      heightIn: form.heightIn ?? 36,
      price: form.price ?? 0,
      vendor: form.vendor ?? "Custom",
      vendorUrl: form.vendorUrl ?? "",
      imageUrl: form.imageUrl ?? "",
      color: form.color ?? "",
      material: form.material ?? "",
      style: form.style as DesignStyle,
    };
    saveCustomItem(item);
    setCustomItems(getCustomItems());
    onItemAdded?.(item);
    resetForm();
  }

  function removeItem(id: string) {
    if (!confirm("Delete this custom item? It will stay in existing projects.")) return;
    deleteCustomItem(id);
    setCustomItems(getCustomItems());
  }

  function editItem(item: FurnitureItem) {
    setForm(item);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary btn-sm"
      >
        {trigger ?? "+ Add Custom Item"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-900/10">
              <div>
                <h2 className="text-lg font-semibold">Custom Furniture Library</h2>
                <p className="text-xs text-brand-600">
                  Add Wayfair finds, Etsy pieces, Facebook Marketplace deals, custom builds — anything not in the default catalog.
                </p>
              </div>
              <button
                onClick={() => { setOpen(false); resetForm(); }}
                className="text-brand-600 hover:text-brand-900 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Quick Paste URL */}
              <div className="card mb-4 bg-amber/5 border-amber/20">
                <h3 className="text-sm font-semibold mb-2">Quick Add by URL</h3>
                <p className="text-xs text-brand-600 mb-3">
                  Paste a product link (Wayfair, Amazon, Etsy, etc.) — we&apos;ll auto-detect the vendor and you fill in the rest.
                </p>
                <div className="flex gap-2">
                  <input
                    className="input flex-1 text-sm"
                    placeholder="https://www.wayfair.com/..."
                    value={pasteUrl}
                    onChange={e => setPasteUrl(e.target.value)}
                  />
                  <button onClick={handlePasteUrl} className="btn-secondary btn-sm shrink-0">
                    Detect
                  </button>
                </div>
              </div>

              {/* Vendor search helper — only shows when there's a name */}
              {form.name && form.name.trim().length > 2 && (
                <div className="mb-4">
                  <VendorSearch query={form.name} />
                </div>
              )}

              {/* Form */}
              <div className="card mb-4">
                <h3 className="text-sm font-semibold mb-3">Item Details</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="label">Item Name *</label>
                    <input
                      className="input"
                      placeholder='e.g. "Modway Engage Tufted Sofa"'
                      value={form.name ?? ""}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="label">Category</label>
                    <select
                      className="select"
                      value={form.category}
                      onChange={e => setForm({ ...form, category: e.target.value as FurnitureCategory })}
                    >
                      {CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Subcategory</label>
                    <input
                      className="input"
                      placeholder="e.g. sofa, dining chair, pendant"
                      value={form.subcategory ?? ""}
                      onChange={e => setForm({ ...form, subcategory: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="label">Style</label>
                    <select
                      className="select"
                      value={form.style}
                      onChange={e => setForm({ ...form, style: e.target.value as DesignStyle })}
                    >
                      {STYLES.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Price ($)</label>
                    <input
                      type="number"
                      className="input"
                      value={form.price ?? 0}
                      onChange={e => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                    />
                  </div>

                  <div>
                    <label className="label">Vendor</label>
                    <select
                      className="select"
                      value={form.vendor}
                      onChange={e => setForm({ ...form, vendor: e.target.value })}
                    >
                      {QUICK_VENDORS.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Vendor URL</label>
                    <input
                      className="input"
                      placeholder="https://..."
                      value={form.vendorUrl ?? ""}
                      onChange={e => setForm({ ...form, vendorUrl: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="label">Color</label>
                    <input
                      className="input"
                      placeholder="e.g. Charcoal Gray"
                      value={form.color ?? ""}
                      onChange={e => setForm({ ...form, color: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Material</label>
                    <input
                      className="input"
                      placeholder="e.g. Velvet, Oak, Metal"
                      value={form.material ?? ""}
                      onChange={e => setForm({ ...form, material: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="label">Width (in)</label>
                    <input
                      type="number"
                      className="input"
                      value={form.widthIn ?? 0}
                      onChange={e => setForm({ ...form, widthIn: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="label">Depth (in)</label>
                    <input
                      type="number"
                      className="input"
                      value={form.depthIn ?? 0}
                      onChange={e => setForm({ ...form, depthIn: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="label">Height (in)</label>
                    <input
                      type="number"
                      className="input"
                      value={form.heightIn ?? 0}
                      onChange={e => setForm({ ...form, heightIn: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Image URL (optional)</label>
                    <input
                      className="input"
                      placeholder="https://..."
                      value={form.imageUrl ?? ""}
                      onChange={e => setForm({ ...form, imageUrl: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={resetForm} className="btn-secondary btn-sm">
                    Clear
                  </button>
                  <button onClick={save} className="btn-primary btn-sm">
                    {form.id ? "Update Item" : "Save to My Library"}
                  </button>
                </div>
              </div>

              {/* Existing Custom Items */}
              {customItems.length > 0 && (
                <div className="card">
                  <h3 className="text-sm font-semibold mb-3">
                    Your Custom Library ({customItems.length})
                  </h3>
                  <div className="divide-y divide-brand-900/5">
                    {customItems.map(item => (
                      <div key={item.id} className="flex items-center gap-3 py-2 group">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-brand-900 text-sm truncate">{item.name}</div>
                          <div className="text-[10px] text-brand-600">
                            {item.vendor} · {item.color} · {item.widthIn}&quot;x{item.depthIn}&quot;x{item.heightIn}&quot;
                          </div>
                        </div>
                        <div className="text-sm font-medium shrink-0">${item.price}</div>
                        <button
                          onClick={() => editItem(item)}
                          className="text-xs text-amber-dark hover:underline opacity-0 group-hover:opacity-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
