"use client";

/**
 * Shared chrome for guided steps: a heading, the step body, and a footer
 * with exactly ONE primary action (big, amber, bottom-right) plus a quiet
 * "Back" link. Keeps every step visually identical so the designer always
 * knows where the "keep going" button lives.
 */

export function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-bold text-brand-900">{title}</h2>
      {subtitle && <p className="text-sm text-brand-600 mt-1">{subtitle}</p>}
    </div>
  );
}

export function StepFooter({
  primaryLabel,
  onPrimary,
  primaryDisabled,
  disabledReason,
  busy,
  busyLabel,
  onBack,
  secondary,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  /** Friendly inline reason shown when the primary action is disabled. */
  disabledReason?: string;
  busy?: boolean;
  busyLabel?: string;
  onBack?: () => void;
  /** Optional quiet secondary affordance rendered next to Back. */
  secondary?: React.ReactNode;
}) {
  return (
    <div className="mt-8">
      {primaryDisabled && disabledReason && (
        <p className="text-right text-xs text-amber-dark mb-2">{disabledReason}</p>
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {onBack ? (
            <button
              onClick={onBack}
              className="text-sm text-brand-600 hover:text-brand-900 transition shrink-0"
            >
              &larr; Back
            </button>
          ) : (
            <span />
          )}
          {secondary}
        </div>
        <button
          onClick={onPrimary}
          disabled={primaryDisabled || busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber px-8 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-amber-dark active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {busy && (
            <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          )}
          {busy ? (busyLabel ?? primaryLabel) : primaryLabel}
        </button>
      </div>
    </div>
  );
}

/** Small soft notice — used for "we couldn't read that" style messages. */
export function StepNotice({
  tone,
  children,
}: {
  tone: "info" | "warn" | "error" | "success";
  children: React.ReactNode;
}) {
  const styles = {
    info: "bg-sky-50 border-sky-200 text-sky-800",
    warn: "bg-amber/10 border-amber/30 text-brand-700",
    error: "bg-red-50 border-red-200 text-red-700",
    success: "bg-emerald-50 border-emerald-200 text-emerald-800",
  }[tone];
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</div>
  );
}
