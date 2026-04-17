"use client";

import { useState } from "react";
import { saveProject, getProject as getProjectFromStore, logActivity } from "@/lib/store";
import {
  WORKFLOW_STEPS,
  calculateTimeSavings,
  autoGenerateRooms,
  autoSelectStyle,
  autoGenerateMoodBoards,
  autoFurnishAllRooms,
  autoBudgetCheck,
  getManualTimeline,
  getAutomatedTimeline,
} from "@/lib/ai-workflow";
import { optimizeSleeping } from "@/lib/sleep-optimizer";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

export default function WorkflowEngine({ project, onUpdate }: Props) {
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [stepResults, setStepResults] = useState<Record<string, string>>({});
  const [showTimeline, setShowTimeline] = useState(false);

  const savings = calculateTimeSavings();
  const manualTimeline = getManualTimeline();
  const autoTimeline = getAutomatedTimeline();

  async function runFullPipeline() {
    setRunning(true);
    setCompletedSteps(new Set());
    setStepResults({});

    const steps = WORKFLOW_STEPS;

    for (let i = 0; i < steps.length; i++) {
      setCurrentStep(i);
      const step = steps[i];

      // Simulate AI processing time
      await sleep(300 + Math.random() * 400);

      try {
        const result = executeStep(step.id, project.id);
        setStepResults(prev => ({ ...prev, [step.id]: result }));
        setCompletedSteps(prev => {
          const next = new Set(prev);
          next.add(step.id);
          return next;
        });
      } catch (err) {
        setStepResults(prev => ({
          ...prev,
          [step.id]: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        }));
        // Continue with remaining steps
      }
    }

    setCurrentStep(-1);
    setRunning(false);
    logActivity(project.id, "workflow_complete", "AI workflow completed — full design pipeline executed");
    onUpdate();
  }

  function executeStep(stepId: string, projectId: string): string {
    const fresh = getProjectFromStore(projectId);
    if (!fresh) return "Project not found";

    switch (stepId) {
      case "scan-import": {
        const hasScans = !!(fresh.property.matterportLink || fresh.property.polycamLink);
        return hasScans
          ? `3D scans linked: ${[fresh.property.matterportLink ? "Matterport" : "", fresh.property.polycamLink ? "Polycam" : ""].filter(Boolean).join(", ")}`
          : "No 3D scans linked — add them in the Overview tab for best results.";
      }

      case "room-setup": {
        if (fresh.rooms.length > 0) {
          return `${fresh.rooms.length} rooms already configured. Skipping auto-generation.`;
        }
        const rooms = autoGenerateRooms(fresh);
        fresh.rooms = rooms;
        saveProject(fresh);
        return `Auto-generated ${rooms.length} rooms based on ${fresh.property.bedrooms}bd/${fresh.property.bathrooms}ba, ${fresh.property.squareFootage} sqft property.`;
      }

      case "sleep-optimize": {
        const result = optimizeSleeping(fresh.rooms, fresh.targetGuests);
        for (const rr of result.roomResults) {
          const room = fresh.rooms.find(r => r.id === rr.roomId);
          if (room && !room.selectedBedConfig) {
            room.selectedBedConfig = rr.recommended;
          }
        }
        saveProject(fresh);
        return `Optimized sleeping: ${result.totalSleeps} guests (target: ${fresh.targetGuests}). ${result.targetMet ? "Target met!" : "Below target — consider adding flex rooms."}`;
      }

      case "style-select": {
        if (fresh.style !== "modern" || fresh.moodBoards.length > 0) {
          return `Style already set: ${fresh.style}. Keeping current selection.`;
        }
        const style = autoSelectStyle(fresh);
        fresh.style = style;
        saveProject(fresh);
        return `Auto-selected style: ${style.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} based on property location and client preferences.`;
      }

      case "mood-board": {
        if (fresh.moodBoards.length > 0) {
          return `${fresh.moodBoards.length} mood board(s) already exist. Skipping.`;
        }
        const boards = autoGenerateMoodBoards(fresh);
        fresh.moodBoards = boards;
        saveProject(fresh);
        return `Generated ${boards.length} mood boards with curated color palettes for ${fresh.style} style.`;
      }

      case "furniture-select": {
        const emptyRooms = fresh.rooms.filter(r => r.furniture.length === 0).length;
        if (emptyRooms === 0) {
          return "All rooms already have furniture. Skipping auto-selection.";
        }
        autoFurnishAllRooms(fresh);
        saveProject(fresh);
        const totalItems = fresh.rooms.reduce((s, r) => s + r.furniture.length, 0);
        return `Auto-selected ${totalItems} furniture items across ${fresh.rooms.length} rooms. Style: ${fresh.style}.`;
      }

      case "budget-check": {
        const check = autoBudgetCheck(fresh);
        return `Total: $${check.totalCost.toLocaleString()} ($${check.perSqft.toFixed(0)}/sqft). ${check.withinBudget ? "Within budget." : `Over budget by $${check.overBy.toLocaleString()}.`} ${check.recommendations[0] ?? ""}`;
      }

      case "render-prompts": {
        const roomCount = fresh.rooms.length;
        return `Generated Midjourney + DALL-E prompts for ${roomCount} rooms + 1 property overview. Ready to copy in the AI Renders tab.`;
      }

      case "shopping-list": {
        const totalItems = fresh.rooms.reduce((s, r) => s + r.furniture.length, 0);
        const totalCost = fresh.rooms.reduce(
          (s, r) => s + r.furniture.reduce((fs, f) => fs + f.item.price * f.quantity, 0), 0
        );
        return `Shopping list: ${totalItems} items, $${totalCost.toLocaleString()} total. Export via the Export tab.`;
      }

      case "client-package": {
        return "Design brief ready. Export as CSV, PDF, or print-friendly view from the Export tab.";
      }

      case "spoak-sync": {
        const hasSpoak = !!fresh.property.spoakLink;
        return hasSpoak
          ? `Spoak project linked. Open in the 3D Scans tab to sync your design board.`
          : "No Spoak link found. Add one in the Overview tab to enable Spoak delivery.";
      }

      case "qa-review": {
        const issues: string[] = [];
        if (fresh.rooms.length === 0) issues.push("No rooms");
        const sleepTotal = fresh.rooms.reduce((s, r) => s + (r.selectedBedConfig?.totalSleeps ?? 0), 0);
        if (sleepTotal < fresh.targetGuests) issues.push(`Under guest target (${sleepTotal}/${fresh.targetGuests})`);
        const emptyFurniture = fresh.rooms.filter(r => r.furniture.length === 0).length;
        if (emptyFurniture > 0) issues.push(`${emptyFurniture} rooms need furniture`);
        if (fresh.moodBoards.length === 0) issues.push("No mood boards");
        if (!fresh.property.matterportLink && !fresh.property.polycamLink) issues.push("No 3D scans");

        if (issues.length === 0) {
          fresh.status = "review";
          saveProject(fresh);
          return "All checks passed! Project status set to 'In Review'. Ready for client presentation.";
        }
        return `${issues.length} issue(s): ${issues.join("; ")}. Fix these before delivery.`;
      }

      default:
        return "Step completed.";
    }
  }

  function runSingleStep(stepId: string) {
    const result = executeStep(stepId, project.id);
    setStepResults(prev => ({ ...prev, [stepId]: result }));
    setCompletedSteps(prev => {
      const next = new Set(prev);
      next.add(stepId);
      return next;
    });
    onUpdate();
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">AI Workflow Engine</h2>
          <p className="text-sm text-brand-600">
            Automate the full design pipeline. What takes designers{" "}
            <span className="font-semibold text-brand-900">{savings.manualHours} hours</span> manually,
            this does in{" "}
            <span className="font-semibold text-amber-dark">{savings.automatedMinutes} minutes</span>.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTimeline(!showTimeline)}
            className="btn-secondary btn-sm"
          >
            {showTimeline ? "Hide" : "Show"} Timeline
          </button>
          <button
            onClick={runFullPipeline}
            disabled={running}
            className="btn-primary"
          >
            {running ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Running Pipeline...
              </span>
            ) : (
              "Run Full Pipeline"
            )}
          </button>
        </div>
      </div>

      {/* Time Savings Banner */}
      <div className="card mb-6 bg-brand-900 text-white">
        <div className="grid grid-cols-3 gap-6 text-center">
          <div>
            <div className="text-3xl font-bold text-red-300 line-through opacity-60">
              {savings.manualHours}hrs
            </div>
            <div className="text-xs text-white/50 mt-1">Manual Design Time</div>
          </div>
          <div>
            <div className="text-4xl font-bold text-amber">
              {savings.automatedMinutes}min
            </div>
            <div className="text-xs text-white/50 mt-1">With AI Workflow</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-emerald-400">
              {savings.savingsPercent}%
            </div>
            <div className="text-xs text-white/50 mt-1">Time Saved</div>
          </div>
        </div>
      </div>

      {/* Timeline Comparison */}
      {showTimeline && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-4">Timeline Comparison</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Manual */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-red-500 mb-3">
                Manual Process — {savings.manualHours} hours
              </div>
              <div className="space-y-1.5">
                {manualTimeline.map((entry) => (
                  <div key={entry.step} className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-brand-700">{entry.step}</span>
                        <span className="text-brand-600">{entry.hours}h</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-red-50">
                        <div
                          className="h-1.5 rounded-full bg-red-300"
                          style={{ width: `${(entry.cumulative / savings.manualHours) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Automated */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-3">
                AI Workflow — {savings.automatedMinutes} minutes
              </div>
              <div className="space-y-1.5">
                {autoTimeline.map((entry) => (
                  <div key={entry.step} className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-brand-700">{entry.step}</span>
                        <span className="text-brand-600">{entry.minutes}min</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-emerald-50">
                        <div
                          className="h-1.5 rounded-full bg-emerald-400"
                          style={{ width: `${(entry.cumulative / savings.automatedMinutes) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pipeline Steps */}
      <div className="space-y-2">
        {WORKFLOW_STEPS.map((step, i) => {
          const isRunning = running && currentStep === i;
          const isComplete = completedSteps.has(step.id);
          const result = stepResults[step.id];

          return (
            <div
              key={step.id}
              className={`card transition ${
                isRunning
                  ? "border-amber/40 bg-amber/5"
                  : isComplete
                    ? "border-emerald-200 bg-emerald-50/30"
                    : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Status icon */}
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold shrink-0 ${
                      isRunning
                        ? "bg-amber/20 text-amber-dark"
                        : isComplete
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-brand-900/5 text-brand-600"
                    }`}
                  >
                    {isRunning ? (
                      <span className="h-4 w-4 rounded-full border-2 border-amber/30 border-t-amber-dark animate-spin" />
                    ) : isComplete ? (
                      "\u2713"
                    ) : (
                      i + 1
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-brand-900">{step.name}</span>
                      <span className="text-[10px] text-brand-600/60">
                        {step.estimatedMinutes}min (saves {step.manualHours}h)
                      </span>
                    </div>
                    <p className="text-xs text-brand-600">{step.description}</p>
                  </div>
                </div>

                {!running && !isComplete && (
                  <button
                    onClick={() => runSingleStep(step.id)}
                    className="btn-secondary btn-sm shrink-0"
                  >
                    Run Step
                  </button>
                )}
              </div>

              {/* Result */}
              {result && (
                <div
                  className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                    result.startsWith("Error")
                      ? "bg-red-50 text-red-700"
                      : "bg-brand-900/5 text-brand-700"
                  }`}
                >
                  {result}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
