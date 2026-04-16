"use client";

import { useState } from "react";
import { saveProject, getProject as getProjectFromStore, logActivity } from "@/lib/store";
import {
  FINISHES_CATALOG,
  FINISH_CATEGORY_LABELS,
  TRADE_LABELS,
  getFinishesByCategory,
  searchFinishes,
} from "@/lib/finishes-catalog";
import type { Project, FinishItem, FinishCategory, SelectedFinish } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

const STATUS_COLORS: Record<SelectedFinish["status"], string> = {
  "spec'd": "bg-gray-100 text-gray-700",
  "approved": "bg-blue-100 text-blue-700",
  "ordered": "bg-amber-100 text-amber-700",
  "delivered": "bg-purple-100 text-purple-700",
  "installed": "bg-emerald-100 text-emerald-700",
};

export default function FinishesPicker({ project, onUpdate }: Props) {
  const [category, setCategory] = useState<FinishCategory | "all">("all");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"catalog" | "selected" | "by-trade">("catalog");

  const finishes = project.finishes ?? [];
  const team = project.team ?? [];

  const filteredCatalog = search.trim()
    ? searchFinishes(search)
    : category === "all"
      ? FINISHES_CATALOG
      : getFinishesByCategory(category);

  const filteredSelections = selectedRoomId === "all"
    ? finishes
    : finishes.filter(f => f.roomId === selectedRoomId);

  const totalMaterialCost = finishes.reduce((s, f) => s + f.item.price * f.quantity, 0);
  const orderedCost = finishes
    .filter(f => ["ordered", "delivered", "installed"].includes(f.status))
    .reduce((s, f) => s + f.item.price * f.quantity, 0);

  function addFinish(item: FinishItem, roomId: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    if (!fresh.finishes) fresh.finishes = [];

    // Check if already selected for this room
    const existing = fresh.finishes.find(f => f.item.id === item.id && f.roomId === roomId);
    if (existing) {
      existing.quantity += 1;
    } else {
      fresh.finishes.push({
        item,
        quantity: 1,
        roomId,
        status: "spec'd",
        notes: "",
      });
    }
    saveProject(fresh);
    logActivity(project.id, "finish_added", `Added ${item.name} to ${fresh.rooms.find(r => r.id === roomId)?.name ?? "room"}`);
    onUpdate();
  }

  function removeFinish(itemId: string, roomId: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    fresh.finishes = (fresh.finishes ?? []).filter(f => !(f.item.id === itemId && f.roomId === roomId));
    saveProject(fresh);
    onUpdate();
  }

  function updateFinishStatus(itemId: string, roomId: string, status: SelectedFinish["status"]) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const f = (fresh.finishes ?? []).find(f => f.item.id === itemId && f.roomId === roomId);
    if (!f) return;
    f.status = status;
    saveProject(fresh);
    logActivity(project.id, "finish_status", `${f.item.name} → ${status}`);
    onUpdate();
  }

  function assignInstaller(itemId: string, roomId: string, memberId: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const f = (fresh.finishes ?? []).find(f => f.item.id === itemId && f.roomId === roomId);
    if (!f) return;
    f.assignedTo = memberId || undefined;
    saveProject(fresh);
    onUpdate();
  }

  function updateQuantity(itemId: string, roomId: string, qty: number) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const f = (fresh.finishes ?? []).find(f => f.item.id === itemId && f.roomId === roomId);
    if (!f) return;
    f.quantity = Math.max(1, qty);
    saveProject(fresh);
    onUpdate();
  }

  // Group by trade for the "By Trade" view
  const byTrade = new Map<string, SelectedFinish[]>();
  for (const f of finishes) {
    const list = byTrade.get(f.item.trade) ?? [];
    list.push(f);
    byTrade.set(f.item.trade, list);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Finishes &amp; Materials</h2>
          <p className="text-sm text-brand-600">
            Spec tile, faucets, paint, flooring, hardware, and fixtures for renovations.
            Assign installers and track order status.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView("catalog")}
            className={view === "catalog" ? "tab-active" : "tab"}
          >
            Catalog
          </button>
          <button
            onClick={() => setView("selected")}
            className={view === "selected" ? "tab-active" : "tab"}
          >
            Selections ({finishes.length})
          </button>
          <button
            onClick={() => setView("by-trade")}
            className={view === "by-trade" ? "tab-active" : "tab"}
          >
            By Trade
          </button>
        </div>
      </div>

      {/* Stats */}
      {finishes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="card py-2 px-3">
            <div className="text-[10px] uppercase tracking-wider text-brand-600">Items Spec'd</div>
            <div className="text-xl font-bold text-brand-900">{finishes.length}</div>
          </div>
          <div className="card py-2 px-3">
            <div className="text-[10px] uppercase tracking-wider text-brand-600">Material Cost</div>
            <div className="text-xl font-bold text-brand-900">${totalMaterialCost.toLocaleString()}</div>
          </div>
          <div className="card py-2 px-3">
            <div className="text-[10px] uppercase tracking-wider text-brand-600">Ordered</div>
            <div className="text-xl font-bold text-amber-dark">${orderedCost.toLocaleString()}</div>
          </div>
          <div className="card py-2 px-3">
            <div className="text-[10px] uppercase tracking-wider text-brand-600">Trades Needed</div>
            <div className="text-xl font-bold text-brand-900">{byTrade.size}</div>
          </div>
        </div>
      )}

      {/* CATALOG VIEW */}
      {view === "catalog" && (
        <div>
          <div className="grid gap-3 mb-4 sm:grid-cols-2">
            <input
              className="input"
              placeholder="Search finishes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {!search && (
              <select
                className="select"
                value={category}
                onChange={e => setCategory(e.target.value as FinishCategory | "all")}
              >
                <option value="all">All Categories</option>
                {Object.entries(FINISH_CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            )}
          </div>

          <div className="text-xs text-brand-600 mb-3">{filteredCatalog.length} items</div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCatalog.map(item => {
              const selectedCount = finishes.filter(f => f.item.id === item.id).length;
              return (
                <div key={item.id} className="card">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-brand-900 text-sm leading-tight">{item.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-brand-600/60">{item.vendor}</span>
                        <span className="badge-neutral text-[9px] capitalize">
                          {FINISH_CATEGORY_LABELS[item.category]}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <div className="text-sm font-bold text-brand-900">${item.price}</div>
                      <div className="text-[9px] text-brand-600/60">per {item.unit}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 mb-3">
                    <span className="text-[9px] text-brand-600">{item.color}</span>
                    <span className="text-[9px] text-brand-600/40">•</span>
                    <span className="text-[9px] text-brand-600">{item.finish}</span>
                    <span className="text-[9px] text-brand-600/40">•</span>
                    <span className="text-[9px] text-brand-600">{item.material}</span>
                  </div>

                  {item.notes && (
                    <p className="text-[11px] text-brand-700 mb-3 leading-snug">{item.notes}</p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-brand-900/5">
                    <div className="text-[10px] text-brand-600">
                      <span className="font-medium">{TRADE_LABELS[item.trade]}</span>
                      {item.leadTimeDays && <span> · {item.leadTimeDays}d lead</span>}
                    </div>
                    {project.rooms.length > 0 ? (
                      <div className="relative group">
                        <button className="btn-secondary btn-sm text-xs">
                          {selectedCount > 0 ? `Add (${selectedCount})` : "+ Add"}
                        </button>
                        <div className="hidden group-hover:block absolute right-0 bottom-full mb-1 z-20 w-48 rounded-lg border border-brand-900/10 bg-white shadow-lg py-1">
                          {project.rooms.map(r => (
                            <button
                              key={r.id}
                              onClick={() => addFinish(item, r.id)}
                              className="block w-full text-left px-3 py-1.5 text-xs text-brand-700 hover:bg-brand-900/5"
                            >
                              {r.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[10px] text-brand-600/60">Add rooms first</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SELECTIONS VIEW */}
      {view === "selected" && (
        <div>
          {finishes.length === 0 ? (
            <div className="card text-center py-12">
              <div className="text-4xl mb-3">🔧</div>
              <p className="text-brand-600 mb-2">No finishes selected yet.</p>
              <p className="text-xs text-brand-600/60">Browse the catalog and add items for your renovation.</p>
            </div>
          ) : (
            <>
              <select
                className="select mb-4 max-w-xs text-xs"
                value={selectedRoomId}
                onChange={e => setSelectedRoomId(e.target.value)}
              >
                <option value="all">All Rooms</option>
                {project.rooms.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>

              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-brand-900/10 text-left">
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-brand-600">Room</th>
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-brand-600">Item</th>
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-brand-600">Qty</th>
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-brand-600">Installer</th>
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-brand-600">Status</th>
                      <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wider text-brand-600 text-right">Cost</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSelections.map(f => {
                      const room = project.rooms.find(r => r.id === f.roomId);
                      return (
                        <tr key={`${f.roomId}-${f.item.id}`} className="border-b border-brand-900/5 last:border-0">
                          <td className="py-2 pr-3 text-brand-600">{room?.name ?? "—"}</td>
                          <td className="py-2 pr-3">
                            <div className="font-medium text-brand-900">{f.item.name}</div>
                            <div className="text-[10px] text-brand-600">{f.item.vendor} · {TRADE_LABELS[f.item.trade]}</div>
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              className="input w-16 text-xs"
                              value={f.quantity}
                              onChange={e => updateQuantity(f.item.id, f.roomId, parseInt(e.target.value) || 1)}
                              min={1}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            {team.filter(m => m.role === f.item.trade).length > 0 ? (
                              <select
                                className="select text-xs"
                                value={f.assignedTo ?? ""}
                                onChange={e => assignInstaller(f.item.id, f.roomId, e.target.value)}
                              >
                                <option value="">Unassigned</option>
                                {team.filter(m => m.role === f.item.trade).map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[10px] text-brand-600/60">No {TRADE_LABELS[f.item.trade]} assigned</span>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <select
                              className={`text-xs rounded px-2 py-1 border-0 ${STATUS_COLORS[f.status]}`}
                              value={f.status}
                              onChange={e => updateFinishStatus(f.item.id, f.roomId, e.target.value as SelectedFinish["status"])}
                            >
                              <option value="spec'd">Spec'd</option>
                              <option value="approved">Approved</option>
                              <option value="ordered">Ordered</option>
                              <option value="delivered">Delivered</option>
                              <option value="installed">Installed</option>
                            </select>
                          </td>
                          <td className="py-2 pr-3 text-right font-medium">
                            ${(f.item.price * f.quantity).toLocaleString()}
                          </td>
                          <td className="py-2">
                            <button
                              onClick={() => removeFinish(f.item.id, f.roomId)}
                              className="text-xs text-red-400 hover:text-red-600"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-brand-900/20">
                      <td colSpan={5} className="py-3 text-right font-semibold text-brand-900">Total Material Cost</td>
                      <td className="py-3 text-right text-lg font-bold text-brand-900">${totalMaterialCost.toLocaleString()}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* BY TRADE VIEW */}
      {view === "by-trade" && (
        <div>
          {byTrade.size === 0 ? (
            <div className="card text-center py-12">
              <p className="text-brand-600">No finishes to organize by trade yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Array.from(byTrade.entries()).map(([trade, items]) => {
                const tradeTotal = items.reduce((s, f) => s + f.item.price * f.quantity, 0);
                const assignedMember = team.find(m => m.role === trade);
                return (
                  <div key={trade} className="card">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-brand-900">{TRADE_LABELS[trade]}</h3>
                        <div className="text-xs text-brand-600 mt-0.5">
                          {items.length} items · ${tradeTotal.toLocaleString()}
                          {assignedMember ? ` · Assigned: ${assignedMember.name}` : " · Not assigned"}
                        </div>
                      </div>
                      {!assignedMember && (
                        <span className="badge-warning text-[10px]">Needs assignment</span>
                      )}
                    </div>

                    <div className="divide-y divide-brand-900/5">
                      {items.map(f => {
                        const room = project.rooms.find(r => r.id === f.roomId);
                        return (
                          <div key={`${f.roomId}-${f.item.id}`} className="flex items-center gap-3 py-2">
                            <span className={`text-[10px] rounded-full px-2 py-0.5 ${STATUS_COLORS[f.status]}`}>
                              {f.status}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-brand-900 truncate">{f.item.name}</div>
                              <div className="text-[10px] text-brand-600">{room?.name} · {f.item.color}</div>
                            </div>
                            <div className="text-xs text-brand-600 shrink-0">x{f.quantity}</div>
                            <div className="text-sm font-medium shrink-0">${(f.item.price * f.quantity).toLocaleString()}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
