"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import RoomPlanner from "@/components/RoomPlanner";
import SleepOptimizer from "@/components/SleepOptimizer";
import FurniturePicker from "@/components/FurniturePicker";
import DesignBoard from "@/components/DesignBoard";
import SpacePlanner from "@/components/SpacePlanner";
import MoodBoardPanel from "@/components/MoodBoardPanel";
import ExportPanel from "@/components/ExportPanel";
import TeamChat from "@/components/TeamChat";
import ScanViewer from "@/components/ScanViewer";
import ActivityFeed from "@/components/ActivityFeed";
import AIRenderingPanel from "@/components/AIRenderingPanel";
import ProjectChecklist from "@/components/ProjectChecklist";
import ProjectSummary from "@/components/ProjectSummary";
import WorkflowEngine from "@/components/WorkflowEngine";
import InspirationBoard from "@/components/InspirationBoard";
import ClientDelivery from "@/components/ClientDelivery";
import StyleQuiz from "@/components/StyleQuiz";
import ShoppingList from "@/components/ShoppingList";
import FinishesPicker from "@/components/FinishesPicker";
import TeamAssignments from "@/components/TeamAssignments";
import RenovationScopeBuilder from "@/components/RenovationScopeBuilder";
import ShareLinkButton from "@/components/ShareLinkButton";
import InvoiceGenerator from "@/components/InvoiceGenerator";
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
  | "overview"
  | "workflow"
  | "scans"
  | "rooms"
  | "sleep"
  | "space-plan"
  | "design"
  | "furniture"
  | "finishes"
  | "mood"
  | "inspiration"
  | "style-quiz"
  | "render"
  | "shopping"
  | "summary"
  | "delivery"
  | "export"
  | "invoicing"
  | "team"
  | "scope"
  | "chat";

const TABS: { id: Tab; label: string; group: string }[] = [
  { id: "overview", label: "Overview", group: "Project" },
  { id: "workflow", label: "AI Workflow", group: "Project" },
  { id: "scans", label: "3D Scans", group: "Inputs" },
  { id: "inspiration", label: "Inspiration", group: "Inputs" },
  { id: "style-quiz", label: "Style Quiz", group: "Design" },
  { id: "rooms", label: "Rooms", group: "Design" },
  { id: "sleep", label: "Sleep Plan", group: "Design" },
  { id: "space-plan", label: "Space Plan", group: "Design" },
  { id: "design", label: "Design Board", group: "Design" },
  { id: "furniture", label: "Catalog", group: "Design" },
  { id: "finishes", label: "Finishes", group: "Renovation" },
  { id: "scope", label: "Scope of Work", group: "Renovation" },
  { id: "team", label: "Team & Tasks", group: "Renovation" },
  { id: "mood", label: "Mood Board", group: "Design" },
  { id: "render", label: "AI Renders", group: "Output" },
  { id: "shopping", label: "Shopping List", group: "Output" },
  { id: "invoicing", label: "Proposals & Invoices", group: "Output" },
  { id: "summary", label: "Summary", group: "Output" },
  { id: "delivery", label: "Client View", group: "Output" },
  { id: "export", label: "Export", group: "Output" },
  { id: "chat", label: "Team Chat", group: "Collab" },
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
  const [tab, setTab] = useState<Tab>("overview");
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

  // Group tabs for display
  const tabGroups = new Map<string, typeof TABS>();
  for (const t of TABS) {
    const list = tabGroups.get(t.group) ?? [];
    list.push(t);
    tabGroups.set(t.group, list);
  }

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
          <QuickStat label="Rooms" value={project.rooms.length} />
          <QuickStat label="Sleeps" value={sleeping} target={project.targetGuests} />
          <QuickStat label="Items" value={totalItems} />
          <QuickStat
            label="Cost"
            value={`$${totalCost.toLocaleString()}`}
            target={project.budget ? `$${project.budget.toLocaleString()}` : undefined}
          />
          <QuickStat
            label="$/sqft"
            value={project.property.squareFootage > 0 ? `$${(totalCost / project.property.squareFootage).toFixed(0)}` : "—"}
            target="$10-20"
          />
        </div>

        {/* Tabs — mobile/tablet: select. Desktop (xl+): grouped tabs */}
        <div className="mb-6 xl:hidden">
          <select
            className="select w-full"
            value={tab}
            onChange={e => setTab(e.target.value as Tab)}
          >
            {Array.from(tabGroups.entries()).map(([group, groupTabs]) => (
              <optgroup key={group} label={group}>
                {groupTabs.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="mb-6 rounded-xl bg-white border border-brand-900/10 p-2 overflow-x-auto hidden xl:block">
          <div className="flex gap-3 min-w-max">
            {Array.from(tabGroups.entries()).map(([group, groupTabs], groupIdx) => (
              <div key={group} className="flex items-center gap-1 shrink-0">
                <span className="text-[9px] uppercase tracking-wider text-brand-600/40 font-semibold mr-1 shrink-0">
                  {group}
                </span>
                {groupTabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`shrink-0 ${tab === t.id ? "tab-active" : "tab"}`}
                  >
                    {t.label}
                  </button>
                ))}
                {groupIdx < tabGroups.size - 1 && <div className="w-px h-5 bg-brand-900/10 mx-1 shrink-0" />}
              </div>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="animate-in">
          {tab === "overview" && <OverviewTab project={project} />}
          {tab === "workflow" && <WorkflowEngine project={project} onUpdate={reload} />}
          {tab === "scans" && <ScanViewer property={project.property} />}
          {tab === "inspiration" && <InspirationBoard project={project} onUpdate={reload} />}
          {tab === "style-quiz" && <StyleQuiz project={project} onUpdate={reload} onComplete={() => setTab("mood")} />}
          {tab === "rooms" && <RoomPlanner project={project} onUpdate={reload} />}
          {tab === "sleep" && <SleepOptimizer project={project} onUpdate={reload} />}
          {tab === "space-plan" && <SpacePlanner project={project} onUpdate={reload} />}
          {tab === "design" && <DesignBoard project={project} onUpdate={reload} />}
          {tab === "furniture" && <FurniturePicker project={project} onUpdate={reload} />}
          {tab === "finishes" && <FinishesPicker project={project} onUpdate={reload} />}
          {tab === "scope" && <RenovationScopeBuilder project={project} onUpdate={reload} />}
          {tab === "team" && <TeamAssignments project={project} onUpdate={reload} />}
          {tab === "mood" && <MoodBoardPanel project={project} onUpdate={reload} />}
          {tab === "render" && <AIRenderingPanel project={project} />}
          {tab === "shopping" && <ShoppingList project={project} />}
          {tab === "invoicing" && <InvoiceGenerator project={project} />}
          {tab === "summary" && <ProjectSummary project={project} />}
          {tab === "delivery" && <ClientDelivery project={project} />}
          {tab === "export" && <ExportPanel project={project} />}
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

function QuickStat({
  label,
  value,
  target,
}: {
  label: string;
  value: number | string;
  target?: number | string;
}) {
  return (
    <div className="card py-3 px-4">
      <div className="text-[10px] uppercase tracking-wider text-brand-600 mb-0.5">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-bold text-brand-900">{value}</span>
        {target !== undefined && target !== 0 && (
          <span className="text-xs text-brand-600/60">/ {target}</span>
        )}
      </div>
    </div>
  );
}

function OverviewTab({ project }: { project: Project }) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(project.notes);

  function saveNotes() {
    project.notes = notes;
    saveProject(project);
    setEditingNotes(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Checklist */}
      <div className="lg:col-span-2">
        <ProjectChecklist project={project} />
      </div>

      {/* Property */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Property</h2>
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
          <Field label="Design Budget" value={project.budget ? `$${project.budget.toLocaleString()}` : "Not set"} />
        </dl>

        <div className="mt-4 pt-4 border-t border-brand-900/5 space-y-2">
          <ScanLink label="Matterport" url={project.property.matterportLink} color="blue" />
          <ScanLink label="Polycam" url={project.property.polycamLink} color="emerald" />
          <ScanLink label="Spoak" url={project.property.spoakLink} color="purple" />
        </div>
      </div>

      {/* Client */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Client</h2>
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

        {/* Quick Action: Send to Spoak */}
        {project.property.spoakLink && (
          <div className="mt-4 pt-4 border-t border-brand-900/5">
            <a
              href={project.property.spoakLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg bg-purple-50 border border-purple-200 px-3 py-2 text-sm text-purple-700 hover:bg-purple-100 transition"
            >
              <span className="font-bold">S</span>
              <span>Open design in Spoak for delivery</span>
              <span className="ml-auto">&rarr;</span>
            </a>
          </div>
        )}
      </div>

      {/* Design */}
      <div className="card lg:col-span-2">
        <h2 className="text-lg font-semibold mb-4">Design Settings</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Field label="Style" value={project.style.replace(/-/g, " ")} />
          <Field label="Target Guests" value={project.targetGuests} />
          <Field
            label="Budget"
            value={project.budget ? `$${project.budget.toLocaleString()}` : "Not set"}
          />
          <Field label="Status" value={project.status} />
        </dl>

        {/* Mood board preview */}
        {project.moodBoards.length > 0 && (
          <div className="mt-4 pt-4 border-t border-brand-900/5">
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-2">
              Active Mood Board
            </div>
            <div className="flex h-10 overflow-hidden rounded-lg">
              {project.moodBoards[0].colorPalette.map((color, i) => (
                <div key={i} className="flex-1" style={{ backgroundColor: color }} />
              ))}
            </div>
          </div>
        )}

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

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-brand-600">{label}</dt>
      <dd className="font-medium text-brand-900 capitalize">{value || "—"}</dd>
    </div>
  );
}

function ScanLink({ label, url, color }: { label: string; url: string; color: string }) {
  if (!url) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full bg-${color}-500`} />
        <span className="text-brand-600">{label}</span>
      </div>
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
