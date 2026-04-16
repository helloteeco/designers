"use client";

import { useState } from "react";
import { saveProject, getProject as getProjectFromStore, generateId, logActivity } from "@/lib/store";
import { TRADE_LABELS } from "@/lib/finishes-catalog";
import type { Project, TeamMember, TaskAssignment, TradeType } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

const ALL_TRADES: TradeType[] = [
  "interior-designer", "general-contractor", "project-manager",
  "plumber", "electrician", "tile-installer", "flooring-installer",
  "painter", "cabinet-maker", "carpenter", "hvac", "drywall", "handyman",
];

const TRADE_ICONS: Record<string, string> = {
  "general-contractor": "🏗️", "plumber": "🚿", "electrician": "⚡",
  "tile-installer": "🧱", "flooring-installer": "🪵", "painter": "🎨",
  "cabinet-maker": "🪚", "carpenter": "🔨", "hvac": "❄️",
  "drywall": "🧰", "handyman": "🛠️", "interior-designer": "✏️",
  "project-manager": "📋",
};

const TASK_STATUS_COLORS: Record<TaskAssignment["status"], string> = {
  "not-started": "bg-gray-100 text-gray-700",
  "in-progress": "bg-amber-100 text-amber-700",
  "blocked": "bg-red-100 text-red-700",
  "complete": "bg-emerald-100 text-emerald-700",
};

export default function TeamAssignments({ project, onUpdate }: Props) {
  const [view, setView] = useState<"team" | "tasks">("team");
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [memberForm, setMemberForm] = useState({
    name: "", email: "", phone: "", role: "general-contractor" as TradeType,
    company: "", notes: "", hourlyRate: 0,
    preferredContact: "email" as TeamMember["preferredContact"],
  });
  const [taskForm, setTaskForm] = useState({
    title: "", description: "", assignedTo: "", roomId: "",
    trade: "general-contractor" as TradeType, dueDate: "",
  });

  const team = project.team ?? [];
  const tasks = project.tasks ?? [];
  const finishes = project.finishes ?? [];

  // Detect trades needed based on finishes spec'd
  const tradesNeeded = new Set<TradeType>(finishes.map(f => f.item.trade));
  const tradesAssigned = new Set(team.map(m => m.role));
  const tradesMissing = Array.from(tradesNeeded).filter(t => !tradesAssigned.has(t));

  function addMember(e: React.FormEvent) {
    e.preventDefault();
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    if (!fresh.team) fresh.team = [];
    const member: TeamMember = {
      id: generateId(),
      name: memberForm.name,
      email: memberForm.email,
      phone: memberForm.phone,
      role: memberForm.role,
      company: memberForm.company,
      notes: memberForm.notes,
      hourlyRate: memberForm.hourlyRate || undefined,
      preferredContact: memberForm.preferredContact,
    };
    fresh.team.push(member);
    saveProject(fresh);
    logActivity(project.id, "team_member_added", `Added ${member.name} as ${TRADE_LABELS[member.role]}`);
    setShowAddMember(false);
    setMemberForm({
      name: "", email: "", phone: "", role: "general-contractor",
      company: "", notes: "", hourlyRate: 0, preferredContact: "email",
    });
    onUpdate();
  }

  function removeMember(id: string) {
    if (!confirm("Remove this team member? Their task assignments will be unassigned.")) return;
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    fresh.team = (fresh.team ?? []).filter(m => m.id !== id);
    // Unassign tasks
    (fresh.tasks ?? []).forEach(t => {
      if (t.assignedTo === id) t.assignedTo = "";
    });
    // Unassign finishes
    (fresh.finishes ?? []).forEach(f => {
      if (f.assignedTo === id) f.assignedTo = undefined;
    });
    saveProject(fresh);
    onUpdate();
  }

  function addTask(e: React.FormEvent) {
    e.preventDefault();
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    if (!fresh.tasks) fresh.tasks = [];
    const task: TaskAssignment = {
      id: generateId(),
      title: taskForm.title,
      description: taskForm.description,
      assignedTo: taskForm.assignedTo,
      roomId: taskForm.roomId || undefined,
      trade: taskForm.trade,
      status: "not-started",
      dueDate: taskForm.dueDate || undefined,
      dependencies: [],
      notes: "",
    };
    fresh.tasks.push(task);
    saveProject(fresh);
    logActivity(project.id, "task_created", `Created task: ${task.title}`);
    setShowAddTask(false);
    setTaskForm({
      title: "", description: "", assignedTo: "", roomId: "",
      trade: "general-contractor", dueDate: "",
    });
    onUpdate();
  }

  function updateTaskStatus(id: string, status: TaskAssignment["status"]) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const t = (fresh.tasks ?? []).find(t => t.id === id);
    if (!t) return;
    t.status = status;
    saveProject(fresh);
    onUpdate();
  }

  function removeTask(id: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    fresh.tasks = (fresh.tasks ?? []).filter(t => t.id !== id);
    saveProject(fresh);
    onUpdate();
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Team &amp; Tasks</h2>
          <p className="text-sm text-brand-600">
            Assign designers, contractors, and trades. Track tasks from design through install.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView("team")} className={view === "team" ? "tab-active" : "tab"}>
            Team ({team.length})
          </button>
          <button onClick={() => setView("tasks")} className={view === "tasks" ? "tab-active" : "tab"}>
            Tasks ({tasks.length})
          </button>
        </div>
      </div>

      {/* Trades Missing Alert */}
      {tradesMissing.length > 0 && (
        <div className="mb-4 card bg-amber/10 border-amber/30">
          <div className="flex items-start gap-3">
            <div className="text-2xl">⚠️</div>
            <div className="flex-1">
              <div className="font-semibold text-amber-dark text-sm">Unassigned Trades</div>
              <p className="text-xs text-brand-700 mt-1">
                You have finishes spec'd that need these trades but no one is assigned:
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                {tradesMissing.map(t => (
                  <button
                    key={t}
                    onClick={() => {
                      setMemberForm({ ...memberForm, role: t });
                      setShowAddMember(true);
                    }}
                    className="text-[11px] bg-white rounded-full px-2.5 py-1 border border-amber/30 hover:bg-amber/5"
                  >
                    + {TRADE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TEAM VIEW */}
      {view === "team" && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowAddMember(true)} className="btn-primary btn-sm">
              + Add Team Member
            </button>
          </div>

          {team.length === 0 ? (
            <div className="card text-center py-12">
              <div className="text-4xl mb-3">👥</div>
              <p className="text-brand-600 mb-4">No team members yet.</p>
              <p className="text-xs text-brand-600/60 max-w-md mx-auto mb-4">
                Add your designers, GC, subcontractors, and project managers. They'll show up as options
                when assigning tasks and finishes.
              </p>
              <button onClick={() => setShowAddMember(true)} className="btn-secondary">
                Add First Team Member
              </button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {team.map(m => {
                const memberTasks = tasks.filter(t => t.assignedTo === m.id);
                const memberFinishes = finishes.filter(f => f.assignedTo === m.id);
                return (
                  <div key={m.id} className="card group">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-2">
                        <span className="text-2xl">{TRADE_ICONS[m.role] ?? "👤"}</span>
                        <div>
                          <div className="font-semibold text-brand-900">{m.name || "Unnamed"}</div>
                          <div className="text-xs text-brand-600">{TRADE_LABELS[m.role]}</div>
                          {m.company && <div className="text-[10px] text-brand-600/60">{m.company}</div>}
                        </div>
                      </div>
                      <button
                        onClick={() => removeMember(m.id)}
                        className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="space-y-1 text-xs mb-3">
                      {m.email && (
                        <a href={`mailto:${m.email}`} className="flex items-center gap-2 text-brand-600 hover:text-amber-dark">
                          <span>📧</span> {m.email}
                        </a>
                      )}
                      {m.phone && (
                        <a href={`tel:${m.phone}`} className="flex items-center gap-2 text-brand-600 hover:text-amber-dark">
                          <span>📱</span> {m.phone}
                        </a>
                      )}
                      {m.hourlyRate && (
                        <div className="text-brand-600">💰 ${m.hourlyRate}/hr</div>
                      )}
                    </div>

                    <div className="flex gap-3 pt-2 border-t border-brand-900/5 text-[10px] text-brand-600">
                      <span>{memberTasks.length} tasks</span>
                      <span>•</span>
                      <span>{memberFinishes.length} finishes</span>
                      <span className="ml-auto">Contact: {m.preferredContact}</span>
                    </div>

                    {m.notes && (
                      <p className="text-xs text-brand-700 mt-2 pt-2 border-t border-brand-900/5">{m.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TASKS VIEW */}
      {view === "tasks" && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowAddTask(true)}
              disabled={team.length === 0}
              className="btn-primary btn-sm"
            >
              + Add Task
            </button>
          </div>

          {tasks.length === 0 ? (
            <div className="card text-center py-12">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-brand-600 mb-2">No tasks yet.</p>
              {team.length === 0 ? (
                <p className="text-xs text-brand-600/60">Add team members first, then you can assign tasks.</p>
              ) : (
                <button onClick={() => setShowAddTask(true)} className="btn-secondary mt-2">
                  Add First Task
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map(t => {
                const assignee = team.find(m => m.id === t.assignedTo);
                const room = project.rooms.find(r => r.id === t.roomId);
                return (
                  <div key={t.id} className="card">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] rounded-full px-2 py-0.5 ${TASK_STATUS_COLORS[t.status]}`}>
                            {t.status}
                          </span>
                          <span className="badge-neutral text-[10px]">{TRADE_LABELS[t.trade]}</span>
                          {room && <span className="text-[10px] text-brand-600">📍 {room.name}</span>}
                          {t.dueDate && <span className="text-[10px] text-brand-600">📅 {new Date(t.dueDate).toLocaleDateString()}</span>}
                        </div>
                        <h4 className="font-semibold text-brand-900">{t.title}</h4>
                        {t.description && <p className="text-xs text-brand-700 mt-1">{t.description}</p>}
                        {assignee && (
                          <div className="text-xs text-brand-600 mt-2">
                            Assigned to: <span className="font-medium">{assignee.name}</span> ({TRADE_LABELS[assignee.role]})
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 items-end ml-3">
                        <select
                          className={`text-xs rounded px-2 py-1 border-0 ${TASK_STATUS_COLORS[t.status]}`}
                          value={t.status}
                          onChange={e => updateTaskStatus(t.id, e.target.value as TaskAssignment["status"])}
                        >
                          <option value="not-started">Not Started</option>
                          <option value="in-progress">In Progress</option>
                          <option value="blocked">Blocked</option>
                          <option value="complete">Complete</option>
                        </select>
                        <button onClick={() => removeTask(t.id)} className="text-xs text-red-400 hover:text-red-600">
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ADD MEMBER MODAL */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Add Team Member</h2>
            <form onSubmit={addMember} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Name</label>
                  <input className="input" value={memberForm.name} onChange={e => setMemberForm({ ...memberForm, name: e.target.value })} required />
                </div>
                <div>
                  <label className="label">Role / Trade</label>
                  <select className="select" value={memberForm.role} onChange={e => setMemberForm({ ...memberForm, role: e.target.value as TradeType })}>
                    {ALL_TRADES.map(t => (
                      <option key={t} value={t}>{TRADE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Company</label>
                <input className="input" value={memberForm.company} onChange={e => setMemberForm({ ...memberForm, company: e.target.value })} placeholder="Acme Plumbing Co." />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Email</label>
                  <input type="email" className="input" value={memberForm.email} onChange={e => setMemberForm({ ...memberForm, email: e.target.value })} />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" value={memberForm.phone} onChange={e => setMemberForm({ ...memberForm, phone: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Hourly Rate (optional)</label>
                  <input type="number" className="input" value={memberForm.hourlyRate} onChange={e => setMemberForm({ ...memberForm, hourlyRate: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="label">Preferred Contact</label>
                  <select className="select" value={memberForm.preferredContact} onChange={e => setMemberForm({ ...memberForm, preferredContact: e.target.value as TeamMember["preferredContact"] })}>
                    <option value="email">Email</option>
                    <option value="phone">Phone Call</option>
                    <option value="text">Text Message</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Notes</label>
                <textarea className="input min-h-[60px]" value={memberForm.notes} onChange={e => setMemberForm({ ...memberForm, notes: e.target.value })} placeholder="Availability, specialties, referral source..." />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddMember(false)} className="btn-secondary btn-sm">Cancel</button>
                <button type="submit" className="btn-primary btn-sm">Add Member</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD TASK MODAL */}
      {showAddTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Create Task</h2>
            <form onSubmit={addTask} className="space-y-4">
              <div>
                <label className="label">Task Title</label>
                <input className="input" value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Demo kitchen cabinets" required />
              </div>

              <div>
                <label className="label">Description</label>
                <textarea className="input min-h-[80px]" value={taskForm.description} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })} placeholder="What needs to be done, materials to use, special instructions..." />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Trade</label>
                  <select className="select" value={taskForm.trade} onChange={e => setTaskForm({ ...taskForm, trade: e.target.value as TradeType })}>
                    {ALL_TRADES.map(t => (
                      <option key={t} value={t}>{TRADE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Assign To</label>
                  <select className="select" value={taskForm.assignedTo} onChange={e => setTaskForm({ ...taskForm, assignedTo: e.target.value })}>
                    <option value="">Unassigned</option>
                    {team.filter(m => m.role === taskForm.trade).map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Room (optional)</label>
                  <select className="select" value={taskForm.roomId} onChange={e => setTaskForm({ ...taskForm, roomId: e.target.value })}>
                    <option value="">No specific room</option>
                    {project.rooms.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Due Date</label>
                  <input type="date" className="input" value={taskForm.dueDate} onChange={e => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddTask(false)} className="btn-secondary btn-sm">Cancel</button>
                <button type="submit" className="btn-primary btn-sm">Create Task</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
