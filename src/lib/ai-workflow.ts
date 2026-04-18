/**
 * AI Workflow Engine
 *
 * Automates the full design pipeline: scan → rooms → sleep → furniture → mood → render → deliver
 * Compresses the designer's 80-hour workflow to under a day.
 */

import type { Project, Room, DesignStyle, MoodBoard, RoomType } from "./types";
import { suggestFurniture } from "./auto-suggest";
import { placeFurniture } from "./space-planning";
import { generateId } from "./store";

// ── Workflow Steps ──

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  estimatedMinutes: number; // time saved vs manual
  manualHours: number; // what it takes a designer manually
  automatable: boolean;
  status: "pending" | "running" | "complete" | "skipped" | "error";
  result?: string;
}

export interface WorkflowRun {
  id: string;
  projectId: string;
  startedAt: string;
  completedAt: string | null;
  steps: WorkflowStep[];
  totalTimeSavedHours: number;
  errors: string[];
}

export const WORKFLOW_STEPS: Omit<WorkflowStep, "status" | "result">[] = [
  {
    id: "scan-import",
    name: "Import 3D Scan",
    description: "Link Matterport/Polycam scan and extract property dimensions",
    estimatedMinutes: 2,
    manualHours: 2,
    automatable: true,
  },
  {
    id: "room-setup",
    name: "Auto-Generate Rooms",
    description: "Create rooms from property details with standard dimensions",
    estimatedMinutes: 1,
    manualHours: 4,
    automatable: true,
  },
  {
    id: "sleep-optimize",
    name: "Optimize Sleeping",
    description: "Run sleep algorithm to maximize guest capacity with best bed configs",
    estimatedMinutes: 0.5,
    manualHours: 3,
    automatable: true,
  },
  {
    id: "style-select",
    name: "Select Design Style",
    description: "Choose style based on property location and client preferences",
    estimatedMinutes: 1,
    manualHours: 4,
    automatable: true,
  },
  {
    id: "mood-board",
    name: "Generate Mood Boards",
    description: "Auto-create mood boards with color palettes matching the chosen style",
    estimatedMinutes: 2,
    manualHours: 8,
    automatable: true,
  },
  {
    id: "furniture-select",
    name: "Auto-Select Furniture",
    description: "Fill every room with style-matched furniture from the catalog",
    estimatedMinutes: 3,
    manualHours: 16,
    automatable: true,
  },
  {
    id: "budget-check",
    name: "Budget Validation",
    description: "Verify total cost is within budget, swap items if over",
    estimatedMinutes: 1,
    manualHours: 2,
    automatable: true,
  },
  {
    id: "render-prompts",
    name: "Generate AI Renders",
    description: "Create Midjourney/DALL-E prompts for every room",
    estimatedMinutes: 2,
    manualHours: 8,
    automatable: true,
  },
  {
    id: "shopping-list",
    name: "Build Shopping List",
    description: "Compile vendor links, quantities, and pricing for procurement",
    estimatedMinutes: 1,
    manualHours: 6,
    automatable: true,
  },
  {
    id: "client-package",
    name: "Package for Client",
    description: "Generate exportable design brief, mood boards, and delivery PDF",
    estimatedMinutes: 2,
    manualHours: 8,
    automatable: true,
  },
  {
    id: "spoak-sync",
    name: "Sync to Spoak",
    description: "Prepare design board data for Spoak project delivery",
    estimatedMinutes: 2,
    manualHours: 6,
    automatable: true,
  },
  {
    id: "qa-review",
    name: "QA Checklist",
    description: "Run final quality checks on all deliverables",
    estimatedMinutes: 3,
    manualHours: 4,
    automatable: true,
  },
];

export function calculateTimeSavings(): {
  manualHours: number;
  automatedMinutes: number;
  savingsPercent: number;
} {
  const manualHours = WORKFLOW_STEPS.reduce((s, step) => s + step.manualHours, 0);
  const automatedMinutes = WORKFLOW_STEPS.reduce((s, step) => s + step.estimatedMinutes, 0);
  return {
    manualHours,
    automatedMinutes,
    savingsPercent: Math.round((1 - automatedMinutes / 60 / manualHours) * 100),
  };
}

// ── Auto-Design Pipeline ──

export function autoGenerateRooms(project: Project): Room[] {
  const { bedrooms, bathrooms, squareFootage } = project.property;
  const rooms: Room[] = [];
  const sqftPerRoom = squareFootage > 0 ? squareFootage / Math.max(bedrooms + 3, 5) : 200;

  // Primary bedroom
  if (bedrooms >= 1) {
    rooms.push(createRoom("Primary Suite", "primary-bedroom", {
      widthFt: Math.round(Math.sqrt(sqftPerRoom * 1.3) * 1.2),
      lengthFt: Math.round(Math.sqrt(sqftPerRoom * 1.3) / 1.2),
      features: ["Window", "Closet", "En-suite"],
    }));
  }

  // Additional bedrooms
  for (let i = 2; i <= bedrooms; i++) {
    const isLarge = i <= 2;
    rooms.push(createRoom(`Bedroom ${i}`, "bedroom", {
      widthFt: isLarge ? 14 : 12,
      lengthFt: isLarge ? 12 : 11,
      features: isLarge ? ["Window", "Closet"] : ["Window"],
    }));
  }

  // Living room
  rooms.push(createRoom("Living Room", "living-room", {
    widthFt: Math.round(Math.sqrt(sqftPerRoom * 1.5) * 1.3),
    lengthFt: Math.round(Math.sqrt(sqftPerRoom * 1.5) / 1.3),
    features: ["Window", "Fireplace"],
  }));

  // Kitchen
  rooms.push(createRoom("Kitchen", "kitchen", {
    widthFt: 14,
    lengthFt: 12,
    features: ["Window"],
  }));

  // Dining room (if > 1500 sqft)
  if (squareFootage > 1500) {
    rooms.push(createRoom("Dining Room", "dining-room", {
      widthFt: 12,
      lengthFt: 11,
      features: ["Window"],
    }));
  }

  // Loft or bonus room (if > 2000 sqft)
  if (squareFootage > 2000) {
    rooms.push(createRoom("Loft", "loft", {
      widthFt: 16,
      lengthFt: 14,
      ceilingHeightFt: 12,
      features: ["Vaulted Ceiling", "Skylight"],
    }));
  }

  // Game room (if targeting 12+ guests)
  if (project.targetGuests >= 12 && squareFootage > 2500) {
    rooms.push(createRoom("Game Room", "game-room", {
      widthFt: 16,
      lengthFt: 14,
      features: ["Window"],
    }));
  }

  // Outdoor space
  rooms.push(createRoom("Outdoor Deck", "outdoor", {
    widthFt: 20,
    lengthFt: 16,
    features: [],
  }));

  return rooms;
}

function createRoom(
  name: string,
  type: RoomType,
  overrides: Partial<Room> & { features?: string[] }
): Room {
  return {
    id: generateId(),
    name,
    type,
    widthFt: overrides.widthFt ?? 12,
    lengthFt: overrides.lengthFt ?? 12,
    ceilingHeightFt: overrides.ceilingHeightFt ?? 9,
    floor: 1,
    features: overrides.features ?? [],
    selectedBedConfig: null,
    furniture: [],
    accentWall: null,
    notes: "",
  };
}

export function autoSelectStyle(project: Project): DesignStyle {
  const city = (project.property.city || "").toLowerCase();
  const state = (project.property.state || "").toLowerCase();
  const prefs = (project.client.preferences || "").toLowerCase();

  // Location-based style inference
  if (prefs.includes("modern") || prefs.includes("contemporary")) return "modern";
  if (prefs.includes("farmhouse") || prefs.includes("country")) return "farmhouse";
  if (prefs.includes("coastal") || prefs.includes("beach")) return "coastal";
  if (prefs.includes("rustic") || prefs.includes("cabin")) return "rustic";
  if (prefs.includes("boho") || prefs.includes("bohemian")) return "bohemian";

  // State/region inference
  const coastalStates = ["fl", "hi", "ca", "sc", "nc", "ga", "al", "ms", "tx"];
  const mountainStates = ["co", "wv", "mt", "wy", "id", "ut", "vt", "nh"];
  const farmStates = ["tn", "ky", "ar", "mo", "ia", "in", "oh"];

  if (coastalStates.includes(state)) return "coastal";
  if (mountainStates.includes(state)) return "mountain-lodge";
  if (farmStates.includes(state)) return "farmhouse";

  if (city.includes("beach") || city.includes("coast") || city.includes("shore")) return "coastal";
  if (city.includes("mountain") || city.includes("ridge") || city.includes("summit")) return "mountain-lodge";

  return "modern"; // safe default
}

export function autoGenerateMoodBoards(project: Project): MoodBoard[] {
  const style = project.style;
  const boards: MoodBoard[] = [];

  // Main style board
  const mainPalette = getStylePalette(style);
  boards.push({
    id: generateId(),
    name: `${formatStyle(style)} — Primary`,
    style,
    colorPalette: mainPalette,
    inspirationNotes: getStyleDescription(style),
    imageUrls: [],
  });

  // Accent board
  const accentPalette = getAccentPalette(style);
  boards.push({
    id: generateId(),
    name: `${formatStyle(style)} — Accents`,
    style,
    colorPalette: accentPalette,
    inspirationNotes: getAccentDescription(style),
    imageUrls: [],
  });

  return boards;
}

export function autoFurnishAllRooms(project: Project): void {
  for (const room of project.rooms) {
    if (room.furniture.length > 0) continue; // skip already furnished rooms
    const items = suggestFurniture(room, project.style);
    for (const item of items) {
      room.furniture.push(placeFurniture(room, item));
    }
  }
}

export function autoBudgetCheck(project: Project): {
  totalCost: number;
  withinBudget: boolean;
  overBy: number;
  perSqft: number;
  recommendations: string[];
} {
  const totalCost = project.rooms.reduce(
    (s, r) => s + r.furniture.reduce((fs, f) => fs + f.item.price * f.quantity, 0),
    0
  );
  const sqft = project.property.squareFootage || 1;
  const perSqft = totalCost / sqft;
  const withinBudget = project.budget <= 0 || totalCost <= project.budget;
  const overBy = project.budget > 0 ? Math.max(0, totalCost - project.budget) : 0;

  const recommendations: string[] = [];
  if (perSqft > 20) {
    recommendations.push("Per-sqft cost is above $20. Consider downsizing accent pieces.");
  }
  if (perSqft < 10) {
    recommendations.push("Per-sqft cost is below $10. You have room for upgrades.");
  }
  if (overBy > 0) {
    recommendations.push(`Over budget by $${overBy.toLocaleString()}. Review high-cost items.`);
  }
  if (!withinBudget && overBy > project.budget * 0.1) {
    recommendations.push("Significantly over budget. Consider swapping premium items for mid-range alternatives.");
  }

  return { totalCost, withinBudget, overBy, perSqft, recommendations };
}

// ── Style helpers ──

function formatStyle(style: string): string {
  return style.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function getStylePalette(style: DesignStyle): string[] {
  const palettes: Record<string, string[]> = {
    "modern": ["#ffffff", "#f5f5f5", "#404040", "#0a0a0a", "#d4a574"],
    "farmhouse": ["#faf5ef", "#e8c9a8", "#8b7355", "#5a6b50", "#3d3022"],
    "coastal": ["#f0f7fa", "#87ceeb", "#4a90a4", "#2c5f6e", "#ffffff"],
    "bohemian": ["#fef3e2", "#f4a261", "#e76f51", "#264653", "#2a9d8f"],
    "industrial": ["#f5f5f5", "#737373", "#404040", "#1a1a1a", "#c4956a"],
    "mid-century": ["#faf5ef", "#d4856c", "#a0522d", "#5c3317", "#f4a261"],
    "scandinavian": ["#ffffff", "#f5f0eb", "#d4d4d4", "#737373", "#a8b5a0"],
    "rustic": ["#f5f0eb", "#8b7355", "#5a4a32", "#3d3022", "#d4a574"],
    "contemporary": ["#ffffff", "#f5f5f5", "#737373", "#1a1a1a", "#4a90a4"],
    "mountain-lodge": ["#f2f5f0", "#a8b5a0", "#5a6b50", "#3a4a32", "#d4a574"],
    "transitional": ["#faf5ef", "#d4c5b5", "#8b7b6b", "#5a4a3a", "#d4a574"],
    "traditional": ["#faf0e6", "#d4856c", "#8b5e3c", "#4a2f1a", "#264653"],
  };
  return palettes[style] ?? palettes["modern"];
}

function getAccentPalette(style: DesignStyle): string[] {
  const accents: Record<string, string[]> = {
    "modern": ["#d4a574", "#1a1a2e", "#f4a261", "#e76f51", "#ffffff"],
    "farmhouse": ["#5a6b50", "#a8b5a0", "#d4a574", "#f5f0eb", "#3d3022"],
    "coastal": ["#2a9d8f", "#f4a261", "#ffffff", "#87ceeb", "#264653"],
    "bohemian": ["#c9b1ff", "#2a9d8f", "#e76f51", "#f4a261", "#264653"],
    "industrial": ["#c4956a", "#404040", "#f5f5f5", "#1a1a1a", "#737373"],
    "mid-century": ["#f4a261", "#e76f51", "#2a9d8f", "#264653", "#fef3e2"],
    "scandinavian": ["#a8b5a0", "#87ceeb", "#ffffff", "#f5f0eb", "#d4d4d4"],
    "rustic": ["#d4a574", "#5a6b50", "#f5f0eb", "#8b7355", "#3d3022"],
    "contemporary": ["#4a90a4", "#2a9d8f", "#f4a261", "#ffffff", "#1a1a1a"],
    "mountain-lodge": ["#d4a574", "#8b7355", "#f5f0eb", "#5a6b50", "#3a4a32"],
    "transitional": ["#4a90a4", "#d4a574", "#faf5ef", "#8b7b6b", "#5a4a3a"],
    "traditional": ["#264653", "#d4856c", "#faf0e6", "#8b5e3c", "#4a2f1a"],
  };
  return accents[style] ?? accents["modern"];
}

function getStyleDescription(style: DesignStyle): string {
  const descriptions: Record<string, string> = {
    "modern": "Clean lines, minimal ornamentation, neutral palette with warm accents. Think open spaces, low-profile furniture, and natural light. Materials: concrete, glass, light wood.",
    "farmhouse": "Warm, inviting, and lived-in. Reclaimed wood, shiplap walls, mason jar accents. White and cream base with earthy wood tones. Comfortable, not precious.",
    "coastal": "Light and breezy with ocean-inspired blues and whites. Natural textures like rattan, linen, and driftwood. Relaxed, airy, and welcoming.",
    "bohemian": "Eclectic mix of patterns, colors, and global influences. Layered textiles, plants, macrame. Warm, free-spirited, and personal.",
    "industrial": "Raw and urban with exposed elements. Metal, reclaimed wood, concrete. Dark palette with warm amber accents. Edison bulbs and factory-inspired fixtures.",
    "mid-century": "Retro-modern with organic shapes and bold colors. Tapered legs, statement lighting, warm wood tones. Playful yet sophisticated.",
    "scandinavian": "Minimalist, functional, and cozy (hygge). Light wood, white base, soft textiles. Clean but warm. Focus on natural materials and simple forms.",
    "rustic": "Natural, rugged, and warm. Heavy wood, stone, leather. Deep earth tones. Cabin-inspired with modern comforts. Chunky textures and handcrafted elements.",
    "contemporary": "Current and evolving. Sleek silhouettes, neutral base with bold accent pieces. Mix of materials and textures. Sophisticated but approachable.",
    "mountain-lodge": "Grand and cozy with natural materials. Stone fireplace, heavy timber, plaid textiles. Forest greens and warm browns. Lodge-luxe for vacation comfort.",
    "transitional": "Best of traditional and contemporary. Classic shapes with modern finishes. Neutral palette with subtle texture. Timeless and versatile.",
    "traditional": "Elegant and classic with rich colors. Detailed millwork, symmetrical layouts. Dark woods, jewel tones, and formal arrangements.",
  };
  return descriptions[style] ?? descriptions["modern"];
}

function getAccentDescription(style: DesignStyle): string {
  const descriptions: Record<string, string> = {
    "modern": "Accent pieces: geometric art, sculptural vases, a single bold color throw. Brass or black metal hardware. One statement piece per room.",
    "farmhouse": "Accent with galvanized metal, vintage signs, woven baskets. Fresh greenery in ceramic pots. Plaid or gingham textiles for warmth.",
    "coastal": "Accent with coral, shells, rope details. Navy and coral pops against white. Striped textiles and nautical elements — keep it subtle, not themed.",
    "bohemian": "Layer kilim rugs, embroidered pillows, hanging plants. Mix vintage and handmade pieces. More is more, but curate the chaos.",
    "industrial": "Accent with Edison lighting, metal shelving, vintage maps. Amber glass, worn leather. Minimal but impactful — let the raw materials speak.",
    "mid-century": "Accent with sunburst mirrors, abstract art, ceramic planters. Mustard, teal, and rust pops. Iconic furniture shapes as focal points.",
    "scandinavian": "Accent with sheepskin throws, candles, ceramic vessels. One piece of bold art. Plants for life. Keep accessories minimal and intentional.",
    "rustic": "Accent with antler decor, woven blankets, iron candle holders. Natural elements like pine cones, birch logs. Handcrafted pottery and leather.",
    "contemporary": "Accent with abstract art, sculptural lighting, one bold furniture piece. Mix metals. Monochrome photography. Less is more with high impact.",
    "mountain-lodge": "Accent with plaid throws, antler chandeliers, landscape art. Cozy reading nooks. Natural stone and timber details. Bears optional.",
    "transitional": "Accent with mixed metals, textured pillows, simple art. One classic pattern (herringbone, trellis). Understated elegance.",
    "traditional": "Accent with oil paintings, crystal, leather-bound books. Floral arrangements. Rich fabric like velvet and silk. Symmetry is key.",
  };
  return descriptions[style] ?? descriptions["modern"];
}

// ── Timeline tracking ──

export interface TimelineEntry {
  step: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  manualEquivalentHours: number;
}

export function getManualTimeline(): { step: string; hours: number; cumulative: number }[] {
  let cumulative = 0;
  return WORKFLOW_STEPS.map(step => {
    cumulative += step.manualHours;
    return { step: step.name, hours: step.manualHours, cumulative };
  });
}

export function getAutomatedTimeline(): { step: string; minutes: number; cumulative: number }[] {
  let cumulative = 0;
  return WORKFLOW_STEPS.map(step => {
    cumulative += step.estimatedMinutes;
    return { step: step.name, minutes: step.estimatedMinutes, cumulative };
  });
}
