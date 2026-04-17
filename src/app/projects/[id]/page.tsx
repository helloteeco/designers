"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
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

        {/* Grouped Tabs — scrollable with indicators */}
        <ScrollableTabs tab={tab} onSwitch={switchTab} />

        {/* Tab Content */}
        <div className="animate-in">
          {tab === "overview" && <OverviewTab project={project} onJumpTo={switchTab} onUpdate={reload} />}
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
  onUpdate,
}: {
  project: Project;
  onJumpTo: (tab: Tab) => void;
  onUpdate: () => void;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingProperty, setEditingProperty] = useState(false);
  const [editingClient, setEditingClient] = useState(false);
  const [notes, setNotes] = useState(project.notes);
  const [propertyDraft, setPropertyDraft] = useState(project.property);
  const [clientDraft, setClientDraft] = useState(project.client);

  function saveNotes() {
    const fresh = getProject(project.id);
    if (!fresh) return;
    fresh.notes = notes;
    saveProject(fresh);
    logActivity(project.id, "notes_updated", "Updated project notes");
    setEditingNotes(false);
    onUpdate();
  }

  function saveProperty() {
    const fresh = getProject(project.id);
    if (!fresh) return;
    fresh.property = { ...propertyDraft };
    saveProject(fresh);
    logActivity(project.id, "property_updated", "Updated property details");
    setEditingProperty(false);
    onUpdate();
  }

  function saveClient() {
    const fresh = getProject(project.id);
    if (!fresh) return;
    fresh.client = { ...clientDraft };
    saveProject(fresh);
    logActivity(project.id, "client_updated", "Updated client information");
    setEditingClient(false);
    onUpdate();
  }

  function cancelPropertyEdit() {
    setPropertyDraft(project.property);
    setEditingProperty(false);
  }

  function cancelClientEdit() {
    setClientDraft(project.client);
    setEditingClient(false);
  }

  const hasScanLinks =
    project.property.matterportLink ||
    project.property.polycamLink ||
    project.property.spoakLink;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <ProjectChecklist project={project} onJumpTo={(t) => onJumpTo(t as Tab)} />
      </div>

      {/* Property */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <span className="text-base" aria-hidden>🏠</span> Property
          </h2>
          {editingProperty ? (
            <div className="flex gap-2">
              <button
                onClick={cancelPropertyEdit}
                className="text-xs text-brand-600 hover:text-brand-900"
              >
                Cancel
              </button>
              <button
                onClick={saveProperty}
                className="text-xs font-semibold text-amber-dark hover:underline"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setPropertyDraft(project.property);
                setEditingProperty(true);
              }}
              className="text-xs text-amber-dark hover:underline"
            >
              Edit
            </button>
          )}
        </div>

        {editingProperty ? (
          <div className="space-y-3">
            <div>
              <label className="label">Address</label>
              <input
                className="input"
                value={propertyDraft.address}
                onChange={(e) => setPropertyDraft({ ...propertyDraft, address: e.target.value })}
                placeholder="123 Mountain View Dr"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">City</label>
                <input
                  className="input"
                  value={propertyDraft.city}
                  onChange={(e) => setPropertyDraft({ ...propertyDraft, city: e.target.value })}
                />
              </div>
              <div>
                <label className="label">State</label>
                <input
                  className="input"
                  value={propertyDraft.state}
                  onChange={(e) => setPropertyDraft({ ...propertyDraft, state: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Sq Footage</label>
                <input
                  type="number"
                  className="input"
                  min={0}
                  value={propertyDraft.squareFootage || ""}
                  onChange={(e) =>
                    setPropertyDraft({ ...propertyDraft, squareFootage: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <label className="label">Floors</label>
                <input
                  type="number"
                  className="input"
                  min={1}
                  value={propertyDraft.floors || ""}
                  onChange={(e) =>
                    setPropertyDraft({ ...propertyDraft, floors: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Bedrooms</label>
                <input
                  type="number"
                  className="input"
                  min={0}
                  value={propertyDraft.bedrooms || ""}
                  onChange={(e) =>
                    setPropertyDraft({ ...propertyDraft, bedrooms: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <label className="label">Bathrooms</label>
                <input
                  type="number"
                  step={0.5}
                  className="input"
                  min={0}
                  value={propertyDraft.bathrooms || ""}
                  onChange={(e) =>
                    setPropertyDraft({ ...propertyDraft, bathrooms: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Address" value={project.property.address} />
            <Field
              label="Location"
              value={
                project.property.city || project.property.state
                  ? `${project.property.city}${project.property.state ? ", " + project.property.state : ""}`
                  : ""
              }
            />
            <Field
              label="Size"
              value={
                project.property.squareFootage
                  ? `${project.property.squareFootage.toLocaleString()} sqft`
                  : ""
              }
            />
            <Field
              label="Layout"
              value={`${project.property.bedrooms} bd / ${project.property.bathrooms} ba`}
            />
            <Field label="Floors" value={project.property.floors || ""} />
          </dl>
        )}

        {/* Scan Links — always visible with CTA when missing */}
        <div className="mt-4 pt-4 border-t border-brand-900/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              3D Scans
            </span>
            <button
              onClick={() => onJumpTo("scans")}
              className="text-xs text-amber-dark hover:underline"
            >
              {hasScanLinks ? "Manage →" : "Add scan →"}
            </button>
          </div>
          {hasScanLinks ? (
            <div className="space-y-1.5">
              <ScanLink label="Matterport" url={project.property.matterportLink} />
              <ScanLink label="Polycam" url={project.property.polycamLink} />
              <ScanLink label="Spoak" url={project.property.spoakLink} />
            </div>
          ) : (
            <p className="text-xs text-brand-600/70 italic">
              No 3D scans linked yet.
            </p>
          )}
        </div>
      </div>

      {/* Client */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <span className="text-base" aria-hidden>👤</span> Client
          </h2>
          {editingClient ? (
            <div className="flex gap-2">
              <button
                onClick={cancelClientEdit}
                className="text-xs text-brand-600 hover:text-brand-900"
              >
                Cancel
              </button>
              <button
                onClick={saveClient}
                className="text-xs font-semibold text-amber-dark hover:underline"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setClientDraft(project.client);
                setEditingClient(true);
              }}
              className="text-xs text-amber-dark hover:underline"
            >
              Edit
            </button>
          )}
        </div>

        {editingClient ? (
          <div className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={clientDraft.name}
                onChange={(e) => setClientDraft({ ...clientDraft, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input"
                  value={clientDraft.email}
                  onChange={(e) => setClientDraft({ ...clientDraft, email: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Phone</label>
                <input
                  type="tel"
                  className="input"
                  value={clientDraft.phone}
                  onChange={(e) => setClientDraft({ ...clientDraft, phone: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label">Preferences / Notes</label>
              <textarea
                className="input min-h-[80px] resize-y"
                value={clientDraft.preferences}
                onChange={(e) => setClientDraft({ ...clientDraft, preferences: e.target.value })}
                placeholder="Style preferences, color likes/dislikes, special requests..."
              />
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Design Settings */}
      <div className="card lg:col-span-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
          <span className="text-base" aria-hidden>🎨</span> Design Settings
        </h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <ClickableField
            label="Style"
            value={project.style.replace(/-/g, " ")}
            capitalize
            onClick={() => onJumpTo("style-quiz")}
            cta="Retake quiz →"
          />
          <ClickableField
            label="Target Guests"
            value={project.targetGuests}
            onClick={() => onJumpTo("sleep")}
            cta="Plan beds →"
          />
          <ClickableField
            label="Budget"
            value={project.budget ? `$${project.budget.toLocaleString()}` : "Not set"}
            onClick={() => onJumpTo("budget")}
            cta={project.budget ? "Track →" : "Set →"}
          />
          <Field label="Status" value={project.status} />
        </dl>

        {/* Project Notes */}
        <div className="mt-4 pt-4 border-t border-brand-900/5">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              Project Notes
            </div>
            {!editingNotes ? (
              <button
                onClick={() => {
                  setNotes(project.notes);
                  setEditingNotes(true);
                }}
                className="text-xs text-amber-dark hover:underline"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingNotes(false)}
                  className="text-xs text-brand-600 hover:text-brand-900"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNotes}
                  className="text-xs font-semibold text-amber-dark hover:underline"
                >
                  Save
                </button>
              </div>
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

function ClickableField({
  label,
  value,
  onClick,
  cta,
  capitalize,
}: {
  label: string;
  value: string | number;
  onClick: () => void;
  cta: string;
  capitalize?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left rounded-lg -mx-2 px-2 py-1 transition hover:bg-amber/5"
    >
      <div className="text-[10px] uppercase tracking-wider text-brand-600">{label}</div>
      <div className={`font-medium text-brand-900 ${capitalize ? "capitalize" : ""}`}>
        {value || "—"}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold text-amber-dark opacity-0 transition group-hover:opacity-100">
        {cta}
      </div>
    </button>
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

// ── Scrollable Tabs with fade + arrow indicators ──

function ScrollableTabs({ tab, onSwitch }: { tab: Tab; onSwitch: (t: Tab) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function updateScrollState() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, []);

  // Auto-scroll active tab into view
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const active = el.querySelector("[data-active-tab]") as HTMLElement | null;
    if (active) {
      const left = active.offsetLeft - el.offsetLeft - 40;
      el.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    }
  }, [tab]);

  function scroll(dir: "left" | "right") {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
  }

  return (
    <div className="relative mb-6">
      {/* Left fade + arrow */}
      {canScrollLeft && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-12 rounded-l-xl bg-gradient-to-r from-white to-transparent" />
          <button
            type="button"
            onClick={() => scroll("left")}
            className="absolute left-0 top-1/2 z-20 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md border border-brand-900/10 text-brand-700 hover:bg-parchment transition"
            aria-label="Scroll tabs left"
          >
            ‹
          </button>
        </>
      )}

      {/* Right fade + arrow */}
      {canScrollRight && (
        <>
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-12 rounded-r-xl bg-gradient-to-l from-white to-transparent" />
          <button
            type="button"
            onClick={() => scroll("right")}
            className="absolute right-0 top-1/2 z-20 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md border border-brand-900/10 text-brand-700 hover:bg-parchment transition"
            aria-label="Scroll tabs right"
          >
            ›
          </button>
        </>
      )}

      {/* Scroll container */}
      <nav
        ref={scrollRef}
        className="overflow-x-auto rounded-xl border border-brand-900/10 bg-white p-1.5 scrollbar-hide"
        role="tablist"
        aria-label="Project sections"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <div className="flex items-center gap-0.5 min-w-max">
          {TAB_GROUPS.map((group, gi) => (
            <div key={group.label} className="flex items-center">
              {gi > 0 && (
                <div className="mx-1 h-5 w-px bg-brand-900/10 shrink-0" />
              )}
              <span className="mr-1 px-1 text-[9px] font-bold uppercase tracking-widest text-brand-600/50 select-none whitespace-nowrap">
                {group.label}
              </span>
              {group.tabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  {...(tab === t.id ? { "data-active-tab": "" } : {})}
                  onClick={() => onSwitch(t.id)}
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
    </div>
  );
}
