"use client";

import { useState } from "react";
import ClientDelivery from "./ClientDelivery";
import ShareLinkButton from "./ShareLinkButton";
import AIRenderingPanel from "./AIRenderingPanel";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
}

type View = "client" | "share" | "renders";

/**
 * Review Hub — Week 4 of Teeco process.
 * Client presentation, share link generation, AI render prompts for
 * final polish. Contract includes 2 revision rounds.
 */
export default function ReviewHub({ project }: Props) {
  const [view, setView] = useState<View>("client");

  const views: { id: View; label: string; hint: string }[] = [
    { id: "client", label: "Client Presentation", hint: "What the client will see" },
    { id: "share", label: "Share Link", hint: "Send to client, no login needed" },
    { id: "renders", label: "AI Render Prompts", hint: "Midjourney / DALL-E prompts" },
  ];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand-900">Client Review</h2>
          <p className="text-sm text-brand-600">
            Week 4 · Design presentation + revisions. Your Teeco contract includes 2 rounds.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-white border border-brand-900/10 p-1">
          {views.map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={view === v.id ? "tab-active" : "tab"}
              title={v.hint}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === "client" && <ClientDelivery project={project} />}
      {view === "share" && <ShareLinkPanel project={project} />}
      {view === "renders" && <AIRenderingPanel project={project} />}
    </div>
  );
}

function ShareLinkPanel({ project }: { project: Project }) {
  return (
    <div>
      <div className="card mb-4">
        <h3 className="font-semibold text-brand-900 mb-2">Generate Client Share Link</h3>
        <p className="text-sm text-brand-600 mb-4">
          Creates a read-only URL with your studio branding that you send to the client.
          They see the full design package — rooms, mood boards, furniture, budget — without needing an account.
        </p>
        <ShareLinkButton project={project} className="btn-primary" />
      </div>

      <div className="card bg-amber/5 border-amber/20">
        <h3 className="font-semibold text-brand-900 text-sm mb-2">Revision rounds (contract)</h3>
        <p className="text-xs text-brand-700 mb-3">
          Your Teeco Design Only + Full Service contracts include 2 rounds of revisions after the initial presentation.
          Each round: client reviews share link, sends feedback, you update designs, regenerate new share link.
        </p>
        <ul className="text-xs text-brand-700 space-y-1">
          <li>• <strong>Round 1:</strong> Initial presentation. Most edits happen here.</li>
          <li>• <strong>Round 2:</strong> Fine-tune approved design. Small swaps only.</li>
          <li>• <strong>Beyond 2:</strong> Out of scope. Bill hourly or flag scope creep.</li>
        </ul>
        <div className="mt-3 text-[10px] text-brand-600/60">
          Tip: take screenshots of Rev 1 and Rev 2 before updating for your records.
        </div>
      </div>
    </div>
  );
}
