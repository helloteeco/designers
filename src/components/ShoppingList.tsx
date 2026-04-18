"use client";

import { useState } from "react";
import { saveProject, getProject as getProjectFromStore, logActivity } from "@/lib/store";
import { totalsByStatus } from "@/lib/masterlist-export";
import type { Project, FurnitureStatus } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate?: () => void;
}

const STATUS_ORDER: FurnitureStatus[] = ["specced", "approved", "ordered", "delivered", "alt-pending"];
const STATUS_META: Record<FurnitureStatus, { label: string; color: string; bg: string }> = {
  "specced": { label: "Spec'd", color: "text-brand-700", bg: "bg-brand-900/5" },
  "approved": { label: "Approved", color: "text-emerald-800", bg: "bg-emerald-100" },
  "ordered": { label: "Ordered", color: "text-emerald-900", bg: "bg-emerald-200" },
  "delivered": { label: "Delivered", color: "text-emerald-900", bg: "bg-emerald-300" },
  "alt-pending": { label: "Alt Pending", color: "text-amber-900", bg: "bg-amber-200" },
};

interface ShoppingItem {
  itemId: string;
  catalogId: string;
  name: string;
  vendor: string;
  vendorUrl: string;
  price: number;
  quantity: number;
  room: string;
  category: string;
  color: string;
  material: string;
  dimensions: string;
  status: FurnitureStatus;
}

export default function ShoppingList({ project, onUpdate }: Props) {
  const [groupBy, setGroupBy] = useState<"vendor" | "room" | "category">("vendor");
  const [showPurchased, setShowPurchased] = useState(true);

  // Build shopping list from all rooms. Status lives on the SelectedFurniture
  // itself (single source of truth) — no separate localStorage bucket.
  const items: ShoppingItem[] = [];
  for (const room of project.rooms) {
    for (const f of room.furniture) {
      items.push({
        itemId: `${room.id}-${f.item.id}`,
        catalogId: f.item.id,
        name: f.item.name,
        vendor: f.item.vendor,
        vendorUrl: f.item.vendorUrl,
        price: f.item.price,
        quantity: f.quantity,
        room: room.name,
        category: f.item.category,
        color: f.item.color,
        material: f.item.material,
        dimensions: `${f.item.widthIn}"W x ${f.item.depthIn}"D x ${f.item.heightIn}"H`,
        status: f.status ?? "specced",
      });
    }
  }

  // Deduplicate by catalog id (same item across rooms = one shopping line)
  const deduped = new Map<string, ShoppingItem & { rooms: string[] }>();
  for (const item of items) {
    const key = item.catalogId;
    if (deduped.has(key)) {
      const existing = deduped.get(key)!;
      existing.quantity += item.quantity;
      existing.rooms.push(item.room);
    } else {
      deduped.set(key, { ...item, rooms: [item.room] });
    }
  }
  const shoppingItems = Array.from(deduped.values());

  function setItemStatus(catalogId: string, status: FurnitureStatus) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    // Apply to every SelectedFurniture row that references this catalog id —
    // the same item picked in multiple rooms shares procurement state.
    for (const room of fresh.rooms) {
      for (const f of room.furniture) {
        if (f.item.id === catalogId) {
          f.status = status;
        }
      }
    }
    saveProject(fresh);
    logActivity(project.id, "status_changed", `Set ${catalogId} → ${status}`);
    onUpdate?.();
  }

  // Per-status totals for the stats bar
  const buckets = totalsByStatus(project);

  // Group
  const grouped = new Map<string, typeof shoppingItems>();
  for (const item of shoppingItems) {
    const key = groupBy === "vendor" ? item.vendor
      : groupBy === "room" ? item.rooms[0]
      : item.category.replace(/-/g, " ");
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }

  const totalCost = shoppingItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const purchasedCost = buckets.ordered + buckets.delivered;
  const totalQuantity = shoppingItems.reduce((s, i) => s + i.quantity, 0);
  const isPurchased = (status: FurnitureStatus) =>
    status === "ordered" || status === "delivered";

  function downloadShoppingList() {
    const headers = ["Item", "Vendor", "URL", "Qty", "Unit Price", "Total", "Color", "Material", "Dimensions", "Rooms"];
    const rows = [headers.join(",")];

    for (const item of shoppingItems) {
      rows.push([
        quote(item.name),
        quote(item.vendor),
        quote(item.vendorUrl),
        item.quantity,
        item.price.toFixed(2),
        (item.price * item.quantity).toFixed(2),
        quote(item.color),
        quote(item.material),
        quote(item.dimensions),
        quote(item.rooms.join("; ")),
      ].join(","));
    }

    rows.push("");
    rows.push(`TOTAL,,,,,$${totalCost.toFixed(2)},,,,`);

    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, "-")}-shopping-list.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logActivity(project.id, "exported", `Exported shopping list (${shoppingItems.length} items)`);
  }

  if (shoppingItems.length === 0) {
    return (
      <div className="card text-center py-12">
        <div className="text-4xl mb-3">&#128722;</div>
        <p className="text-brand-600">No furniture selected yet. Add items in the Space Planner or Design Board.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Shopping List</h2>
          <p className="text-sm text-brand-600">
            {shoppingItems.length} unique items across {project.rooms.filter(r => r.furniture.length > 0).length} rooms.
            Track what&apos;s been purchased.
          </p>
        </div>
        <button onClick={downloadShoppingList} className="btn-primary btn-sm">
          Download CSV
        </button>
      </div>

      {/* Stats — split by status so designer + client see what's locked vs pending */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className="card py-3 px-4 text-center">
          <div className="text-2xl font-bold text-brand-900">${totalCost.toLocaleString()}</div>
          <div className="text-[10px] text-brand-600">Total ({totalQuantity} items)</div>
        </div>
        <div className="card py-3 px-4 text-center">
          <div className="text-xl font-bold text-brand-700">${buckets.spec.toLocaleString()}</div>
          <div className="text-[10px] text-brand-600">Spec&apos;d</div>
        </div>
        <div className="card py-3 px-4 text-center bg-emerald-50 border-emerald-200">
          <div className="text-xl font-bold text-emerald-800">${buckets.approved.toLocaleString()}</div>
          <div className="text-[10px] text-emerald-700">Approved</div>
        </div>
        <div className="card py-3 px-4 text-center bg-emerald-100 border-emerald-300">
          <div className="text-xl font-bold text-emerald-900">${purchasedCost.toLocaleString()}</div>
          <div className="text-[10px] text-emerald-700">Ordered + Delivered</div>
        </div>
        <div className="card py-3 px-4 text-center bg-amber/10 border-amber/30">
          <div className="text-xl font-bold text-amber-dark">${buckets.altPending.toLocaleString()}</div>
          <div className="text-[10px] text-amber-dark">Alt Pending</div>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-brand-600 mb-1">
          <span>Procurement Progress</span>
          <span>
            {shoppingItems.filter(i => isPurchased(i.status)).length}/{shoppingItems.length} ordered or delivered
          </span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-brand-900/5">
          <div
            className="h-2.5 rounded-full bg-emerald-500 transition-all"
            style={{ width: `${shoppingItems.length > 0 ? (shoppingItems.filter(i => isPurchased(i.status)).length / shoppingItems.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {(["vendor", "room", "category"] as const).map(g => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={groupBy === g ? "tab-active" : "tab"}
            >
              By {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowPurchased(!showPurchased)}
          className="text-xs text-brand-600 hover:text-brand-900"
        >
          {showPurchased ? "Hide ordered" : "Show all"}
        </button>
      </div>

      {/* Grouped Items */}
      <div className="space-y-6">
        {Array.from(grouped.entries())
          .sort(([, a], [, b]) => b.reduce((s, i) => s + i.price * i.quantity, 0) - a.reduce((s, i) => s + i.price * i.quantity, 0))
          .map(([group, groupItems]) => {
            const filteredItems = showPurchased ? groupItems : groupItems.filter(i => !isPurchased(i.status));
            if (filteredItems.length === 0 && !showPurchased) return null;
            const groupTotal = groupItems.reduce((s, i) => s + i.price * i.quantity, 0);

            return (
              <div key={group} className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-brand-900 capitalize">{group}</h3>
                  <span className="text-sm text-brand-600">${groupTotal.toLocaleString()}</span>
                </div>

                <div className="divide-y divide-brand-900/5">
                  {(showPurchased ? groupItems : filteredItems).map(item => {
                    const purchased = isPurchased(item.status);
                    const meta = STATUS_META[item.status];
                    return (
                      <div
                        key={item.itemId}
                        className={`flex items-center gap-3 py-2.5 ${purchased ? "opacity-70" : ""}`}
                      >
                        <select
                          value={item.status}
                          onChange={(e) => setItemStatus(item.catalogId, e.target.value as FurnitureStatus)}
                          className={`shrink-0 text-[10px] font-semibold rounded px-1.5 py-1 border-0 cursor-pointer ${meta.bg} ${meta.color}`}
                          title="Procurement status"
                        >
                          {STATUS_ORDER.map(s => (
                            <option key={s} value={s}>{STATUS_META[s].label}</option>
                          ))}
                        </select>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${purchased ? "line-through text-brand-600" : "text-brand-900"}`}>
                              {item.name}
                            </span>
                            {item.quantity > 1 && (
                              <span className="text-[10px] bg-brand-900/5 rounded px-1.5 py-0.5">x{item.quantity}</span>
                            )}
                          </div>
                          <div className="text-[10px] text-brand-600/60">
                            {item.color} &middot; {item.material} &middot; {item.dimensions}
                            {item.rooms.length > 1 && ` (${item.rooms.join(", ")})`}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-sm font-medium text-brand-900">${(item.price * item.quantity).toLocaleString()}</div>
                          {item.vendorUrl && (
                            <a
                              href={item.vendorUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-amber-dark hover:underline"
                            >
                              Buy &rarr;
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function quote(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
