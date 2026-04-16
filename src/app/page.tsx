"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getUser } from "@/lib/store";

export default function LandingPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (user) {
      router.replace("/dashboard");
      return;
    }
    setLoaded(true);
  }, [router]);

  if (!loaded) return null;

  return (
    <div className="min-h-screen bg-brand-900 text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber text-brand-900 font-bold text-lg">
            D
          </div>
          <span className="text-lg font-bold tracking-tight">
            Design Studio
          </span>
        </div>
        <button
          onClick={() => router.push("/login")}
          className="rounded-lg bg-white/10 px-5 py-2 text-sm font-medium backdrop-blur transition hover:bg-white/20"
        >
          Sign In
        </button>
      </nav>

      {/* Hero */}
      <main className="mx-auto max-w-5xl px-8 pt-24 pb-32">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-amber/20 px-4 py-1.5 text-sm text-amber-light">
          <span className="h-1.5 w-1.5 rounded-full bg-amber" />
          AI-Powered Design Automation for Vacation Rentals
        </div>

        <h1 className="text-5xl font-bold leading-tight tracking-tight md:text-6xl">
          80 hours of design work
          <br />
          <span className="text-amber">compressed to one day.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-white/70 leading-relaxed">
          Upload your Matterport or Polycam scan. Design Studio&apos;s AI engine
          auto-generates rooms, optimizes sleeping, selects furniture, creates mood boards,
          generates AI renderings, and delivers a complete design package — ready for
          Spoak presentation.
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          <button
            onClick={() => router.push("/login")}
            className="btn-accent text-base px-8 py-4"
          >
            Get Started Free
          </button>
          <button
            onClick={() => {
              const el = document.getElementById("workflow");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
            className="rounded-lg border border-white/20 px-8 py-4 text-base font-semibold transition hover:bg-white/10"
          >
            See the Workflow
          </button>
        </div>

        {/* Stats */}
        <div className="mt-20 grid grid-cols-4 gap-8 border-t border-white/10 pt-10">
          {[
            { value: "80hrs", sub: "<1 day", label: "Design turnaround" },
            { value: "97%", sub: "automated", label: "Workflow steps" },
            { value: "12+", sub: "guests", label: "Sleep optimized" },
            { value: "1-click", sub: "export", label: "Client delivery" },
          ].map((s) => (
            <div key={s.label}>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-amber">{s.value}</span>
                <span className="text-sm text-white/40">&rarr; {s.sub}</span>
              </div>
              <div className="mt-1 text-sm text-white/50">{s.label}</div>
            </div>
          ))}
        </div>
      </main>

      {/* Workflow Section */}
      <section id="workflow" className="bg-brand-800 px-8 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber/20 px-3 py-1 text-xs text-amber-light font-semibold">
            AI WORKFLOW ENGINE
          </div>
          <h2 className="text-3xl font-bold mb-4">
            From 3D scan to client delivery in <span className="text-amber">12 automated steps.</span>
          </h2>
          <p className="text-white/60 mb-12 max-w-2xl">
            Each step that used to take hours is now done in minutes. The AI handles room setup,
            sleep optimization, furniture selection, mood boards, and rendering — while you
            focus on creative direction.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { step: "01", title: "Import 3D Scan", desc: "Matterport + Polycam integration with embedded viewers", time: "2h → 2min" },
              { step: "02", title: "Auto-Generate Rooms", desc: "AI creates rooms from property details with dimensions", time: "4h → 1min" },
              { step: "03", title: "Optimize Sleeping", desc: "Algorithm maximizes capacity with queen/queen bunks", time: "3h → 30sec" },
              { step: "04", title: "Select Design Style", desc: "Style quiz or auto-detect from location and preferences", time: "4h → 1min" },
              { step: "05", title: "Generate Mood Boards", desc: "Curated color palettes and style descriptions", time: "8h → 2min" },
              { step: "06", title: "Auto-Select Furniture", desc: "80+ catalog items matched to style per room", time: "16h → 3min" },
              { step: "07", title: "Space Planning", desc: "Visual layout with clearance checks and measurements", time: "6h → 3min" },
              { step: "08", title: "Budget Validation", desc: "$10-20/sqft tracking with overspend alerts", time: "2h → 1min" },
              { step: "09", title: "AI Renderings", desc: "Midjourney + DALL-E prompts per room auto-generated", time: "8h → 2min" },
              { step: "10", title: "Shopping List", desc: "Vendor links, quantities, procurement tracking", time: "6h → 1min" },
              { step: "11", title: "Spoak Delivery", desc: "Sync to Spoak design board for client presentation", time: "6h → 2min" },
              { step: "12", title: "QA & Export", desc: "Automated checks, CSV, PDF, and print-ready brief", time: "4h → 3min" },
            ].map((s) => (
              <div key={s.step} className="rounded-xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber/20 text-amber font-bold text-xs">
                    {s.step}
                  </div>
                  <div className="text-xs text-amber font-mono">{s.time}</div>
                </div>
                <h3 className="font-semibold mb-1">{s.title}</h3>
                <p className="text-xs text-white/50">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section className="bg-brand-900 px-8 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-bold mb-16">
            Everything your designers need, <span className="text-amber">in one place.</span>
          </h2>

          {/* Hero feature: Space Planning */}
          <div className="mb-16 rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber/20 text-xl">
                &#128207;
              </div>
              <div>
                <h3 className="text-xl font-bold">Space Planner with 3D Scan Integration</h3>
                <p className="text-sm text-white/60">
                  The heart of the workflow — plan furniture at real scale using scan data
                </p>
              </div>
            </div>
            <p className="text-white/70 leading-relaxed mb-4">
              Visual room canvas with real dimensions from your Matterport and Polycam scans.
              Place furniture at scale, see clearance zones, check 36&quot; walkway compliance,
              and track coverage percentages. Integrated catalog sidebar lets you search,
              filter, and click-to-place items instantly. Auto-furnish fills rooms with
              style-matched pieces in one click.
            </p>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div className="rounded-lg bg-white/5 p-3">
                <div className="text-amber font-semibold">Real Scale</div>
                <div className="text-white/50 text-xs mt-1">Furniture dimensions matched to room plans</div>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <div className="text-amber font-semibold">Clearance Check</div>
                <div className="text-white/50 text-xs mt-1">36&quot; walkway validation per room</div>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <div className="text-amber font-semibold">Auto-Furnish</div>
                <div className="text-white/50 text-xs mt-1">One-click room filling with smart suggestions</div>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <div className="text-amber font-semibold">Scan Reference</div>
                <div className="text-white/50 text-xs mt-1">Quick links to Matterport + Polycam</div>
              </div>
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "Matterport & Polycam", desc: "Embed 3D tours and scans. Use measurements to verify room dimensions. Never leave the app.", icon: "\ud83d\udcd0" },
              { title: "Sleep Optimizer", desc: "Algorithm maximizes guest capacity. Queen-over-queen bunks in bedrooms, sofa beds in flex rooms.", icon: "\ud83d\udecf\ufe0f" },
              { title: "AI Workflow Engine", desc: "12-step automated pipeline: scan → rooms → sleep → furniture → render → deliver. One click.", icon: "\u26a1" },
              { title: "Client Inspiration", desc: "Collect Pinterest, Instagram, Houzz, and Spoak references. Tag by room and design element.", icon: "\ud83d\udca1" },
              { title: "Style Quiz", desc: "6 questions to match property and client preferences to the perfect design style.", icon: "\ud83c\udfa8" },
              { title: "AI Renderings", desc: "Auto-generated Midjourney and DALL-E prompts from furniture selections, colors, and style.", icon: "\u2728" },
              { title: "Shopping List", desc: "Track procurement with vendor links, check off purchases, monitor budget in real-time.", icon: "\ud83d\uded2" },
              { title: "Spoak Delivery", desc: "Sync design boards to Spoak for professional client presentation and collaboration.", icon: "\ud83d\udce6" },
              { title: "Client Presentation", desc: "Professional design package view. Print as PDF or share digitally.", icon: "\ud83d\udccb" },
              { title: "One-Click Export", desc: "CSV furniture lists, sleep plans, design briefs, AI prompts — all downloadable instantly.", icon: "\ud83d\udcca" },
              { title: "Team Collaboration", desc: "Real-time chat per project. Activity feed tracks who did what and when.", icon: "\ud83d\udcac" },
              { title: "Project Templates", desc: "Pre-built mountain cabin, beach house, farmhouse, and more. All rooms pre-configured.", icon: "\ud83d\udcdd" },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur"
              >
                <div className="mb-3 text-2xl">{f.icon}</div>
                <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
                <p className="text-sm text-white/60 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Designers */}
      <section className="bg-brand-800 px-8 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-bold mb-6">
            Built for designers who <span className="text-amber">move fast.</span>
          </h2>
          <p className="text-white/60 mb-12 max-w-2xl">
            Design Studio is built for the specific workflow of vacation rental interior design.
            Every feature is designed to compress the 80-hour timeline into same-day delivery.
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
              <div className="text-red-300 text-xs font-bold uppercase tracking-wider mb-4">Without Design Studio</div>
              <div className="space-y-3">
                {[
                  "Visit property with measuring tape — 4 hours",
                  "Sketch room layouts in PowerPoint — 8 hours",
                  "Browse Wayfair for each room — 16 hours",
                  "Build mood boards in Canva — 8 hours",
                  "Create AI rendering prompts manually — 8 hours",
                  "Compile furniture spreadsheet — 6 hours",
                  "Build client presentation — 8 hours",
                  "Deliver via email with attachments — 2 hours",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-white/60">
                    <span className="text-red-300">&#x2717;</span>
                    {item}
                  </div>
                ))}
                <div className="mt-4 pt-4 border-t border-white/10 text-lg font-bold text-red-300">
                  Total: ~80 hours (2+ weeks)
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-amber/30 bg-amber/5 p-8">
              <div className="text-amber text-xs font-bold uppercase tracking-wider mb-4">With Design Studio</div>
              <div className="space-y-3">
                {[
                  "Import Matterport/Polycam scan — 2 minutes",
                  "AI auto-generates rooms from property data — 1 minute",
                  "Sleep optimizer runs — 30 seconds",
                  "Style quiz + auto mood boards — 3 minutes",
                  "Auto-furnish all rooms — 3 minutes",
                  "Space planner with clearance checks — 10 minutes",
                  "AI rendering prompts auto-generated — 2 minutes",
                  "Export + deliver via Spoak — 5 minutes",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-white/80">
                    <span className="text-amber">&#x2713;</span>
                    {item}
                  </div>
                ))}
                <div className="mt-4 pt-4 border-t border-amber/20 text-lg font-bold text-amber">
                  Total: ~20 minutes + creative review
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-900 px-8 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to 40x your design speed?
          </h2>
          <p className="text-white/60 mb-8">
            Start a project, import your scan, and let the AI do the heavy lifting.
            Your first design can be done today.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="btn-accent text-lg px-10 py-5"
          >
            Start Designing Now
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-brand-950 px-8 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-white/40">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-amber/20 text-xs font-bold text-amber">
              D
            </div>
            Design Studio
          </div>
          <div className="text-xs text-white/30">
            Built for vacation rental designers who compress 80 hours into 1 day.
          </div>
        </div>
      </footer>
    </div>
  );
}
