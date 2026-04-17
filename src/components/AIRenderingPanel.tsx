"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  { slug: "nano-banana",      label: "Nano Banana (Gemini)", url: "https://aistudio.google.com/prompts/new_chat", icon: "🍌", notes: "Google Gemini 2.5 Flash Image. Best-in-class for interior renders, fast, consistent." },
  { slug: "midjourney",       label: "Midjourney",       url: "https://www.midjourney.com/imagine", icon: "🌀", notes: "Great photorealism. Paste in web app or /imagine in Discord." },
  { slug: "dalle",            label: "DALL-E (ChatGPT)", url: "https://chatgpt.com/",               icon: "🎨", notes: "Easy iteration. Ask ChatGPT to render the prompt." },
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
  // Accept http(s) URLs, and data:image/ URLs from file uploads.
  // Reject blob: URLs (session-scoped, don't persist).
  if (/^data:image\//i.test(trimmed)) return trimmed.length < 8_000_000; // ~8MB cap
  if (!/^https?:\/\//i.test(trimmed)) return false;
  return trimmed.length > 10 && trimmed.length < 2000;
}

// Real validation: preload the URL as an image. Resolves true if it loads
// as an image, false if the browser can't decode it. Skips network check
// for data: URLs since they don't hit the network.
function validateImageUrl(url: string, timeoutMs: number = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    if (!looksLikeImageUrl(url)) {
      resolve(false);
      return;
    }
    const img = new Image();
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    const t = setTimeout(() => done(false), timeoutMs);
    img.onload = () => { clearTimeout(t); done(true); };
    img.onerror = () => { clearTimeout(t); done(false); };
    img.src = url.trim();
  });
}

// Compress a File to a data URL (jpeg) scaled to fit within maxDim.
// This keeps localStorage-friendly sizes (~100-300KB per render).
async function compressImageFile(
  file: File,
  maxDim: number = 1600,
  quality: number = 0.82
): Promise<string | null> {
  try {
    // Prefer createImageBitmap (fast, respects EXIF orientation)
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    // JPEG for photo-like AI renders; much smaller than PNG.
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    // Fallback: read file as data URL directly (no compression)
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }
}

// ── Component ──

const TOOL_STORAGE_KEY = (pid: string) => `aiWorkflow_tool_${pid}`;
const TARGET_STORAGE_KEY = (pid: string) => `aiWorkflow_target_${pid}`;
const PROMPT_OVERRIDES_KEY = (pid: string) => `aiWorkflow_prompts_${pid}`;

export default function AIWorkflowPanel({ project, onUpdate, onJumpTo }: Props) {
  const [tool, setTool] = useState<AITool>(() => {
    if (typeof window === "undefined") return "nano-banana";
    const saved = sessionStorage.getItem(TOOL_STORAGE_KEY(project.id));
    return (saved as AITool) || "nano-banana";
  });
  const [selectedRoom, setSelectedRoom] = useState<string>(() => {
    if (typeof window === "undefined") return project.rooms[0]?.id ?? "overview";
    const saved = sessionStorage.getItem(TARGET_STORAGE_KEY(project.id));
    if (saved === "overview" || project.rooms.some((r) => r.id === saved)) {
      return saved as string;
    }
    return project.rooms[0]?.id ?? "overview";
  });
  const [copied, setCopied] = useState<string | null>(null);
  const [pasteInput, setPasteInput] = useState("");
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [urlValidation, setUrlValidation] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [urlError, setUrlError] = useState<string>("");
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptOverrides, setPromptOverrides] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = sessionStorage.getItem(PROMPT_OVERRIDES_KEY(project.id));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persist prompt overrides
  useEffect(() => {
    try {
      sessionStorage.setItem(
        PROMPT_OVERRIDES_KEY(project.id),
        JSON.stringify(promptOverrides)
      );
    } catch { /* quota — ignore */ }
  }, [promptOverrides, project.id]);
  const [editingNotesFor, setEditingNotesFor] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [viewMode, setViewMode] = useState<"target" | "all">("target");

  function pickTool(t: AITool) {
    setTool(t);
    try { sessionStorage.setItem(TOOL_STORAGE_KEY(project.id), t); } catch { /* ignore */ }
  }
  function pickTarget(t: string) {
    setSelectedRoom(t);
    setPasteInput(""); // clean slate when switching targets
    try { sessionStorage.setItem(TARGET_STORAGE_KEY(project.id), t); } catch { /* ignore */ }
  }

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
  const autoPrompt = selectedRoom === "overview"
    ? overviewPrompt
    : roomPrompts.get(selectedRoom) ?? "";
  // User-edited prompts override the auto-generated version per target+tool
  const overrideKey = `${tool}__${selectedRoom}`;
  const currentPrompt = promptOverrides[overrideKey] ?? autoPrompt;
  const isPromptCustomized = promptOverrides[overrideKey] !== undefined && promptOverrides[overrideKey] !== autoPrompt;

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

  async function addRender(url: string, roomId: string | "overview") {
    const clean = url.trim();
    if (!looksLikeImageUrl(clean)) {
      setUrlValidation("invalid");
      setUrlError("URL must start with http:// or https://");
      return;
    }
    setUrlValidation("checking");
    setUrlError("");
    const ok = await validateImageUrl(clean);
    if (!ok) {
      setUrlValidation("invalid");
      setUrlError("That URL didn't load as an image. Make sure you copied the image address (not the page URL).");
      return;
    }
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    if (!fresh.aiRenders) fresh.aiRenders = [];
    const prompt = currentPrompt;
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
    setUrlValidation("idle");
    onUpdate();
  }

  async function handleFileUpload(file: File | null | undefined) {
    if (!file) return;
    setUploadError("");
    if (!file.type.startsWith("image/")) {
      setUploadError("That's not an image file. Try a JPG, PNG, or WebP.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setUploadError("Image is over 20 MB. Please use a smaller file.");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await compressImageFile(file, 1600, 0.82);
      if (!dataUrl) {
        setUploadError("Couldn't read that image. Try a different file.");
        setUploading(false);
        return;
      }
      await addRender(dataUrl, selectedRoom as string | "overview");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error(err);
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function regeneratePromptFromDesign() {
    // Drop the override so the auto prompt takes over
    setPromptOverrides((prev) => {
      const next = { ...prev };
      delete next[overrideKey];
      return next;
    });
    setEditingPrompt(false);
  }

  function saveRenderNotes(id: string, notes: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh?.aiRenders) return;
    const r = fresh.aiRenders.find((x) => x.id === id);
    if (!r) return;
    r.notes = notes.trim();
    saveProject(fresh);
    setEditingNotesFor(null);
    setNotesDraft("");
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

      {/* Workflow steps indicator — active step highlighted based on state */}
      {(() => {
        const hasRender = rendersForTarget(selectedRoom).length > 0;
        const hasApproved = rendersForTarget(selectedRoom).some((r) => r.approved);
        // Determine current step
        let activeStep = 1;
        if (hasApproved) activeStep = 5;
        else if (hasRender) activeStep = 5; // approve next
        else if (pasteInput.trim().length > 0) activeStep = 4;
        else activeStep = 2; // default to "copy prompt"

        const steps = [
          { n: 1, label: "Pick tool" },
          { n: 2, label: "Pick target" },
          { n: 3, label: "Copy prompt" },
          { n: 4, label: "Paste image URL" },
          { n: 5, label: "Approve & continue" },
        ];
        return (
          <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-1">
            {steps.map((s, i, arr) => {
              const isActive = s.n === activeStep;
              const isDone = s.n < activeStep;
              return (
                <div key={s.n} className="flex items-center gap-2 shrink-0">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition ${
                      isActive
                        ? "bg-amber text-brand-900 ring-2 ring-amber/30"
                        : isDone
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-brand-900/5 text-brand-600"
                    }`}
                  >
                    {isDone ? "✓" : s.n}
                  </div>
                  <span
                    className={`text-[11px] whitespace-nowrap ${
                      isActive ? "text-brand-900 font-semibold" : "text-brand-600"
                    }`}
                  >
                    {s.label}
                  </span>
                  {i < arr.length - 1 && (
                    <span className="text-brand-600/30 text-xs">→</span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Tool selector */}
      <div className="mb-6 card">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-brand-900">Step 1 — Pick your AI tool</h3>
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
                onClick={() => pickTool(t.slug)}
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
      <div className="mb-3 text-sm font-semibold text-brand-900">Step 2 — Pick what to render</div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => pickTarget("overview")}
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
              onClick={() => pickTarget(r.id)}
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
              Step 3 — Copy the prompt {currentRoom ? `for ${currentRoom.name}` : "for the whole property"}
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
        {editingPrompt ? (
          <>
            <textarea
              className="input font-mono text-xs leading-relaxed min-h-[180px] resize-y"
              value={currentPrompt}
              onChange={(e) =>
                setPromptOverrides((prev) => ({ ...prev, [overrideKey]: e.target.value }))
              }
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-brand-600">
                {isPromptCustomized
                  ? "Customized — saved to this tool + target."
                  : "Match auto-generated."}
              </span>
              <div className="flex gap-2">
                {isPromptCustomized && (
                  <button
                    type="button"
                    onClick={() =>
                      setPromptOverrides((prev) => {
                        const next = { ...prev };
                        delete next[overrideKey];
                        return next;
                      })
                    }
                    className="text-xs text-brand-600 hover:text-brand-900"
                  >
                    Reset to auto
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditingPrompt(false)}
                  className="text-xs font-semibold text-amber-dark hover:underline"
                >
                  Done
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg bg-brand-900/5 p-4 font-mono text-xs text-brand-700 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
              {currentPrompt}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-brand-600">
                {isPromptCustomized ? (
                  <span className="text-amber-dark font-semibold">● Customized</span>
                ) : (
                  `Auto-generated from ${currentRoom ? "room" : "property"} details.`
                )}
              </span>
              <button
                type="button"
                onClick={() => setEditingPrompt(true)}
                className="text-xs font-semibold text-amber-dark hover:underline"
              >
                Edit prompt
              </button>
            </div>
          </>
        )}
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
            Step 4 — Paste the rendered image URL
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
            value={pasteInput}
            onChange={(e) => {
              setPasteInput(e.target.value);
              setUrlValidation("idle");
              setUrlError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && looksLikeImageUrl(pasteInput) && urlValidation !== "checking") {
                addRender(pasteInput, selectedRoom as string | "overview");
              }
            }}
            disabled={urlValidation === "checking"}
          />
          <button
            type="button"
            onClick={() => addRender(pasteInput, selectedRoom as string | "overview")}
            disabled={!looksLikeImageUrl(pasteInput) || urlValidation === "checking"}
            className="btn-accent btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {urlValidation === "checking" ? "Checking..." : "Save render"}
          </button>
        </div>
        {urlError && (
          <p className="mt-2 text-xs text-red-500">{urlError}</p>
        )}
        {urlValidation === "checking" && (
          <p className="mt-2 text-xs text-brand-600">
            Testing whether the URL loads as an image…
          </p>
        )}
        <p className="mt-2 text-[11px] text-brand-600/70">
          💡 <strong>Tip:</strong> Right-click the rendered image in your AI tool → &quot;Copy Image Address&quot;. Pasting a page URL won&apos;t work.
        </p>
      </div>

      {/* View mode toggle */}
      {renders.length > 0 && (
        <div className="mb-3 flex items-center gap-1 rounded-lg border border-brand-900/10 bg-white p-1 w-fit">
          <button
            type="button"
            onClick={() => setViewMode("target")}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
              viewMode === "target"
                ? "bg-brand-900 text-white"
                : "text-brand-600 hover:text-brand-900"
            }`}
          >
            Current target
          </button>
          <button
            type="button"
            onClick={() => setViewMode("all")}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
              viewMode === "all"
                ? "bg-brand-900 text-white"
                : "text-brand-600 hover:text-brand-900"
            }`}
          >
            All renders ({renders.length})
          </button>
        </div>
      )}

      {/* Saved renders — for current target */}
      {viewMode === "target" && rendersForTarget(selectedRoom).length > 0 && (
        <div className="card mb-6">
          <h3 className="text-sm font-semibold text-brand-900 mb-3">
            Saved renders ({rendersForTarget(selectedRoom).length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rendersForTarget(selectedRoom).map((r) => {
              const isBroken = brokenImages.has(r.id);
              return (
              <div
                key={r.id}
                className={`rounded-lg overflow-hidden border transition ${
                  r.approved ? "border-emerald-300" : "border-brand-900/10"
                }`}
              >
                {isBroken ? (
                  <div className="flex h-40 flex-col items-center justify-center gap-1 bg-brand-900/5 text-center px-4">
                    <span className="text-2xl opacity-50" aria-hidden>🖼️</span>
                    <span className="text-[11px] text-brand-600">
                      Image couldn&apos;t load
                    </span>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-amber-dark underline truncate max-w-full"
                    >
                      Open URL ↗
                    </a>
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={r.url}
                    alt={`${TOOL_LABELS[r.tool]} render`}
                    className="w-full h-40 object-cover bg-brand-900/5"
                    onError={() => {
                      setBrokenImages((prev) => {
                        const next = new Set(prev);
                        next.add(r.id);
                        return next;
                      });
                    }}
                  />
                )}
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-brand-600">
                      {TOOL_LABELS[r.tool]}
                    </span>
                    <span className="text-[10px] text-brand-600/60">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {/* Notes */}
                  {editingNotesFor === r.id ? (
                    <div className="mb-2">
                      <textarea
                        className="input text-xs min-h-[60px] resize-y"
                        value={notesDraft}
                        onChange={(e) => setNotesDraft(e.target.value)}
                        placeholder="e.g., Client loved the fireplace angle"
                        autoFocus
                        maxLength={500}
                      />
                      <div className="mt-1 flex justify-end gap-2">
                        <button
                          onClick={() => { setEditingNotesFor(null); setNotesDraft(""); }}
                          className="text-[10px] text-brand-600 hover:text-brand-900"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => saveRenderNotes(r.id, notesDraft)}
                          className="text-[10px] font-semibold text-amber-dark hover:underline"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : r.notes ? (
                    <button
                      onClick={() => { setEditingNotesFor(r.id); setNotesDraft(r.notes); }}
                      className="mb-2 w-full text-left rounded-lg bg-cream/70 px-2 py-1.5 text-[11px] text-brand-700 hover:bg-cream transition"
                      title="Edit note"
                    >
                      {r.notes}
                    </button>
                  ) : (
                    <button
                      onClick={() => { setEditingNotesFor(r.id); setNotesDraft(""); }}
                      className="mb-2 w-full rounded-lg border border-dashed border-brand-900/15 px-2 py-1.5 text-[10px] text-brand-600 hover:border-amber/40 hover:bg-amber/5 transition"
                    >
                      + Add note
                    </button>
                  )}
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
              );
            })}
          </div>
        </div>
      )}

      {/* All renders gallery (cross-project view) */}
      {viewMode === "all" && renders.length > 0 && (
        <div className="card mb-6">
          <h3 className="text-sm font-semibold text-brand-900 mb-3">
            All renders across the project ({renders.length})
          </h3>
          <div className="space-y-4">
            {(["overview", ...project.rooms.map((r) => r.id)] as string[])
              .filter((rid) => rendersForTarget(rid).length > 0)
              .map((rid) => {
                const label =
                  rid === "overview"
                    ? "🏡 Property Overview"
                    : project.rooms.find((r) => r.id === rid)?.name ?? "Unknown";
                const list = rendersForTarget(rid);
                return (
                  <div key={rid}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                        {label} — {list.length} render{list.length === 1 ? "" : "s"}
                      </div>
                      <button
                        type="button"
                        onClick={() => { pickTarget(rid); setViewMode("target"); }}
                        className="text-[10px] font-semibold text-amber-dark hover:underline"
                      >
                        Focus →
                      </button>
                    </div>
                    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                      {list.map((r) => {
                        const isBroken = brokenImages.has(r.id);
                        return (
                          <a
                            key={r.id}
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`group relative block aspect-square overflow-hidden rounded-lg border transition ${
                              r.approved ? "border-emerald-300" : "border-brand-900/10"
                            }`}
                            title={r.notes || `${TOOL_LABELS[r.tool]} render`}
                          >
                            {isBroken ? (
                              <div className="flex h-full flex-col items-center justify-center bg-brand-900/5 text-[10px] text-brand-600">
                                🖼️
                              </div>
                            ) : (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={r.url}
                                alt={r.notes || "render"}
                                className="w-full h-full object-cover"
                                onError={() =>
                                  setBrokenImages((prev) => new Set(prev).add(r.id))
                                }
                              />
                            )}
                            {r.approved && (
                              <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                                ✓
                              </span>
                            )}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Flow: Continue to next step — smart CTA based on render state */}
      {onJumpTo && (() => {
        const totalRenders = renders.length;
        const approvedCount = renders.filter((r) => r.approved).length;
        const roomsWithRenders = new Set(
          renders.map((r) => r.roomId).filter((id) => id !== "overview")
        );
        const roomsWithoutRenders = project.rooms.filter((r) => !roomsWithRenders.has(r.id));

        // No renders yet — encourage first render
        if (totalRenders === 0) {
          return (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-900/10 bg-white px-5 py-4 shadow-sm">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-brand-600">
                  Next step
                </div>
                <div className="text-sm font-medium text-brand-900">
                  Copy the prompt above, render it in {activeTool?.label ?? "your AI tool"}, then paste the URL here.
                </div>
              </div>
              {activeTool && (
                <a
                  href={activeTool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary btn-sm shrink-0"
                >
                  Open {activeTool.label} ↗
                </a>
              )}
            </div>
          );
        }

        // Some rooms still unrendered — suggest next room
        if (roomsWithoutRenders.length > 0 && roomsWithoutRenders.length < project.rooms.length) {
          const next = roomsWithoutRenders[0];
          return (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-900/10 bg-white px-5 py-4 shadow-sm">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-brand-600">
                  Keep going
                </div>
                <div className="text-sm font-medium text-brand-900">
                  {roomsWithoutRenders.length} room{roomsWithoutRenders.length === 1 ? "" : "s"} still need{roomsWithoutRenders.length === 1 ? "s" : ""} a render. Try {next.name} next.
                </div>
              </div>
              <button
                type="button"
                onClick={() => pickTarget(next.id)}
                className="btn-primary btn-sm shrink-0"
              >
                Render {next.name} →
              </button>
            </div>
          );
        }

        // Have renders but none approved — encourage approval
        if (totalRenders > 0 && approvedCount === 0) {
          return (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber/30 bg-amber/5 px-5 py-4 shadow-sm">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-dark">
                  Almost done
                </div>
                <div className="text-sm font-medium text-brand-900">
                  Mark your favorite renders as approved, then compile them in a mood board.
                </div>
              </div>
              <button
                type="button"
                onClick={() => onJumpTo("mood")}
                className="btn-secondary btn-sm shrink-0"
              >
                Skip to Mood Board →
              </button>
            </div>
          );
        }

        // Renders exist and at least one approved — head to delivery
        return (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 px-5 py-4 shadow-sm">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                Ready for delivery
              </div>
              <div className="text-sm font-medium text-brand-900">
                {approvedCount} approved render{approvedCount === 1 ? "" : "s"}. Compile them in a mood board or export the full package.
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => onJumpTo("mood")}
                className="btn-secondary btn-sm"
              >
                Mood Board
              </button>
              <button
                type="button"
                onClick={() => onJumpTo("export")}
                className="btn-primary btn-sm"
              >
                Export →
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
