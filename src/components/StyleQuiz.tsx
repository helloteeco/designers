"use client";

import { useState } from "react";
import { saveProject, getProject as getProjectFromStore, logActivity } from "@/lib/store";
import type { Project, DesignStyle } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
}

interface QuizQuestion {
  id: number;
  question: string;
  options: { label: string; value: string; styles: DesignStyle[] }[];
}

const QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    question: "How would you describe the overall vibe you want?",
    options: [
      { label: "Clean & minimal", value: "clean", styles: ["modern", "scandinavian", "contemporary"] },
      { label: "Warm & cozy", value: "warm", styles: ["farmhouse", "rustic", "mountain-lodge", "traditional"] },
      { label: "Bold & eclectic", value: "bold", styles: ["bohemian", "industrial", "mid-century"] },
      { label: "Breezy & relaxed", value: "breezy", styles: ["coastal", "transitional"] },
    ],
  },
  {
    id: 2,
    question: "What color palette feels right for this property?",
    options: [
      { label: "Whites, grays, and blacks", value: "mono", styles: ["modern", "scandinavian", "contemporary"] },
      { label: "Earth tones — tans, browns, greens", value: "earth", styles: ["rustic", "farmhouse", "mountain-lodge"] },
      { label: "Blues and sandy neutrals", value: "coastal", styles: ["coastal", "transitional"] },
      { label: "Rich jewel tones and warm accents", value: "jewel", styles: ["bohemian", "mid-century", "traditional"] },
      { label: "Mixed — I like contrast and layering", value: "mixed", styles: ["industrial", "bohemian", "mid-century"] },
    ],
  },
  {
    id: 3,
    question: "Which material do you gravitate toward most?",
    options: [
      { label: "Reclaimed wood and stone", value: "reclaimed", styles: ["rustic", "farmhouse", "mountain-lodge"] },
      { label: "Metal and concrete", value: "metal", styles: ["industrial", "modern", "contemporary"] },
      { label: "Natural fibers — rattan, jute, linen", value: "natural", styles: ["coastal", "bohemian", "scandinavian"] },
      { label: "Polished wood and leather", value: "polished", styles: ["mid-century", "traditional", "transitional"] },
      { label: "Glass, lacquer, and smooth surfaces", value: "glass", styles: ["modern", "contemporary", "scandinavian"] },
    ],
  },
  {
    id: 4,
    question: "What kind of furniture shapes do you prefer?",
    options: [
      { label: "Tapered legs, clean lines", value: "tapered", styles: ["mid-century", "scandinavian", "modern"] },
      { label: "Chunky, oversized, sink-in comfort", value: "chunky", styles: ["farmhouse", "mountain-lodge", "traditional"] },
      { label: "Low-profile and streamlined", value: "low", styles: ["modern", "contemporary", "scandinavian"] },
      { label: "Mixed vintage and handmade", value: "vintage", styles: ["bohemian", "rustic", "industrial"] },
      { label: "Classic shapes with soft curves", value: "classic", styles: ["transitional", "coastal", "traditional"] },
    ],
  },
  {
    id: 5,
    question: "Imagine your ideal vacation rental living room. What stands out?",
    options: [
      { label: "A massive stone fireplace and timber beams", value: "fireplace", styles: ["mountain-lodge", "rustic", "farmhouse"] },
      { label: "Floor-to-ceiling windows with a view", value: "windows", styles: ["modern", "contemporary", "coastal"] },
      { label: "A gallery wall and layered textiles", value: "gallery", styles: ["bohemian", "mid-century", "industrial"] },
      { label: "Shiplap walls and a farmhouse table", value: "shiplap", styles: ["farmhouse", "transitional", "traditional"] },
      { label: "Rattan accents and breezy curtains", value: "rattan", styles: ["coastal", "bohemian", "scandinavian"] },
    ],
  },
  {
    id: 6,
    question: "What should guests feel when they walk in?",
    options: [
      { label: "Wow, this is luxurious and curated", value: "luxury", styles: ["modern", "contemporary", "mid-century"] },
      { label: "This feels like a warm hug", value: "hug", styles: ["farmhouse", "mountain-lodge", "rustic", "traditional"] },
      { label: "This is so fun and Instagram-worthy", value: "instagram", styles: ["bohemian", "industrial", "mid-century"] },
      { label: "I never want to leave this peaceful retreat", value: "peaceful", styles: ["coastal", "scandinavian", "transitional"] },
    ],
  },
];

const STYLE_INFO: Record<DesignStyle, { label: string; description: string; palette: string[] }> = {
  modern: { label: "Modern", description: "Clean lines, neutral palette, minimal decor with bold statement pieces.", palette: ["#ffffff", "#d4d4d4", "#737373", "#404040", "#0a0a0a"] },
  farmhouse: { label: "Farmhouse", description: "Warm woods, shiplap, vintage accents, and cozy textiles.", palette: ["#faf5ef", "#e8c9a8", "#8b7355", "#5c4033", "#2d1b0e"] },
  coastal: { label: "Coastal", description: "Ocean-inspired blues, sandy neutrals, natural textures, and airy spaces.", palette: ["#f0f7fa", "#87ceeb", "#4a90a4", "#2c5f6e", "#1a3a4a"] },
  bohemian: { label: "Bohemian", description: "Layered patterns, mixed textures, global accents, and rich colors.", palette: ["#fef3e2", "#e07b53", "#8b4d6a", "#4a3766", "#2a3d2e"] },
  industrial: { label: "Industrial", description: "Exposed materials, metal and wood, warehouse vibes, raw finishes.", palette: ["#e8e4e0", "#a09890", "#706860", "#404040", "#1a1a1a"] },
  "mid-century": { label: "Mid-Century Modern", description: "Retro-inspired forms, warm woods, bold accent colors, tapered legs.", palette: ["#faf5eb", "#d4a574", "#c45e3a", "#2d5a4a", "#1a2a3a"] },
  scandinavian: { label: "Scandinavian", description: "Light woods, whites, functional simplicity, hygge comfort.", palette: ["#ffffff", "#f5f0eb", "#c4b8a8", "#8a7e70", "#3a3530"] },
  rustic: { label: "Rustic", description: "Raw natural wood, stone, antler accents, cabin warmth.", palette: ["#f2f0eb", "#c4a882", "#8b6b3d", "#5a4020", "#2a1a0a"] },
  contemporary: { label: "Contemporary", description: "Current trends, mixed materials, sophisticated neutrals.", palette: ["#fafafa", "#d4d4d8", "#71717a", "#3f3f46", "#18181b"] },
  transitional: { label: "Transitional", description: "Classic meets modern — timeless shapes, updated finishes.", palette: ["#f8f4f0", "#d4c4b0", "#8b7d6b", "#5a4d3e", "#2d2418"] },
  "mountain-lodge": { label: "Mountain Lodge", description: "Timber, stone, cozy layers, nature-inspired palette, grand scale.", palette: ["#f5f0eb", "#a8b5a0", "#7a6b5a", "#4a3d30", "#1a1510"] },
  traditional: { label: "Traditional", description: "Classic proportions, rich fabrics, symmetry, and warmth.", palette: ["#faf8f5", "#d4b896", "#8b6b4a", "#5a3d2a", "#2a1810"] },
};

function loadSavedAnswers(projectId: string): Record<number, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(`styleQuiz_${projectId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistAnswers(projectId: string, answers: Record<number, string>) {
  try {
    localStorage.setItem(`styleQuiz_${projectId}`, JSON.stringify(answers));
  } catch { /* quota exceeded — ignore */ }
}

export default function StyleQuiz({ project, onUpdate }: Props) {
  const [answers, setAnswers] = useState<Record<number, string>>(() =>
    loadSavedAnswers(project.id)
  );
  const [showResults, setShowResults] = useState(() => {
    const saved = loadSavedAnswers(project.id);
    return Object.keys(saved).length >= QUESTIONS.length;
  });

  const currentQuestion = Object.keys(answers).length;
  const allAnswered = currentQuestion >= QUESTIONS.length;

  function selectAnswer(questionId: number, value: string) {
    const next = { ...answers, [questionId]: value };
    setAnswers(next);
    persistAnswers(project.id, next);
    if (Object.keys(next).length >= QUESTIONS.length) {
      setShowResults(true);
    }
  }

  function getResults(): { style: DesignStyle; score: number; percent: number }[] {
    const scores: Record<string, number> = {};
    for (const q of QUESTIONS) {
      const answer = answers[q.id];
      if (!answer) continue;
      const option = q.options.find((o) => o.value === answer);
      if (!option) continue;
      for (const style of option.styles) {
        scores[style] = (scores[style] ?? 0) + 1;
      }
    }
    const maxScore = Math.max(...Object.values(scores), 1);
    return Object.entries(scores)
      .map(([style, score]) => ({
        style: style as DesignStyle,
        score,
        percent: Math.round((score / maxScore) * 100),
      }))
      .sort((a, b) => b.score - a.score);
  }

  function applyStyle(style: DesignStyle) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    fresh.style = style;
    saveProject(fresh);
    logActivity(project.id, "style_changed", `Style set to ${style} via quiz`);
    onUpdate();
  }

  function resetQuiz() {
    setAnswers({});
    setShowResults(false);
    persistAnswers(project.id, {});
  }

  if (showResults && allAnswered) {
    const results = getResults();
    if (results.length === 0) {
      resetQuiz();
      return null;
    }
    const topStyle = results[0];
    const info = STYLE_INFO[topStyle.style];

    return (
      <div>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">Your Style Results</h2>
            <p className="text-sm text-brand-600">
              Based on your answers, here are your top style matches.
            </p>
          </div>
          <button onClick={resetQuiz} className="btn-secondary btn-sm">
            Retake Quiz
          </button>
        </div>

        {/* Top result highlight */}
        <div className="card mb-6 border-amber/30 bg-amber/5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-amber-dark font-semibold mb-1">
                Best Match
              </div>
              <h3 className="text-2xl font-bold text-brand-900">{info.label}</h3>
              <p className="text-sm text-brand-600 mt-1">{info.description}</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-amber-dark">{topStyle.percent}%</div>
              <div className="text-[10px] text-brand-600">match</div>
            </div>
          </div>

          {/* Palette preview */}
          <div className="flex gap-2 mb-4">
            {info.palette.map((color, i) => (
              <div key={i} className="text-center">
                <div className="h-10 w-10 rounded-lg border border-brand-900/10" style={{ backgroundColor: color }} />
                <span className="text-[9px] text-brand-600 mt-1 block">{color}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => applyStyle(topStyle.style)}
            className={`btn-accent btn-sm ${project.style === topStyle.style ? "opacity-60 cursor-default" : ""}`}
            disabled={project.style === topStyle.style}
          >
            {project.style === topStyle.style ? "Already Applied" : `Apply ${info.label} Style`}
          </button>
        </div>

        {/* Runner-up styles */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.slice(1, 7).map(({ style, percent }) => {
            const si = STYLE_INFO[style];
            const isActive = project.style === style;
            return (
              <div
                key={style}
                className={`card transition ${isActive ? "border-amber/40 bg-amber/5" : ""}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="text-sm font-semibold text-brand-900">{si.label}</h4>
                  <span className="text-sm font-bold text-brand-600">{percent}%</span>
                </div>
                <div className="flex gap-1 mb-3">
                  {si.palette.map((color, i) => (
                    <div key={i} className="h-5 w-5 rounded" style={{ backgroundColor: color }} />
                  ))}
                </div>
                <p className="text-xs text-brand-600 mb-3 line-clamp-2">{si.description}</p>
                <button
                  onClick={() => applyStyle(style)}
                  disabled={isActive}
                  className={`w-full text-xs font-medium rounded-lg px-3 py-1.5 transition ${
                    isActive
                      ? "bg-amber/20 text-amber-dark cursor-default"
                      : "bg-brand-900/5 text-brand-700 hover:bg-brand-900/10"
                  }`}
                >
                  {isActive ? "Active Style" : "Apply This Style"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const activeQ = QUESTIONS[Math.min(currentQuestion, QUESTIONS.length - 1)];
  const progress = ((currentQuestion) / QUESTIONS.length) * 100;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Design Style Quiz</h2>
        <p className="text-sm text-brand-600">
          Answer {QUESTIONS.length} quick questions to find the perfect design style for this property.
        </p>
      </div>

      {/* Progress */}
      <div className="mb-2 flex items-center justify-between text-xs text-brand-600">
        <span>Question {Math.min(currentQuestion + 1, QUESTIONS.length)} of {QUESTIONS.length}</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="mb-8 h-2 w-full overflow-hidden rounded-full bg-brand-900/5">
        <div
          className="h-full rounded-full bg-amber transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Question card */}
      <div className="card">
        <h3 className="text-xl font-semibold text-brand-900 mb-6">
          {activeQ.question}
        </h3>
        <div className="space-y-3">
          {activeQ.options.map((option) => {
            const isSelected = answers[activeQ.id] === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => selectAnswer(activeQ.id, option.value)}
                className={`w-full rounded-xl border px-5 py-4 text-left text-sm font-medium transition ${
                  isSelected
                    ? "border-amber bg-amber/10 text-brand-900"
                    : "border-brand-900/10 text-brand-700 hover:border-amber/40 hover:bg-amber/5"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation dots */}
      {currentQuestion > 0 && (
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              const prevQ = QUESTIONS[currentQuestion - 1];
              if (prevQ) {
                const next = { ...answers };
                delete next[prevQ.id];
                setAnswers(next);
                persistAnswers(project.id, next);
              }
            }}
            className="text-xs font-medium text-brand-600 hover:text-brand-900 transition"
          >
            &larr; Previous question
          </button>
          <div className="flex gap-1.5">
            {QUESTIONS.map((q, i) => (
              <div
                key={q.id}
                className={`h-2 w-2 rounded-full transition ${
                  i < currentQuestion
                    ? "bg-amber"
                    : i === currentQuestion
                    ? "bg-brand-900/40"
                    : "bg-brand-900/10"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Current style indicator */}
      <div className="mt-8 pt-6 border-t border-brand-900/5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-brand-600">
            Current project style:{" "}
            <span className="font-semibold text-brand-900 capitalize">
              {project.style.replace(/-/g, " ")}
            </span>
          </span>
          {currentQuestion > 0 && (
            <button
              onClick={resetQuiz}
              className="text-brand-600 hover:text-brand-900 transition"
            >
              Start over
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
