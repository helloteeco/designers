"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import BriefHub from "@/components/BriefHub";
import ConceptHub from "@/components/ConceptHub";
import RoomPlanner from "@/components/RoomPlanner";
import SleepOptimizer from "@/components/SleepOptimizer";
import DesignHub from "@/components/DesignHub";
import SceneDesigner from "@/components/SceneDesigner";
import ItemsHub from "@/components/ItemsHub";
import RenovationHub from "@/components/RenovationHub";
import ReviewHub from "@/components/ReviewHub";
import OrderHub from "@/components/OrderHub";
import InstallHub from "@/components/InstallHub";
import ShareLinkButton from "@/components/ShareLinkButton";
import { SaveIndicator, useToast } from "@/components/Toast";
import {
  getProject,
  saveProject,
  getUser,
  loadProjectFromDatabase,
  logActivity,
} from "@/lib/store";
import { isConfigured, subscribeToProject } from "@/lib/supabase";
import { getTotalSleeping } from "@/lib/sleep-optimizer";
import type { Project, ProjectStatus } from "@/lib/types";

type Tab =
  | "brief"
  | "concept"
  | "rooms"
  | "sleep"
  | "design"
  | "scene"
  | "items"
  | "renovation"
  | "review"
  | "order"
  | "install";

interface TabDef {
  id: Tab;
  label: string;
  week: string;
  /** If returns false, the tab is hidden. */
  visible?: (project: Project) => boolean;
}

/**
 * Tabs align to Teeco's 7-week process.
 * Week 1 = Brief, Concept
 * Weeks 2-3 = Rooms, Sleep, Design, Items, Renovation
 * Week 4 = Review
 * Weeks 5-6 = Order
 * Week 7 = Install
 */
const ALL_TABS: TabDef[] = [
  { id: "brief", label: "Brief", week: "Wk 1" },
  { id: "concept", label: "Concept", week: "Wk 1" },
  { id: "rooms", label: "Rooms", week: "Wk 2-3" },
  {
    id: "sleep",
    label: "Sleep Plan",
    week: "Wk 2-3",
    // Only STR / furnish-only projects need sleep optimization
    visible: (p) => p.projectType === "furnish-only" || p.projectType === "full-redesign",
  },
  { id: "design", label: "Space Plan", week: "Wk 2-3" },
  { id: "scene", label: "Scene", week: "Wk 2-3" },
  { id: "items", label: "Items", week: "Wk 2-3" },
  {
    id: "renovation",
    label: "Renovation",
    week: "Wk 2-3",
    visible: (p) => p.projectType === "renovation" || p.projectType === "full-redesign" || p.projectType === "new-construction",
  },
  { id: "review", label: "Review", week: "Wk 4" },
  { id: "order", label: "Order", week: "Wk 5-6" },
  { id: "install", label: "Install", week: "Wk 7" },
];

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "in-progress", label: "In Progress" },
  { value: "review", label: "In Review" },
  { value: "delivered", label: "Delivered" },
];

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>("brief");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setProject(getProject(projectId));
  }, [projectId]);

  useEffect(() => {
    const user = getUser();
    if (!user) {
      router.replace("/login");
      return;
    }

    async function load() {
      if (isConfigured()) {
        await loadProjectFromDatabase(projectId);
      }
      const p = getProject(projectId);
      if (!p) {
        router.replace("/dashboard");
        return;
      }
      setProject(p);
      setLoading(false);
    }
    load();

    if (isConfigured()) {
      const unsub = subscribeToProject(projectId, () => {
        loadProjectFromDatabase(projectId).then(() => reload());
      });
      return () => unsub();
    }
  }, [projectId, router, reload]);

  if (loading || !project) {
    return (
      <div className="min-h-screen bg-cream">
        <Navbar />
        <main className="mx-auto max-w-7xl px-6 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-1/3 rounded bg-brand-900/10" />
            <div className="h-4 w-1/2 rounded bg-brand-900/5" />
            <div className="grid grid-cols-4 gap-3 mt-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="card py-3 px-4">
                  <div className="h-3 w-12 rounded bg-brand-900/10 mb-2" />
                  <div className="h-5 w-8 rounded bg-brand-900/10" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  const sleeping = getTotalSleeping(project.rooms);
  const totalItems = project.rooms.reduce((s, r) => s + r.furniture.length, 0);
  const totalCost = project.rooms.reduce(
    (s, r) => s + r.furniture.reduce((fs, f) => fs + f.item.price * f.quantity, 0),
    0
  );

  function updateStatus(status: ProjectStatus) {
    const p = getProject(projectId);
    if (!p) return;
    p.status = status;
    saveProject(p);
    logActivity(projectId, "status_changed", `Status → ${status}`);
    toast.success(`Status: ${status.replace("-", " ")}`);
    reload();
  }

  // Filter tabs based on project type
  const visibleTabs = ALL_TABS.filter(t => !t.visible || t.visible(project));

  // Per-tab "done" heuristic — drives the progress chain's checkmarks. Cheap,
  // forgiving rules; designer can always click back to revisit a "done" step.
  const isTabDone: Record<Tab, boolean> = {
    brief: !!project.client.name && (project.property.floorPlans ?? []).length > 0,
    concept: project.moodBoards.some(b => b.isLockedConcept),
    rooms: project.rooms.length > 0,
    sleep: project.rooms.some(r => !!r.selectedBedConfig),
    design: project.rooms.some(r => r.furniture.length > 0),
    scene: project.rooms.some(r => (r.sceneItems?.length ?? 0) > 0 || !!r.sceneSnapshot),
    items: totalItems > 0,
    renovation: (project.scope?.length ?? 0) > 0,
    review: project.status === "review" || project.status === "delivered",
    order: project.status === "delivered",
    install: project.status === "delivered",
  };
  const currentIdx = visibleTabs.findIndex(t => t.id === tab);

  return (
    <div className="min-h-screen bg-cream">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 animate-in">
        {/* Back + Title */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/dashboard")}
            className="mb-3 text-sm text-brand-600 hover:text-brand-900 transition"
          >
            &larr; All Projects
          </button>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-brand-900 truncate">
                {project.name || "Untitled"}
              </h1>
              <p className="text-xs sm:text-sm text-brand-600 mt-0.5 truncate">
                {project.property.address || "No address"} &middot;{" "}
                {project.client.name || "No client"} &middot;{" "}
                <span className="capitalize">{project.style.replace(/-/g, " ")}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <SaveIndicator updatedAt={project.updatedAt} />
              <ShareLinkButton project={project} />
              <select
                className="select w-auto text-xs"
                value={project.status}
                onChange={(e) => updateStatus(e.target.value as ProjectStatus)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <QuickStat
            label="Layout"
            value={(() => {
              const bedroomTypes = ["primary-bedroom", "bedroom", "loft", "bonus-room"];
              const bd = project.rooms.filter(r => bedroomTypes.includes(r.type)).length;
              const ba = project.rooms.filter(r => r.type === "bathroom").length;
              if (bd === 0 && ba === 0) return project.rooms.length === 0 ? "—" : `${project.rooms.length} space${project.rooms.length === 1 ? "" : "s"}`;
              return `${bd}BR/${ba}BA`;
            })()}
          />
          <QuickStat label="Sleeps" value={sleeping} target={project.targetGuests} goodWhenOver />
          <QuickStat label="Items" value={totalItems} />
          <QuickStat
            label="Cost"
            value={`$${totalCost.toLocaleString()}`}
            target={project.budget ? `$${project.budget.toLocaleString()}` : undefined}
          />
          <QuickStat
            label="$/sqft"
            value={(() => {
              // Use property.squareFootage if set, otherwise calculate from rooms
              // (interior rooms only — exclude outdoor spaces)
              const interiorSqft = project.rooms
                .filter(r => r.type !== "outdoor")
                .reduce((s, r) => s + r.widthFt * r.lengthFt, 0);
              const sqft = project.property.squareFootage > 0
                ? project.property.squareFootage
                : interiorSqft;
              return sqft > 0 ? `$${(totalCost / sqft).toFixed(0)}` : "—";
            })()}
            target="$10-20"
          />
        </div>

        {/* Phase-based tabs — matches Teeco 7-week process */}
        <div className="mb-6 md:hidden">
          <select
            className="select w-full"
            value={tab}
            onChange={e => setTab(e.target.value as Tab)}
          >
            {visibleTabs.map(t => (
              <option key={t.id} value={t.id}>{t.week} · {t.label}</option>
            ))}
          </select>
        </div>

        {/* Desktop: numbered progress chain. Each step shows its state
            (done ✓ / current / upcoming) plus the connector lines between
            so it reads as a sequence, not a flat tab strip. */}
        <div className="mb-6 rounded-xl bg-white border border-brand-900/10 p-3 overflow-x-auto hidden md:block">
          <div className="flex items-center min-w-max">
            {visibleTabs.map((t, idx) => {
              const isCurrent = tab === t.id;
              const isDone = isTabDone[t.id];
              const isPast = idx < currentIdx;
              const isFirst = idx === 0;

              return (
                <div key={t.id} className="flex items-center shrink-0">
                  {/* Connector line (skip before first step) */}
                  {!isFirst && (
                    <div className={`h-px w-6 mx-1 ${
                      isPast || isCurrent ? "bg-amber/60" : "bg-brand-900/10"
                    }`} />
                  )}

                  <button
                    onClick={() => setTab(t.id)}
                    className={`group flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition ${
                      isCurrent
                        ? "bg-brand-900 text-white"
                        : isDone
                          ? "text-brand-900 hover:bg-brand-900/5"
                          : "text-brand-600 hover:bg-brand-900/5"
                    }`}
                    title={t.week}
                  >
                    {/* Step indicator: number, current dot, or done check */}
                    <span className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0 ${
                      isCurrent
                        ? "bg-amber text-white"
                        : isDone
                          ? "bg-emerald-500 text-white"
                          : "bg-brand-900/10 text-brand-600 group-hover:bg-brand-900/15"
                    }`}>
                      {isDone && !isCurrent ? "✓" : idx + 1}
                    </span>
                    <span className="text-sm font-medium whitespace-nowrap">{t.label}</span>
                    {!isCurrent && (
                      <span className="hidden xl:inline text-[9px] uppercase tracking-wider opacity-50">{t.week}</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tab Content — each phase maps to a hub */}
        <div className="animate-in">
          {tab === "brief" && <BriefHub project={project} onUpdate={reload} />}
          {tab === "concept" && <ConceptHub project={project} onUpdate={reload} />}
          {tab === "rooms" && <RoomPlanner project={project} onUpdate={reload} />}
          {tab === "sleep" && <SleepOptimizer project={project} onUpdate={reload} />}
          {tab === "design" && <DesignHub project={project} onUpdate={reload} />}
          {tab === "scene" && <SceneDesigner project={project} onUpdate={reload} />}
          {tab === "items" && <ItemsHub project={project} onUpdate={reload} />}
          {tab === "renovation" && <RenovationHub project={project} onUpdate={reload} />}
          {tab === "review" && <ReviewHub project={project} />}
          {tab === "order" && <OrderHub project={project} />}
          {tab === "install" && <InstallHub project={project} projectId={projectId} />}
        </div>
      </main>
    </div>
  );
}

function QuickStat({
  label,
  value,
  target,
  goodWhenOver,
}: {
  label: string;
  value: number | string;
  target?: number | string;
  /** If true (like Sleeps), exceeding target is positive (green).
   *  If false/undefined (like Cost), exceeding target is negative (red). */
  goodWhenOver?: boolean;
}) {
  // Color logic: compare value vs target if both are numbers or numeric strings
  let valueColor = "text-brand-900";
  let indicator: string | null = null;
  if (target !== undefined && target !== 0 && target !== "") {
    const numValue = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ""));
    const numTarget = typeof target === "number" ? target : parseFloat(String(target).replace(/[^0-9.-]/g, ""));
    if (!isNaN(numValue) && !isNaN(numTarget) && numTarget > 0) {
      if (numValue > numTarget) {
        valueColor = goodWhenOver ? "text-emerald-600" : "text-red-500";
        indicator = goodWhenOver ? `+${numValue - numTarget}` : `over by ${Math.round(((numValue - numTarget) / numTarget) * 100)}%`;
      } else if (numValue === numTarget && goodWhenOver) {
        valueColor = "text-emerald-600";
      }
    }
  }
  return (
    <div className="card py-3 px-4">
      <div className="text-[10px] uppercase tracking-wider text-brand-600 mb-0.5">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-xl font-bold ${valueColor}`}>{value}</span>
        {target !== undefined && target !== 0 && target !== "" && (
          <span className="text-xs text-brand-600/60">/ {target}</span>
        )}
      </div>
      {indicator && (
        <div className={`text-[10px] font-medium mt-0.5 ${goodWhenOver ? "text-emerald-600" : "text-red-500"}`}>
          {indicator}
        </div>
      )}
    </div>
  );
}
