"use client";

import { useState } from "react";
import ReviewHub from "./ReviewHub";
import OrderHub from "./OrderHub";
import InstallHub from "./InstallHub";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  projectId: string;
  onUpdate?: () => void;
}

type View = "review" | "order" | "install";

/**
 * Deliver — combines what used to be the Review, Order, and Install tabs into
 * one client-facing workspace. Three sub-views: review the design, order the
 * items, generate the install-guide PDF for handoff.
 */
export default function DeliverWorkspace({ project, projectId, onUpdate }: Props) {
  const [view, setView] = useState<View>("review");

  const totalCost = project.rooms.reduce(
    (s, r) => s + r.furniture.reduce((fs, f) => fs + f.item.price * f.quantity, 0),
    0
  );
  const itemCount = project.rooms.reduce((s, r) => s + r.furniture.length, 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Deliver</h2>
          <p className="text-sm text-brand-600">
            Client-facing outputs. Review the design, lock the order, generate the install guide.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-white border border-brand-900/10 p-1">
          <button
            onClick={() => setView("review")}
            className={view === "review" ? "tab-active" : "tab"}
            title="What the client sees + sign-off"
          >
            👁️ Review
          </button>
          <button
            onClick={() => setView("order")}
            className={view === "order" ? "tab-active" : "tab"}
            title={`${itemCount} items · $${totalCost.toLocaleString()}`}
          >
            🛒 Order
            {itemCount > 0 && (
              <span className="ml-1.5 text-[10px] opacity-70">{itemCount}</span>
            )}
          </button>
          <button
            onClick={() => setView("install")}
            className={view === "install" ? "tab-active" : "tab"}
            title="Install Guide PDF + delivery checklist"
          >
            📖 Install Guide
          </button>
        </div>
      </div>

      {view === "review" && <ReviewHub project={project} />}
      {view === "order" && <OrderHub project={project} onUpdate={onUpdate} />}
      {view === "install" && <InstallHub project={project} projectId={projectId} />}
    </div>
  );
}
