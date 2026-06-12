"use client";

import { useState } from "react";
import { STYLE_PRESETS } from "@/lib/style-presets";
import { getProject, saveProject } from "@/lib/store";
import type { Project } from "@/lib/types";
import { StepHeading, StepFooter } from "./StepShell";
import { getGuidedPresetId, setGuidedPresetId } from "./guided-state";

interface Props {
  project: Project;
  onUpdate: () => void;
  onComplete: () => void;
  onBack: () => void;
}

export default function StepPickStyle({ project, onUpdate, onComplete, onBack }: Props) {
  const [selectedId, setSelectedId] = useState<string>(() => getGuidedPresetId(project));

  function select(presetId: string) {
    setSelectedId(presetId);
    const preset = STYLE_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    setGuidedPresetId(project.id, presetId);
    const fresh = getProject(project.id);
    if (!fresh) return;
    fresh.style = preset.designStyle;
    saveProject(fresh);
    onUpdate();
  }

  return (
    <div>
      <StepHeading
        title="Pick a style"
        subtitle="This sets the look for every room — the furniture we suggest and the renders we create. You can change it any time."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STYLE_PRESETS.map(preset => {
          const active = preset.id === selectedId;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => select(preset.id)}
              className={`text-left rounded-xl border-2 p-4 transition ${
                active
                  ? "border-amber bg-amber/5 shadow-sm"
                  : "border-brand-900/10 bg-white hover:border-amber/40"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{preset.emoji}</span>
                  <span className="text-sm font-semibold text-brand-900">{preset.label}</span>
                </div>
                {active && (
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-amber text-white text-[10px] font-bold">
                    ✓
                  </span>
                )}
              </div>
              <div className="flex gap-1 mb-2">
                {preset.palette.map((hex, i) => (
                  <span
                    key={i}
                    className="h-4 w-full rounded-sm border border-brand-900/10"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
              <p className="text-[11px] text-brand-600 leading-snug">{preset.description}</p>
            </button>
          );
        })}
      </div>

      <StepFooter
        primaryLabel="Use this style"
        onPrimary={onComplete}
        onBack={onBack}
      />
    </div>
  );
}
