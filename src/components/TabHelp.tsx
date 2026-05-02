"use client";

import { useState, useEffect } from "react";

interface Props {
  /** Unique ID for this help tooltip (used as localStorage key suffix) */
  tabId: string;
  /** The help text to display — should be written at 3rd-grade reading level */
  children: React.ReactNode;
  /** Optional title for the help panel */
  title?: string;
}

/**
 * Per-tab dismissable help tooltip.
 *
 * Shows a friendly explanation panel at the top of a tab/section.
 * - "Got it" button dismisses permanently (localStorage)
 * - When dismissed, a tiny "?" button appears to re-show
 * - Written at 3rd-grade reading level for quick comprehension
 *
 * Usage:
 *   <TabHelp tabId="design-board" title="How this works">
 *     Drop a photo of your room. Pick a style. Click the button.
 *     The AI will make a pretty picture of your room with furniture.
 *   </TabHelp>
 */
export default function TabHelp({ tabId, children, title }: Props) {
  const storageKey = `tabHelp_dismissed_${tabId}`;
  const [dismissed, setDismissed] = useState(true); // Start hidden to avoid flash
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    setDismissed(stored === "1");
    setLoaded(true);
  }, [storageKey]);

  function dismiss() {
    localStorage.setItem(storageKey, "1");
    setDismissed(true);
  }

  function reshow() {
    localStorage.removeItem(storageKey);
    setDismissed(false);
  }

  // Don't render anything until we've checked localStorage (prevents flash)
  if (!loaded) return null;

  // Dismissed state: show tiny re-show button
  if (dismissed) {
    return (
      <div className="flex justify-end mb-2">
        <button
          onClick={reshow}
          className="w-5 h-5 rounded-full bg-brand-900/5 border border-brand-900/10 text-brand-600 text-[10px] font-bold hover:bg-brand-900/10 transition flex items-center justify-center"
          title="Show help"
          aria-label="Show help for this section"
        >
          ?
        </button>
      </div>
    );
  }

  // Active state: show the help panel
  return (
    <div className="mb-4 p-3 rounded-lg bg-sky-50 border border-sky-200 relative">
      {title && (
        <p className="text-xs font-bold text-sky-800 mb-1">{title}</p>
      )}
      <div className="text-xs text-sky-700 leading-relaxed pr-16">
        {children}
      </div>
      <button
        onClick={dismiss}
        className="absolute top-2 right-2 px-2 py-1 rounded text-[10px] font-medium text-sky-600 hover:text-sky-800 hover:bg-sky-100 transition"
        aria-label="Dismiss help"
      >
        Got it ✕
      </button>
    </div>
  );
}
