"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PlanMarkerEditor } from "@/components/PlanMarkerEditor";
import { getProject, saveProject, logActivity } from "@/lib/store";
import { downloadMasterlistXlsx } from "@/lib/masterlist-export";
import { getReadinessItems } from "@/lib/project-readiness";
import { getStudioSettings, saveStudioSettings, setAdvancedMode } from "@/lib/studio-settings";
import type { Project } from "@/lib/types";
import { StepHeading, StepFooter, StepNotice } from "./StepShell";

interface Props {
  project: Project;
  onUpdate: () => void;
  onBack: () => void;
  goToStep: (index: number) => void;
  advanced: boolean;
}

export default function StepExport({ project, onUpdate, onBack, goToStep, advanced }: Props) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [taxRate, setTaxRate] = useState<number>(() => getStudioSettings().taxShippingRatePercent);
  const heroInputRef = useRef<HTMLInputElement>(null);

  const items = getReadinessItems(project);
  const blockers = items.filter(i => i.severity === "blocker");
  const warnings = items.filter(i => i.severity === "warning");
  const blocked = blockers.length > 0;

  function openInstallGuide() {
    if (blocked) return;
    logActivity(project.id, "exported", "Opened Install Guide from guided flow");
    window.open(`/projects/install-guide?id=${project.id}`, "_blank");
  }

  async function downloadMasterlist() {
    if (blocked || downloading) return;
    setExportError(null);
    setDownloading(true);
    try {
      await downloadMasterlistXlsx(project);
      logActivity(project.id, "exported", "Downloaded Masterlist .xlsx from guided flow");
    } catch (err) {
      setExportError(
        `The Masterlist didn't download: ${err instanceof Error ? err.message : "unknown error"}. Try again — if it keeps failing, the full export screen (Advanced) has more options.`
      );
    } finally {
      setDownloading(false);
    }
  }

  function handleHeroUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const fresh = getProject(project.id);
      if (!fresh) return;
      fresh.property.heroImageUrl = reader.result as string;
      saveProject(fresh);
      onUpdate();
    };
    reader.readAsDataURL(file);
  }

  function openDeliverWorkspace() {
    setAdvancedMode(true);
    window.dispatchEvent(new CustomEvent("navigate-tab", { detail: "deliver" }));
  }

  return (
    <div>
      <StepHeading
        title="Your deliverables are ready"
        subtitle="Two downloads: the Install Guide for the install crew, and the Masterlist for ordering."
      />

      <div className="space-y-4">
        {exportError && <StepNotice tone="error">{exportError}</StepNotice>}

        {/* The two big finish-line buttons */}
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={openInstallGuide}
            disabled={blocked}
            className="rounded-xl border-2 border-amber bg-amber/5 p-6 text-left transition hover:bg-amber/10 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="text-3xl mb-2">📖</div>
            <div className="text-lg font-bold text-brand-900">Download Install Guide (PDF)</div>
            <p className="text-xs text-brand-600 mt-1">
              The room-by-room setup book: renders, boards, floor plan, and tips.
              Opens in a new tab — use Print &rarr; Save as PDF.
            </p>
          </button>

          <button
            onClick={() => void downloadMasterlist()}
            disabled={blocked || downloading}
            className="rounded-xl border-2 border-amber bg-amber/5 p-6 text-left transition hover:bg-amber/10 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="text-3xl mb-2">📋</div>
            <div className="text-lg font-bold text-brand-900">
              {downloading ? "Preparing Masterlist…" : "Download Masterlist (.xlsx)"}
            </div>
            <p className="text-xs text-brand-600 mt-1">
              Every item with prices, vendors, links, and totals — ready to order from.
            </p>
          </button>
        </div>

        {blocked && (
          <StepNotice tone="warn">
            {blockers[0].message}{" "}
            <button onClick={() => goToStep(blockers[0].fixStep)} className="font-semibold underline">
              {blockers[0].fixLabel}
            </button>
          </StepNotice>
        )}

        {/* Readiness checklist */}
        <div className="card">
          <h3 className="text-sm font-semibold text-brand-900 mb-3">Before you send it off</h3>
          {items.length === 0 ? (
            <p className="text-sm text-emerald-700">
              ✓ Everything&apos;s in place — rooms, beds, furniture, renders, photos. Ship it!
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map(item => (
                <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className={`flex items-start gap-2 ${item.severity === "blocker" ? "text-red-700" : "text-brand-700"}`}>
                    <span className="shrink-0 mt-0.5">{item.severity === "blocker" ? "✕" : "○"}</span>
                    {item.message}
                  </span>
                  {item.id === "no-hero-photo" ? (
                    <>
                      <button
                        onClick={() => heroInputRef.current?.click()}
                        className="text-xs font-medium text-amber-dark hover:text-brand-900 underline decoration-amber/40 shrink-0"
                      >
                        {item.fixLabel}
                      </button>
                      <input
                        ref={heroInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleHeroUpload(f); e.target.value = ""; }}
                      />
                    </>
                  ) : (
                    <button
                      onClick={() => goToStep(item.fixStep)}
                      className="text-xs font-medium text-amber-dark hover:text-brand-900 underline decoration-amber/40 shrink-0"
                    >
                      {item.fixLabel}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Floor-plan markers — part of the deliverable, visually secondary */}
        <details open className="rounded-xl border border-brand-900/10 bg-white">
          <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-brand-700 hover:text-brand-900 transition">
            Floor-plan markers
            <span className="ml-2 text-[11px] font-normal text-brand-600/60">
              — mark where art, mirrors, and TVs go on the plan (shows up in the Install Guide)
            </span>
          </summary>
          <div className="px-5 pb-5">
            <PlanMarkerEditor project={project} onUpdate={onUpdate} />
          </div>
        </details>

        {/* Advanced-only extras */}
        {advanced && (
          <div className="card border-dashed">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-3">Power controls</h3>
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <label className="label">Tax &amp; shipping rate (%)</label>
                <div className="relative w-36">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    className="input pr-8"
                    value={taxRate}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      const rate = Number.isFinite(v) && v >= 0 ? v : 0;
                      setTaxRate(rate);
                      saveStudioSettings({ taxShippingRatePercent: rate });
                    }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-600 text-sm">%</span>
                </div>
                <p className="text-[10px] text-brand-600 mt-1">
                  Used in the Masterlist T&amp;S column. Teeco standard: 7%.
                </p>
              </div>
              <button
                onClick={openDeliverWorkspace}
                className="text-xs text-brand-600 hover:text-brand-900 underline decoration-brand-900/20 transition"
              >
                Open the full Deliver workspace &rarr;
              </button>
            </div>
          </div>
        )}
      </div>

      <StepFooter
        primaryLabel={project.status === "delivered" ? "Back to all projects" : "Mark project delivered"}
        onPrimary={() => {
          if (project.status === "delivered") {
            router.push("/dashboard");
            return;
          }
          const fresh = getProject(project.id);
          if (!fresh) return;
          fresh.status = "delivered";
          saveProject(fresh);
          logActivity(project.id, "status_changed", "Status → delivered (guided flow)");
          onUpdate();
        }}
        onBack={onBack}
      />
    </div>
  );
}
