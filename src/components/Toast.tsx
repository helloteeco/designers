"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ToastKind = "success" | "info" | "warning" | "error";

interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastCtx {
  show: (message: string, kind?: ToastKind, action?: ToastItem["action"]) => void;
  success: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Graceful fallback — won't crash the app if provider is missing
    return {
      show: (m: string) => console.log("[toast]", m),
      success: (m: string) => console.log("[toast:success]", m),
      info: (m: string) => console.log("[toast:info]", m),
      warning: (m: string) => console.log("[toast:warning]", m),
      error: (m: string) => console.log("[toast:error]", m),
    };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = "info", action?: ToastItem["action"]) => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      setToasts(prev => [...prev, { id, message, kind, action }]);
      // Auto-dismiss after 3.5s unless it has an action
      if (!action) {
        setTimeout(() => remove(id), 3500);
      }
    },
    [remove]
  );

  const ctx: ToastCtx = {
    show,
    success: (m) => show(m, "success"),
    info: (m) => show(m, "info"),
    warning: (m) => show(m, "warning"),
    error: (m) => show(m, "error"),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none max-w-sm">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl shadow-lg px-4 py-3 text-sm flex items-start gap-3 animate-in slide-in-from-right-4 ${COLORS[t.kind]}`}
          >
            <span className="text-base leading-none shrink-0">{ICONS[t.kind]}</span>
            <div className="flex-1 leading-snug">{t.message}</div>
            {t.action && (
              <button
                onClick={() => {
                  t.action?.onClick();
                  remove(t.id);
                }}
                className="text-xs font-semibold underline shrink-0"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => remove(t.id)}
              className="text-base leading-none shrink-0 opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const COLORS: Record<ToastKind, string> = {
  success: "bg-emerald-50 border border-emerald-200 text-emerald-900",
  info: "bg-white border border-brand-900/10 text-brand-900",
  warning: "bg-amber-50 border border-amber-200 text-amber-900",
  error: "bg-red-50 border border-red-200 text-red-900",
};

const ICONS: Record<ToastKind, string> = {
  success: "✓",
  info: "ℹ",
  warning: "⚠",
  error: "✕",
};

/**
 * SaveIndicator — passive indicator that flashes green on project save.
 * Watches the project's updatedAt timestamp and briefly highlights when it changes.
 */
export function SaveIndicator({ updatedAt }: { updatedAt: string | undefined }) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [lastSeen, setLastSeen] = useState(updatedAt);

  useEffect(() => {
    if (!updatedAt || updatedAt === lastSeen) return;
    setState("saved");
    setLastSeen(updatedAt);
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [updatedAt, lastSeen]);

  if (state === "idle") {
    return (
      <span className="flex items-center gap-1.5 text-[10px] text-brand-600/60">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-600/30" />
        Synced
      </span>
    );
  }
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-[10px] text-amber-dark">
        <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" />
        Saving...
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-medium">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Saved
    </span>
  );
}
