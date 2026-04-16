"use client";

import { useState } from "react";
import { STYLE_QUIZ, scoreQuizResults, PRESET_PALETTES } from "@/lib/design-presets";
import { saveProject, getProject as getProjectFromStore, logActivity } from "@/lib/store";
import type { Project, DesignStyle } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: () => void;
  onComplete?: () => void;
}

export default function StyleQuiz({ project, onUpdate, onComplete }: Props) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showResults, setShowResults] = useState(false);

  const questions = STYLE_QUIZ;
  const question = questions[currentQuestion];
  const progress = ((currentQuestion + 1) / questions.length) * 100;

  function selectAnswer(label: string) {
    const newAnswers = { ...answers, [question.id]: label };
    setAnswers(newAnswers);

    if (currentQuestion < questions.length - 1) {
      setTimeout(() => setCurrentQuestion(currentQuestion + 1), 300);
    } else {
      setShowResults(true);
    }
  }

  function applyStyle(style: DesignStyle) {
    const fresh = getProjectFromStore(project.id);
    if (!fresh) return;
    fresh.style = style;
    saveProject(fresh);
    logActivity(project.id, "style_selected", `Design style set to ${style} via quiz`);
    onUpdate();
    onComplete?.();
  }

  function restart() {
    setAnswers({});
    setCurrentQuestion(0);
    setShowResults(false);
  }

  if (showResults) {
    const results = scoreQuizResults(answers);
    const top3 = results.slice(0, 3);
    const maxScore = top3[0]?.score ?? 1;

    return (
      <div>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">Style Quiz Results</h2>
            <p className="text-sm text-brand-600">
              Based on your answers, here are your top style matches.
            </p>
          </div>
          <button onClick={restart} className="btn-secondary btn-sm">
            Retake Quiz
          </button>
        </div>

        <div className="space-y-4">
          {top3.map((result, i) => {
            const palette = PRESET_PALETTES.find(p => p.style === result.style);
            const matchPercent = Math.round((result.score / maxScore) * 100);
            const styleName = result.style.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

            return (
              <div
                key={result.style}
                className={`card transition ${i === 0 ? "border-amber/40 bg-amber/5" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    {/* Match rank */}
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full font-bold text-sm shrink-0 ${
                      i === 0 ? "bg-amber text-white" : "bg-brand-900/10 text-brand-600"
                    }`}>
                      #{i + 1}
                    </div>

                    <div>
                      <h3 className="font-semibold text-brand-900 text-lg">{styleName}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="h-1.5 w-24 rounded-full bg-brand-900/5">
                          <div
                            className={`h-1.5 rounded-full ${i === 0 ? "bg-amber" : "bg-brand-900/20"}`}
                            style={{ width: `${matchPercent}%` }}
                          />
                        </div>
                        <span className="text-xs text-brand-600">{matchPercent}% match</span>
                      </div>

                      {/* Palette preview */}
                      {palette && (
                        <div className="flex mt-3 overflow-hidden rounded-lg">
                          {palette.colors.map((color, j) => (
                            <div key={j} className="h-8 w-8" style={{ backgroundColor: color }} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => applyStyle(result.style)}
                    className={i === 0 ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
                  >
                    {i === 0 ? "Apply This Style" : "Choose"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Design Style Quiz</h2>
        <p className="text-sm text-brand-600">
          Answer {questions.length} quick questions to find the perfect design style for this property.
        </p>
      </div>

      {/* Progress */}
      <div className="mb-8">
        <div className="flex justify-between text-xs text-brand-600 mb-1">
          <span>Question {currentQuestion + 1} of {questions.length}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-brand-900/5">
          <div
            className="h-2 rounded-full bg-amber transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="card p-8">
        <h3 className="text-xl font-semibold text-brand-900 mb-6">{question.question}</h3>

        <div className="space-y-3">
          {question.options.map(option => {
            const isSelected = answers[question.id] === option.label;
            return (
              <button
                key={option.label}
                onClick={() => selectAnswer(option.label)}
                className={`w-full text-left rounded-xl border-2 px-5 py-4 transition ${
                  isSelected
                    ? "border-amber bg-amber/10 text-brand-900"
                    : "border-brand-900/10 hover:border-amber/40 text-brand-700"
                }`}
              >
                <span className="font-medium">{option.label}</span>
              </button>
            );
          })}
        </div>

        {/* Navigation */}
        {currentQuestion > 0 && (
          <button
            onClick={() => setCurrentQuestion(currentQuestion - 1)}
            className="mt-6 text-sm text-brand-600 hover:text-brand-900"
          >
            &larr; Previous
          </button>
        )}
      </div>
    </div>
  );
}
