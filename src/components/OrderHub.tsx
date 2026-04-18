"use client";

import { useState } from "react";
import ShoppingList from "./ShoppingList";
import InvoiceGenerator from "./InvoiceGenerator";
import ExportPanel from "./ExportPanel";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate?: () => void;
}

type View = "masterlist" | "shopping" | "invoicing" | "guide";

/**
 * Order Hub — Weeks 5-6 of Teeco process.
 * Procurement + order management. Masterlist export, shopping list with
 * purchased tracking, proposals + invoices.
 */
export default function OrderHub({ project, onUpdate }: Props) {
  const [view, setView] = useState<View>("masterlist");

  const views: { id: View; label: string; hint: string }[] = [
    { id: "masterlist", label: "📋 Masterlist", hint: "Teeco CSV format matching your Google Sheet (primary deliverable)" },
    { id: "guide", label: "📖 Install Guide", hint: "Branded PDF with scene renders + per-room tips (primary deliverable)" },
    { id: "shopping", label: "Shopping + Track", hint: "Check items off as they arrive" },
    { id: "invoicing", label: "Proposals & Invoices", hint: "Billing documents" },
  ];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand-900">Procurement &amp; Ordering</h2>
          <p className="text-sm text-brand-600">
            Weeks 5-6 · Export the masterlist, order items, track deliveries, send invoices.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-white border border-brand-900/10 p-1 overflow-x-auto">
          {views.map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`shrink-0 ${view === v.id ? "tab-active" : "tab"}`}
              title={v.hint}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === "masterlist" && <ExportPanel project={project} />}
      {view === "guide" && <InstallGuideShortcut project={project} />}
      {view === "shopping" && <ShoppingList project={project} onUpdate={onUpdate} />}
      {view === "invoicing" && <InvoiceGenerator project={project} />}
    </div>
  );
}

function InstallGuideShortcut({ project }: { project: Project }) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h3 className="font-semibold text-brand-900 mb-1">Install Guide — Design-Only deliverable</h3>
          <p className="text-sm text-brand-600 mb-3">
            Client handles purchasing + install. The Install Guide shows them exactly how to execute —
            cover page, how-tos, checklist, tips, floor plan, per-room design boards with your tips.
          </p>
          <p className="text-xs text-brand-600/80">
            The full editor lives in the <strong>Install</strong> tab. This is the quick-open shortcut.
          </p>
        </div>
        <button
          onClick={() => window.open(`/projects/install-guide?id=${project.id}`, "_blank")}
          className="btn-primary"
        >
          📖 Open Install Guide
        </button>
      </div>
    </div>
  );
}
