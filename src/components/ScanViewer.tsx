"use client";

import { useState } from "react";
import type { Project, Property } from "@/lib/types";
import { getProject as getProjectFromStore, saveProject, logActivity } from "@/lib/store";

interface Props {
  property: Property;
  projectId?: string;
  onUpdate?: () => void;
}

/**
 * Embeds Matterport and Polycam 3D scans, and links to Spoak projects.
 * Accepts inline link inputs so users can add/update scans without leaving the tab.
 *
 * Matterport embed: https://my.matterport.com/show/?m=MODEL_ID
 * Polycam embed:    https://poly.cam/capture/CAPTURE_ID
 * Spoak:            Direct link (no public embed API)
 */
export default function ScanViewer({ property, projectId, onUpdate }: Props) {
  const matterportUrl = extractMatterportEmbedUrl(property.matterportLink);
  const polycamUrl = extractPolycamEmbedUrl(property.polycamLink);
  const spoakUrl = property.spoakLink?.trim() || "";

  const hasMatterport = !!matterportUrl;
  const hasPolycam = !!polycamUrl;
  const hasSpoak = !!spoakUrl;
  const hasAny = hasMatterport || hasPolycam || hasSpoak;

  const [editing, setEditing] = useState(!hasAny);
  const [draft, setDraft] = useState({
    matterportLink: property.matterportLink,
    polycamLink: property.polycamLink,
    spoakLink: property.spoakLink,
  });

  const canSave = !!projectId;

  function saveLinks() {
    if (!projectId) return;
    const fresh = getProjectFromStore(projectId) as Project | null;
    if (!fresh) return;
    fresh.property = {
      ...fresh.property,
      matterportLink: draft.matterportLink.trim(),
      polycamLink: draft.polycamLink.trim(),
      spoakLink: draft.spoakLink.trim(),
    };
    saveProject(fresh);
    logActivity(projectId, "scans_updated", "Updated 3D scan links");
    setEditing(false);
    onUpdate?.();
  }

  return (
    <div className="space-y-6">
      {/* Header with edit toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">3D Scans</h2>
          <p className="text-sm text-brand-600">
            Link Matterport, Polycam, or Spoak so your team can walk through the space.
          </p>
        </div>
        {canSave && (
          hasAny && !editing ? (
            <button
              onClick={() => {
                setDraft({
                  matterportLink: property.matterportLink,
                  polycamLink: property.polycamLink,
                  spoakLink: property.spoakLink,
                });
                setEditing(true);
              }}
              className="btn-secondary btn-sm"
            >
              Manage links
            </button>
          ) : editing && hasAny ? (
            <button
              onClick={() => setEditing(false)}
              className="btn-secondary btn-sm"
            >
              Cancel
            </button>
          ) : null
        )}
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="card">
          <h3 className="text-sm font-semibold text-brand-900 mb-3">
            {hasAny ? "Update scan links" : "Add your first scan link"}
          </h3>
          <div className="space-y-3">
            <ScanLinkInput
              label="Matterport"
              accent="blue"
              hint="https://my.matterport.com/show/?m=MODEL_ID"
              value={draft.matterportLink}
              onChange={(v) => setDraft({ ...draft, matterportLink: v })}
            />
            <ScanLinkInput
              label="Polycam"
              accent="emerald"
              hint="https://poly.cam/capture/CAPTURE_ID"
              value={draft.polycamLink}
              onChange={(v) => setDraft({ ...draft, polycamLink: v })}
            />
            <ScanLinkInput
              label="Spoak"
              accent="purple"
              hint="https://www.spoak.com/..."
              value={draft.spoakLink}
              onChange={(v) => setDraft({ ...draft, spoakLink: v })}
            />
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            {hasAny && (
              <button onClick={() => setEditing(false)} className="btn-secondary btn-sm">
                Cancel
              </button>
            )}
            <button
              onClick={saveLinks}
              disabled={!canSave}
              className="btn-primary btn-sm disabled:opacity-40"
            >
              Save scan links
            </button>
          </div>
          {!canSave && (
            <p className="mt-2 text-xs text-brand-600/70">
              Links can only be saved when this page is opened from a project.
            </p>
          )}
        </div>
      )}

      {/* Embedded scans */}
      {hasMatterport && (
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between bg-brand-900/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-sm font-semibold text-brand-900">
                Matterport 3D Tour
              </span>
            </div>
            <a
              href={property.matterportLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-amber-dark hover:underline"
            >
              Open in Matterport &rarr;
            </a>
          </div>
          <div className="relative aspect-video bg-brand-900/5">
            <iframe
              src={matterportUrl}
              className="absolute inset-0 h-full w-full"
              frameBorder="0"
              allowFullScreen
              allow="xr-spatial-tracking"
              title="Matterport 3D Tour"
            />
          </div>
        </div>
      )}

      {hasPolycam && (
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between bg-brand-900/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-semibold text-brand-900">
                Polycam 3D Scan
              </span>
            </div>
            <a
              href={property.polycamLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-amber-dark hover:underline"
            >
              Open in Polycam &rarr;
            </a>
          </div>
          <div className="relative aspect-video bg-brand-900/5">
            <iframe
              src={polycamUrl}
              className="absolute inset-0 h-full w-full"
              frameBorder="0"
              allowFullScreen
              title="Polycam 3D Scan"
            />
          </div>
        </div>
      )}

      {hasSpoak && (
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600 font-bold text-sm">
              S
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-brand-900">
                Spoak Design Board
              </h3>
              <p className="text-xs text-brand-600">
                Open your Spoak project to view and edit the design board.
              </p>
            </div>
            <a
              href={spoakUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary btn-sm"
            >
              Open in Spoak &rarr;
            </a>
          </div>
        </div>
      )}

      {/* Help */}
      {hasAny && !editing && (
        <div className="card bg-amber/5 border-amber/20">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-dark mb-2">
            Tips
          </h3>
          <ul className="text-xs text-brand-700 space-y-1">
            <li>&bull; Matterport works best for immersive walkthroughs — share with clients who want to explore.</li>
            <li>&bull; Polycam is great for quick phone scans when you&apos;re on-site.</li>
            <li>&bull; Spoak links open externally — no embed, but a one-click jump for your team.</li>
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Inline input component ──

function ScanLinkInput({
  label,
  accent,
  hint,
  value,
  onChange,
}: {
  label: string;
  accent: "blue" | "emerald" | "purple";
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const dot = accent === "blue" ? "bg-blue-500" : accent === "emerald" ? "bg-emerald-500" : "bg-purple-500";
  return (
    <div>
      <label className="label flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </label>
      <input
        type="url"
        className="input"
        placeholder={hint}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ── URL parsers (unchanged) ──

function extractMatterportEmbedUrl(link: string): string | null {
  if (!link?.trim()) return null;
  const trimmed = link.trim();
  if (trimmed.includes("my.matterport.com/show/")) {
    try {
      const url = new URL(trimmed);
      url.searchParams.set("play", "1");
      url.searchParams.set("qs", "1");
      return url.toString();
    } catch {
      return trimmed;
    }
  }
  const patterns = [
    /matterport\.com\/show\/\?m=([a-zA-Z0-9]+)/,
    /my\.matterport\.com\/show\/\?m=([a-zA-Z0-9]+)/,
    /matterport\.com\/models\/([a-zA-Z0-9]+)/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return `https://my.matterport.com/show/?m=${match[1]}&play=1&qs=1`;
    }
  }
  if (/^[a-zA-Z0-9]{8,}$/.test(trimmed)) {
    return `https://my.matterport.com/show/?m=${trimmed}&play=1&qs=1`;
  }
  return null;
}

function extractPolycamEmbedUrl(link: string): string | null {
  if (!link?.trim()) return null;
  const trimmed = link.trim();
  if (trimmed.includes("poly.cam/capture/")) {
    try {
      const url = new URL(trimmed);
      if (!url.pathname.endsWith("/embed")) {
        url.pathname = url.pathname.replace(/\/?$/, "/embed");
      }
      return url.toString();
    } catch {
      return trimmed;
    }
  }
  const match = trimmed.match(/poly\.cam\/capture\/([a-zA-Z0-9-]+)/);
  if (match?.[1]) {
    return `https://poly.cam/capture/${match[1]}/embed`;
  }
  return null;
}
