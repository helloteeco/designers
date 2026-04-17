"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SEEN_KEY = "designStudio_welcomeSeen";

export default function WelcomeModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(SEEN_KEY);
    if (!seen) {
      // Small delay so dashboard renders first
      setTimeout(() => setOpen(true), 400);
    }
  }, []);

  function close() {
    localStorage.setItem(SEEN_KEY, "1");
    setOpen(false);
  }

  function startFirstProject() {
    close();
    router.push("/projects/new");
  }

  function openSettings() {
    close();
    router.push("/settings");
  }

  if (!open) return null;

  const steps = [
    {
      emoji: "👋",
      title: "Welcome to Design Studio",
      body: "You're about to compress 80 hours of design work into one day. Let's make sure you're set up right. It takes 30 seconds.",
      primary: { label: "Show me around", action: () => setStep(1) },
      secondary: { label: "Skip tour", action: close },
    },
    {
      emoji: "🏠",
      title: "Start with a template",
      body: "Every project starts from a template — Mountain Cabin, Beach House, Kitchen Remodel, etc. Rooms are pre-set. You adjust dimensions, then the AI fills the rest.",
      primary: { label: "Next", action: () => setStep(2) },
      secondary: { label: "Skip", action: close },
    },
    {
      emoji: "⚡",
      title: "Run the AI Workflow",
      body: "Inside any project, click the AI Workflow tab. It auto-generates rooms, optimizes sleeping, selects furniture, creates mood boards, and generates rendering prompts. ~20 minutes start to finish.",
      primary: { label: "Next", action: () => setStep(3) },
      secondary: { label: "Skip", action: close },
    },
    {
      emoji: "📤",
      title: "Share with your client",
      body: "Click the Share Link button in any project header. You get a branded URL to email — no login needed. Your studio name, logo, and contact info show up. Set those in Settings.",
      primary: { label: "Set up my studio", action: openSettings },
      secondary: { label: "I'll do that later", action: close },
    },
  ];

  const current = steps[step];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4 animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl animate-in zoom-in-95">
        {/* Progress dots */}
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-amber" : i < step ? "w-1.5 bg-amber/40" : "w-1.5 bg-brand-900/10"
                }`}
              />
            ))}
          </div>
          <button
            onClick={close}
            className="text-brand-600 hover:text-brand-900 text-sm"
          >
            Skip
          </button>
        </div>

        <div className="px-8 pt-6 pb-8 text-center">
          <div className="text-5xl mb-4">{current.emoji}</div>
          <h2 className="text-xl font-bold text-brand-900 mb-3">{current.title}</h2>
          <p className="text-sm text-brand-700 leading-relaxed">{current.body}</p>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          {step === 0 ? (
            <>
              <button onClick={current.secondary.action} className="btn-secondary btn-sm flex-1">
                {current.secondary.label}
              </button>
              <button onClick={current.primary.action} className="btn-primary btn-sm flex-1">
                {current.primary.label}
              </button>
            </>
          ) : step === steps.length - 1 ? (
            <>
              <button onClick={current.secondary.action} className="btn-secondary btn-sm flex-1">
                {current.secondary.label}
              </button>
              <button onClick={current.primary.action} className="btn-primary btn-sm flex-1">
                {current.primary.label}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep(Math.max(0, step - 1))}
                className="btn-secondary btn-sm"
              >
                Back
              </button>
              <div className="flex-1" />
              <button onClick={startFirstProject} className="btn-secondary btn-sm">
                Start First Project
              </button>
              <button onClick={current.primary.action} className="btn-primary btn-sm">
                {current.primary.label} →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
