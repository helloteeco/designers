"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { getUser, getProfile, syncProfile } from "@/lib/store";
import { isConfigured, dbGetTeamMembers } from "@/lib/supabase";
import {
  getStudioSettings,
  saveStudioSettings,
  downloadBackup,
  importBackup,
  exportAllData,
  type StudioSettings,
  type BackupPayload,
} from "@/lib/studio-settings";

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
}

type Tab = "studio" | "pricing" | "team" | "data" | "cloud";

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfileState] = useState(getProfile());
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<Tab>("studio");
  const [studioSettings, setStudioSettings] = useState<StudioSettings>(getStudioSettings());
  const [saveNote, setSaveNote] = useState("");
  const [importResult, setImportResult] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const user = getUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    setStudioSettings(getStudioSettings());

    async function load() {
      if (isConfigured()) {
        const p = await syncProfile();
        if (p) {
          setProfileState(p);
          const m = await dbGetTeamMembers(p.companyId);
          setMembers(m as TeamMember[]);
        }
      }
      setLoading(false);
    }
    load();
  }, [router]);

  function copyInvite() {
    if (profile?.inviteCode) {
      navigator.clipboard.writeText(profile.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function updateSetting<K extends keyof StudioSettings>(key: K, value: StudioSettings[K]) {
    setStudioSettings(prev => ({ ...prev, [key]: value }));
  }

  function saveSettings() {
    saveStudioSettings(studioSettings);
    setSaveNote("Settings saved.");
    setTimeout(() => setSaveNote(""), 2000);
  }

  function handleBackupDownload() {
    try {
      downloadBackup(studioSettings.studioName || "designstudio");
    } catch (e) {
      alert("Backup failed: " + (e instanceof Error ? e.message : "unknown"));
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("Importing a backup will REPLACE all current projects and settings. Continue?")) {
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const payload = JSON.parse(ev.target?.result as string) as BackupPayload;
        const result = importBackup(payload);
        setImportResult(`Imported ${result.projectsImported} project(s). Reloading...`);
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        alert("Import failed: " + (err instanceof Error ? err.message : "unknown"));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const backupStats = (() => {
    try {
      const data = exportAllData();
      return {
        projects: data.projects.length,
        customItems: data.customItems.length,
        inspirationCount: Object.keys(data.inspirationItems).length,
      };
    } catch {
      return { projects: 0, customItems: 0, inspirationCount: 0 };
    }
  })();

  const TABS: { id: Tab; label: string }[] = [
    { id: "studio", label: "Studio Profile" },
    { id: "pricing", label: "Pricing & Defaults" },
    { id: "team", label: "Team" },
    { id: "data", label: "Backup & Data" },
    { id: "cloud", label: "Cloud Sync" },
  ];

  return (
    <div className="min-h-screen bg-cream">
      <Navbar />
      <main className="mx-auto max-w-5xl px-6 py-8 animate-in">
        <div className="flex items-start justify-between mb-6">
          <h1 className="text-2xl font-bold text-brand-900">Settings</h1>
          {saveNote && (
            <span className="text-xs text-emerald-600 font-medium">{saveNote}</span>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-1 rounded-xl bg-white border border-brand-900/10 p-1 w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={tab === t.id ? "tab-active" : "tab"}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* STUDIO PROFILE */}
        {tab === "studio" && (
          <div className="space-y-6">
            <section className="card">
              <h2 className="text-lg font-semibold mb-1">Studio Branding</h2>
              <p className="text-sm text-brand-600 mb-4">
                Shown on client-facing design briefs, share links, and PDF exports.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label">Studio Name</label>
                  <input
                    className="input"
                    placeholder="Your Design Studio, LLC"
                    value={studioSettings.studioName}
                    onChange={e => updateSetting("studioName", e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Logo URL</label>
                  <input
                    className="input"
                    placeholder="https://..."
                    value={studioSettings.studioLogoUrl}
                    onChange={e => updateSetting("studioLogoUrl", e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Website</label>
                  <input
                    className="input"
                    placeholder="https://yourstudio.com"
                    value={studioSettings.studioWebsite}
                    onChange={e => updateSetting("studioWebsite", e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Studio Email</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="hello@yourstudio.com"
                    value={studioSettings.studioEmail}
                    onChange={e => updateSetting("studioEmail", e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Studio Phone</label>
                  <input
                    className="input"
                    placeholder="(555) 123-4567"
                    value={studioSettings.studioPhone}
                    onChange={e => updateSetting("studioPhone", e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Studio Address</label>
                  <input
                    className="input"
                    placeholder="123 Design St, San Diego, CA"
                    value={studioSettings.studioAddress}
                    onChange={e => updateSetting("studioAddress", e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Brand Primary Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-10 w-14 rounded border border-brand-900/10 cursor-pointer"
                      value={studioSettings.studioPrimaryColor}
                      onChange={e => updateSetting("studioPrimaryColor", e.target.value)}
                    />
                    <input
                      className="input flex-1"
                      value={studioSettings.studioPrimaryColor}
                      onChange={e => updateSetting("studioPrimaryColor", e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Brand Accent Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-10 w-14 rounded border border-brand-900/10 cursor-pointer"
                      value={studioSettings.studioAccentColor}
                      onChange={e => updateSetting("studioAccentColor", e.target.value)}
                    />
                    <input
                      className="input flex-1"
                      value={studioSettings.studioAccentColor}
                      onChange={e => updateSetting("studioAccentColor", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="card">
              <h2 className="text-lg font-semibold mb-4">Your Profile</h2>
              {loading ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-4 w-1/3 rounded bg-brand-900/10" />
                  <div className="h-4 w-1/2 rounded bg-brand-900/5" />
                </div>
              ) : (
                <dl className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-brand-600">Name</dt>
                    <dd className="font-medium text-brand-900">{profile?.name || getUser()?.name || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-brand-600">Email</dt>
                    <dd className="font-medium text-brand-900">{profile?.email || getUser()?.email || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-brand-600">Role</dt>
                    <dd className="font-medium text-brand-900 capitalize">{profile?.role || "designer"}</dd>
                  </div>
                </dl>
              )}
            </section>

            <div className="flex justify-end">
              <button onClick={saveSettings} className="btn-primary">Save Settings</button>
            </div>
          </div>
        )}

        {/* PRICING */}
        {tab === "pricing" && (
          <div className="space-y-6">
            <section className="card">
              <h2 className="text-lg font-semibold mb-1">Billing Model</h2>
              <p className="text-sm text-brand-600 mb-4">
                How you charge clients for your design services. Used for client-facing brief totals.
              </p>

              <div className="grid grid-cols-3 gap-3 mb-4">
                {(["percent", "flat", "hourly"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => updateSetting("preferredMarkupType", t)}
                    className={`rounded-xl border-2 px-4 py-3 text-left transition ${
                      studioSettings.preferredMarkupType === t
                        ? "border-amber bg-amber/5"
                        : "border-brand-900/10 hover:border-amber/40"
                    }`}
                  >
                    <div className="font-semibold text-brand-900 text-sm capitalize">
                      {t === "percent" ? "% Markup" : t === "flat" ? "Flat Fee" : "Hourly"}
                    </div>
                    <div className="text-[11px] text-brand-600 mt-1">
                      {t === "percent" && "Add % on top of wholesale furniture pricing"}
                      {t === "flat" && "Fixed design fee regardless of project size"}
                      {t === "hourly" && "Billed by the hour for design time"}
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="label">Markup %</label>
                  <div className="relative">
                    <input
                      type="number"
                      className="input pr-8"
                      value={studioSettings.defaultMarkupPercent}
                      onChange={e => updateSetting("defaultMarkupPercent", parseFloat(e.target.value) || 0)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-600 text-sm">%</span>
                  </div>
                  <div className="text-[10px] text-brand-600 mt-1">Industry standard: 20-40%</div>
                </div>
                <div>
                  <label className="label">Hourly Rate</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-600 text-sm">$</span>
                    <input
                      type="number"
                      className="input pl-7"
                      value={studioSettings.defaultHourlyRate}
                      onChange={e => updateSetting("defaultHourlyRate", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="text-[10px] text-brand-600 mt-1">Industry: $125-$300/hr</div>
                </div>
                <div>
                  <label className="label">Flat Design Fee</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-600 text-sm">$</span>
                    <input
                      type="number"
                      className="input pl-7"
                      value={studioSettings.defaultFlatDesignFee}
                      onChange={e => updateSetting("defaultFlatDesignFee", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="text-[10px] text-brand-600 mt-1">Per project, per room, etc.</div>
                </div>
              </div>
            </section>

            <section className="card">
              <h2 className="text-lg font-semibold mb-1">Budget Guidance</h2>
              <p className="text-sm text-brand-600 mb-4">
                Default targets for new projects. Alerts flag when projects exceed.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Target $/sqft (Furnishing)</label>
                  <input
                    type="number"
                    className="input"
                    value={studioSettings.targetCostPerSqft}
                    onChange={e => updateSetting("targetCostPerSqft", parseFloat(e.target.value) || 0)}
                  />
                  <div className="text-[10px] text-brand-600 mt-1">Airbnb rule of thumb: $10-$20/sqft</div>
                </div>
                <div>
                  <label className="label">Renovation Contingency %</label>
                  <input
                    type="number"
                    className="input"
                    value={studioSettings.contingencyPercent}
                    onChange={e => updateSetting("contingencyPercent", parseFloat(e.target.value) || 0)}
                  />
                  <div className="text-[10px] text-brand-600 mt-1">Standard: 10-20% buffer on renos</div>
                </div>
              </div>
            </section>

            <section className="card">
              <h2 className="text-lg font-semibold mb-1">Client-Facing Visibility</h2>
              <p className="text-sm text-brand-600 mb-4">
                Control what shows in client presentations and share links.
              </p>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-brand-900/20"
                    checked={studioSettings.showPricingToClient}
                    onChange={e => updateSetting("showPricingToClient", e.target.checked)}
                  />
                  <div>
                    <div className="text-sm font-medium text-brand-900">Show pricing to client</div>
                    <div className="text-[10px] text-brand-600">
                      If unchecked, prices are hidden on client delivery views and share links.
                    </div>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-brand-900/20"
                    checked={studioSettings.showVendorLinksToClient}
                    onChange={e => updateSetting("showVendorLinksToClient", e.target.checked)}
                  />
                  <div>
                    <div className="text-sm font-medium text-brand-900">Show vendor links to client</div>
                    <div className="text-[10px] text-brand-600">
                      If unchecked, Wayfair/Amazon/etc. links are hidden — protects your sourcing.
                    </div>
                  </div>
                </label>
                <div>
                  <label className="label">Brief Footer Note</label>
                  <textarea
                    className="input min-h-[60px]"
                    placeholder="Thank you message shown on every client brief."
                    value={studioSettings.briefFooterNote}
                    onChange={e => updateSetting("briefFooterNote", e.target.value)}
                  />
                </div>
              </div>
            </section>

            <div className="flex justify-end">
              <button onClick={saveSettings} className="btn-primary">Save Settings</button>
            </div>
          </div>
        )}

        {/* TEAM */}
        {tab === "team" && (
          <section className="card">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Team</h2>
                {profile?.companyName && (
                  <p className="text-sm text-brand-600">{profile.companyName}</p>
                )}
              </div>
            </div>

            {profile?.inviteCode && (
              <div className="mb-6 rounded-lg bg-amber/10 border border-amber/30 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-amber-dark mb-2">
                  Invite Code
                </div>
                <p className="text-sm text-brand-700 mb-3">
                  Share this code with teammates so they can join your workspace during signup.
                </p>
                <div className="flex items-center gap-3">
                  <code className="flex-1 rounded-lg bg-white px-4 py-2 text-lg font-mono font-bold text-brand-900 border border-brand-900/10">
                    {profile.inviteCode}
                  </code>
                  <button onClick={copyInvite} className="btn-accent btn-sm">
                    {copied ? "Copied!" : "Copy Code"}
                  </button>
                </div>
              </div>
            )}

            {members.length > 0 ? (
              <div className="space-y-2">
                {members.map(m => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-brand-900/5 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber/20 text-xs font-bold text-amber-dark">
                        {m.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-brand-900">
                          {m.full_name}
                          {m.id === profile?.id && (
                            <span className="ml-1.5 text-[10px] text-brand-600">(you)</span>
                          )}
                        </div>
                        <div className="text-xs text-brand-600">{m.email}</div>
                      </div>
                    </div>
                    <span className="badge-neutral text-[10px] capitalize">{m.role}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-brand-900/5 p-4">
                <p className="text-sm text-brand-700 font-medium mb-1">
                  {isConfigured() ? "Loading team members..." : "Team collaboration requires Cloud Sync"}
                </p>
                {!isConfigured() && (
                  <p className="text-xs text-brand-600">
                    Go to the <button onClick={() => setTab("cloud")} className="text-amber-dark underline">Cloud Sync</button> tab
                    to connect Supabase. Until then, projects live only in this browser — switching devices or clearing cache will
                    lose data. Use Backup & Data to export.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* DATA / BACKUP */}
        {tab === "data" && (
          <div className="space-y-6">
            <section className="card">
              <h2 className="text-lg font-semibold mb-1">Backup All Data</h2>
              <p className="text-sm text-brand-600 mb-4">
                Download a complete snapshot of every project, finish selection, inspiration board, and setting.
                Use this before switching devices, clearing browser data, or as a weekly safety net.
              </p>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg bg-brand-900/5 p-3 text-center">
                  <div className="text-2xl font-bold text-brand-900">{backupStats.projects}</div>
                  <div className="text-[10px] text-brand-600">Projects</div>
                </div>
                <div className="rounded-lg bg-brand-900/5 p-3 text-center">
                  <div className="text-2xl font-bold text-brand-900">{backupStats.customItems}</div>
                  <div className="text-[10px] text-brand-600">Custom Items</div>
                </div>
                <div className="rounded-lg bg-brand-900/5 p-3 text-center">
                  <div className="text-2xl font-bold text-brand-900">{backupStats.inspirationCount}</div>
                  <div className="text-[10px] text-brand-600">Inspiration Boards</div>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={handleBackupDownload} className="btn-primary">
                  Download Backup (.json)
                </button>
                <button onClick={handleImportClick} className="btn-secondary">
                  Restore from Backup
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </div>
              {importResult && (
                <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
                  {importResult}
                </div>
              )}
            </section>

            <section className="card">
              <h2 className="text-lg font-semibold mb-1">Storage Info</h2>
              <p className="text-sm text-brand-600 mb-4">
                Where your data lives right now.
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between py-2 border-b border-brand-900/5">
                  <span className="text-brand-700">Primary Storage</span>
                  <span className="text-brand-900 font-medium">Browser localStorage (this device)</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-brand-900/5">
                  <span className="text-brand-700">Cloud Sync</span>
                  <span className={`font-medium ${isConfigured() ? "text-emerald-600" : "text-amber-dark"}`}>
                    {isConfigured() ? "Connected (Supabase)" : "Not connected"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-brand-700">Risk of data loss</span>
                  <span className={`font-medium ${isConfigured() ? "text-emerald-600" : "text-red-500"}`}>
                    {isConfigured() ? "Low" : "High — back up weekly"}
                  </span>
                </div>
              </div>
              {!isConfigured() && (
                <div className="mt-4 rounded-lg bg-amber/10 border border-amber/30 px-3 py-2 text-xs text-brand-700">
                  <strong>Heads up:</strong> Until you enable Cloud Sync, this app stores everything in your browser.
                  If you clear browser data, switch to another device, or use a different browser — you won&apos;t see
                  your projects. Download a backup now as a safety net.
                </div>
              )}
            </section>
          </div>
        )}

        {/* CLOUD SYNC */}
        {tab === "cloud" && (
          <div className="space-y-6">
            <section className="card">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`h-3 w-3 rounded-full ${isConfigured() ? "bg-emerald-400" : "bg-amber"}`}
                />
                <h2 className="text-lg font-semibold">
                  {isConfigured() ? "Cloud Sync Connected" : "Cloud Sync Not Connected"}
                </h2>
              </div>

              {isConfigured() ? (
                <p className="text-sm text-brand-600">
                  Projects sync automatically across all devices and team members. Team chat and activity feeds
                  are live.
                </p>
              ) : (
                <>
                  <p className="text-sm text-brand-600 mb-4">
                    Enable cloud sync to unlock: multi-device access, real-time team chat, activity feed, team
                    collaboration, and automatic project backup.
                  </p>

                  <div className="rounded-lg bg-brand-900/5 p-4 mb-4">
                    <h3 className="font-semibold text-brand-900 text-sm mb-3">Setup in 5 minutes:</h3>
                    <ol className="space-y-3 text-sm text-brand-700 list-decimal list-inside">
                      <li>
                        Go to{" "}
                        <a
                          href="https://supabase.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-dark underline font-medium"
                        >
                          supabase.com
                        </a>{" "}
                        and create a free account.
                      </li>
                      <li>Create a new project. Wait ~2 min for it to provision.</li>
                      <li>
                        In your Supabase project, go to <strong>SQL Editor</strong>, copy the schema from{" "}
                        <code className="text-xs bg-white px-1 rounded">supabase/migrations/001_initial_schema.sql</code>{" "}
                        in the repo, and run it.
                      </li>
                      <li>
                        Go to <strong>Settings → API</strong> in Supabase. Copy the Project URL and anon key.
                      </li>
                      <li>
                        In Vercel, go to your <strong>design-studio</strong> project → Settings → Environment Variables.
                        Add:
                        <div className="mt-2 rounded bg-white p-3 text-xs font-mono space-y-1 border border-brand-900/10">
                          <div>NEXT_PUBLIC_SUPABASE_URL = &lt;your-project-url&gt;</div>
                          <div>NEXT_PUBLIC_SUPABASE_ANON_KEY = &lt;your-anon-key&gt;</div>
                        </div>
                      </li>
                      <li>
                        Trigger a redeploy. Done — this page will show &quot;Connected&quot;.
                      </li>
                    </ol>
                  </div>

                  <div className="rounded-lg bg-amber/10 border border-amber/30 p-4">
                    <h3 className="font-semibold text-brand-900 text-sm mb-2">Why bother?</h3>
                    <ul className="space-y-1 text-sm text-brand-700">
                      <li>• Access projects from laptop + phone + iPad simultaneously</li>
                      <li>• Your team sees live updates as you work</li>
                      <li>• Team chat works inside each project</li>
                      <li>• Browser cache clear = no data loss (it&apos;s in the cloud)</li>
                      <li>• Supabase free tier supports 500MB + 50k monthly users</li>
                    </ul>
                  </div>
                </>
              )}
            </section>

            {!isConfigured() && (
              <section className="card">
                <h2 className="text-lg font-semibold mb-2">Working Solo? That&apos;s OK.</h2>
                <p className="text-sm text-brand-600 mb-4">
                  You don&apos;t need Cloud Sync if you&apos;re a one-person studio working from one machine.
                  Just use the Backup & Data tab weekly to download a snapshot — if anything ever goes wrong
                  (browser cache clear, laptop dies), you restore from that file.
                </p>
                <button onClick={() => setTab("data")} className="btn-secondary btn-sm">
                  Go to Backup &amp; Data →
                </button>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
