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
import FloorPlansPanel from "@/components/FloorPlansPanel";
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

        {/* Tabs — phone (<md): select dropdown. Anything larger: scrollable tabs. */}
        <div className="mb-6 md:hidden">
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

        <div className="mb-6 rounded-xl bg-white border border-brand-900/10 p-2 overflow-x-auto hidden md:block scroll-fade">
          <div className="flex gap-2 min-w-max items-center">
            {Array.from(tabGroups.entries()).map(([group, groupTabs], groupIdx) => (
              <div key={group} className="flex items-center gap-1 shrink-0">
                {/* Group label: visible only on xl+ where there's space */}
                <span className="hidden xl:inline text-[9px] uppercase tracking-wider text-brand-600/40 font-semibold mr-1 shrink-0">
                  {group}
                </span>
                {groupTabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={tab === t.id ? "tab-active" : "tab"}
                  >
                    {t.label}
                  </button>
                ))}
                {/* Separator between groups: always visible so tabs group visually */}
                {groupIdx < tabGroups.size - 1 && <div className="w-px h-5 bg-brand-900/10 mx-1 shrink-0" />}
              </div>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="animate-in">
          {tab === "overview" && <OverviewTab project={project} onUpdate={reload} />}
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

function OverviewTab({ project, onUpdate }: { project: Project; onUpdate: () => void }) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(project.notes);
  const [editingProperty, setEditingProperty] = useState(false);
  const [editingClient, setEditingClient] = useState(false);
  const [propertyForm, setPropertyForm] = useState(project.property);
  const [clientForm, setClientForm] = useState(project.client);

  function saveNotes() {
    project.notes = notes;
    saveProject(project);
    setEditingNotes(false);
  }

  function saveProperty() {
    const fresh = getProject(project.id);
    if (!fresh) return;
    fresh.property = { ...propertyForm };
    saveProject(fresh);
    setEditingProperty(false);
  }

  function saveClient() {
    const fresh = getProject(project.id);
    if (!fresh) return;
    fresh.client = { ...clientForm };
    saveProject(fresh);
    setEditingClient(false);
  }

  const hasScans = !!(project.property.matterportLink || project.property.polycamLink || project.property.spoakLink);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Checklist */}
      <div className="lg:col-span-2">
        <ProjectChecklist project={project} />
      </div>

      {/* Missing-scans nudge (hides once any link is added) */}
      {!hasScans && (
        <div className="lg:col-span-2 card bg-amber/10 border-amber/30">
          <div className="flex items-start gap-3">
            <div className="text-2xl">📐</div>
            <div className="flex-1">
              <h3 className="font-semibold text-brand-900 text-sm">
                Link your 3D scan for best results
              </h3>
              <p className="text-xs text-brand-700 mt-1 mb-2">
                The AI workflow and space planner use real dimensions from your
                Matterport, Polycam, or Spoak scan. Paste any URL below — the app
                auto-detects and embeds it.
              </p>
              <div className="text-[10px] text-brand-600/80">
                No scan yet?&nbsp;
                <a href="https://matterport.com" target="_blank" rel="noopener noreferrer" className="text-amber-dark underline">Matterport</a>
                &nbsp;·&nbsp;
                <a href="https://poly.cam" target="_blank" rel="noopener noreferrer" className="text-amber-dark underline">Polycam (free iPhone app)</a>
                &nbsp;·&nbsp;
                <a href="https://www.spoak.com" target="_blank" rel="noopener noreferrer" className="text-amber-dark underline">Spoak</a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Property */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Property</h2>
          {!editingProperty ? (
            <button
              onClick={() => {
                setPropertyForm(project.property);
                setEditingProperty(true);
              }}
              className="text-xs text-amber-dark hover:underline"
            >
              Edit
            </button>
          ) : (
            <div className="flex gap-3 text-xs">
              <button onClick={() => setEditingProperty(false)} className="text-brand-600 hover:text-brand-900">
                Cancel
              </button>
              <button onClick={saveProperty} className="text-amber-dark hover:underline font-medium">
                Save
              </button>
            </div>
          )}
        </div>

        {editingProperty ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <label className="label">Address</label>
              <input
                className="input"
                value={propertyForm.address}
                onChange={e => setPropertyForm({ ...propertyForm, address: e.target.value })}
              />
            </div>
            <div>
              <label className="label">City</label>
              <input
                className="input"
                value={propertyForm.city}
                onChange={e => setPropertyForm({ ...propertyForm, city: e.target.value })}
              />
            </div>
            <div>
              <label className="label">State</label>
              <input
                className="input"
                value={propertyForm.state}
                onChange={e => setPropertyForm({ ...propertyForm, state: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Square Footage</label>
              <input
                type="number"
                className="input"
                value={propertyForm.squareFootage || ""}
                onChange={e => setPropertyForm({ ...propertyForm, squareFootage: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="label">Floors</label>
              <input
                type="number"
                className="input"
                min={1}
                value={propertyForm.floors || ""}
                onChange={e => setPropertyForm({ ...propertyForm, floors: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div>
              <label className="label">Bedrooms</label>
              <input
                type="number"
                className="input"
                min={0}
                value={propertyForm.bedrooms || ""}
                onChange={e => setPropertyForm({ ...propertyForm, bedrooms: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="label">Bathrooms</label>
              <input
                type="number"
                className="input"
                min={0}
                step={0.5}
                value={propertyForm.bathrooms || ""}
                onChange={e => setPropertyForm({ ...propertyForm, bathrooms: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
        ) : (
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
        )}

        {/* 3D Scans — always editable, always visible */}
        <div className="mt-4 pt-4 border-t border-brand-900/5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              3D Scans &amp; Design Links
            </div>
            <span className="text-[10px] text-brand-600/60">Paste URLs below</span>
          </div>
          <div className="space-y-2">
            <ScanInput
              label="Matterport"
              icon="📐"
              placeholder="https://my.matterport.com/show/?m=..."
              url={editingProperty ? propertyForm.matterportLink : project.property.matterportLink}
              onChange={editingProperty ? (v) => setPropertyForm({ ...propertyForm, matterportLink: v }) : (v) => {
                const fresh = getProject(project.id);
                if (!fresh) return;
                fresh.property.matterportLink = v;
                saveProject(fresh);
              }}
              color="blue"
            />
            <ScanInput
              label="Polycam"
              icon="📱"
              placeholder="https://poly.cam/capture/..."
              url={editingProperty ? propertyForm.polycamLink : project.property.polycamLink}
              onChange={editingProperty ? (v) => setPropertyForm({ ...propertyForm, polycamLink: v }) : (v) => {
                const fresh = getProject(project.id);
                if (!fresh) return;
                fresh.property.polycamLink = v;
                saveProject(fresh);
              }}
              color="emerald"
            />
            <ScanInput
              label="Spoak"
              icon="🎨"
              placeholder="https://www.spoak.com/..."
              url={editingProperty ? propertyForm.spoakLink : project.property.spoakLink}
              onChange={editingProperty ? (v) => setPropertyForm({ ...propertyForm, spoakLink: v }) : (v) => {
                const fresh = getProject(project.id);
                if (!fresh) return;
                fresh.property.spoakLink = v;
                saveProject(fresh);
              }}
              color="purple"
            />
          </div>
        </div>

        {/* Floor Plans */}
        <div className="mt-4 pt-4 border-t border-brand-900/5">
          <FloorPlansPanel project={project} onUpdate={onUpdate} />
        </div>
      </div>

      {/* Client */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Client</h2>
          {!editingClient ? (
            <button
              onClick={() => {
                setClientForm(project.client);
                setEditingClient(true);
              }}
              className="text-xs text-amber-dark hover:underline"
            >
              Edit
            </button>
          ) : (
            <div className="flex gap-3 text-xs">
              <button onClick={() => setEditingClient(false)} className="text-brand-600 hover:text-brand-900">
                Cancel
              </button>
              <button onClick={saveClient} className="text-amber-dark hover:underline font-medium">
                Save
              </button>
            </div>
          )}
        </div>

        {editingClient ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <label className="label">Client Name</label>
              <input
                className="input"
                value={clientForm.name}
                onChange={e => setClientForm({ ...clientForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={clientForm.email}
                onChange={e => setClientForm({ ...clientForm, email: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                className="input"
                value={clientForm.phone}
                onChange={e => setClientForm({ ...clientForm, phone: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="label">Preferences / Notes</label>
              <textarea
                className="input min-h-[80px]"
                value={clientForm.preferences}
                onChange={e => setClientForm({ ...clientForm, preferences: e.target.value })}
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

/** Always-visible scan URL input with inline edit + open button. */
function ScanInput({
  label,
  icon,
  placeholder,
  url,
  onChange,
  color,
}: {
  label: string;
  icon: string;
  placeholder: string;
  url: string;
  onChange: (v: string) => void;
  color: string;
}) {
  const [value, setValue] = useState(url);
  const [focused, setFocused] = useState(false);
  const colorDot = {
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
    purple: "bg-purple-500",
  }[color] ?? "bg-gray-400";

  // Keep local state in sync when URL changes externally
  useEffect(() => { setValue(url); }, [url]);

  function handleBlur() {
    setFocused(false);
    if (value !== url) onChange(value);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-base" aria-hidden>{icon}</span>
      <div className="flex items-center gap-1.5 w-24 shrink-0">
        <div className={`h-1.5 w-1.5 rounded-full ${colorDot}`} />
        <span className="text-xs font-medium text-brand-700">{label}</span>
      </div>
      <input
        type="url"
        className="input flex-1 text-xs py-1.5"
        placeholder={placeholder}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={handleBlur}
        onFocus={() => setFocused(true)}
      />
      {url && !focused && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-amber-dark hover:underline shrink-0"
          title={`Open ${label}`}
        >
          Open →
        </a>
      )}
    </div>
  );
}
