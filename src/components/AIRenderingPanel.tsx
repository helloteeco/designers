"use client";

import { useMemo, useState } from "react";
import { saveProject, getProject as getProjectFromStore, generateId, logActivity } from "@/lib/store";
import type { Project, Room, AIRender, AITool } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
  onJumpTo?: (tab: string) => void;
}

// ── AI tool registry ──

interface AIToolInfo {
  slug: AITool;
  label: string;
  url: string;
  icon: string;
  notes: string;
}

const AI_TOOLS: AIToolInfo[] = [
  { slug: "midjourney",       label: "Midjourney",       url: "https://www.midjourney.com/imagine", icon: "🌀", notes: "Best photorealism. Paste in web app or /imagine in Discord." },
  { slug: "dalle",            label: "DALL-E (ChatGPT)", url: "https://chatgpt.com/",               icon: "🎨", notes: "Great for iteration. Ask ChatGPT to render the prompt." },
  { slug: "ideogram",         label: "Ideogram",         url: "https://ideogram.ai/",               icon: "📐", notes: "Strongest for text + signage in renders." },
  { slug: "leonardo",         label: "Leonardo",         url: "https://leonardo.ai/",               icon: "🦁", notes: "Tunable models, good for consistent style." },
  { slug: "stable-diffusion", label: "Stable Diffusion", url: "https://huggingface.co/spaces/stabilityai/stable-diffusion", icon: "🌊", notes: "Free. Requires upload or Hugging Face space." },
  { slug: "krea",             label: "Krea",             url: "https://www.krea.ai/",               icon: "⚡", notes: "Real-time rendering as you type." },
  { slug: "runway",           label: "Runway",           url: "https://runwayml.com/",              icon: "🎬", notes: "Video + image. Great for walkthroughs." },
];

const TOOL_LABELS: Record<AITool, string> = AI_TOOLS.reduce(
  (acc, t) => { acc[t.slug] = t.label; return acc; },
  { other: "Other" } as Record<AITool, string>
);

// ── Prompt generation (kept from previous impl) ──

function formatStyle(style: string): string {
  return style.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function hexToColorName(hex: string): string {
  const colors: Record<string, string> = {
    "#f5f0eb": "warm cream", "#d4a574": "warm amber", "#8b7355": "mocha brown",
    "#3d3022": "dark chocolate", "#1a1a2e": "deep navy", "#f0f7fa": "icy blue",
    "#87ceeb": "sky blue", "#4a90a4": "ocean teal", "#2c5f6e": "deep teal",
    "#f2f5f0": "sage white", "#a8b5a0": "soft sage", "#5a6b50": "forest green",
    "#faf5ef": "warm linen", "#e8c9a8": "desert sand", "#c4956a": "terracotta",
    "#ffffff": "pure white", "#d4d4d4": "light gray", "#737373": "medium gray",
    "#404040": "charcoal", "#0a0a0a": "near black", "#fef3e2": "pale peach",
    "#f4a261": "golden amber", "#e76f51": "burnt sienna", "#264653": "dark teal",
    "#2a9d8f": "emerald teal", "#f8f4ff": "lavender white", "#c9b1ff": "soft lavender",
    "#faf0e6": "antique linen", "#d4856c": "dusty rose", "#a0522d": "sienna",
  };
  const lower = hex.toLowerCase();
  if (colors[lower]) return colors[lower];
  const r = parseInt(lower.slice(1, 3), 16);
  const g = parseInt(lower.slice(3, 5), 16);
  const b = parseInt(lower.slice(5, 7), 16);
  if (isNaN(r)) return hex;
  const brightness = (r + g + b) / 3;
  if (brightness > 220) return "light neutral";
  if (brightness > 180) return "warm neutral";
  if (brightness > 120) return "muted tone";
  if (brightness > 60) return "rich tone";
  return "dark tone";
}

function generateOverviewPrompt(project: Project, tool: AITool): string {
  const style = formatStyle(project.style);
  const addr = project.property.address || "a vacation rental";
  const city = project.property.city ? `${project.property.city}, ${project.property.state}` : "";
  const sqft = project.property.squareFootage;
  const beds = project.property.bedrooms;
  const baths = project.property.bathrooms;
  const base = `Interior design rendering of ${addr}${city ? ` in ${city}` : ""}. ${style} style vacation rental${sqft ? `, ${sqft} sqft` : ""}, ${beds} bedrooms, ${baths} bathrooms. Warm inviting atmosphere, professional interior photography, wide angle lens, natural lighting, staged for vacation rental guests.`;
  return tool === "midjourney" ? `${base} --ar 16:9 --v 6 --style raw --q 2` : base;
}

function generateRoomPrompt(project: Project, room: Room, tool: AITool): string {
  const style = formatStyle(project.style);
  const roomType = room.type.replace(/-/g, " ");
  const dims = `${room.widthFt}' x ${room.lengthFt}'`;
  const furnitureNames = room.furniture.map((f) => `${f.item.name} (${f.item.color})`).slice(0, 6);
  const bedInfo = room.selectedBedConfig ? `featuring ${room.selectedBedConfig.name}` : "";
  const accentInfo = room.accentWall
    ? `with a ${hexToColorName(room.accentWall.color)} ${room.accentWall.treatment} accent wall on the ${room.accentWall.wall} wall`
    : "";
  const materials = Array.from(new Set(room.furniture.map((f) => f.item.material).filter(Boolean))).slice(0, 4);
  const materialStr = materials.length > 0 ? `Key materials: ${materials.join(", ")}.` : "";
  const moodBoard = project.moodBoards[0];
  const moodColors = moodBoard?.colorPalette?.slice(0, 3) ?? [];
  const colorInfo = moodColors.length > 0 ? `Color scheme: ${moodColors.map(hexToColorName).join(", ")}.` : "";
  const moodStyle = moodBoard?.inspirationNotes ? `Design inspiration: ${moodBoard.inspirationNotes.slice(0, 100)}.` : "";
  const featureDescriptions: Record<string, string> = {
    "Window": "large windows with natural light",
    "Vaulted Ceiling": "dramatic vaulted ceiling",
    "Fireplace": "stone fireplace as focal point",
    "Skylight": "skylight flooding room with light",
    "Balcony": "private balcony access",
    "Bay Window": "bay window seating nook",
    "Built-in Shelving": "built-in shelving",
    "En-suite": "en-suite bathroom",
  };
  const featureStr = room.features.length > 0
    ? room.features.map((f) => featureDescriptions[f] ?? f.toLowerCase()).join(", ") + "."
    : "";
  const furnStr = furnitureNames.length > 0 ? `Furnished with: ${furnitureNames.join(", ")}.` : "";
  const base = [
    `Interior design rendering of a ${style} ${roomType} (${dims}${room.ceilingHeightFt >= 10 ? ", vaulted ceiling" : ""})`,
    bedInfo ? `${bedInfo}.` : "",
    accentInfo ? `${accentInfo}.` : "",
    furnStr,
    materialStr,
    colorInfo,
    moodStyle,
    featureStr,
    "Professional interior photography, natural lighting, warm and inviting atmosphere, high-end vacation rental staging, photorealistic.",
  ].filter(Boolean).join(" ");
  return tool === "midjourney" ? `${base} --ar 16:9 --v 6 --style raw --q 2` : base;
}

// ── Clipboard with fallback ──

function copyToClipboard(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => resolve(true)).catch(() => resolve(false));
        return;
      }
    } catch { /* fall through */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      resolve(true);
    } catch {
      resolve(false);
    }
  });
}

// ── URL validation ──

function looksLikeImageUrl(url: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  // Let any valid-looking URL through — Midjourney/DALL-E use varied domains
  return trimmed.length > 10 && trimmed.length < 2000;
}

// ── Component ──

export default function AIWorkflowPanel({ project, onUpdate, onJumpTo }: Props) {
  const [tool, setTool] = useState<AITool>("midjourney");
  const [selectedRoom, setSelectedRoom] = useState<string>(
    project.rooms[0]?.id ?? "overview"
  );
  const [copied, setCopied] = useState<string | null>(null);
  const [pasteInput, setPasteInput] = useState("");
  const [pasteTarget, setPasteTarget] = useState<string | null>(null); // roomId or "overview"

  const renders = project.aiRenders ?? [];

  const overviewPrompt = useMemo(() => generateOverviewPrompt(project, tool), [project, tool]);
  const roomPrompts = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of project.rooms) map.set(r.id, generateRoomPrompt(project, r, tool));
    return map;
  }, [project, tool]);

  const currentRoom = selectedRoom === "overview"
    ? null
    : project.rooms.find((r) => r.id === selectedRoom) ?? null;
  const currentPrompt = selectedRoom === "overview"
    ? overviewPrompt
    : roomPrompts.get(selectedRoom) ?? "";

  const rendersForTarget = (roomId: string) => renders.filter((r) => r.roomId === roomId);

  async function handleCopy(text: string, id: string) {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } else {
      window.prompt("Copy this prompt:", text);
    }
  }

  function addRender(url: string, roomId: string | "overview") {
    const clean = url.trim();
    if (!looksLikeImageUrl(clean)) return;
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    if (!fresh.aiRenders) fresh.aiRenders = [];
    const prompt = roomId === "overview"
      ? overviewPrompt
      : roomPrompts.get(roomId) ?? "";
    const entry: AIRender = {
      id: generateId(),
      roomId,
      url: clean,
      prompt,
      tool,
      approved: false,
      notes: "",
      createdAt: new Date().toISOString(),
    };
    fresh.aiRenders.push(entry);
    saveProject(fresh);
    logActivity(project.id, "ai_render_added", `Added ${tool} render for ${roomId === "overview" ? "property overview" : fresh.rooms.find((r) => r.id === roomId)?.name}`);
    setPasteInput("");
    setPasteTarget(null);
    onUpdate();
  }

  function toggleApproval(id: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh?.aiRenders) return;
    const r = fresh.aiRenders.find((x) => x.id === id);
    if (!r) return;
    r.approved = !r.approved;
    saveProject(fresh);
    onUpdate();
  }

  function deleteRender(id: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh?.aiRenders) return;
    fresh.aiRenders = fresh.aiRenders.filter((r) => r.id !== id);
    saveProject(fresh);
    onUpdate();
  }

  const activeTool = AI_TOOLS.find((t) => t.slug === tool);

  // Empty state — no rooms
  if (project.rooms.length === 0) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-lg font-semibold">AI Workflow</h2>
          <p className="text-sm text-brand-600">
            Generate rendering prompts and store AI-generated images to iterate on the design.
          </p>
        </div>
        <div className="card text-center py-12">
          <div className="mx-auto mb-3 text-4xl">📐</div>
          <h3 className="font-semibold text-brand-900 mb-1">Plan rooms first</h3>
          <p className="text-sm text-brand-600 mb-4">
            AI Workflow generates room-specific prompts. You need at least one room defined.
          </p>
          <button
            onClick={() => onJumpTo?.("rooms")}
            className="btn-primary btn-sm"
          >
            Go to Rooms →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">AI Workflow</h2>
          <p className="text-sm text-brand-600">
            Generate prompts from your current design. Render in your favorite AI tool. Paste the image URL back to save it with the project.
          </p>
        </div>
      </div>

      {/* Workflow steps indicator */}
      <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { n: 1, label: "Pick tool & room" },
          { n: 2, label: "Copy prompt" },
          { n: 3, label: "Render in AI tool" },
          { n: 4, label: "Paste image URL" },
          { n: 5, label: "Approve & continue" },
        ].map((s, i, arr) => (
          <div key={s.n} className="flex items-center gap-2 shrink-0">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-900/5 text-[10px] font-bold text-brand-600">
              {s.n}
            </div>
            <span className="text-[11px] text-brand-600 whitespace-nowrap">{s.label}</span>
            {i < arr.length - 1 && (
              <span className="text-brand-600/30 text-xs">→</span>
            )}
          </div>
        ))}
      </div>

      {/* Tool selector */}
      <div className="mb-6 card">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-brand-900">1. Pick your AI tool</h3>
            <p className="text-xs text-brand-600">
              Prompts are tailored to the tool you pick (Midjourney gets parameter flags).
            </p>
          </div>
          {activeTool && (
            <a
              href={activeTool.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-accent btn-sm"
            >
              Open {activeTool.label} ↗
            </a>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {AI_TOOLS.map((t) => {
            const isActive = tool === t.slug;
            return (
              <button
                key={t.slug}
                type="button"
                onClick={() => setTool(t.slug)}
                aria-pressed={isActive}
                className={`flex items-start gap-2 rounded-lg border p-3 text-left transition ${
                  isActive
                    ? "border-amber bg-amber/5"
                    : "border-brand-900/10 hover:border-amber/40 hover:bg-cream/50"
                }`}
              >
                <span className="text-xl" aria-hidden>{t.icon}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-brand-900">{t.label}</div>
                  <div className="text-[10px] text-brand-600 line-clamp-2">{t.notes}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Room / Overview selector */}
      <div className="mb-3 text-sm font-semibold text-brand-900">2. Pick what to render</div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedRoom("overview")}
          className={selectedRoom === "overview" ? "tab-active" : "tab"}
        >
          🏡 Property Overview
          {rendersForTarget("overview").length > 0 && (
            <span className="ml-1.5 rounded-full bg-amber/30 px-1.5 text-[10px] text-brand-900">
              {rendersForTarget("overview").length}
            </span>
          )}
        </button>
        {project.rooms.map((r) => {
          const count = rendersForTarget(r.id).length;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedRoom(r.id)}
              className={selectedRoom === r.id ? "tab-active" : "tab"}
            >
              {r.name}
              {count > 0 && (
                <span className="ml-1.5 rounded-full bg-amber/30 px-1.5 text-[10px] text-brand-900">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Prompt card */}
      <div className="card mb-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-brand-900">
              3. Copy the prompt {currentRoom ? `for ${currentRoom.name}` : "for the whole property"}
            </h3>
            <p className="text-xs text-brand-600">
              Auto-generated from your current design selections — style, furniture, colors, materials.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {activeTool && (
              <a
                href={activeTool.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary btn-sm"
                title={`Open ${activeTool.label}`}
              >
                Open {activeTool.label} ↗
              </a>
            )}
            <button
              onClick={() => handleCopy(currentPrompt, selectedRoom)}
              className="btn-primary btn-sm"
            >
              {copied === selectedRoom ? "Copied!" : "Copy prompt"}
            </button>
          </div>
        </div>
        <div className="rounded-lg bg-brand-900/5 p-4 font-mono text-xs text-brand-700 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
          {currentPrompt}
        </div>
        {currentRoom && currentRoom.furniture.length === 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber/10 border border-amber/30 px-3 py-2 text-xs text-brand-700">
            <span aria-hidden>💡</span>
            <span>
              This room has no furniture yet — the prompt will be generic.
              <button
                onClick={() => onJumpTo?.("catalog")}
                className="ml-1 font-semibold text-amber-dark hover:underline"
              >
                Add items →
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Paste rendered URL */}
      <div className="card mb-6">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-brand-900">
            4. Paste the rendered image URL
          </h3>
          <p className="text-xs text-brand-600">
            After rendering in {activeTool?.label ?? "your AI tool"}, copy the image URL (or right-click → Copy Image Address) and paste it here.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="url"
            className="input flex-1"
            placeholder="https://cdn.midjourney.com/... or https://..."
            value={pasteTarget === selectedRoom ? pasteInput : ""}
            onChange={(e) => { setPasteInput(e.target.value); setPasteTarget(selectedRoom); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && looksLikeImageUrl(pasteInput)) {
                addRender(pasteInput, selectedRoom as string | "overview");
              }
            }}
          />
          <button
            type="button"
            onClick={() => addRender(pasteInput, selectedRoom as string | "overview")}
            disabled={!looksLikeImageUrl(pasteInput) || pasteTarget !== selectedRoom}
            className="btn-accent btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save render
          </button>
        </div>
      </div>

      {/* Saved renders for selected target */}
      {rendersForTarget(selectedRoom).length > 0 && (
        <div className="card mb-6">
          <h3 className="text-sm font-semibold text-brand-900 mb-3">
            Saved renders ({rendersForTarget(selectedRoom).length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rendersForTarget(selectedRoom).map((r) => (
              <div
                key={r.id}
                className={`rounded-lg overflow-hidden border transition ${
                  r.approved ? "border-emerald-300" : "border-brand-900/10"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.url}
                  alt={`${TOOL_LABELS[r.tool]} render`}
                  className="w-full h-40 object-cover bg-brand-900/5"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-brand-600">
                      {TOOL_LABELS[r.tool]}
                    </span>
                    <span className="text-[10px] text-brand-600/60">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleApproval(r.id)}
                      className={`flex-1 rounded-lg text-[10px] font-semibold py-1.5 transition ${
                        r.approved
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-brand-900/5 text-brand-700 hover:bg-brand-900/10"
                      }`}
                    >
                      {r.approved ? "✓ Approved" : "Mark approved"}
                    </button>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-brand-900/5 px-2.5 py-1.5 text-[10px] font-semibold text-brand-700 hover:bg-brand-900/10 transition"
                      title="Open full size"
                    >
                      ↗
                    </a>
                    <button
                      onClick={() => deleteRender(r.id)}
                      className="rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-red-500 hover:bg-red-50 transition"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flow: Continue to next step */}
      {onJumpTo && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-900/10 bg-white px-5 py-4 shadow-sm">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-600">
              Next step
            </div>
            <div className="text-sm font-medium text-brand-900">
              {renders.some((r) => r.approved)
                ? "Add your approved renders to a mood board"
                : project.moodBoards.length > 0
                ? "Review mood boards"
                : "Create a mood board to compile the look"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onJumpTo("mood")}
            className="btn-primary btn-sm shrink-0"
          >
            Go to Mood Board →
          </button>
        </div>
      )}
    </div>
  );
}
