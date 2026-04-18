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

export interface RoomAnnotation {
  floorPlanId: string;  // which FloorPlan this is anchored to
  x: number;            // 0-100 (% of plan width)
  y: number;            // 0-100 (% of plan height)
  width: number;        // 0-100 (% of plan width)
  height: number;       // 0-100 (% of plan height)
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
}

export interface MoodBoard {
  id: string;
  name: string;
  style: DesignStyle;
  colorPalette: string[];
  inspirationNotes: string;
  imageUrls: string[];
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
