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

export type ProjectType = "furnish-only" | "renovation" | "full-redesign" | "new-construction";

export type TradeType =
  | "general-contractor"
  | "plumber"
  | "electrician"
  | "tile-installer"
  | "flooring-installer"
  | "painter"
  | "cabinet-maker"
  | "carpenter"
  | "hvac"
  | "drywall"
  | "handyman"
  | "interior-designer"
  | "project-manager";

export type FinishCategory =
  | "tile"
  | "flooring"
  | "paint"
  | "faucets"
  | "plumbing-fixtures"
  | "lighting-fixtures"
  | "cabinet-hardware"
  | "door-hardware"
  | "countertops"
  | "backsplash"
  | "wall-treatment"
  | "window-treatment"
  | "appliances";

export type RenovationScope =
  | "cosmetic"
  | "kitchen-remodel"
  | "bathroom-remodel"
  | "full-gut"
  | "addition"
  | "flooring-only"
  | "paint-only";

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

export interface FloorPlan {
  id: string;
  name: string;           // e.g. "Existing Plan", "Demo Plan", "New Plan", "Kitchen Detail"
  url: string;            // either a pasted URL or a data: URI from file upload
  type: "image" | "pdf" | "link"; // image = inline preview, pdf = new-tab, link = external
  uploadedAt: string;
  notes: string;
  sizeBytes?: number;     // informational; warns on backup if huge
  /** The Primary plan drives Install Guide cover, room auto-detect, and Space
   *  Planner reference. Exactly zero or one plan should be primary; if none is
   *  flagged, treat the most-recent image plan as primary. */
  isPrimary?: boolean;
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
  floorPlans?: FloorPlan[];
  /** Hero image (property exterior or best interior shot) used on Install Guide cover */
  heroImageUrl?: string;
  /** Room-level notes designer writes for install guide tips */
  installNotes?: string;
  /** Raw SVG text of the most-recent Matterport schematic uploaded. Stored
   *  once at the property level and cropped per-room via Room.svgBBox in
   *  the Space Planner backdrop. */
  floorPlanSvgContent?: string;
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

/**
 * Procurement state for a SelectedFurniture row. Mirrors Teeco's masterlist
 * color highlights:
 *   specced   → designer picked it, client hasn't approved (default, neutral)
 *   approved  → client signed off (green-ish)
 *   ordered   → purchased, awaiting delivery (green)
 *   delivered → received on site (green/done)
 *   alt-pending → primary out of stock, alt being sourced (orange/red)
 */
export type FurnitureStatus = "specced" | "approved" | "ordered" | "delivered" | "alt-pending";

export interface AltItem {
  name: string;
  vendor: string;
  vendorUrl: string;
  price: number;
  notes: string;
}

export interface SelectedFurniture {
  item: FurnitureItem;
  quantity: number;
  roomId: string;
  notes: string;
  /** Procurement state — defaults to "specced" if unset for backwards compat. */
  status?: FurnitureStatus;
  /** Backup pick when the primary is unavailable. */
  altItem?: AltItem;
}

export interface RoomAnnotation {
  floorPlanId: string;  // which FloorPlan this is anchored to
  x: number;            // 0-100 (% of plan width)
  y: number;            // 0-100 (% of plan height)
  width: number;        // 0-100 (% of plan width)
  height: number;       // 0-100 (% of plan height)
}

export interface SceneItem {
  id: string;              // unique instance id (one item can appear multiple times)
  itemId: string;          // references a FurnitureItem id (catalog or custom)
  x: number;               // 0-100 (% of canvas width)
  y: number;               // 0-100 (% of canvas height)
  width: number;           // 0-100 (% of canvas width)
  height: number;          // 0-100 (% of canvas height)
  rotation: number;        // degrees 0-360
  zIndex: number;          // display order
  flipX?: boolean;
  flipY?: boolean;
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
  annotation?: RoomAnnotation;  // Optional spatial anchor on a floor plan image
  sceneBackgroundUrl?: string;  // optional image: room photo, Matterport snap, white/blank
  sceneItems?: SceneItem[];     // Spoak-style visual scene composition
  /** Install-guide per-room tips (shown on room's install guide page) */
  installTips?: string;
  /** Snapshot of the rendered scene as base64 image, for use in install guide
   *  without needing to re-render. Regenerated when designer clicks "Snapshot Scene". */
  sceneSnapshot?: string;
  /** Bounding box of this room within the project's floorPlanSvgContent.
   *  Used to crop the SVG so the Space Planner backdrop shows just this
   *  room's walls, doors, and windows. */
  svgBBox?: { x: number; y: number; width: number; height: number };
}

export interface MoodBoard {
  id: string;
  name: string;
  style: DesignStyle;
  colorPalette: string[];
  inspirationNotes: string;
  imageUrls: string[];
  /** "A" or "B" if this is a concept-board variant, undefined for standalone mood boards */
  conceptVariant?: "A" | "B";
  /** Whether client has locked in this concept as the chosen direction */
  isLockedConcept?: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: TradeType;
  company: string;
  notes: string;
  hourlyRate?: number;
  preferredContact: "email" | "phone" | "text";
}

export interface TaskAssignment {
  id: string;
  title: string;
  description: string;
  assignedTo: string; // TeamMember.id
  roomId?: string;
  trade: TradeType;
  status: "not-started" | "in-progress" | "blocked" | "complete";
  dueDate?: string;
  dependencies: string[]; // other task ids
  notes: string;
}

export interface FinishItem {
  id: string;
  name: string;
  category: FinishCategory;
  subcategory: string;
  vendor: string;
  vendorSku: string;
  vendorUrl: string;
  imageUrl: string;
  price: number;
  unit: "each" | "sqft" | "box" | "gallon" | "linear-ft";
  color: string;
  finish: string; // matte, polished, brushed, etc.
  material: string;
  dimensions?: string;
  style: DesignStyle;
  leadTimeDays?: number;
  trade: TradeType; // who installs it
  notes: string;
}

export interface SelectedFinish {
  item: FinishItem;
  quantity: number;
  roomId: string;
  assignedTo?: string; // TeamMember.id of installer
  status: "spec'd" | "approved" | "ordered" | "delivered" | "installed";
  installDate?: string;
  notes: string;
}

export interface ScopeItem {
  id: string;
  description: string;
  roomId: string;
  trade: TradeType;
  laborHours: number;
  materialCost: number;
  laborCost: number;
  notes: string;
}

export interface Project {
  id: string;
  name: string;
  projectType: ProjectType;
  renovationScope?: RenovationScope[];
  client: Client;
  property: Property;
  rooms: Room[];
  moodBoards: MoodBoard[];
  team: TeamMember[];
  tasks: TaskAssignment[];
  finishes: SelectedFinish[];
  scope: ScopeItem[];
  targetGuests: number;
  style: DesignStyle;
  budget: number;
  renovationBudget?: number;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  notes: string;
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
