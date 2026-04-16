/**
 * Design presets — curated palettes, style quiz logic, and inspiration data
 */

import type { DesignStyle } from "./types";

// ── Color Palettes ──

export const PRESET_PALETTES: { name: string; style: DesignStyle; colors: string[] }[] = [
  { name: "Warm Neutrals", style: "modern", colors: ["#f5f0eb", "#d4a574", "#8b7355", "#3d3022", "#1a1a2e"] },
  { name: "Coastal Blue", style: "coastal", colors: ["#f0f7fa", "#87ceeb", "#4a90a4", "#2c5f6e", "#1a3a4a"] },
  { name: "Forest Retreat", style: "mountain-lodge", colors: ["#f2f5f0", "#a8b5a0", "#5a6b50", "#3a4a32", "#1a2a1a"] },
  { name: "Desert Sand", style: "farmhouse", colors: ["#faf5ef", "#e8c9a8", "#c4956a", "#8b5e3c", "#4a2f1a"] },
  { name: "Modern Mono", style: "contemporary", colors: ["#ffffff", "#d4d4d4", "#737373", "#404040", "#0a0a0a"] },
  { name: "Sunset Warmth", style: "bohemian", colors: ["#fef3e2", "#f4a261", "#e76f51", "#264653", "#2a9d8f"] },
  { name: "Lavender Dream", style: "bohemian", colors: ["#f8f4ff", "#c9b1ff", "#8b6bbf", "#4a3766", "#1a1030"] },
  { name: "Earthy Terracotta", style: "rustic", colors: ["#faf0e6", "#d4856c", "#a0522d", "#5c3317", "#2d1b0e"] },
  { name: "Scandinavian Light", style: "scandinavian", colors: ["#ffffff", "#f5f0eb", "#d4d4d4", "#a8b5a0", "#5a6b50"] },
  { name: "Industrial Loft", style: "industrial", colors: ["#f5f5f5", "#737373", "#404040", "#1a1a1a", "#c4956a"] },
  { name: "Mid-Century Pop", style: "mid-century", colors: ["#faf5ef", "#f4a261", "#e76f51", "#264653", "#2a9d8f"] },
  { name: "Mountain Lodge", style: "mountain-lodge", colors: ["#f5f0eb", "#d4a574", "#8b7355", "#5a6b50", "#3d3022"] },
];

// ── Style Quiz ──

export interface QuizQuestion {
  id: string;
  question: string;
  options: { label: string; styles: DesignStyle[]; weight: number }[];
}

export const STYLE_QUIZ: QuizQuestion[] = [
  {
    id: "vibe",
    question: "How would you describe the overall vibe you want?",
    options: [
      { label: "Clean & minimal", styles: ["modern", "scandinavian", "contemporary"], weight: 3 },
      { label: "Warm & cozy", styles: ["farmhouse", "rustic", "mountain-lodge"], weight: 3 },
      { label: "Beachy & relaxed", styles: ["coastal", "bohemian"], weight: 3 },
      { label: "Bold & eclectic", styles: ["bohemian", "mid-century", "industrial"], weight: 3 },
    ],
  },
  {
    id: "colors",
    question: "Which color palette speaks to you?",
    options: [
      { label: "Whites, grays, and one accent color", styles: ["modern", "scandinavian", "contemporary"], weight: 2 },
      { label: "Warm browns, creams, and sage green", styles: ["farmhouse", "rustic", "mountain-lodge"], weight: 2 },
      { label: "Blues, whites, and sandy tones", styles: ["coastal"], weight: 2 },
      { label: "Rich jewel tones and warm metals", styles: ["bohemian", "traditional", "mid-century"], weight: 2 },
    ],
  },
  {
    id: "furniture",
    question: "What kind of furniture do you prefer?",
    options: [
      { label: "Sleek, low-profile, simple lines", styles: ["modern", "contemporary", "scandinavian"], weight: 2 },
      { label: "Substantial, natural wood, sturdy", styles: ["farmhouse", "rustic", "mountain-lodge"], weight: 2 },
      { label: "Light, airy, wicker and rattan", styles: ["coastal", "bohemian"], weight: 2 },
      { label: "Mix of vintage and modern, statement pieces", styles: ["mid-century", "industrial", "bohemian"], weight: 2 },
    ],
  },
  {
    id: "walls",
    question: "What would you do with the walls?",
    options: [
      { label: "Keep them white or very light", styles: ["modern", "scandinavian", "coastal"], weight: 1 },
      { label: "Shiplap or wood paneling", styles: ["farmhouse", "coastal", "rustic"], weight: 1 },
      { label: "Bold wallpaper or a dark accent wall", styles: ["bohemian", "mid-century", "traditional"], weight: 1 },
      { label: "Exposed brick or concrete", styles: ["industrial", "contemporary"], weight: 1 },
    ],
  },
  {
    id: "lighting",
    question: "What type of lighting feels right?",
    options: [
      { label: "Recessed and track lighting, very clean", styles: ["modern", "contemporary"], weight: 1 },
      { label: "Warm pendants, lanterns, candles", styles: ["farmhouse", "rustic", "mountain-lodge"], weight: 1 },
      { label: "Rattan or woven fixtures, lots of natural light", styles: ["coastal", "bohemian", "scandinavian"], weight: 1 },
      { label: "Edison bulbs, metal fixtures, industrial pendants", styles: ["industrial", "mid-century"], weight: 1 },
    ],
  },
  {
    id: "property",
    question: "Where is (or will be) the property?",
    options: [
      { label: "Near the beach or water", styles: ["coastal"], weight: 3 },
      { label: "In the mountains or forest", styles: ["mountain-lodge", "rustic"], weight: 3 },
      { label: "Rural area or countryside", styles: ["farmhouse", "rustic"], weight: 3 },
      { label: "Urban or suburban area", styles: ["modern", "contemporary", "industrial"], weight: 3 },
    ],
  },
];

export function scoreQuizResults(
  answers: Record<string, string>
): { style: DesignStyle; score: number }[] {
  const scores: Record<string, number> = {};

  for (const question of STYLE_QUIZ) {
    const answer = answers[question.id];
    if (!answer) continue;

    const option = question.options.find(o => o.label === answer);
    if (!option) continue;

    for (const style of option.styles) {
      scores[style] = (scores[style] ?? 0) + option.weight;
    }
  }

  return Object.entries(scores)
    .map(([style, score]) => ({ style: style as DesignStyle, score }))
    .sort((a, b) => b.score - a.score);
}

// ── Client Onboarding Questions ──

export interface OnboardingQuestion {
  id: string;
  question: string;
  type: "text" | "select" | "multiselect" | "scale";
  options?: string[];
}

export const CLIENT_ONBOARDING: OnboardingQuestion[] = [
  { id: "use", question: "What will this property be used for?", type: "select", options: ["Short-term rental (Airbnb)", "Long-term rental", "Personal vacation home", "Mix of rental and personal use"] },
  { id: "guests", question: "How many guests do you want to accommodate?", type: "select", options: ["2-4 (cozy)", "6-8 (family)", "10-12 (group)", "14-16 (large group)", "16+ (max capacity)"] },
  { id: "budget", question: "What is your total furnishing budget?", type: "select", options: ["Under $5,000", "$5,000 - $10,000", "$10,000 - $15,000", "$15,000 - $25,000", "$25,000+"] },
  { id: "timeline", question: "When do you need the property ready?", type: "select", options: ["ASAP (within 2 weeks)", "1 month", "2-3 months", "No rush"] },
  { id: "style_pref", question: "Do you have a design style preference?", type: "select", options: ["Yes, I know what I want", "I have some ideas", "Help me decide", "Designer's choice"] },
  { id: "must_haves", question: "Any must-have features?", type: "multiselect", options: ["Hot tub", "Fire pit", "Game room", "Bunk beds for kids", "Office/workspace", "Outdoor dining", "King bed in primary", "Pet-friendly materials"] },
  { id: "avoid", question: "Anything you want to avoid?", type: "text" },
  { id: "inspiration", question: "Share any inspiration links or Pinterest boards", type: "text" },
];

// ── Vendor Info ──

export const VENDORS = [
  { name: "Wayfair", url: "https://www.wayfair.com", specialty: "Everything — primary vendor", shippingNote: "Free shipping on most items" },
  { name: "Amazon", url: "https://www.amazon.com", specialty: "Small items, linens, accessories", shippingNote: "Prime 2-day shipping" },
  { name: "Target", url: "https://www.target.com", specialty: "Decor, textiles, kitchen", shippingNote: "Free shipping $35+" },
  { name: "IKEA", url: "https://www.ikea.com", specialty: "Budget furniture, storage, basics", shippingNote: "Flat-rate shipping" },
  { name: "West Elm", url: "https://www.westelm.com", specialty: "Premium mid-century, modern", shippingNote: "Free shipping $75+" },
  { name: "Article", url: "https://www.article.com", specialty: "Modern/mid-century sofas and beds", shippingNote: "Flat-rate delivery" },
  { name: "Ruggable", url: "https://www.ruggable.com", specialty: "Washable rugs (ideal for rentals)", shippingNote: "Free shipping" },
];
