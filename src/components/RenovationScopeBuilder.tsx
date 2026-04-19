"use client";

import { useState } from "react";
import { saveProject, getProject as getProjectFromStore, generateId, logActivity } from "@/lib/store";
import { TRADE_LABELS } from "@/lib/finishes-catalog";
import type { Project, ScopeItem, TradeType, RenovationScope as RenoScopeType } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

// Pre-built scope templates for common renovation types
const SCOPE_TEMPLATES: Record<RenoScopeType, Array<Omit<ScopeItem, "id" | "roomId" | "notes"> & { roomHint?: string }>> = {
  "cosmetic": [
    { description: "Paint all walls and ceilings", trade: "painter", laborHours: 16, materialCost: 400, laborCost: 1200 },
    { description: "Replace cabinet hardware", trade: "cabinet-maker", laborHours: 4, materialCost: 300, laborCost: 300 },
    { description: "Replace light fixtures", trade: "electrician", laborHours: 6, materialCost: 800, laborCost: 600 },
    { description: "Replace faucets", trade: "plumber", laborHours: 4, materialCost: 600, laborCost: 400 },
  ],
  "kitchen-remodel": [
    { description: "Demo existing kitchen (cabinets, counters, flooring)", trade: "general-contractor", laborHours: 24, materialCost: 200, laborCost: 1800, roomHint: "kitchen" },
    { description: "Electrical rough-in for new outlets + under-cabinet lighting", trade: "electrician", laborHours: 16, materialCost: 400, laborCost: 1600, roomHint: "kitchen" },
    { description: "Plumbing rough-in for sink + dishwasher relocation", trade: "plumber", laborHours: 12, materialCost: 300, laborCost: 1200, roomHint: "kitchen" },
    { description: "Install new cabinets", trade: "cabinet-maker", laborHours: 24, materialCost: 6000, laborCost: 2400, roomHint: "kitchen" },
    { description: "Template + install quartz countertops", trade: "general-contractor", laborHours: 8, materialCost: 3500, laborCost: 800, roomHint: "kitchen" },
    { description: "Install backsplash tile", trade: "tile-installer", laborHours: 12, materialCost: 500, laborCost: 1200, roomHint: "kitchen" },
    { description: "Install kitchen flooring (LVP)", trade: "flooring-installer", laborHours: 8, materialCost: 800, laborCost: 800, roomHint: "kitchen" },
    { description: "Paint kitchen walls + ceiling", trade: "painter", laborHours: 6, materialCost: 150, laborCost: 450, roomHint: "kitchen" },
    { description: "Install new lighting fixtures + pendants", trade: "electrician", laborHours: 4, materialCost: 600, laborCost: 400, roomHint: "kitchen" },
    { description: "Install appliances + connect", trade: "plumber", laborHours: 4, materialCost: 0, laborCost: 400, roomHint: "kitchen" },
  ],
  "bathroom-remodel": [
    { description: "Demo existing bathroom (tile, tub, vanity, toilet)", trade: "general-contractor", laborHours: 16, materialCost: 200, laborCost: 1200, roomHint: "bathroom" },
    { description: "Plumbing rough-in for new shower/tub + toilet", trade: "plumber", laborHours: 16, materialCost: 600, laborCost: 1600, roomHint: "bathroom" },
    { description: "Electrical rough-in for vanity lights + exhaust fan", trade: "electrician", laborHours: 6, materialCost: 300, laborCost: 600, roomHint: "bathroom" },
    { description: "Install shower pan + waterproofing", trade: "tile-installer", laborHours: 8, materialCost: 400, laborCost: 800, roomHint: "bathroom" },
    { description: "Install shower tile + floor tile", trade: "tile-installer", laborHours: 24, materialCost: 1200, laborCost: 2400, roomHint: "bathroom" },
    { description: "Install vanity + countertop", trade: "general-contractor", laborHours: 6, materialCost: 1200, laborCost: 600, roomHint: "bathroom" },
    { description: "Install toilet, tub, faucets, accessories", trade: "plumber", laborHours: 8, materialCost: 1500, laborCost: 800, roomHint: "bathroom" },
    { description: "Install vanity light + exhaust fan", trade: "electrician", laborHours: 3, materialCost: 400, laborCost: 300, roomHint: "bathroom" },
    { description: "Paint bathroom walls + ceiling", trade: "painter", laborHours: 4, materialCost: 80, laborCost: 300, roomHint: "bathroom" },
    { description: "Install door + hardware", trade: "carpenter", laborHours: 3, materialCost: 300, laborCost: 300, roomHint: "bathroom" },
  ],
  "full-gut": [
    { description: "Obtain permits", trade: "general-contractor", laborHours: 8, materialCost: 2000, laborCost: 800 },
    { description: "Full demo — interior walls, flooring, fixtures, cabinets", trade: "general-contractor", laborHours: 80, materialCost: 500, laborCost: 6000 },
    { description: "Frame new interior layout", trade: "carpenter", laborHours: 60, materialCost: 3000, laborCost: 4500 },
    { description: "Electrical rewire throughout", trade: "electrician", laborHours: 60, materialCost: 3500, laborCost: 6000 },
    { description: "Plumbing repipe throughout", trade: "plumber", laborHours: 60, materialCost: 4000, laborCost: 6000 },
    { description: "HVAC duct + unit install", trade: "hvac", laborHours: 40, materialCost: 8000, laborCost: 4000 },
    { description: "Insulation + drywall", trade: "drywall", laborHours: 40, materialCost: 2500, laborCost: 3000 },
    { description: "Flooring install throughout", trade: "flooring-installer", laborHours: 40, materialCost: 4000, laborCost: 4000 },
    { description: "Kitchen + bath tile install", trade: "tile-installer", laborHours: 60, materialCost: 3000, laborCost: 6000 },
    { description: "Paint entire interior", trade: "painter", laborHours: 40, materialCost: 800, laborCost: 3000 },
    { description: "Install all cabinetry + built-ins", trade: "cabinet-maker", laborHours: 40, materialCost: 12000, laborCost: 4000 },
    { description: "Install all fixtures, appliances, hardware", trade: "handyman", laborHours: 16, materialCost: 0, laborCost: 1200 },
  ],
  "addition": [
    { description: "Permits + architectural drawings", trade: "general-contractor", laborHours: 16, materialCost: 4000, laborCost: 1600 },
    { description: "Foundation + concrete", trade: "general-contractor", laborHours: 40, materialCost: 6000, laborCost: 4000 },
    { description: "Framing + roofing", trade: "carpenter", laborHours: 60, materialCost: 8000, laborCost: 4500 },
    { description: "Windows + exterior doors", trade: "carpenter", laborHours: 16, materialCost: 4000, laborCost: 1200 },
    { description: "Electrical rough + finish", trade: "electrician", laborHours: 30, materialCost: 2000, laborCost: 3000 },
    { description: "Plumbing rough + finish", trade: "plumber", laborHours: 20, materialCost: 1500, laborCost: 2000 },
    { description: "HVAC tie-in", trade: "hvac", laborHours: 16, materialCost: 2000, laborCost: 1600 },
    { description: "Insulation + drywall", trade: "drywall", laborHours: 20, materialCost: 1200, laborCost: 1500 },
    { description: "Flooring", trade: "flooring-installer", laborHours: 8, materialCost: 800, laborCost: 800 },
    { description: "Paint + trim", trade: "painter", laborHours: 12, materialCost: 300, laborCost: 900 },
  ],
  "flooring-only": [
    { description: "Remove existing flooring", trade: "flooring-installer", laborHours: 8, materialCost: 100, laborCost: 600 },
    { description: "Floor prep (leveling, moisture barrier)", trade: "flooring-installer", laborHours: 6, materialCost: 300, laborCost: 450 },
    { description: "Install new flooring", trade: "flooring-installer", laborHours: 20, materialCost: 3000, laborCost: 2000 },
    { description: "Install transitions + baseboards", trade: "carpenter", laborHours: 6, materialCost: 200, laborCost: 450 },
  ],
  "paint-only": [
    { description: "Prep walls (patch, sand, prime)", trade: "painter", laborHours: 8, materialCost: 200, laborCost: 600 },
    { description: "Paint all walls (2 coats)", trade: "painter", laborHours: 24, materialCost: 400, laborCost: 1800 },
    { description: "Paint trim + doors", trade: "painter", laborHours: 12, materialCost: 100, laborCost: 900 },
    { description: "Paint ceilings", trade: "painter", laborHours: 10, materialCost: 150, laborCost: 750 },
  ],
};

const TEMPLATE_LABELS: Record<RenoScopeType, string> = {
  "cosmetic": "Cosmetic Refresh",
  "kitchen-remodel": "Kitchen Remodel",
  "bathroom-remodel": "Bathroom Remodel",
  "full-gut": "Full Gut Renovation",
  "addition": "Home Addition",
  "flooring-only": "Flooring Only",
  "paint-only": "Paint Only",
};

export default function RenovationScopeBuilder({ project, onUpdate }: Props) {
  const [showTemplate, setShowTemplate] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customForm, setCustomForm] = useState({
    description: "", trade: "general-contractor" as TradeType, roomId: "",
    laborHours: 0, materialCost: 0, laborCost: 0, notes: "",
  });

  const scope = project.scope ?? [];
  const finishes = project.finishes ?? [];
  const team = project.team ?? [];

  const totalLabor = scope.reduce((s, item) => s + item.laborCost, 0);
  const totalMaterial = scope.reduce((s, item) => s + item.materialCost, 0) + finishes.reduce((s, f) => s + f.item.price * f.quantity, 0);
  const totalHours = scope.reduce((s, item) => s + item.laborHours, 0);
  const grandTotal = totalLabor + totalMaterial;

  // Group by trade
  const byTrade = new Map<TradeType, ScopeItem[]>();
  for (const item of scope) {
    const list = byTrade.get(item.trade) ?? [];
    list.push(item);
    byTrade.set(item.trade, list);
  }

  function applyTemplate(template: RenoScopeType) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    if (!fresh.scope) fresh.scope = [];
    if (!fresh.renovationScope) fresh.renovationScope = [];

    const items = SCOPE_TEMPLATES[template];
    for (const tmpl of items) {
      // Try to match roomHint to an actual room
      let roomId = "";
      if (tmpl.roomHint) {
        const match = fresh.rooms.find(r => r.type.includes(tmpl.roomHint!) || r.name.toLowerCase().includes(tmpl.roomHint!));
        if (match) roomId = match.id;
      }
      fresh.scope.push({
        id: generateId(),
        description: tmpl.description,
        roomId,
        trade: tmpl.trade,
        laborHours: tmpl.laborHours,
        materialCost: tmpl.materialCost,
        laborCost: tmpl.laborCost,
        notes: "",
      });
    }

    if (!fresh.renovationScope.includes(template)) {
      fresh.renovationScope.push(template);
    }
    fresh.projectType = "renovation";

    saveProject(fresh);
    logActivity(project.id, "scope_template_applied", `Applied ${TEMPLATE_LABELS[template]} template (${items.length} scope items)`);
    setShowTemplate(false);
    onUpdate();
  }

  function addCustomItem(e: React.FormEvent) {
    e.preventDefault();
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    // If a roomId was picked, make sure it still exists. Otherwise fall back
    // to whole-home scope so the item isn't orphaned pointing at a deleted room.
    const validRoomId =
      customForm.roomId && fresh.rooms.some(r => r.id === customForm.roomId)
        ? customForm.roomId
        : "";
    if (!fresh.scope) fresh.scope = [];
    fresh.scope.push({
      id: generateId(),
      description: customForm.description,
      roomId: validRoomId,
      trade: customForm.trade,
      laborHours: customForm.laborHours,
      materialCost: customForm.materialCost,
      laborCost: customForm.laborCost,
      notes: customForm.notes,
    });
    saveProject(fresh);
    setShowCustom(false);
    setCustomForm({
      description: "", trade: "general-contractor", roomId: "",
      laborHours: 0, materialCost: 0, laborCost: 0, notes: "",
    });
    onUpdate();
  }

  function removeItem(id: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    fresh.scope = (fresh.scope ?? []).filter(s => s.id !== id);
    saveProject(fresh);
    onUpdate();
  }

  function exportScope() {
    const lines: string[] = [];
    lines.push("═".repeat(70));
    lines.push(`RENOVATION SCOPE OF WORK`);
    lines.push(`Project: ${project.name}`);
    lines.push(`Property: ${project.property.address}, ${project.property.city}, ${project.property.state}`);
    lines.push(`Date: ${new Date().toLocaleDateString()}`);
    lines.push("═".repeat(70));
    lines.push("");

    // By trade
    for (const [trade, items] of Array.from(byTrade.entries())) {
      const tradeLabor = items.reduce((s, i) => s + i.laborCost, 0);
      const tradeMaterial = items.reduce((s, i) => s + i.materialCost, 0);
      const tradeHours = items.reduce((s, i) => s + i.laborHours, 0);
      const tradeMember = team.find(m => m.role === trade);
      const tradeFinishes = finishes.filter(f => f.item.trade === trade);

      lines.push(`${TRADE_LABELS[trade].toUpperCase()}`);
      lines.push("─".repeat(50));
      if (tradeMember) {
        lines.push(`Assigned to: ${tradeMember.name}${tradeMember.company ? ` (${tradeMember.company})` : ""}`);
        lines.push(`Contact: ${tradeMember.email || "—"} · ${tradeMember.phone || "—"}`);
      } else {
        lines.push(`Assigned to: [UNASSIGNED — find a ${TRADE_LABELS[trade]}]`);
      }
      lines.push("");

      lines.push("SCOPE ITEMS:");
      for (const item of items) {
        const room = project.rooms.find(r => r.id === item.roomId);
        lines.push(`  ☐ ${item.description}${room ? ` (${room.name})` : ""}`);
        lines.push(`    Labor: ${item.laborHours}h @ $${item.laborCost} · Material: $${item.materialCost}`);
        if (item.notes) lines.push(`    Notes: ${item.notes}`);
      }

      if (tradeFinishes.length > 0) {
        lines.push("");
        lines.push("FINISHES/MATERIALS SPEC'D:");
        for (const f of tradeFinishes) {
          const room = project.rooms.find(r => r.id === f.roomId);
          lines.push(`  • ${f.item.name} (${f.quantity} ${f.item.unit}) — $${(f.item.price * f.quantity).toFixed(2)}`);
          lines.push(`    ${f.item.vendor} · ${f.item.color} · ${f.item.finish}${room ? ` · for ${room.name}` : ""}`);
          if (f.item.vendorSku) lines.push(`    SKU: ${f.item.vendorSku}`);
        }
      }

      lines.push("");
      lines.push(`TRADE SUBTOTAL: ${tradeHours}h labor · $${tradeLabor.toLocaleString()} labor + $${tradeMaterial.toLocaleString()} materials = $${(tradeLabor + tradeMaterial).toLocaleString()}`);
      lines.push("");
      lines.push("");
    }

    lines.push("═".repeat(70));
    lines.push(`PROJECT TOTALS`);
    lines.push("─".repeat(50));
    lines.push(`Total Labor Hours: ${totalHours}h`);
    lines.push(`Total Labor: $${totalLabor.toLocaleString()}`);
    lines.push(`Total Materials/Finishes: $${totalMaterial.toLocaleString()}`);
    lines.push(`GRAND TOTAL: $${grandTotal.toLocaleString()}`);
    lines.push("");

    if (project.renovationBudget) {
      const delta = grandTotal - project.renovationBudget;
      lines.push(`Budget: $${project.renovationBudget.toLocaleString()}`);
      lines.push(`Variance: ${delta > 0 ? "OVER" : "UNDER"} by $${Math.abs(delta).toLocaleString()}`);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, "-")}-scope-of-work.txt`;
    a.click();
    URL.revokeObjectURL(url);
    logActivity(project.id, "scope_exported", "Exported renovation scope of work");
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Renovation Scope of Work</h2>
          <p className="text-sm text-brand-600">
            Build contractor-ready scope documents. Combine template items with your selected finishes
            into a bid-ready package.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTemplate(true)} className="btn-secondary btn-sm">
            + Apply Template
          </button>
          <button onClick={() => setShowCustom(true)} className="btn-secondary btn-sm">
            + Add Line Item
          </button>
          {scope.length > 0 && (
            <button onClick={exportScope} className="btn-primary btn-sm">
              Export Scope Doc
            </button>
          )}
        </div>
      </div>

      {/* Totals */}
      {scope.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="card py-2 px-3">
            <div className="text-[10px] uppercase tracking-wider text-brand-600">Total Hours</div>
            <div className="text-xl font-bold text-brand-900">{totalHours}h</div>
          </div>
          <div className="card py-2 px-3">
            <div className="text-[10px] uppercase tracking-wider text-brand-600">Labor</div>
            <div className="text-xl font-bold text-brand-900">${totalLabor.toLocaleString()}</div>
          </div>
          <div className="card py-2 px-3">
            <div className="text-[10px] uppercase tracking-wider text-brand-600">Materials</div>
            <div className="text-xl font-bold text-brand-900">${totalMaterial.toLocaleString()}</div>
          </div>
          <div className="card py-2 px-3 border-amber/40">
            <div className="text-[10px] uppercase tracking-wider text-brand-600">Grand Total</div>
            <div className="text-xl font-bold text-amber-dark">${grandTotal.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {scope.length === 0 && (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">🏗️</div>
          <p className="text-brand-600 mb-2">No scope items yet.</p>
          <p className="text-xs text-brand-600/60 max-w-md mx-auto mb-4">
            Apply a pre-built template (kitchen remodel, bathroom remodel, cosmetic refresh, etc.)
            or add custom line items for your renovation.
          </p>
          <button onClick={() => setShowTemplate(true)} className="btn-primary">
            Start with Template
          </button>
        </div>
      )}

      {/* Scope by trade */}
      {scope.length > 0 && (
        <div className="space-y-4">
          {Array.from(byTrade.entries()).map(([trade, items]) => {
            const tradeTotal = items.reduce((s, i) => s + i.laborCost + i.materialCost, 0);
            const member = team.find(m => m.role === trade);

            return (
              <div key={trade} className="card">
                <div className="flex items-start justify-between mb-3 pb-3 border-b border-brand-900/5">
                  <div>
                    <h3 className="font-semibold text-brand-900">{TRADE_LABELS[trade]}</h3>
                    {member ? (
                      <div className="text-xs text-brand-600">
                        {member.name}{member.company && ` (${member.company})`}
                      </div>
                    ) : (
                      <div className="text-xs text-red-500">
                        Not assigned — add a {TRADE_LABELS[trade]} in the Team tab
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-brand-900">${tradeTotal.toLocaleString()}</div>
                    <div className="text-[10px] text-brand-600">{items.length} items</div>
                  </div>
                </div>

                <div className="space-y-2">
                  {items.map(item => {
                    const room = project.rooms.find(r => r.id === item.roomId);
                    return (
                      <div key={item.id} className="flex items-start gap-3 py-1 group">
                        <div className="flex-1">
                          <div className="text-sm text-brand-900">
                            {item.description}
                            {room && <span className="text-xs text-brand-600 ml-2">📍 {room.name}</span>}
                          </div>
                          <div className="text-[10px] text-brand-600 mt-0.5">
                            {item.laborHours}h labor · ${item.laborCost} labor + ${item.materialCost} materials
                          </div>
                          {item.notes && <div className="text-[10px] text-brand-700 italic mt-0.5">{item.notes}</div>}
                        </div>
                        <div className="text-sm font-medium shrink-0">${(item.laborCost + item.materialCost).toLocaleString()}</div>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Template Modal */}
      {showTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Apply Renovation Template</h2>
            <p className="text-sm text-brand-600 mb-4">
              Pre-built scope templates based on common renovation types. Labor hours and costs are averages — adjust after applying.
            </p>

            <div className="grid gap-2">
              {(Object.keys(SCOPE_TEMPLATES) as RenoScopeType[]).map(key => {
                const items = SCOPE_TEMPLATES[key];
                const templateTotal = items.reduce((s, i) => s + i.laborCost + i.materialCost, 0);
                const templateHours = items.reduce((s, i) => s + i.laborHours, 0);
                return (
                  <button
                    key={key}
                    onClick={() => applyTemplate(key)}
                    className="flex items-center justify-between rounded-xl border border-brand-900/10 px-4 py-3 text-left hover:border-amber hover:bg-amber/5 transition"
                  >
                    <div>
                      <div className="font-medium text-brand-900">{TEMPLATE_LABELS[key]}</div>
                      <div className="text-xs text-brand-600">{items.length} scope items · {templateHours}h labor</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-brand-900">~${templateTotal.toLocaleString()}</div>
                      <div className="text-[10px] text-brand-600">avg total</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-brand-900/10 flex justify-end">
              <button onClick={() => setShowTemplate(false)} className="btn-secondary btn-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Item Modal */}
      {showCustom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Add Scope Line Item</h2>
            <form onSubmit={addCustomItem} className="space-y-4">
              <div>
                <label className="label">Description</label>
                <input
                  className="input"
                  value={customForm.description}
                  onChange={e => setCustomForm({ ...customForm, description: e.target.value })}
                  placeholder="e.g. Demo existing backsplash and prep wall"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Trade</label>
                  <select
                    className="select"
                    value={customForm.trade}
                    onChange={e => setCustomForm({ ...customForm, trade: e.target.value as TradeType })}
                  >
                    {Object.entries(TRADE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Room</label>
                  <select
                    className="select"
                    value={customForm.roomId}
                    onChange={e => setCustomForm({ ...customForm, roomId: e.target.value })}
                  >
                    <option value="">Whole home / multi-room</option>
                    {project.rooms.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Labor Hours</label>
                  <input
                    type="number"
                    className="input"
                    value={customForm.laborHours}
                    onChange={e => setCustomForm({ ...customForm, laborHours: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="label">Labor Cost</label>
                  <input
                    type="number"
                    className="input"
                    value={customForm.laborCost}
                    onChange={e => setCustomForm({ ...customForm, laborCost: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="label">Material Cost</label>
                  <input
                    type="number"
                    className="input"
                    value={customForm.materialCost}
                    onChange={e => setCustomForm({ ...customForm, materialCost: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div>
                <label className="label">Notes (optional)</label>
                <textarea
                  className="input min-h-[60px]"
                  value={customForm.notes}
                  onChange={e => setCustomForm({ ...customForm, notes: e.target.value })}
                  placeholder="Special requirements, materials to use, dependencies..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCustom(false)} className="btn-secondary btn-sm">Cancel</button>
                <button type="submit" className="btn-primary btn-sm">Add Item</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
