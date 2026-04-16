"use client";

import { useState } from "react";
import { logActivity } from "@/lib/store";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
}

interface ShoppingItem {
  itemId: string;
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
  purchased: boolean;
}

export default function ShoppingList({ project }: Props) {
  const [groupBy, setGroupBy] = useState<"vendor" | "room" | "category">("vendor");
  const [purchased, setPurchased] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`shopping_${project.id}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [showPurchased, setShowPurchased] = useState(false);

  // Build shopping list from all rooms
  const items: ShoppingItem[] = [];
  for (const room of project.rooms) {
    for (const f of room.furniture) {
      items.push({
        itemId: `${room.id}-${f.item.id}`,
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
        purchased: purchased.has(`${room.id}-${f.item.id}`),
      });
    }
  }

  // Deduplicate by item name + vendor (combine quantities across rooms)
  const deduped = new Map<string, ShoppingItem & { rooms: string[] }>();
  for (const item of items) {
    const key = `${item.name}-${item.vendor}`;
    if (deduped.has(key)) {
      const existing = deduped.get(key)!;
      existing.quantity += item.quantity;
      existing.rooms.push(item.room);
    } else {
      deduped.set(key, { ...item, rooms: [item.room] });
    }
  }
  const shoppingItems = Array.from(deduped.values());

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
  const purchasedCost = shoppingItems.filter(i => i.purchased).reduce((s, i) => s + i.price * i.quantity, 0);
  const totalQuantity = shoppingItems.reduce((s, i) => s + i.quantity, 0);

  function togglePurchased(itemId: string) {
    const updated = new Set(purchased);
    if (updated.has(itemId)) {
      updated.delete(itemId);
    } else {
      updated.add(itemId);
    }
    setPurchased(updated);
    localStorage.setItem(`shopping_${project.id}`, JSON.stringify([...updated]));
  }

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

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="card py-3 px-4 text-center">
          <div className="text-2xl font-bold text-brand-900">{totalQuantity}</div>
          <div className="text-[10px] text-brand-600">Total Items</div>
        </div>
        <div className="card py-3 px-4 text-center">
          <div className="text-2xl font-bold text-brand-900">${totalCost.toLocaleString()}</div>
          <div className="text-[10px] text-brand-600">Total Cost</div>
        </div>
        <div className="card py-3 px-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">${purchasedCost.toLocaleString()}</div>
          <div className="text-[10px] text-brand-600">Purchased</div>
        </div>
        <div className="card py-3 px-4 text-center">
          <div className="text-2xl font-bold text-amber-dark">${(totalCost - purchasedCost).toLocaleString()}</div>
          <div className="text-[10px] text-brand-600">Remaining</div>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-brand-600 mb-1">
          <span>Procurement Progress</span>
          <span>{shoppingItems.filter(i => i.purchased).length}/{shoppingItems.length} purchased</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-brand-900/5">
          <div
            className="h-2.5 rounded-full bg-emerald-500 transition-all"
            style={{ width: `${shoppingItems.length > 0 ? (shoppingItems.filter(i => i.purchased).length / shoppingItems.length) * 100 : 0}%` }}
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
          {showPurchased ? "Hide" : "Show"} Purchased
        </button>
      </div>

      {/* Grouped Items */}
      <div className="space-y-6">
        {Array.from(grouped.entries())
          .sort(([, a], [, b]) => b.reduce((s, i) => s + i.price * i.quantity, 0) - a.reduce((s, i) => s + i.price * i.quantity, 0))
          .map(([group, groupItems]) => {
            const filteredItems = showPurchased ? groupItems : groupItems.filter(i => !i.purchased);
            if (filteredItems.length === 0 && !showPurchased) return null;
            const groupTotal = groupItems.reduce((s, i) => s + i.price * i.quantity, 0);

            return (
              <div key={group} className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-brand-900 capitalize">{group}</h3>
                  <span className="text-sm text-brand-600">${groupTotal.toLocaleString()}</span>
                </div>

                <div className="divide-y divide-brand-900/5">
                  {(showPurchased ? groupItems : filteredItems).map(item => (
                    <div
                      key={item.itemId}
                      className={`flex items-center gap-3 py-2.5 ${item.purchased ? "opacity-50" : ""}`}
                    >
                      <button
                        onClick={() => togglePurchased(item.itemId)}
                        className={`flex h-5 w-5 items-center justify-center rounded border shrink-0 transition ${
                          item.purchased
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : "border-brand-900/20 hover:border-amber"
                        }`}
                      >
                        {item.purchased && <span className="text-xs">&#10003;</span>}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${item.purchased ? "line-through text-brand-600" : "text-brand-900"}`}>
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
                  ))}
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
