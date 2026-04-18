"use client";

import { useState } from "react";
import { saveProject, getProject as getProjectFromStore, generateId, logActivity } from "@/lib/store";
import { PRESET_PALETTES } from "@/lib/design-presets";
import StyleQuiz from "./StyleQuiz";
import { useToast } from "./Toast";
import type { Project, MoodBoard, DesignStyle } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

const STYLE_OPTIONS: { value: DesignStyle; label: string }[] = [
  { value: "modern", label: "Modern" },
  { value: "farmhouse", label: "Farmhouse" },
  { value: "coastal", label: "Coastal" },
  { value: "bohemian", label: "Bohemian" },
  { value: "industrial", label: "Industrial" },
  { value: "mid-century", label: "Mid-Century" },
  { value: "scandinavian", label: "Scandinavian" },
  { value: "rustic", label: "Rustic" },
  { value: "contemporary", label: "Contemporary" },
  { value: "transitional", label: "Transitional" },
  { value: "mountain-lodge", label: "Mountain Lodge" },
  { value: "traditional", label: "Traditional" },
];

/**
 * Concept Hub — Week 1 direction alignment (Teeco's "2 Concept Board options" step).
 * Two concept boards (A and B) side-by-side. Client picks one, it becomes the
 * locked project direction. Any standalone mood boards also live here.
 */
export default function ConceptHub({ project, onUpdate }: Props) {
  const toast = useToast();
  const [showStyleQuiz, setShowStyleQuiz] = useState(false);

  const conceptA = project.moodBoards.find(b => b.conceptVariant === "A");
  const conceptB = project.moodBoards.find(b => b.conceptVariant === "B");
  const lockedConcept = project.moodBoards.find(b => b.isLockedConcept);

  function createConcept(variant: "A" | "B") {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    if (!fresh.moodBoards) fresh.moodBoards = [];

    // If this variant already exists, do nothing
    if (fresh.moodBoards.some(b => b.conceptVariant === variant)) return;

    const preset = variant === "A" ? PRESET_PALETTES[0] : PRESET_PALETTES[3]; // Warm neutrals vs Desert sand
    const board: MoodBoard = {
      id: generateId(),
      name: variant === "A" ? "Concept A" : "Concept B",
      style: preset.style,
      colorPalette: [...preset.colors],
      inspirationNotes: variant === "A"
        ? "First direction. Example: clean modern with warm accents."
        : "Alternative direction. Example: more eclectic, richer tones.",
      imageUrls: [],
      conceptVariant: variant,
      isLockedConcept: false,
    };
    fresh.moodBoards.push(board);
    saveProject(fresh);
    logActivity(project.id, "concept_created", `Created Concept ${variant}`);
    onUpdate();
  }

  function updateConcept(boardId: string, patch: Partial<MoodBoard>) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const board = fresh.moodBoards.find(b => b.id === boardId);
    if (!board) return;
    Object.assign(board, patch);
    saveProject(fresh);
    onUpdate();
  }

  function deleteConcept(boardId: string) {
    if (!confirm("Delete this concept board?")) return;
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    fresh.moodBoards = (fresh.moodBoards ?? []).filter(b => b.id !== boardId);
    saveProject(fresh);
    toast.info("Concept deleted");
    onUpdate();
  }

  function lockInConcept(boardId: string) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    // Unlock any previously-locked, lock this one
    (fresh.moodBoards ?? []).forEach(b => { b.isLockedConcept = b.id === boardId; });
    const locked = fresh.moodBoards.find(b => b.id === boardId);
    if (locked) {
      // Also set project.style to locked concept's style
      fresh.style = locked.style;
    }
    saveProject(fresh);
    logActivity(project.id, "concept_locked", `Locked in ${locked?.name ?? "concept"}`);
    toast.success("Concept locked in · project style set");
    onUpdate();
  }

  function unlockConcept(boardId: string) {
    updateConcept(boardId, { isLockedConcept: false });
    toast.info("Concept unlocked");
  }

  function addImage(boardId: string) {
    const url = prompt("Paste image URL (Pinterest, Unsplash, etc.):");
    if (!url || !url.trim()) return;
    const trimmed = url.trim();
    if (!/^(https?:\/\/|data:image\/)/.test(trimmed)) {
      alert("Not a valid image URL. Must start with https:// or data:image/");
      return;
    }
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const board = fresh.moodBoards.find(b => b.id === boardId);
    if (!board) return;
    if (!board.imageUrls) board.imageUrls = [];
    if (board.imageUrls.includes(trimmed)) return;
    board.imageUrls.push(trimmed);
    saveProject(fresh);
    onUpdate();
  }

  function removeImage(boardId: string, idx: number) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    const board = fresh.moodBoards.find(b => b.id === boardId);
    if (!board || !board.imageUrls) return;
    board.imageUrls.splice(idx, 1);
    saveProject(fresh);
    onUpdate();
  }

  const standaloneBoards = project.moodBoards.filter(b => !b.conceptVariant);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-2 flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-brand-900">Concept Alignment</h2>
            <p className="text-sm text-brand-600">
              Week 1 · Two concept directions for client to pick from. Once they pick, the winning concept drives the whole project&apos;s style.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowStyleQuiz(true)} className="btn-secondary btn-sm">
              🎨 Style Quiz
            </button>
          </div>
        </div>

        {/* Status banner */}
        {lockedConcept ? (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2 text-xs text-emerald-900 mt-2">
            ✓ <strong>{lockedConcept.name}</strong> locked in. Project style: {lockedConcept.style.replace(/-/g, " ")}.
            <button onClick={() => unlockConcept(lockedConcept.id)} className="ml-3 underline">Unlock</button>
          </div>
        ) : conceptA && conceptB ? (
          <div className="rounded-lg bg-amber/10 border border-amber/30 px-4 py-2 text-xs text-brand-700 mt-2">
            Present both to client. When they pick one, click <strong>Lock In</strong> to make it the project direction.
          </div>
        ) : (
          <div className="rounded-lg bg-brand-900/5 px-4 py-2 text-xs text-brand-600 mt-2">
            Start with 2 concept boards. Fill each with a color palette, style, inspiration images, and notes.
          </div>
        )}
      </div>

      {/* A/B Side-by-Side */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <ConceptBoardCard
          variant="A"
          board={conceptA}
          isLocked={lockedConcept?.id === conceptA?.id}
          hasLocked={!!lockedConcept}
          onCreate={() => createConcept("A")}
          onUpdate={(patch) => conceptA && updateConcept(conceptA.id, patch)}
          onDelete={() => conceptA && deleteConcept(conceptA.id)}
          onLock={() => conceptA && lockInConcept(conceptA.id)}
          onAddImage={() => conceptA && addImage(conceptA.id)}
          onRemoveImage={(i) => conceptA && removeImage(conceptA.id, i)}
        />
        <ConceptBoardCard
          variant="B"
          board={conceptB}
          isLocked={lockedConcept?.id === conceptB?.id}
          hasLocked={!!lockedConcept}
          onCreate={() => createConcept("B")}
          onUpdate={(patch) => conceptB && updateConcept(conceptB.id, patch)}
          onDelete={() => conceptB && deleteConcept(conceptB.id)}
          onLock={() => conceptB && lockInConcept(conceptB.id)}
          onAddImage={() => conceptB && addImage(conceptB.id)}
          onRemoveImage={(i) => conceptB && removeImage(conceptB.id, i)}
        />
      </div>

      {/* Standalone mood boards (non-concept variants) */}
      {standaloneBoards.length > 0 && (
        <div className="mt-8 pt-6 border-t border-brand-900/10">
          <h3 className="text-sm font-semibold text-brand-900 mb-3">Additional Mood Boards ({standaloneBoards.length})</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {standaloneBoards.map(board => (
              <div key={board.id} className="card">
                <div className="mb-3 flex h-14 overflow-hidden rounded-lg">
                  {board.colorPalette.map((color, i) => (
                    <div key={i} className="flex-1" style={{ backgroundColor: color }} />
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-brand-900 text-sm">{board.name}</h4>
                    <span className="text-[10px] text-brand-600 capitalize">{board.style.replace(/-/g, " ")}</span>
                  </div>
                  <button onClick={() => deleteConcept(board.id)} className="text-[10px] text-red-400 hover:text-red-600">
                    Delete
                  </button>
                </div>
                {board.inspirationNotes && <p className="text-xs text-brand-700 mt-2">{board.inspirationNotes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Style quiz modal */}
      {showStyleQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-900/10">
              <div>
                <h2 className="text-lg font-semibold text-brand-900">Style Quiz</h2>
                <p className="text-xs text-brand-600">6 questions to find the right style</p>
              </div>
              <button onClick={() => setShowStyleQuiz(false)} className="text-brand-600 hover:text-brand-900 text-xl leading-none">×</button>
            </div>
            <div className="p-6">
              <StyleQuiz
                project={project}
                onUpdate={onUpdate}
                onComplete={() => setShowStyleQuiz(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Single concept board card ──

function ConceptBoardCard({
  variant,
  board,
  isLocked,
  hasLocked,
  onCreate,
  onUpdate,
  onDelete,
  onLock,
  onAddImage,
  onRemoveImage,
}: {
  variant: "A" | "B";
  board: MoodBoard | undefined;
  isLocked: boolean;
  hasLocked: boolean;
  onCreate: () => void;
  onUpdate: (patch: Partial<MoodBoard>) => void;
  onDelete: () => void;
  onLock: () => void;
  onAddImage: () => void;
  onRemoveImage: (idx: number) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [name, setName] = useState(board?.name ?? "");
  const [notes, setNotes] = useState(board?.inspirationNotes ?? "");

  if (!board) {
    return (
      <div className="card border-2 border-dashed border-brand-900/10 text-center py-12">
        <div className="text-4xl mb-3">🎨</div>
        <h3 className="font-semibold text-brand-900 mb-1">Concept {variant}</h3>
        <p className="text-xs text-brand-600 mb-4 max-w-xs mx-auto">
          {variant === "A"
            ? "Primary direction. Start here with your top recommendation."
            : "Alternative direction. Give the client something different to compare."}
        </p>
        <button onClick={onCreate} className="btn-primary btn-sm">
          + Build Concept {variant}
        </button>
      </div>
    );
  }

  return (
    <div className={`card transition ${isLocked ? "border-emerald-400 bg-emerald-50/30 ring-2 ring-emerald-200" : ""}`}>
      {/* Header with variant badge */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold rounded px-2 py-0.5 ${
            variant === "A" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
          }`}>
            CONCEPT {variant}
          </span>
          {isLocked && (
            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded px-2 py-0.5">
              ✓ LOCKED IN
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {!isLocked && (
            <button onClick={onLock} className="text-[10px] text-amber-dark hover:underline font-semibold" title="Mark this as the chosen direction">
              🔒 Lock In
            </button>
          )}
          {!hasLocked && (
            <button onClick={onDelete} className="text-[10px] text-red-400 hover:text-red-600">
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Editable name */}
      {editingName ? (
        <input
          autoFocus
          className="input text-base font-semibold mb-2"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => { onUpdate({ name: name || `Concept ${variant}` }); setEditingName(false); }}
          onKeyDown={e => { if (e.key === "Enter") { onUpdate({ name: name || `Concept ${variant}` }); setEditingName(false); } }}
        />
      ) : (
        <h3
          onClick={() => { setName(board.name); setEditingName(true); }}
          className="font-semibold text-brand-900 text-base mb-2 cursor-pointer hover:text-amber-dark"
          title="Click to rename"
        >
          {board.name}
        </h3>
      )}

      {/* Style picker */}
      <div className="mb-3">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">Style</label>
        <select
          className="select text-sm mt-1"
          value={board.style}
          onChange={e => onUpdate({ style: e.target.value as DesignStyle })}
          disabled={isLocked}
        >
          {STYLE_OPTIONS.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Palette preview + picker */}
      <div className="mb-3">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">Color Palette</label>
        <div className="mt-1 flex h-12 overflow-hidden rounded-lg">
          {board.colorPalette.map((color, i) => (
            <div key={i} className="flex-1" style={{ backgroundColor: color }} title={color} />
          ))}
        </div>
        {!isLocked && (
          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
            {PRESET_PALETTES.slice(0, 6).map(p => (
              <button
                key={p.name}
                onClick={() => onUpdate({ colorPalette: [...p.colors], style: p.style })}
                className={`flex w-full items-center gap-2 rounded border px-2 py-1 text-xs transition ${
                  JSON.stringify(p.colors) === JSON.stringify(board.colorPalette)
                    ? "border-amber bg-amber/5"
                    : "border-brand-900/5 hover:border-amber/30"
                }`}
              >
                <div className="flex overflow-hidden rounded">
                  {p.colors.map((c, i) => (
                    <div key={i} className="h-4 w-4" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <span className="text-[10px] text-brand-700">{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Inspiration images */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
            Inspiration ({board.imageUrls?.length ?? 0})
          </label>
          {!isLocked && (
            <button onClick={onAddImage} className="text-[10px] text-amber-dark hover:underline">
              + Add Image
            </button>
          )}
        </div>
        {board.imageUrls && board.imageUrls.length > 0 ? (
          <div className="grid grid-cols-3 gap-1">
            {board.imageUrls.slice(0, 9).map((url, i) => (
              <div key={i} className="relative aspect-square rounded overflow-hidden bg-brand-900/5 group/img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                {!isLocked && (
                  <button
                    onClick={() => onRemoveImage(i)}
                    className="absolute top-0 right-0 h-5 w-5 rounded-bl bg-white/90 text-xs opacity-0 group-hover/img:opacity-100"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-brand-600/60 italic">Paste Pinterest, Unsplash, or any image URL.</div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">Design Direction</label>
        {editingNotes ? (
          <textarea
            autoFocus
            className="input min-h-[70px] text-xs mt-1"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={() => { onUpdate({ inspirationNotes: notes }); setEditingNotes(false); }}
          />
        ) : (
          <p
            onClick={() => { if (!isLocked) { setNotes(board.inspirationNotes); setEditingNotes(true); } }}
            className={`text-xs mt-1 whitespace-pre-wrap ${isLocked ? "text-brand-700" : "text-brand-700 cursor-text hover:bg-brand-900/5 rounded px-2 py-1"}`}
          >
            {board.inspirationNotes || (isLocked ? "" : "Click to add direction notes...")}
          </p>
        )}
      </div>
    </div>
  );
}
