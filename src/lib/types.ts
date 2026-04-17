export type RoomType =
  | "primary-bedroom"
  | "bedroom"
  | "loft"
  | "den"
  | "living-room"
  | "dining-room"
  | "kitchen"
  | "bathroom"
  | "outdoor"
  | "hallway"
  | "bonus-room"
  | "office"
  | "game-room"
  | "media-room";

export type BedType =
  | "king"
  | "queen"
  | "full"
  | "twin"
  | "queen-over-queen-bunk"
  | "twin-over-twin-bunk"
  | "twin-over-full-bunk"
  | "sofa-bed"
  | "murphy-bed"
  | "daybed-trundle";

export type FurnitureCategory =
  | "beds-mattresses"
  | "seating"
  | "tables"
  | "storage"
  | "lighting"
  | "decor"
  | "rugs-textiles"
  | "outdoor"
  | "kitchen-dining"
  | "bathroom";

export type DesignStyle =
  | "modern"
  | "farmhouse"
  | "coastal"
  | "bohemian"
  | "industrial"
  | "mid-century"
  | "scandinavian"
  | "traditional"
  | "rustic"
  | "contemporary"
  | "transitional"
  | "mountain-lodge";

export type ProjectStatus = "draft" | "in-progress" | "review" | "delivered";

export type WallTreatment =
  | "paint"
  | "wallpaper"
  | "shiplap"
  | "stone"
  | "wood-panel"
  | "tile";

// ── Core data models ──

export interface Client {
  name: string;
  email: string;
  phone: string;
  preferences: string;
}

export interface Property {
  address: string;
  city: string;
  state: string;
  squareFootage: number;
  bedrooms: number;
  bathrooms: number;
  floors: number;
  matterportLink: string;
  polycamLink: string;
  spoakLink: string;
}

export interface BedItem {
  type: BedType;
  quantity: number;
  sleepsPerUnit: number;
}

export interface BedConfiguration {
  id: string;
  name: string;
  beds: BedItem[];
  totalSleeps: number;
  minWidthFt: number;
  minLengthFt: number;
  minCeilingFt: number;
  description: string;
  priority: number;
}

export interface AccentWall {
  color: string;
  treatment: WallTreatment;
  wall: "north" | "south" | "east" | "west";
}

export interface FurnitureItem {
  id: string;
  name: string;
  category: FurnitureCategory;
  subcategory: string;
  widthIn: number;
  depthIn: number;
  heightIn: number;
  price: number;
  vendor: string;
  vendorUrl: string;
  imageUrl: string;
  color: string;
  material: string;
  style: DesignStyle;
}

export interface SelectedFurniture {
  item: FurnitureItem;
  quantity: number;
  roomId: string;
  notes: string;
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  widthFt: number;
  lengthFt: number;
  ceilingHeightFt: number;
  floor: number;
  features: string[];
  selectedBedConfig: BedConfiguration | null;
  furniture: SelectedFurniture[];
  accentWall: AccentWall | null;
  notes: string;
}

export interface MoodBoard {
  id: string;
  name: string;
  style: DesignStyle;
  colorPalette: string[];
  inspirationNotes: string;
  imageUrls: string[];
  products: MoodBoardProduct[];
  roomAssignment: string; // room id or "whole-property"
}

// ── Product sourcing types ──

export type RetailerSlug =
  | "wayfair"
  | "amazon"
  | "target"
  | "walmart"
  | "article"
  | "living-spaces"
  | "ikea"
  | "west-elm"
  | "pottery-barn"
  | "crate-barrel"
  | "cb2"
  | "world-market"
  | "overstock"
  | "home-depot"
  | "rugs-usa"
  | "etsy";

export interface RetailerInfo {
  slug: RetailerSlug;
  name: string;
  baseUrl: string;
  searchUrl: string;
  logoColor: string;
  tier: "budget" | "mid-range" | "premium";
}

export interface MoodBoardProduct {
  id: string;
  name: string;
  category: FurnitureCategory;
  subcategory: string;
  price: number;
  retailer: RetailerSlug;
  purchaseUrl: string;
  imageUrl: string;
  color: string;
  material: string;
  style: DesignStyle;
  dimensions: string;
  notes: string;
  alternatives: ProductAlternative[];
  addedAt: string;
}

export interface ProductAlternative {
  id: string;
  name: string;
  price: number;
  retailer: RetailerSlug;
  purchaseUrl: string;
  savings: number;
  savingsPercent: number;
}

export type BudgetTier = "economy" | "mid-range" | "premium" | "luxury";

export interface BudgetBreakdown {
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  percentUsed: number;
  isOverBudget: boolean;
  byRoom: { roomId: string; roomName: string; spent: number; allocated: number }[];
  byCategory: { category: FurnitureCategory; spent: number; percent: number }[];
  suggestions: BudgetSuggestion[];
}

export interface BudgetSuggestion {
  type: "swap" | "remove" | "downgrade";
  currentProduct: string;
  currentPrice: number;
  suggestedProduct: string;
  suggestedPrice: number;
  suggestedRetailer: RetailerSlug;
  suggestedUrl: string;
  savings: number;
  room: string;
}

export interface Project {
  id: string;
  name: string;
  client: Client;
  property: Property;
  rooms: Room[];
  moodBoards: MoodBoard[];
  targetGuests: number;
  style: DesignStyle;
  budget: number;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  notes: string;
  aiRenders?: AIRender[];
}

export type AITool = "midjourney" | "dalle" | "ideogram" | "leonardo" | "stable-diffusion" | "krea" | "runway" | "other";

export interface AIRender {
  id: string;
  roomId: string | "overview";
  url: string;
  prompt: string;
  tool: AITool;
  approved: boolean;
  notes: string;
  createdAt: string;
}

// ── Sleep optimizer types ──

export interface RoomSleepResult {
  roomId: string;
  roomName: string;
  recommended: BedConfiguration;
  alternatives: BedConfiguration[];
}

export interface SleepOptimizationResult {
  roomResults: RoomSleepResult[];
  totalSleeps: number;
  targetGuests: number;
  targetMet: boolean;
  summary: string;
}

// ── Export types ──

export interface ExportRow {
  room: string;
  itemName: string;
  category: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  dimensions: string;
  vendor: string;
  vendorUrl: string;
  color: string;
  material: string;
  notes: string;
}

// ── Chat types ──

export interface ChatMessage {
  id: string;
  project_id: string;
  user_id: string;
  message: string;
  created_at: string;
  profiles?: {
    full_name: string;
    email: string;
  };
}

// ── Activity types ──

export interface ActivityEntry {
  id: string;
  project_id: string;
  user_id: string;
  action: string;
  details: string | null;
  created_at: string;
  profiles?: {
    full_name: string;
  };
}
