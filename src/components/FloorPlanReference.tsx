"use client";

import { useState } from "react";
import type { Project, FloorPlan } from "@/lib/types";

interface Props {
  project: Project;
  /** Compact mode: collapsed by default, expands on click */
  defaultExpanded?: boolean;
}

/**
 * Floor plan reference strip — shown in Rooms and Space Plan tabs so
 * designers can glance at uploaded plans while entering dimensions.
 * Does NOT auto-extract anything (computer vision on floor plans is
 * unreliable). It's a visual reference that stays pinned while you work.
 */
export default function FloorPlanReference({ project, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [preview, setPreview] = useState<FloorPlan | null>(null);
  const plans = project.property?.floorPlans ?? [];

  if (plans.length === 0) {
    return (
      <div className="mb-4 rounded-lg border border-dashed border-brand-900/20 px-4 py-3 text-xs text-brand-600 flex items-center justify-between">
        <span>
          📐 No floor plans uploaded yet. Add them in the{" "}
          <span className="font-medium text-brand-700">Overview tab → Property</span> to reference while you work.
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 rounded-lg border border-brand-900/10 bg-white overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-brand-900/5 transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-base">📐</span>
            <span className="text-sm font-medium text-brand-900">
              Floor Plans
            </span>
            <span className="text-[10px] bg-brand-900/5 text-brand-600 px-2 py-0.5 rounded-full font-mono">
              {plans.length}
            </span>
          </div>
          <span className="text-xs text-brand-600">
            {expanded ? "Hide" : "Show"} reference
          </span>
        </button>

        {expanded && (
          <div className="border-t border-brand-900/5 p-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {plans.map(plan => (
                <button
                  key={plan.id}
                  onClick={() => {
                    if (plan.type === "image") {
                      setPreview(plan);
                    } else {
                      window.open(plan.url, "_blank");
                    }
                  }}
                  className="group rounded-md overflow-hidden border border-brand-900/10 hover:border-amber/40 bg-brand-900/5 transition"
                  title={plan.name}
                >
                  <div className="aspect-video">
                    {plan.type === "image" ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={plan.url}
                        alt={plan.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-2xl">
                        {plan.type === "pdf" ? "📄" : "🔗"}
                      </div>
                    )}
                  </div>
                  <div className="px-2 py-1 text-[10px] font-medium text-brand-700 truncate text-left group-hover:text-amber-dark">
                    {plan.name}
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-brand-600/60">
              Click any plan to view full-size. Use it as a reference while you enter room dimensions.
            </div>
          </div>
        )}
      </div>

      {/* Full-screen preview */}
      {preview && preview.type === "image" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setPreview(null)}
        >
          <div className="max-w-6xl max-h-full overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-white rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-brand-900/5">
                <span className="text-sm font-medium text-brand-900">{preview.name}</span>
                <button onClick={() => setPreview(null)} className="text-brand-600 hover:text-brand-900 text-lg leading-none">
                  ×
                </button>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.url} alt={preview.name} className="max-w-full max-h-[85vh] object-contain" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
