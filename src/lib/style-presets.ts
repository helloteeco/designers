/**
 * Style presets — curated directions the designer picks from before AI
 * generates a scene. Each preset's {palette, vibe, signaturePieces} feed
 * both the Gemini scene-generation prompt and the product-sourcing queries.
 *
 * These are the high-ROI popular styles for 2025–2026 short-term rental
 * and boutique residential work. "Groovy" is our internal label for the
 * Funk It Interiors-style 70s-inspired bold look.
 */

import type { DesignStyle } from "./types";

export interface StylePreset {
  id: string;
  label: string;
  /** Short description surfaced to the designer */
  description: string;
  /** 5-color hex palette, lead → accent */
  palette: string[];
  /** Keywords woven into image-gen prompt (comma-separated vibe) */
  vibe: string;
  /** Signature item shorthand — informs sourcing search queries */
  signaturePieces: string[];
  /** Maps to our internal DesignStyle for auto-suggest fallback */
  designStyle: DesignStyle;
  /** Hero emoji for chip display */
  emoji: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "japandi",
    label: "Japandi",
    description: "Japanese + Scandinavian minimalism. Warm neutrals, natural wood, clean lines.",
    palette: ["#EEE8DC", "#D6C5A3", "#8B7355", "#2C2825", "#A8B5A6"],
    vibe: "japandi, japanese-scandinavian fusion, warm minimalism, light oak wood, matte black accents, paper lanterns, low-profile furniture, zen, calm, natural textures",
    signaturePieces: ["low platform bed", "light oak nightstand", "paper pendant lamp", "cotton bouclé chair", "wabi-sabi ceramic"],
    designStyle: "scandinavian",
    emoji: "🎋",
  },
  {
    id: "scandinavian",
    label: "Scandinavian",
    description: "Light, airy, hygge. White walls, pale wood, cozy textiles.",
    palette: ["#FFFFFF", "#F5F0E8", "#D4C5A9", "#6B7A6B", "#2E2E2E"],
    vibe: "scandinavian, nordic, hygge, white-washed walls, pale ash wood, sheepskin throws, soft wool rugs, simple silhouettes, functional minimalism, natural light",
    signaturePieces: ["white upholstered sofa", "ash wood dining table", "wishbone chair", "pendant globe lamp", "fur throw"],
    designStyle: "scandinavian",
    emoji: "❄️",
  },
  {
    id: "mid-century-modern",
    label: "Mid-Century Modern",
    description: "1950s–60s clean lines. Walnut, brass, geometric forms, saturated accents.",
    palette: ["#C4A98A", "#8B4513", "#2E2E2E", "#D4A574", "#7BA098"],
    vibe: "mid-century modern, 1950s 1960s, walnut wood, tapered legs, brass fixtures, geometric patterns, teal and mustard accents, nelson bubble lamp, eames, saarinen",
    signaturePieces: ["walnut credenza", "tapered-leg sofa", "starburst mirror", "george nelson pendant", "eames lounge chair"],
    designStyle: "mid-century",
    emoji: "🪑",
  },
  {
    id: "coastal",
    label: "Coastal",
    description: "Breezy, bright. White-washed, natural fibers, blue + sand accents.",
    palette: ["#FFFFFF", "#F2EBE0", "#C4B5A0", "#7FA8BE", "#2E5A7A"],
    vibe: "coastal, beach house, hamptons, whitewashed shiplap, jute rugs, rattan furniture, linen slipcovered sofas, driftwood, blue and white stripes, natural light pouring in",
    signaturePieces: ["white slipcovered sofa", "rattan accent chair", "jute rug", "oversized seashell", "rope pendant"],
    designStyle: "coastal",
    emoji: "🐚",
  },
  {
    id: "boho",
    label: "Boho",
    description: "Layered, eclectic. Moroccan rugs, rattan, plants, warm earth tones.",
    palette: ["#D4A574", "#B8860B", "#8B4513", "#C47A4D", "#5C4033"],
    vibe: "bohemian, boho, layered textures, moroccan rug, rattan peacock chair, macrame wall hanging, fiddle leaf fig, kilim pillows, globally-inspired, warm terracotta, amber lighting",
    signaturePieces: ["moroccan pouf", "rattan peacock chair", "kilim rug", "macrame wall hanging", "terracotta vase cluster"],
    designStyle: "bohemian",
    emoji: "🌿",
  },
  {
    id: "traditional",
    label: "Traditional",
    description: "Timeless, refined. Wainscoting, tufted upholstery, oriental rugs.",
    palette: ["#F5EBE0", "#C9B8A3", "#8B4513", "#4A3F35", "#6B2737"],
    vibe: "traditional, classic, wainscoting, crown molding, tufted chesterfield, oriental persian rug, mahogany wood, brass hardware, drapery with valance, symmetrical arrangements",
    signaturePieces: ["tufted chesterfield sofa", "wingback chair", "persian rug", "mahogany console", "brass table lamp"],
    designStyle: "traditional",
    emoji: "🏛️",
  },
  {
    id: "groovy",
    label: "Groovy",
    description: "70s-inspired bold color + curvy forms. Mushroom lamps, shag, earth jewel tones.",
    palette: ["#C4572F", "#D4A54F", "#6B8E4E", "#8B4B7F", "#3D2817"],
    vibe: "70s inspired, groovy, retro, curvy rounded furniture, mushroom lamp, shag rug, burnt orange and avocado green, velvet sofa, bold geometric wallpaper, mood lighting, earthy jewel tones, funk-it-interiors vibe",
    signaturePieces: ["curved velvet sofa", "mushroom table lamp", "shag rug", "rounded sculptural chair", "bold abstract art"],
    designStyle: "bohemian",
    emoji: "🍄",
  },
  {
    id: "mediterranean",
    label: "Mediterranean",
    description: "Sun-drenched. Terracotta, plaster walls, arches, wrought iron.",
    palette: ["#F5EBE0", "#D4A574", "#C4572F", "#5C6B4F", "#3D2817"],
    vibe: "mediterranean, spanish, tuscan, terracotta tile floor, plaster walls, arched doorway, wrought iron, olive branches, warm sunlight, linen curtains, rustic wood beam ceiling",
    signaturePieces: ["linen sofa", "wrought iron pendant", "terracotta urn", "olive branch bouquet", "rustic wood dining table"],
    designStyle: "rustic",
    emoji: "🫒",
  },
  {
    id: "organic-modern",
    label: "Organic Modern",
    description: "Contemporary + natural. Bouclé, travertine, soft curves, neutral warmth.",
    palette: ["#F5EBE0", "#E8D5B7", "#C4A98A", "#8B7355", "#2E2E2E"],
    vibe: "organic modern, contemporary, bouclé fabric, travertine stone, soft curves, rounded silhouettes, warm neutrals, limewash walls, oak wood, natural linen, minimal but warm",
    signaturePieces: ["bouclé sofa", "travertine coffee table", "curved oak credenza", "linen drapery", "sculptural ceramic vase"],
    designStyle: "contemporary",
    emoji: "🪨",
  },
  {
    id: "japanese-minimalist",
    label: "Japanese Minimalist",
    description: "Zen purity. Tatami, shoji screens, bonsai, low furniture, empty space.",
    palette: ["#F5F1E8", "#D4C5A3", "#8B7355", "#2C2825", "#4A5D4A"],
    vibe: "japanese minimalist, zen, tatami mat floor, shoji screen, bonsai, low futon bed, dark wood beams, paper lantern, empty negative space, wabi-sabi, calm, meditation",
    signaturePieces: ["low futon bed", "shoji room divider", "tatami mat", "bonsai", "dark wood stool"],
    designStyle: "modern",
    emoji: "⛩️",
  },
];

export function getPreset(id: string | undefined): StylePreset | undefined {
  if (!id) return undefined;
  return STYLE_PRESETS.find(p => p.id === id);
}

/**
 * Build the text prompt for Gemini scene generation.
 *
 * Mode: "full-scene" — photorealistic furnished room (old default, still
 * available if the designer wants it).
 * Mode: "install-guide-bg" (default) — clean install-guide style backdrop:
 * empty room with just walls/floor/window/door drawn flatly, no furniture.
 * Furniture cutouts get layered on top separately. This matches how Teeco's
 * actual install guides look (see Bedroom / Kitchen / Bedroom 2 boards).
 */
export function buildScenePrompt(
  preset: StylePreset,
  room: { type: string; widthFt: number; lengthFt: number; name?: string },
  extraNotes?: string,
  mode: "full-scene" | "install-guide-bg" = "install-guide-bg"
): string {
  const roomKind = room.type.replace(/-/g, " ");

  if (mode === "install-guide-bg") {
    // The install-guide aesthetic: empty room BACKGROUND only. Clean walls,
    // visible flooring, window with light, any door hardware — NO furniture.
    // Straight-on or slight 3/4 angle. Flat, composite-ready.
    const parts = [
      `An empty ${roomKind} design-board background illustration, straight-on interior elevation view,`,
      `clean empty room with ${preset.palette[0]} walls, ${preset.palette[1]} flooring,`,
      `${preset.label} style architectural details only — a window with natural daylight,`,
      `no furniture, no decor, no art, no plants, no rugs, no lamps — just the empty architectural shell,`,
      `wide aspect ratio suitable for composite work, soft even lighting, ${preset.vibe.split(",").slice(0, 3).join(",")} mood hinted through wall color and material choices only,`,
      `photographed as a design-board reference, 16:9 aspect ratio, minimal and uncluttered`,
    ];
    if (extraNotes) parts.push(extraNotes);
    return parts.join(" ");
  }

  // Realistic furnished scene — the "show me what it'll look like" mode.
  // This is what designers and clients actually want to see: a beautiful,
  // photoreal render of the FULLY FURNISHED room. Treated as a hero image
  // for the install guide cover and per-room pages.
  const parts = [
    `Award-winning interior design photography of a fully furnished ${roomKind}`,
    `in authentic ${preset.label} style — ${preset.vibe}`,
    `Color palette anchors on ${preset.palette.slice(0, 3).join(", ")}, with subtle accents from ${preset.palette.slice(3).join(" and ")}`,
    `Hero pieces visible: ${preset.signaturePieces.slice(0, 5).join(", ")}`,
    `Architectural context: ${room.widthFt}' × ${room.lengthFt}' room with proper proportions, natural ceiling height, a window letting in soft daylight`,
    `Camera: 24mm wide-angle interior lens at eye level, slight 3/4 perspective showing 3 walls, depth of field set to keep entire room sharp`,
    `Lighting: golden hour natural light pouring through window, supplemented by warm interior lamps for editorial mood, no harsh shadows`,
    `Styling: layered textures, intentional negative space, magazine-quality composition (think Architectural Digest, Dwell, Apartment Therapy)`,
    `Render: photorealistic — NOT illustration, NOT painting, NOT 3D render, NOT cartoon. Looks like a real photograph from a luxury interior shoot.`,
    `16:9 aspect ratio, sharp focus throughout`,
  ];
  if (extraNotes) parts.push(extraNotes);
  return parts.join(". ");
}
