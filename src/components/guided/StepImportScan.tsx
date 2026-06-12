"use client";

import { useRef, useState } from "react";
import ScanViewer from "@/components/ScanViewer";
import { getProject, saveProject, generateId, logActivity } from "@/lib/store";
import { detectRoomsFromSvgDetailed, isSvgSource, readSvgText, parseSvgViewBox, annotationFromSvgBBox } from "@/lib/floor-plan-svg";
import { guessRoomType, prettifyLabel } from "@/lib/floor-plan-ocr";
import { sharpenImage } from "@/lib/sharpen-image";
import type { FloorPlan, Project, Room, RoomType } from "@/lib/types";
import { StepHeading, StepFooter, StepNotice } from "./StepShell";

interface Props {
  project: Project;
  onUpdate: () => void;
  onComplete: () => void;
  onSkipToRooms: () => void;
}

const MAX_UPLOAD_MB = 3;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const M_TO_FT = 3.28084;

/** Starter dimensions when rooms come from the Matterport tour's room list,
 *  which carries labels but no measurements — the confirm step fixes sizes. */
const DEFAULT_DIMS: Partial<Record<RoomType, { w: number; l: number }>> = {
  "living-room": { w: 16, l: 14 },
  "dining-room": { w: 12, l: 11 },
  kitchen: { w: 12, l: 11 },
  "primary-bedroom": { w: 14, l: 12 },
  bedroom: { w: 12, l: 11 },
  bathroom: { w: 8, l: 6 },
  outdoor: { w: 20, l: 14 },
};

const VALID_ROOM_TYPES = new Set<string>([
  "primary-bedroom", "bedroom", "loft", "den", "living-room", "dining-room",
  "kitchen", "bathroom", "outdoor", "hallway", "bonus-room", "office",
  "game-room", "media-room", "laundry", "storage", "closet",
]);

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Shrink an image data URL so the vision API call stays fast. */
function resizeForVision(dataUrl: string, maxPx = 1500): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      if (width <= maxPx && height <= maxPx) { resolve(dataUrl); return; }
      const scale = maxPx / Math.max(width, height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export default function StepImportScan({ project, onUpdate, onComplete, onSkipToRooms }: Props) {
  const [scanLink, setScanLink] = useState(
    project.property.matterportLink || project.property.polycamLink || ""
  );
  const [files, setFiles] = useState<{ file: File; preview: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [note, setNote] = useState<{ tone: "info" | "warn" | "error" | "success"; text: string } | null>(null);
  /** Plans imported while the project ALREADY had rooms — kept around so the
   *  designer can choose to re-read them and replace the room list, instead
   *  of us silently leaving the old rooms in place. */
  const [redetectOffer, setRedetectOffer] = useState<{ plan: FloorPlan; dataUrl: string; preview: string }[] | null>(null);
  const [redetecting, setRedetecting] = useState(false);
  /** Secondary, quieter notice line for Matterport tour pull results. */
  const [mpInfo, setMpInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingPlans = project.property.floorPlans ?? [];
  const hasScan = Boolean(project.property.matterportLink || project.property.polycamLink);
  const hasImported = hasScan || existingPlans.length > 0;
  const linkIsNew =
    scanLink.trim() !== "" &&
    scanLink.trim() !== project.property.matterportLink &&
    scanLink.trim() !== project.property.polycamLink;
  const hasPendingInput = linkIsNew || files.length > 0;
  // Show "Import" while there's new input to bring in; otherwise "Continue".
  const showImport = hasPendingInput && !importing;

  async function addFiles(list: FileList | File[]) {
    setNote(null);
    const accepted: { file: File; preview: string }[] = [];
    for (const file of Array.from(list)) {
      const ok = file.type.startsWith("image/") || file.type === "application/pdf";
      if (!ok) {
        setNote({ tone: "warn", text: `"${file.name}" isn't an image or PDF, so we skipped it.` });
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setNote({ tone: "warn", text: `"${file.name}" is bigger than ${MAX_UPLOAD_MB}MB — try a smaller export of the plan.` });
        continue;
      }
      let preview = "";
      if (file.type.startsWith("image/")) {
        try { preview = await sharpenImage(file, 0.8); }
        catch { preview = await fileToDataUrl(file); }
      }
      accepted.push({ file, preview });
    }
    if (accepted.length > 0) setFiles(prev => [...prev, ...accepted]);
  }

  /** Detect rooms from one plan. Returns no rooms when nothing could be
   *  read. `method` records HOW the rooms were read — exact SVG geometry
   *  ("svg") vs AI vision ("ai") — so notices can say so. */
  async function detectRooms(
    rawDataUrl: string,
    previewDataUrl: string,
    isPdf: boolean,
    planId: string,
    planIsImage: boolean
  ): Promise<{ rooms: Room[]; method: "svg" | "ai" }> {
    const rooms: Room[] = [];

    // SVG plans carry exact geometry — check the RAW upload (the sharpened
    // preview is rasterized and would hide the SVG markup).
    if (!isPdf && isSvgSource(rawDataUrl)) {
      try {
        const result = await detectRoomsFromSvgDetailed(rawDataUrl);
        const svgText = await readSvgText(rawDataUrl).catch(() => "");
        const viewBox = svgText ? parseSvgViewBox(svgText) : null;
        for (const r of result.rooms) {
          const room = blankRoom(r.label, r.guessedType, r.widthFt, r.lengthFt, r.floor ?? 1);
          // Anchor each room onto the plan so Install Guide pages can show a
          // per-room crop instead of the whole plan.
          if (r.svgBBox && viewBox && planIsImage) {
            room.annotation = annotationFromSvgBBox(r.svgBBox, viewBox, planId) ?? undefined;
            room.svgBBox = r.svgBBox;
          }
          rooms.push(room);
        }
        if (rooms.length > 0) return { rooms, method: "svg" };
      } catch { /* fall through to AI vision */ }
    }

    // AI vision — handles PNG/JPG and (now) PDF data URLs too.
    const payload = isPdf
      ? rawDataUrl
      : await resizeForVision(previewDataUrl || rawDataUrl, 1500);
    const res = await fetch("/api/extract-floorplan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: payload }),
    });
    if (!res.ok) return { rooms: [], method: "ai" };
    const result = await res.json();
    if (!result.ok || !result.rooms?.length) return { rooms: [], method: "ai" };

    for (const r of result.rooms as Array<{
      name: string; type: string; widthM: number; lengthM: number; floor: number;
      bboxPct?: { x: number; y: number; width: number; height: number };
    }>) {
      const room = blankRoom(
        r.name,
        (VALID_ROOM_TYPES.has(r.type) ? r.type : "bedroom") as RoomType,
        Math.round(r.widthM * M_TO_FT * 10) / 10,
        Math.round(r.lengthM * M_TO_FT * 10) / 10,
        r.floor || 1
      );
      // Spatial anchor on the plan, when the API gives us one (image plans only).
      if (r.bboxPct && planIsImage) {
        room.annotation = { floorPlanId: planId, ...r.bboxPct };
      }
      rooms.push(room);
    }
    return { rooms, method: "ai" };
  }

  function blankRoom(name: string, type: RoomType, widthFt: number, lengthFt: number, floor: number): Room {
    return {
      id: generateId(),
      name, type, widthFt, lengthFt,
      ceilingHeightFt: 9,
      floor,
      features: [],
      selectedBedConfig: null,
      furniture: [],
      accentWall: null,
      notes: "",
    };
  }

  async function handleImport() {
    setNote(null);
    setMpInfo(null);
    setRedetectOffer(null);
    setImporting(true);
    try {
      const fresh = getProject(project.id);
      if (!fresh) return;
      if (!fresh.property.floorPlans) fresh.property.floorPlans = [];

      // 1. Scan link
      const link = scanLink.trim();
      if (link) {
        if (/poly\.cam/i.test(link)) {
          fresh.property.polycamLink = link;
        } else {
          fresh.property.matterportLink = link;
          const m = link.match(/[?&]m=([a-zA-Z0-9]+)/) || link.match(/matterport\.com\/models\/([a-zA-Z0-9]+)/);
          if (m?.[1]) fresh.property.matterportModelId = m[1];
        }
      }

      // 2. Floor plan files
      const newPlans: { plan: FloorPlan; dataUrl: string; preview: string }[] = [];
      for (const { file, preview } of files) {
        setStatusText(`Adding ${file.name}…`);
        const dataUrl = await fileToDataUrl(file);
        const plan: FloorPlan = {
          id: generateId(),
          name: file.name.replace(/\.[^.]+$/, ""),
          url: dataUrl,
          type: file.type === "application/pdf" ? "pdf" : "image",
          uploadedAt: new Date().toISOString(),
          notes: "",
          sizeBytes: file.size,
          isPrimary: fresh.property.floorPlans.length === 0 ? true : undefined,
        };
        fresh.property.floorPlans.push(plan);
        newPlans.push({ plan, dataUrl, preview });
      }
      saveProject(fresh);
      onUpdate();

      // 3. Room auto-detection — only when the project has no rooms yet,
      //    so we never clobber rooms a designer already shaped.
      let detectedCount = 0;
      let detectedMethod: "svg" | "ai" = "ai";
      if (fresh.rooms.length === 0 && newPlans.length > 0) {
        setStatusText("Reading your floor plan…");
        for (const { plan, dataUrl, preview } of newPlans) {
          try {
            const { rooms: detected, method } = await detectRooms(
              dataUrl,
              preview,
              plan.type === "pdf",
              plan.id,
              plan.type === "image"
            );
            if (detected.length > 0) {
              const current = getProject(project.id);
              if (!current) break;
              current.rooms = detected;
              // Fill in bed/bath counts only when the listing didn't provide
              // them — designer-entered counts stay untouched so the confirm
              // step can cross-check detection against them.
              const bedTypes = ["primary-bedroom", "bedroom", "loft", "bonus-room"];
              current.property.bedrooms = current.property.bedrooms || detected.filter(r => bedTypes.includes(r.type)).length;
              current.property.bathrooms = current.property.bathrooms || detected.filter(r => r.type === "bathroom").length;
              current.property.floors = Math.max(...detected.map(r => r.floor), 1);
              saveProject(current);
              onUpdate();
              detectedCount = detected.length;
              detectedMethod = method;
              break;
            }
          } catch { /* keep trying the next plan */ }
        }
      }

      // 3.5 Matterport tour pull — when API tokens are configured on the
      // server this fetches the tour's own room list + a panorama per room.
      // No plan rooms yet → create rooms from the tour (sizes are starters).
      // Plan rooms exist → just attach tour photos by label match.
      let mpPulled = 0;
      let mpPhotos = 0;
      let mpNotice: string | null = null;
      const modelId = getProject(project.id)?.property.matterportModelId;
      if (link && modelId) {
        setStatusText("Checking your Matterport tour for rooms…");
        try {
          const res = await fetch(`/api/matterport/model-rooms?modelId=${encodeURIComponent(modelId)}`);
          const data = await res.json().catch(() => ({} as { ok?: boolean; rooms?: unknown[]; error?: string }));
          const mpRooms = (data?.ok && Array.isArray(data.rooms) ? data.rooms : []) as Array<{
            label: string; suggestedPanoUrl: string | null;
          }>;
          if (res.ok && mpRooms.length > 0) {
            const current = getProject(project.id);
            if (current) {
              const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
              if (current.rooms.length === 0) {
                current.rooms = mpRooms.map((mp) => {
                  const type = guessRoomType(mp.label || "bedroom");
                  const d = DEFAULT_DIMS[type] ?? { w: 12, l: 11 };
                  const room = blankRoom(prettifyLabel(mp.label || "Room", type), type, d.w, d.l, 1);
                  if (mp.suggestedPanoUrl) { room.referenceImageUrl = mp.suggestedPanoUrl; mpPhotos++; }
                  return room;
                });
                mpPulled = current.rooms.length;
              } else {
                for (const mp of mpRooms) {
                  if (!mp.suggestedPanoUrl) continue;
                  const target = current.rooms.find(r =>
                    !r.referenceImageUrl &&
                    (norm(r.name).includes(norm(mp.label)) || norm(mp.label).includes(norm(r.name)))
                  );
                  if (target) { target.referenceImageUrl = mp.suggestedPanoUrl; mpPhotos++; }
                }
              }
              saveProject(current);
              onUpdate();
            }
          } else if (res.status === 400) {
            mpNotice = "Your tour link is saved. (Matterport's API isn't connected, so room photos can't auto-pull — screenshot rooms in the tour and add them in the Review step.)";
          } else {
            mpNotice = "Your tour link is saved, but we couldn't reach Matterport's room list just now — you can add room photos by hand in the Review step.";
          }
        } catch {
          mpNotice = "Your tour link is saved, but we couldn't reach Matterport's room list just now — you can add room photos by hand in the Review step.";
        }
      }

      logActivity(project.id, "imported", `Guided import: ${link ? "scan link" : ""}${link && files.length ? " + " : ""}${files.length ? `${files.length} floor plan(s)` : ""}`);
      setFiles([]);
      setScanLink(link);

      if (detectedCount > 0) {
        const plural = detectedCount === 1 ? "" : "s";
        setNote({
          tone: "success",
          text: detectedMethod === "svg"
            ? `Done! We found ${detectedCount} room${plural} on your plan (read from your Matterport plan) — you'll confirm them in the next step.`
            : `Done! We found ${detectedCount} room${plural} on your plan (read by AI — double-check sizes in the next step).`,
        });
      } else if (newPlans.length > 0 && fresh.rooms.length === 0) {
        setNote({ tone: "warn", text: "Your plan is saved, but we couldn't read the rooms off it automatically. No problem — add them by hand in the next step." });
      } else if (newPlans.length > 0 && fresh.rooms.length > 0) {
        // The project already has rooms, so we never clobber them silently.
        // Offer a re-detect instead (notice with button rendered above).
        setRedetectOffer(newPlans);
        setNote(null);
      } else if (mpPulled > 0) {
        const p = mpPulled === 1 ? "" : "s";
        setNote({
          tone: "success",
          text: `Done! We pulled ${mpPulled} room${p} from your Matterport tour${mpPhotos > 0 ? ` with ${mpPhotos} room photo${mpPhotos === 1 ? "" : "s"}` : ""} — sizes are starters, so give them a quick check in the next step.`,
        });
      } else {
        setNote({ tone: "success", text: "Imported! Check the preview below, then continue." });
      }

      // Quieter second line for tour-pull side results.
      if (mpPhotos > 0 && mpPulled === 0) {
        setMpInfo(`We also matched ${mpPhotos} room photo${mpPhotos === 1 ? "" : "s"} from your Matterport tour — they'll power the renders in the Review step.`);
      } else if (mpNotice) {
        setMpInfo(mpNotice);
      }
    } catch {
      setNote({ tone: "error", text: "Something went wrong importing. Your work is safe — try again, or continue and add rooms manually in the next step." });
    } finally {
      setImporting(false);
      setStatusText("");
    }
  }

  /** Designer chose to re-read a newly imported plan even though the project
   *  already has rooms: confirm (it discards their edits), then re-run
   *  detection and REPLACE the room list. */
  async function redetectFromNewPlan() {
    if (!redetectOffer || redetectOffer.length === 0) return;
    const existingCount = getProject(project.id)?.rooms.length ?? 0;
    const ok = window.confirm(
      `Replace your ${existingCount} existing room${existingCount === 1 ? "" : "s"} with what we read off the new plan? Any edits you've made to those rooms (names, sizes, bed setups, notes) will be lost.`
    );
    if (!ok) return;
    setRedetecting(true);
    setNote(null);
    try {
      for (const { plan, dataUrl, preview } of redetectOffer) {
        try {
          const { rooms: detected, method } = await detectRooms(
            dataUrl,
            preview,
            plan.type === "pdf",
            plan.id,
            plan.type === "image"
          );
          if (detected.length > 0) {
            const current = getProject(project.id);
            if (!current) break;
            current.rooms = detected;
            const bedTypes = ["primary-bedroom", "bedroom", "loft", "bonus-room"];
            current.property.bedrooms = current.property.bedrooms || detected.filter(r => bedTypes.includes(r.type)).length;
            current.property.bathrooms = current.property.bathrooms || detected.filter(r => r.type === "bathroom").length;
            current.property.floors = Math.max(...detected.map(r => r.floor), 1);
            saveProject(current);
            logActivity(project.id, "imported", `Re-detected ${detected.length} room(s) from a new floor plan`);
            onUpdate();
            setRedetectOffer(null);
            const plural = detected.length === 1 ? "" : "s";
            setNote({
              tone: "success",
              text: method === "svg"
                ? `Done! We replaced your rooms with ${detected.length} room${plural} from the new plan (read from your Matterport plan) — you'll confirm them in the next step.`
                : `Done! We replaced your rooms with ${detected.length} room${plural} from the new plan (read by AI — double-check sizes in the next step).`,
            });
            return;
          }
        } catch { /* keep trying the next plan */ }
      }
      setNote({ tone: "warn", text: "We couldn't read rooms off the new plan, so your existing rooms are untouched." });
    } finally {
      setRedetecting(false);
    }
  }

  const imagePlans = existingPlans.filter(p => p.type === "image");
  const pdfPlans = existingPlans.filter(p => p.type === "pdf");

  return (
    <div>
      <StepHeading
        title="Bring in the property"
        subtitle="Paste your 3D scan link and upload the floor plan. We'll read the rooms off the plan for you."
      />

      <div className="space-y-4">
        {note && <StepNotice tone={note.tone}>{note.text}</StepNotice>}
        {mpInfo && <StepNotice tone="info">{mpInfo}</StepNotice>}

        {redetectOffer && (
          <StepNotice tone="warn">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span>
                You already have {project.rooms.length} room{project.rooms.length === 1 ? "" : "s"}, so we kept them. Want us to re-read the new plan instead?
              </span>
              <button
                type="button"
                onClick={() => void redetectFromNewPlan()}
                disabled={redetecting}
                className="shrink-0 rounded-xl border border-amber/40 bg-amber/10 px-3 py-1.5 text-xs font-semibold text-amber-dark hover:bg-amber/20 transition disabled:opacity-50"
              >
                {redetecting ? "Re-detecting…" : "Re-detect rooms from this plan"}
              </button>
            </div>
          </StepNotice>
        )}

        {/* Scan link */}
        <div className="card">
          <label className="label">Matterport or Polycam link</label>
          <input
            className="input"
            placeholder="https://my.matterport.com/show/?m=…  or  https://poly.cam/capture/…"
            value={scanLink}
            onChange={e => setScanLink(e.target.value)}
          />
          <p className="text-[11px] text-brand-600/60 mt-1.5">
            The walkthrough shows up right here once it&apos;s imported.
          </p>
        </div>

        {/* Floor plan upload */}
        <div className="card">
          <label className="label">Floor plan</label>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); addFiles(e.dataTransfer.files); }}
            className="border-2 border-dashed border-brand-900/15 rounded-xl p-6 text-center cursor-pointer hover:border-amber/40 transition"
          >
            {files.length === 0 ? (
              <>
                <p className="text-sm text-brand-600">Drop your floor plan here, or click to choose a file</p>
                <p className="text-[11px] text-brand-600/60 mt-1">Image or PDF — up to {MAX_UPLOAD_MB}MB</p>
                <p className="text-[11px] text-brand-600/60 mt-1">
                  Tip: in your Matterport tour, open the floor-plan view and screenshot it — that image works here.
                </p>
              </>
            ) : (
              <div className="flex items-center justify-center gap-3 flex-wrap">
                {files.map((f, i) => (
                  <div key={i} className="relative group">
                    {f.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.preview} alt="" className="w-20 h-20 object-cover rounded-lg border border-brand-900/10" />
                    ) : (
                      <div className="w-20 h-20 rounded-lg border border-brand-900/10 flex items-center justify-center bg-brand-900/5 text-[10px] text-brand-600">PDF</div>
                    )}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setFiles(prev => prev.filter((_, j) => j !== i)); }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    >
                      &times;
                    </button>
                  </div>
                ))}
                <span className="text-xs text-brand-600">+ Add another</span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.svg"
              multiple
              className="hidden"
              onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
            />
          </div>
        </div>

        {/* Previews — proof the import worked */}
        {hasScan && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-2">Your 3D scan</div>
            <ScanViewer property={project.property} />
          </div>
        )}

        {(imagePlans.length > 0 || pdfPlans.length > 0) && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-2">Your floor plan</div>
            <div className="card">
              {imagePlans.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {imagePlans.map(p => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p.id} src={p.url} alt={p.name} className="w-full rounded-lg border border-brand-900/10 bg-white" />
                  ))}
                </div>
              )}
              {pdfPlans.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 text-sm">
                  <span className="text-brand-900 font-medium truncate">{p.name}.pdf</span>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-amber-dark hover:underline shrink-0"
                  >
                    Open PDF &rarr;
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <StepFooter
        primaryLabel={showImport ? "Import" : "Continue"}
        busyLabel={statusText || "Importing…"}
        busy={importing}
        onPrimary={() => {
          if (showImport) void handleImport();
          else onComplete();
        }}
        primaryDisabled={!showImport && !hasImported && project.rooms.length === 0}
        disabledReason="Paste a scan link or upload a floor plan — or use the link below to add rooms by hand."
        secondary={
          <button
            onClick={onSkipToRooms}
            className="text-xs text-brand-600/70 hover:text-brand-900 underline decoration-brand-900/20 transition text-left"
          >
            No scan? Add rooms manually in the next step.
          </button>
        }
      />
    </div>
  );
}
