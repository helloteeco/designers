"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ClientDelivery from "@/components/ClientDelivery";
import { getStudioSettings, type StudioSettings } from "@/lib/studio-settings";
import type { Project } from "@/lib/types";

/**
 * Public read-only view of a project.
 * Accessed via /share?d=<base64-encoded-project-json>
 *
 * Designer copies the share link and sends to client.
 * Client opens it and sees the full design package without needing an account.
 */
export default function SharePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream flex items-center justify-center text-brand-600 text-sm">Loading...</div>}>
      <SharePageInner />
    </Suspense>
  );
}

function SharePageInner() {
  const params = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const data = params?.get("d");
      if (!data) {
        setError("This share link is missing project data.");
        return;
      }
      const json = atob(decodeURIComponent(data));
      const parsed = JSON.parse(json);
      setProject(parsed.project);
      setSettings(parsed.settings ?? getStudioSettings());
    } catch (e) {
      setError("This share link is invalid or corrupted. Ask the designer to re-send.");
    }
  }, [params]);

  if (error) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="card max-w-md text-center py-10">
          <div className="text-4xl mb-3">🔗</div>
          <h1 className="text-lg font-semibold text-brand-900 mb-2">Invalid Share Link</h1>
          <p className="text-sm text-brand-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!project || !settings) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="animate-pulse text-brand-600 text-sm">Loading design package...</div>
      </div>
    );
  }

  // Apply pricing/vendor visibility settings
  const sanitized: Project = settings.showPricingToClient
    ? project
    : {
        ...project,
        rooms: project.rooms.map(r => ({
          ...r,
          furniture: r.furniture.map(f => ({
            ...f,
            item: { ...f.item, price: 0, vendorUrl: settings.showVendorLinksToClient ? f.item.vendorUrl : "" },
          })),
        })),
      };

  return (
    <div className="min-h-screen bg-cream">
      {/* Studio Brand Header */}
      <header
        className="px-6 py-5 border-b border-brand-900/10"
        style={{ backgroundColor: settings.studioPrimaryColor }}
      >
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings.studioLogoUrl ? (
              <img src={settings.studioLogoUrl} alt={settings.studioName} className="h-8 w-auto" />
            ) : (
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center font-bold"
                style={{ backgroundColor: settings.studioAccentColor, color: settings.studioPrimaryColor }}
              >
                {settings.studioName?.charAt(0) || "D"}
              </div>
            )}
            <span className="text-lg font-semibold text-white">
              {settings.studioName || "Design Studio"}
            </span>
          </div>
          <div className="text-xs text-white/70">
            Design Package for {project.client.name || "Client"}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Welcome banner */}
        <div className="card mb-6 bg-brand-900 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest" style={{ color: settings.studioAccentColor }}>
                Your Design Package
              </div>
              <h1 className="text-2xl font-bold mt-1">{project.name}</h1>
              <p className="text-white/60 mt-1 text-sm">
                {project.property.address}
                {project.property.city && `, ${project.property.city}, ${project.property.state}`}
              </p>
            </div>
            <div className="text-right text-xs text-white/50">
              Prepared {new Date().toLocaleDateString()}
            </div>
          </div>
        </div>

        <ClientDelivery project={sanitized} />

        {/* Footer */}
        {settings.briefFooterNote && (
          <div className="card mt-8 text-center py-8">
            <p className="text-sm text-brand-700 italic max-w-2xl mx-auto">
              {settings.briefFooterNote}
            </p>
            <div className="mt-4 pt-4 border-t border-brand-900/5 text-xs text-brand-600">
              {settings.studioName}
              {settings.studioEmail && ` · ${settings.studioEmail}`}
              {settings.studioPhone && ` · ${settings.studioPhone}`}
              {settings.studioWebsite && (
                <>
                  {" · "}
                  <a
                    href={settings.studioWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-dark hover:underline"
                  >
                    {settings.studioWebsite.replace(/^https?:\/\//, "")}
                  </a>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
