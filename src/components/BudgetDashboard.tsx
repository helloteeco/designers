"use client";

import { useState, useMemo } from "react";
import { saveProject, getProject as getProjectFromStore, logActivity } from "@/lib/store";
import { generateBudgetSuggestions, findAlternatives } from "@/lib/product-sourcing";
import { CATALOG } from "@/lib/furniture-catalog";
import type { Project, FurnitureCategory, BudgetSuggestion } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  "beds-mattresses": "Beds & Mattresses",
  seating: "Seating",
  tables: "Tables",
  storage: "Storage",
  lighting: "Lighting",
  decor: "Decor & Smart Home",
  "rugs-textiles": "Rugs & Textiles",
  outdoor: "Outdoor",
  "kitchen-dining": "Kitchen & Dining",
  bathroom: "Bathroom",
};

export default function BudgetDashboard({ project, onUpdate }: Props) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(project.budget.toString());

  const analysis = useMemo(() => {
    const totalSpent = project.rooms.reduce(
      (s, r) => s + r.furniture.reduce((fs, f) => fs + f.item.price * f.quantity, 0),
      0
    );
    const remaining = project.budget - totalSpent;
    const percentUsed = project.budget > 0 ? (totalSpent / project.budget) * 100 : 0;

    // By room
    const byRoom = project.rooms
      .map((r) => ({
        roomId: r.id,
        roomName: r.name,
        roomType: r.type,
        spent: r.furniture.reduce((s, f) => s + f.item.price * f.quantity, 0),
        itemCount: r.furniture.length,
      }))
      .filter((r) => r.spent > 0 || r.itemCount > 0)
      .sort((a, b) => b.spent - a.spent);

    // By category
    const catMap = new Map<string, number>();
    for (const room of project.rooms) {
      for (const f of room.furniture) {
        const cat = f.item.category;
        catMap.set(cat, (catMap.get(cat) ?? 0) + f.item.price * f.quantity);
      }
    }
    const byCategory = Array.from(catMap.entries())
      .map(([cat, spent]) => ({
        category: cat as FurnitureCategory,
        spent,
        percent: totalSpent > 0 ? (spent / totalSpent) * 100 : 0,
      }))
      .sort((a, b) => b.spent - a.spent);

    // By retailer
    const retMap = new Map<string, { spent: number; count: number }>();
    for (const room of project.rooms) {
      for (const f of room.furniture) {
        const v = f.item.vendor;
        const cur = retMap.get(v) ?? { spent: 0, count: 0 };
        cur.spent += f.item.price * f.quantity;
        cur.count += f.quantity;
        retMap.set(v, cur);
      }
    }
    const byRetailer = Array.from(retMap.entries())
      .map(([vendor, data]) => ({ vendor, ...data }))
      .sort((a, b) => b.spent - a.spent);

    return { totalSpent, remaining, percentUsed, byRoom, byCategory, byRetailer };
  }, [project]);

  const suggestions = useMemo(() => {
    if (!showSuggestions || analysis.remaining >= 0) return [];
    return generateBudgetSuggestions(project.rooms, Math.abs(analysis.remaining));
  }, [showSuggestions, project.rooms, analysis.remaining]);

  function saveBudget() {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    fresh.budget = parseInt(budgetInput) || 0;
    saveProject(fresh);
    logActivity(project.id, "budget_updated", `Budget set to $${fresh.budget.toLocaleString()}`);
    setEditingBudget(false);
    onUpdate();
  }

  function applySwap(suggestion: BudgetSuggestion) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    for (const room of fresh.rooms) {
      const idx = room.furniture.findIndex((f) => f.item.name === suggestion.currentProduct);
      if (idx >= 0) {
        const alt = findAlternatives(room.furniture[idx].item, 1);
        if (alt.length > 0) {
          const newItem = CATALOG.find((c) => c.id === alt[0].id);
          if (newItem) {
            room.furniture[idx] = {
              ...room.furniture[idx],
              item: newItem,
            };
          }
        }
        break;
      }
    }
    saveProject(fresh);
    logActivity(project.id, "budget_swap", `Swapped ${suggestion.currentProduct} -> ${suggestion.suggestedProduct}`);
    onUpdate();
  }

  const isOverBudget = project.budget > 0 && analysis.remaining < 0;
  const healthColor = isOverBudget
    ? "text-red-600"
    : analysis.percentUsed > 85
    ? "text-amber-dark"
    : "text-emerald-600";

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Budget Dashboard</h2>
          <p className="text-sm text-brand-600">
            Track spending, see where your money goes, and optimize to hit your target.
          </p>
        </div>
        {isOverBudget && (
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="btn-accent btn-sm"
          >
            {showSuggestions ? "Hide Suggestions" : "Fix Budget"}
          </button>
        )}
      </div>

      {/* Budget + Total */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="text-[10px] uppercase tracking-wider text-brand-600 font-semibold mb-1">
            Budget
          </div>
          {editingBudget ? (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-brand-600">$</span>
                <input
                  type="number"
                  className="input pl-7 py-1.5 text-sm"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveBudget()}
                  autoFocus
                />
              </div>
              <button onClick={saveBudget} className="btn-primary btn-sm text-[10px] px-2 py-1">Save</button>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-brand-900">
                {project.budget > 0 ? `$${project.budget.toLocaleString()}` : "Not set"}
              </span>
              <button
                onClick={() => { setEditingBudget(true); setBudgetInput(project.budget.toString()); }}
                className="text-xs text-amber-dark hover:underline"
              >
                Edit
              </button>
            </div>
          )}
        </div>

        <div className="card">
          <div className="text-[10px] uppercase tracking-wider text-brand-600 font-semibold mb-1">
            Total Spent
          </div>
          <div className="text-2xl font-bold text-brand-900">
            ${analysis.totalSpent.toLocaleString()}
          </div>
        </div>

        <div className="card">
          <div className="text-[10px] uppercase tracking-wider text-brand-600 font-semibold mb-1">
            Remaining
          </div>
          <div className={`text-2xl font-bold ${healthColor}`}>
            {project.budget > 0
              ? `${analysis.remaining >= 0 ? "" : "-"}$${Math.abs(analysis.remaining).toLocaleString()}`
              : "—"}
          </div>
          {project.budget > 0 && (
            <div className="mt-2">
              <div className="h-2 w-full rounded-full bg-brand-900/5">
                <div
                  className={`h-2 rounded-full transition-all ${
                    isOverBudget ? "bg-red-500" : analysis.percentUsed > 85 ? "bg-amber" : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(analysis.percentUsed, 100)}%` }}
                />
              </div>
              <div className="mt-0.5 text-[10px] text-brand-600">
                {Math.round(analysis.percentUsed)}% of budget used
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Budget swap suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="mb-6 card border-amber/30 bg-amber/5">
          <h3 className="font-semibold text-brand-900 mb-1">
            Budget Swap Suggestions
          </h3>
          <p className="text-xs text-brand-600 mb-4">
            Swap expensive items for affordable alternatives to get back on budget.
            Total possible savings: ${suggestions.reduce((s, sg) => s + sg.savings, 0).toLocaleString()}
          </p>
          <div className="space-y-2">
            {suggestions.map((sg, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-amber/20 bg-white px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-brand-600">{sg.room}</div>
                  <div className="text-sm">
                    <span className="line-through text-brand-600">{sg.currentProduct}</span>
                    <span className="mx-1 text-brand-600">→</span>
                    <span className="font-medium text-brand-900">{sg.suggestedProduct}</span>
                  </div>
                  <div className="text-xs text-brand-600">
                    ${sg.currentPrice.toLocaleString()} → ${sg.suggestedPrice.toLocaleString()}
                    <span className="ml-1 font-semibold text-emerald-600">
                      save ${sg.savings.toLocaleString()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => applySwap(sg)}
                  className="shrink-0 btn-sm btn-accent text-[10px]"
                >
                  Apply Swap
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* By Room */}
        <div className="card">
          <h3 className="font-semibold text-brand-900 mb-4">Spending by Room</h3>
          {analysis.byRoom.length === 0 ? (
            <p className="text-sm text-brand-600 text-center py-4">No items added yet.</p>
          ) : (
            <div className="space-y-3">
              {analysis.byRoom.map((r) => (
                <div key={r.roomId}>
                  <div className="flex justify-between text-sm mb-0.5">
                    <span className="text-brand-700">{r.roomName}</span>
                    <span className="font-medium text-brand-900">${r.spent.toLocaleString()}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-brand-900/5">
                    <div
                      className="h-2 rounded-full bg-sage transition-all"
                      style={{
                        width: `${analysis.totalSpent > 0 ? (r.spent / analysis.totalSpent) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <div className="text-[10px] text-brand-600 mt-0.5">
                    {r.itemCount} items
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Category */}
        <div className="card">
          <h3 className="font-semibold text-brand-900 mb-4">Spending by Category</h3>
          {analysis.byCategory.length === 0 ? (
            <p className="text-sm text-brand-600 text-center py-4">No items added yet.</p>
          ) : (
            <div className="space-y-3">
              {analysis.byCategory.map((c) => (
                <div key={c.category}>
                  <div className="flex justify-between text-sm mb-0.5">
                    <span className="text-brand-700">
                      {CATEGORY_LABELS[c.category] ?? c.category}
                    </span>
                    <span className="font-medium text-brand-900">
                      ${c.spent.toLocaleString()}
                      <span className="ml-1 text-brand-600 text-xs">
                        ({Math.round(c.percent)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-brand-900/5">
                    <div
                      className="h-2 rounded-full bg-amber transition-all"
                      style={{ width: `${c.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Retailer */}
        <div className="card lg:col-span-2">
          <h3 className="font-semibold text-brand-900 mb-4">Spending by Retailer</h3>
          {analysis.byRetailer.length === 0 ? (
            <p className="text-sm text-brand-600 text-center py-4">No items added yet.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {analysis.byRetailer.map((r) => (
                <div
                  key={r.vendor}
                  className="rounded-lg border border-brand-900/10 bg-cream/50 px-4 py-2.5"
                >
                  <div className="text-xs font-semibold text-brand-900">{r.vendor}</div>
                  <div className="text-sm font-bold text-brand-900">
                    ${r.spent.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-brand-600">{r.count} items</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
