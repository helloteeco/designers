"use client";

import { useState } from "react";
import ProjectSummary from "./ProjectSummary";
import ClientDelivery from "./ClientDelivery";
import ShoppingList from "./ShoppingList";
import InvoiceGenerator from "./InvoiceGenerator";
import ExportPanel from "./ExportPanel";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
}

type View = "summary" | "client" | "shopping" | "invoicing" | "export";

/**
 * Deliver hub — all output/handoff flows in one tab.
 * Replaces five separate tabs (Summary, Client View, Shopping, Invoicing, Export).
 */
export default function DeliverHub({ project }: Props) {
  const [view, setView] = useState<View>("summary");

  const totalCost = project.rooms.reduce(
    (s, r) => s + r.furniture.reduce((fs, f) => fs + f.item.price * f.quantity, 0),
    0
  );
  const items = project.rooms.reduce((s, r) => s + r.furniture.length, 0);

  const views: { id: View; label: string; icon: string; hint: string }[] = [
    { id: "summary", label: "Summary", icon: "📋", hint: "Project overview" },
    { id: "client", label: "Client View", icon: "👁️", hint: "What the client sees" },
    { id: "shopping", label: "Shopping List", icon: "🛒", hint: `${items} items, $${totalCost.toLocaleString()}` },
    { id: "invoicing", label: "Proposals & Invoices", icon: "💰", hint: "Billing documents" },
    { id: "export", label: "Export", icon: "📤", hint: "CSV, PDF, print" },
  ];

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Deliver</h2>
            <p className="text-sm text-brand-600">
              Everything your client receives — presentation, pricing, procurement, and export.
            </p>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1 rounded-xl bg-white border border-brand-900/10 p-1 overflow-x-auto">
          {views.map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`shrink-0 ${view === v.id ? "tab-active" : "tab"}`}
              title={v.hint}
            >
              <span className="mr-1.5">{v.icon}</span>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === "summary" && <ProjectSummary project={project} />}
      {view === "client" && <ClientDelivery project={project} />}
      {view === "shopping" && <ShoppingList project={project} />}
      {view === "invoicing" && <InvoiceGenerator project={project} />}
      {view === "export" && <ExportPanel project={project} />}
    </div>
  );
}
