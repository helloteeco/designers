"use client";

import { useCallback, useEffect, useState } from "react";
import type { Project } from "@/lib/types";
import { useAdvancedMode } from "./guided/useAdvancedMode";
import {
  GUIDED_STEPS,
  getDoneSteps,
  isStepComplete,
  firstIncompleteStep,
  initialStep,
  markStepDone,
  saveStep,
} from "./guided/guided-state";
import StepImportScan from "./guided/StepImportScan";
import StepConfirmRooms from "./guided/StepConfirmRooms";
import StepPickStyle from "./guided/StepPickStyle";
import StepReviewRenders from "./guided/StepReviewRenders";
import StepExport from "./guided/StepExport";

interface Props {
  project: Project;
  onUpdate: () => void;
}

/**
 * Guided flow — the default project view. One linear path, one primary
 * action per step:
 *
 *   1. Import scan   2. Confirm rooms   3. Pick a style
 *   4. Furniture & renders   5. Get deliverables
 *
 * Step state machine (see guided/guided-state.ts):
 *   complete   = primary action pressed (persisted), with data fallbacks
 *   reachable  = every earlier step complete; completed steps stay clickable
 *   on load    = resume saved step if reachable, else first incomplete step
 */
export default function GuidedFlow({ project, onUpdate }: Props) {
  const advanced = useAdvancedMode();
  const [step, setStep] = useState(() => initialStep(project));
  // Done flags live in localStorage; bump this counter to recompute.
  const [, setDoneVersion] = useState(0);

  const done = getDoneSteps(project.id);
  const reachableLimit = firstIncompleteStep(project, done);

  const goToStep = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, GUIDED_STEPS.length - 1));
    setStep(clamped);
    saveStep(project.id, clamped);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [project.id]);

  // Keep the persisted step in sync if the initial auto-skip landed somewhere.
  useEffect(() => {
    saveStep(project.id, step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function completeStep(index: number) {
    markStepDone(project.id, GUIDED_STEPS[index].id);
    setDoneVersion(v => v + 1);
    if (index < GUIDED_STEPS.length - 1) goToStep(index + 1);
  }

  const current = GUIDED_STEPS[step];

  return (
    <div className="mx-auto max-w-3xl">
      {/* Step indicator — numbered dots + labels */}
      <div className="mb-8 rounded-xl bg-white border border-brand-900/10 px-4 py-3 overflow-x-auto">
        <div className="flex items-center min-w-max">
          {GUIDED_STEPS.map((s, idx) => {
            const isCurrent = idx === step;
            const isDone = isStepComplete(project, s.id, done) && !isCurrent;
            const clickable = idx <= reachableLimit;
            return (
              <div key={s.id} className="flex items-center shrink-0">
                {idx > 0 && (
                  <div className={`h-px w-5 sm:w-8 mx-1.5 ${
                    idx <= reachableLimit ? "bg-amber/60" : "bg-brand-900/10"
                  }`} />
                )}
                <button
                  onClick={() => clickable && goToStep(idx)}
                  disabled={!clickable}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition ${
                    isCurrent
                      ? "bg-brand-900 text-white"
                      : clickable
                        ? "text-brand-700 hover:bg-brand-900/5 cursor-pointer"
                        : "text-brand-600/40 cursor-default"
                  }`}
                  title={clickable ? s.label : "Finish the earlier steps first"}
                >
                  <span className={`flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-bold shrink-0 ${
                    isCurrent
                      ? "bg-amber text-white"
                      : isDone
                        ? "bg-emerald-500 text-white"
                        : clickable
                          ? "bg-brand-900/10 text-brand-600"
                          : "bg-brand-900/5 text-brand-600/40"
                  }`}>
                    {isDone ? "✓" : idx + 1}
                  </span>
                  <span className="text-xs sm:text-sm font-medium whitespace-nowrap">{s.label}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Current step */}
      <div className="animate-in">
        {current.id === "import" && (
          <StepImportScan
            project={project}
            onUpdate={onUpdate}
            onComplete={() => completeStep(0)}
            onSkipToRooms={() => completeStep(0)}
          />
        )}
        {current.id === "rooms" && (
          <StepConfirmRooms
            project={project}
            onUpdate={onUpdate}
            onComplete={() => completeStep(1)}
            onBack={() => goToStep(0)}
            advanced={advanced}
          />
        )}
        {current.id === "style" && (
          <StepPickStyle
            project={project}
            onUpdate={onUpdate}
            onComplete={() => completeStep(2)}
            onBack={() => goToStep(1)}
          />
        )}
        {current.id === "furniture" && (
          <StepReviewRenders
            project={project}
            onUpdate={onUpdate}
            onComplete={() => completeStep(3)}
            onBack={() => goToStep(2)}
            goToStep={goToStep}
            advanced={advanced}
          />
        )}
        {current.id === "export" && (
          <StepExport
            project={project}
            onUpdate={onUpdate}
            onBack={() => goToStep(3)}
            goToStep={goToStep}
            advanced={advanced}
          />
        )}
      </div>
    </div>
  );
}
