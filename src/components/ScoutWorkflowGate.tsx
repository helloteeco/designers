"use client";

import type { Project } from "@/lib/types";
import { getDesignReadiness } from "@/lib/design-readiness";

interface Props {
  project: Project;
  onNavigate?: (tab: "brief" | "concept" | "rooms" | "design" | "deliver") => void;
}

export default function ScoutWorkflowGate({ project, onNavigate }: Props) {
  const readiness = getDesignReadiness(project);
  const required = [...readiness.sourceItems, ...readiness.workflowItems];
  const completeCount = required.filter(item => item.complete).length;
  const status = readiness.furnitureScopeReady
    ? { label: "Scope ready for Scout QA", tone: "ready" as const }
    : readiness.floorPlanGateOpen
      ? { label: "Floor plan gate open, furniture/render scope still blocked", tone: "warn" as const }
      : { label: "Blocked by floor-plan / scale gate", tone: "blocked" as const };

  return (
    <section className="mb-6 rounded-2xl border border-brand-900/10 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-dark">
            Scout QA spine · Matterport → floor plan → scaled placement → room concepts → shopping list
          </div>
          <h2 className="mt-1 text-lg font-semibold text-brand-900">Design workflow readiness</h2>
          <p className="mt-1 max-w-3xl text-sm text-brand-600">
            V1 now makes the floor-plan/scale gate visible. Scout should not approve room concepts,
            composite boards, or shopping exports until the evidence below is green.
          </p>
        </div>
        <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${
          status.tone === "ready"
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : status.tone === "warn"
              ? "bg-amber/15 text-brand-900 border border-amber/40"
              : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {status.label}
          <div className="mt-1 text-xs font-normal opacity-75">{completeCount}/{required.length} checks complete</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ReadinessGroup title="Source evidence checklist" items={readiness.sourceItems} />
        <ReadinessGroup title="Workflow gates" items={readiness.workflowItems} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-brand-900/10 bg-cream/60 p-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-brand-600">Current blockers</h3>
          {readiness.blockers.length === 0 ? (
            <p className="mt-2 text-sm text-emerald-700">No blockers. Ready for Scout to QA the exported scope.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm text-brand-700">
              {readiness.blockers.slice(0, 5).map(blocker => (
                <li key={blocker} className="flex gap-2"><span className="text-red-500">•</span><span>{blocker}</span></li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-brand-900/10 bg-cream/60 p-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-brand-600">Next action</h3>
          {!readiness.sourceItems[1]?.complete ? (
            <GateAction label="Upload floor plan" tab="brief" onNavigate={onNavigate} />
          ) : !readiness.floorPlanGateOpen ? (
            <GateAction label="Calibrate layout scale" tab="design" onNavigate={onNavigate} />
          ) : !readiness.canStartRoomDesign ? (
            <GateAction label="Place scaled furniture" tab="design" onNavigate={onNavigate} />
          ) : !readiness.furnitureScopeReady ? (
            <GateAction label="Finish concepts + furniture scope" tab="design" onNavigate={onNavigate} />
          ) : (
            <GateAction label="Export Scout scope" tab="deliver" onNavigate={onNavigate} />
          )}
          <p className="mt-2 text-xs text-brand-600">
            AI renders, shopping carts, client portal, and public launch stay out of v1. This slice only exposes the gate and export path.
          </p>
        </div>
      </div>
    </section>
  );
}

function ReadinessGroup({ title, items }: { title: string; items: ReturnType<typeof getDesignReadiness>["sourceItems"] }) {
  return (
    <div className="rounded-xl border border-brand-900/10 p-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-brand-600">{title}</h3>
      <div className="mt-3 space-y-2">
        {items.map(item => (
          <div key={item.id} className="flex gap-2">
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${item.complete ? "bg-emerald-500 text-white" : "bg-brand-900/10 text-brand-600"}`}>
              {item.complete ? "✓" : "!"}
            </span>
            <div>
              <div className="text-sm font-semibold text-brand-900">{item.label}</div>
              <div className="text-xs text-brand-600">{item.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GateAction({ label, tab, onNavigate }: { label: string; tab: "brief" | "concept" | "rooms" | "design" | "deliver"; onNavigate?: Props["onNavigate"] }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate?.(tab)}
      className="mt-2 rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
    >
      {label} →
    </button>
  );
}
