"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import RoomPlanner from "@/components/RoomPlanner";
import SleepOptimizer from "@/components/SleepOptimizer";
import FurniturePicker from "@/components/FurniturePicker";
import DesignBoard from "@/components/DesignBoard";
import MoodBoardPanel from "@/components/MoodBoardPanel";
import ExportPanel from "@/components/ExportPanel";
import TeamChat from "@/components/TeamChat";
import ScanViewer from "@/components/ScanViewer";
import ActivityFeed from "@/components/ActivityFeed";
import AIRenderingPanel from "@/components/AIRenderingPanel";
import ProjectChecklist from "@/components/ProjectChecklist";
import ProjectSummary from "@/components/ProjectSummary";
import StyleQuiz from "@/components/StyleQuiz";
import RoomProportions from "@/components/RoomProportions";
import BudgetDashboard from "@/components/BudgetDashboard";
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

// ── Tab system ──

type Tab =
  | "overview"
  | "ai-workflow"
  | "scans"
  | "style-quiz"
  | "rooms"
  | "sleep"
  | "proportions"
  | "design"
  | "catalog"
  | "budget"
  | "mood"
  | "export"
  | "summary"
  | "chat";

interface TabGroup {
  label: string;
  tabs: { id: Tab; label: string }[];
}

const TAB_GROUPS: TabGroup[] = [
  {
    label: "Project",
    tabs: [
      { id: "overview", label: "Overview" },
      { id: "ai-workflow", label: "AI Workflow" },
    ],
  },
  {
    label: "Inputs",
    tabs: [
      { id: "scans", label: "3D Scans" },
    ],
  },
  {
    label: "Design",
    tabs: [
      { id: "style-quiz", label: "Style Quiz" },
      { id: "rooms", label: "Rooms" },
      { id: "sleep", label: "Sleep Plan" },
      { id: "proportions", label: "Proportions" },
      { id: "design", label: "Design Board" },
    ],
  },
  {
    label: "Catalog",
    tabs: [
      { id: "catalog", label: "Products & Pricing" },
      { id: "budget", label: "Budget" },
    ],
  },
  {
    label: "Delivery",
    tabs: [
      { id: "mood", label: "Mood Board" },
      { id: "export", label: "Export" },
      { id: "summary", label: "Summary" },
    ],
  },
  {
    label: "Team",
    tabs: [{ id: "chat", label: "Chat" }],
  },
];

const STATUS_OPTIONS: { value: ProjectStatus; label: string; color: string }[] = [
  { value: "draft", label: "Draft", color: "bg-brand-900/10 text-brand-700" },
  { value: "in-progress", label: "In Progress", color: "bg-blue-100 text-blue-800" },
  { value: "review", label: "In Review", color: "bg-amber-light/50 text-amber-dark" },
  { value: "delivered", label: "Delivered", color: "bg-emerald-100 text-emerald-800" },
];

// ── Helpers ──

function computeCostPerSqft(totalCost: number, sqft: number): string {
  if (!sqft || sqft <= 0 || totalCost <= 0) return "—";
  const val = totalCost / sqft;
  return `$${val.toFixed(0)}`;
}

function getBudgetHealth(totalCost: number, budget: number): "ok" | "warn" | "over" | "none" {
  if (!budget || budget <= 0) return "none";
  const pct = totalCost / budget;
  if (pct > 1) return "over";
  if (pct > 0.85) return "warn";
  return "ok";
}

// ── Page ──

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "overview";
    const saved = sessionStorage.getItem(`tab_${projectId}`);
    return (saved as Tab) || "overview";
  });
  const [loading, setLoading] = useState(true);
  const [clientLinkCopied, setClientLinkCopied] = useState(false);

  function switchTab(t: Tab) {
    setTab(t);
    try { sessionStorage.setItem(`tab_${projectId}`, t); } catch { /* ignore */ }
  }

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

  // ── Derived stats (memoized) ──
  const stats = useMemo(() => {
    if (!project) return null;
    const sleeping = getTotalSleeping(project.rooms);
    const totalItems = project.rooms.reduce((s, r) => s + r.furniture.length, 0);
    const totalCost = project.rooms.reduce(
      (s, r) => s + r.furniture.reduce((fs, f) => fs + f.item.price * f.quantity, 0),
      0
    );
    const costPerSqft = computeCostPerSqft(totalCost, project.property.squareFootage);
    const budgetHealth = getBudgetHealth(totalCost, project.budget);
    return { sleeping, totalItems, totalCost, costPerSqft, budgetHealth };
  }, [project]);

  if (loading || !project || !stats) {
    return (
      <div className="min-h-screen bg-cream">
        <Navbar />
        <main className="mx-auto max-w-7xl px-6 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-1/3 rounded bg-brand-900/10" />
            <div className="h-4 w-1/2 rounded bg-brand-900/5" />
            <div className="grid grid-cols-5 gap-3 mt-6">
              {[1, 2, 3, 4, 5].map((i) => (
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

  function updateStatus(status: ProjectStatus) {
    const p = getProject(projectId);
    if (!p) return;
    p.status = status;
    saveProject(p);
    logActivity(projectId, "status_changed", `Status -> ${status}`);
    reload();
  }

  function openClientView() {
    if (!project) return;
    const url = `/projects/print?id=${project.id}`;
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      // Pop-up blocked — fallback to copying the URL
      const full = `${window.location.origin}${url}`;
      try {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(full);
        } else {
          const ta = document.createElement("textarea");
          ta.value = full;
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        setClientLinkCopied(true);
        setTimeout(() => setClientLinkCopied(false), 2000);
      } catch {
        window.prompt("Copy this link:", full);
      }
    }
  }

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === project.status) ?? STATUS_OPTIONS[0];

  return (
    <div className="min-h-screen bg-cream">
      <Navbar />

      <main className="mx-auto max-w-7xl px-6 py-6 animate-in">
        {/* Back + Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/dashboard")}
            className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-brand-900/10 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 shadow-sm transition hover:border-brand-900/20 hover:text-brand-900"
          >
            <span aria-hidden>&larr;</span> All Projects
          </button>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-brand-900 truncate">
                {project.name || "Untitled"}
              </h1>
              <p className="mt-0.5 text-sm text-brand-600">
                {project.property.address || "No address"} &middot;{" "}
                {project.client.name || "No client"} &middot;{" "}
                <span className="capitalize">{project.style.replace(/-/g, " ")}</span>
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={openClientView}
                className="btn-accent btn-sm"
                title="Opens a print-ready client view you can send as PDF"
              >
                {clientLinkCopied ? "Link copied!" : "Client View"}
              </button>

              {/* Status dropdown styled as pill */}
              <div className="relative">
                <select
                  className={`appearance-none rounded-lg border border-brand-900/10 px-4 py-2 pr-8 text-xs font-semibold shadow-sm transition focus:border-amber focus:ring-2 focus:ring-amber/20 outline-none ${currentStatus.color}`}
                  value={project.status}
                  onChange={(e) => updateStatus(e.target.value as ProjectStatus)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-brand-600">
                  ▼
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats — 5 cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Rooms" value={project.rooms.length} />
          <StatCard
            label="Sleeps"
            value={stats.sleeping}
            target={project.targetGuests}
            status={
              stats.sleeping >= project.targetGuests
                ? "ok"
                : stats.sleeping > 0
                ? "warn"
                : undefined
            }
          />
          <StatCard label="Items" value={stats.totalItems} />
          <StatCard
            label="Cost"
            value={`$${stats.totalCost.toLocaleString()}`}
            target={
              project.budget ? `$${project.budget.toLocaleString()}` : undefined
            }
            status={stats.budgetHealth === "over" ? "over" : stats.budgetHealth === "warn" ? "warn" : undefined}
          />
          <StatCard
            label="$/Sqft"
            value={stats.costPerSqft}
            target="$10-20"
          />
        </div>

        {/* Grouped Tabs */}
        <nav
          className="mb-6 overflow-x-auto rounded-xl border border-brand-900/10 bg-white p-1.5"
          role="tablist"
          aria-label="Project sections"
        >
          <div className="flex items-center gap-0.5 min-w-max">
            {TAB_GROUPS.map((group, gi) => (
              <div key={group.label} className="flex items-center">
                {gi > 0 && (
                  <div className="mx-1 h-5 w-px bg-brand-900/10 shrink-0" />
                )}
                <span className="mr-1 px-1.5 text-[9px] font-bold uppercase tracking-widest text-brand-600/50 select-none">
                  {group.label}
                </span>
                {group.tabs.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => switchTab(t.id)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition whitespace-nowrap ${
                      tab === t.id
                        ? "bg-brand-900 text-white shadow-sm"
                        : "text-brand-600 hover:bg-parchment hover:text-brand-900"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </nav>

        {/* Tab Content */}
        <div className="animate-in">
          {tab === "overview" && <OverviewTab project={project} onJumpTo={switchTab} />}
          {tab === "ai-workflow" && <AIRenderingPanel project={project} />}
          {tab === "scans" && <ScanViewer property={project.property} />}
          {tab === "style-quiz" && <StyleQuiz project={project} onUpdate={reload} />}
          {tab === "rooms" && <RoomPlanner project={project} onUpdate={reload} />}
          {tab === "sleep" && <SleepOptimizer project={project} onUpdate={reload} />}
          {tab === "proportions" && <RoomProportions project={project} onUpdate={reload} />}
          {tab === "design" && <DesignBoard project={project} onUpdate={reload} />}
          {tab === "catalog" && <FurniturePicker project={project} onUpdate={reload} />}
          {tab === "budget" && <BudgetDashboard project={project} onUpdate={reload} />}
          {tab === "mood" && <MoodBoardPanel project={project} onUpdate={reload} />}
          {tab === "export" && <ExportPanel project={project} />}
          {tab === "summary" && <ProjectSummary project={project} />}
          {tab === "chat" && (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <TeamChat projectId={projectId} />
              </div>
              <div>
                <ActivityFeed projectId={projectId} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Stat Card ──

function StatCard({
  label,
  value,
  target,
  status,
}: {
  label: string;
  value: number | string;
  target?: number | string;
  status?: "ok" | "warn" | "over";
}) {
  const statusColor =
    status === "over"
      ? "border-red-300 bg-red-50/50"
      : status === "warn"
      ? "border-amber/40 bg-amber/5"
      : status === "ok"
      ? "border-emerald-200 bg-emerald-50/50"
      : "border-brand-900/10 bg-white";

  return (
    <div className={`rounded-xl border p-4 shadow-sm transition ${statusColor}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-1">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={`text-xl font-bold ${
            status === "over" ? "text-red-600" : "text-brand-900"
          }`}
        >
          {value}
        </span>
        {target !== undefined && target !== 0 && (
          <span className="text-xs text-brand-600/60">/ {target}</span>
        )}
      </div>
    </div>
  );
}

// ── Overview Tab ──

function OverviewTab({
  project,
  onJumpTo,
}: {
  project: Project;
  onJumpTo: (tab: Tab) => void;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(project.notes);

  function saveNotes() {
    const fresh = getProject(project.id);
    if (!fresh) return;
    fresh.notes = notes;
    saveProject(fresh);
    setEditingNotes(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <ProjectChecklist project={project} onJumpTo={(t) => onJumpTo(t as Tab)} />
      </div>

      {/* Property */}
      <div className="card">
        <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
          <span className="text-base" aria-hidden>🏠</span> Property
        </h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Address" value={project.property.address} />
          <Field
            label="Location"
            value={`${project.property.city}, ${project.property.state}`}
          />
          <Field
            label="Size"
            value={
              project.property.squareFootage
                ? `${project.property.squareFootage.toLocaleString()} sqft`
                : "—"
            }
          />
          <Field
            label="Layout"
            value={`${project.property.bedrooms} bd / ${project.property.bathrooms} ba`}
          />
          <Field label="Floors" value={project.property.floors || "—"} />
        </dl>

        <div className="mt-4 pt-4 border-t border-brand-900/5 space-y-2">
          <ScanLink label="Matterport" url={project.property.matterportLink} />
          <ScanLink label="Polycam" url={project.property.polycamLink} />
          <ScanLink label="Spoak" url={project.property.spoakLink} />
        </div>
      </div>

      {/* Client */}
      <div className="card">
        <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
          <span className="text-base" aria-hidden>👤</span> Client
        </h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Name" value={project.client.name} />
          <Field label="Email" value={project.client.email} />
          <Field label="Phone" value={project.client.phone} />
        </dl>
        {project.client.preferences && (
          <div className="mt-4 pt-4 border-t border-brand-900/5">
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-1">
              Preferences
            </div>
            <p className="text-sm text-brand-700 whitespace-pre-wrap">
              {project.client.preferences}
            </p>
          </div>
        )}
      </div>

      {/* Design */}
      <div className="card lg:col-span-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
          <span className="text-base" aria-hidden>🎨</span> Design Settings
        </h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-brand-600">Style</dt>
            <dd className="font-medium text-brand-900 capitalize">{project.style.replace(/-/g, " ")}</dd>
          </div>
          <Field label="Target Guests" value={project.targetGuests} />
          <Field
            label="Budget"
            value={project.budget ? `$${project.budget.toLocaleString()}` : "Not set"}
          />
          <Field label="Status" value={project.status} />
        </dl>
        <div className="mt-4 pt-4 border-t border-brand-900/5">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              Project Notes
            </div>
            {!editingNotes ? (
              <button
                onClick={() => setEditingNotes(true)}
                className="text-xs text-amber-dark hover:underline"
              >
                Edit
              </button>
            ) : (
              <button
                onClick={saveNotes}
                className="text-xs text-amber-dark hover:underline font-medium"
              >
                Save
              </button>
            )}
          </div>
          {editingNotes ? (
            <textarea
              className="input min-h-[100px] resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add project notes, reminders, design decisions..."
              autoFocus
            />
          ) : (
            <p className="text-sm text-brand-700 whitespace-pre-wrap">
              {project.notes || "No notes yet. Click Edit to add some."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared components ──

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-brand-600">{label}</dt>
      <dd className="font-medium text-brand-900">{value || "—"}</dd>
    </div>
  );
}

function ScanLink({ label, url }: { label: string; url: string }) {
  if (!url) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-brand-600">{label}</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-amber-dark hover:underline"
      >
        Open Link &rarr;
      </a>
    </div>
  );
}
