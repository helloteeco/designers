/**
 * DEMO_PROJECT — a realistic, fully-populated fixture modeled on the
 * "Kelly & Zyaire — 2 Hiddenwoods Ct" reference project. Used by
 * scripts/verify-masterlist.ts (and other verification scripts) to exercise
 * exports without a browser. Type-correct against src/lib/types.ts.
 *
 * All image URL fields are empty strings — no fetches.
 */

import type {
  BedConfiguration,
  DesignStyle,
  FinishItem,
  FurnitureCategory,
  FurnitureItem,
  FurnitureStatus,
  Project,
  Room,
  RoomType,
  ScopeItem,
  SelectedFinish,
  SelectedFurniture,
} from "../../src/lib/types";

// ── Helpers ──

let itemSeq = 0;

interface FurnOpts {
  category: FurnitureCategory;
  subcategory: string;
  price: number;
  vendor: string;
  color?: string;
  material?: string;
  widthIn?: number;
  depthIn?: number;
  heightIn?: number;
  style?: DesignStyle;
  quantity?: number;
  status?: FurnitureStatus;
  notes?: string;
}

function furn(roomId: string, name: string, o: FurnOpts): SelectedFurniture {
  itemSeq += 1;
  const item: FurnitureItem = {
    id: `demo-item-${itemSeq}`,
    name,
    category: o.category,
    subcategory: o.subcategory,
    widthIn: o.widthIn ?? 36,
    depthIn: o.depthIn ?? 20,
    heightIn: o.heightIn ?? 30,
    price: o.price,
    vendor: o.vendor,
    vendorUrl: "",
    imageUrl: "",
    color: o.color ?? "",
    material: o.material ?? "",
    style: o.style ?? "transitional",
  };
  return {
    item,
    quantity: o.quantity ?? 1,
    roomId,
    notes: o.notes ?? "",
    status: o.status,
  };
}

const kingConfig: BedConfiguration = {
  id: "cfg-king",
  name: "King",
  beds: [{ type: "king", quantity: 1, sleepsPerUnit: 2 }],
  totalSleeps: 2,
  minWidthFt: 12,
  minLengthFt: 12,
  minCeilingFt: 8,
  description: "Single king bed — primary suite layout.",
  priority: 1,
};

const queenConfig: BedConfiguration = {
  id: "cfg-queen",
  name: "Queen",
  beds: [{ type: "queen", quantity: 1, sleepsPerUnit: 2 }],
  totalSleeps: 2,
  minWidthFt: 10,
  minLengthFt: 11,
  minCeilingFt: 8,
  description: "Single queen bed — standard guest room.",
  priority: 1,
};

const queenBunkConfig: BedConfiguration = {
  id: "cfg-qq-bunk",
  name: "Queen-over-Queen Bunk",
  beds: [{ type: "queen-over-queen-bunk", quantity: 1, sleepsPerUnit: 4 }],
  totalSleeps: 4,
  minWidthFt: 9,
  minLengthFt: 11,
  minCeilingFt: 8.5,
  description: "Queen-over-queen bunk — sleeps four in the kids/flex room.",
  priority: 1,
};

function room(
  id: string,
  name: string,
  type: RoomType,
  widthFt: number,
  lengthFt: number,
  extra: Partial<Room> = {}
): Room {
  return {
    id,
    name,
    type,
    widthFt,
    lengthFt,
    ceilingHeightFt: 9,
    floor: 1,
    features: [],
    selectedBedConfig: null,
    furniture: [],
    accentWall: null,
    notes: "",
    ...extra,
  };
}

// ── Rooms ──

const livingRoom = room("room-living", "Living Room", "living-room", 16, 20);
livingRoom.furniture = [
  furn("room-living", "Sven 88\" Sofa", {
    category: "seating", subcategory: "sofa", price: 1799, vendor: "Article",
    color: "Charme Tan", material: "leather", widthIn: 88, depthIn: 38, heightIn: 34,
    style: "mid-century", status: "ordered",
  }),
  furn("room-living", "Kellen Accent Chair", {
    category: "seating", subcategory: "accent-chair", price: 429, vendor: "Wayfair",
    color: "Cream Boucle", quantity: 2,
  }),
  furn("room-living", "Norden Coffee Table", {
    category: "tables", subcategory: "coffee-table", price: 349, vendor: "West Elm",
    color: "Walnut", material: "wood",
  }),
  furn("room-living", "Mira 8x10 Area Rug", {
    category: "rugs-textiles", subcategory: "area-rug", price: 389, vendor: "Wayfair",
    color: "Ivory/Grey", status: "ordered",
  }),
  furn("room-living", "65\" QLED Smart TV", {
    category: "decor", subcategory: "tv", price: 698, vendor: "Costco",
  }),
  furn("room-living", "Arc Floor Lamp", {
    category: "lighting", subcategory: "floor-lamp", price: 129, vendor: "Amazon",
    color: "Brass",
  }),
];
// Primary sofa has a sourced alternative on file.
livingRoom.furniture[0].altItem = {
  name: "Timber Charme Sofa",
  vendor: "Article",
  vendorUrl: "",
  price: 1999,
  notes: "Backup if Sven ships past install date",
};
// Accent chair carries scraped alternatives.
livingRoom.furniture[1].alternatives = [
  {
    name: "Barrel Swivel Chair",
    vendor: "Wayfair",
    price: 379,
    url: "",
    inStock: true,
  },
];

const diningRoom = room("room-dining", "Dining Room", "dining-room", 12, 14);
diningRoom.furniture = [
  furn("room-dining", "Seno Oak Dining Table", {
    category: "tables", subcategory: "dining-table", price: 1299, vendor: "Article",
    color: "Oak", material: "wood", widthIn: 72, depthIn: 37, heightIn: 30,
  }),
  furn("room-dining", "Windsor Dining Chair", {
    category: "seating", subcategory: "dining-chair", price: 119, vendor: "Wayfair",
    color: "Black", quantity: 6,
  }),
  furn("room-dining", "Linear Chandelier", {
    category: "lighting", subcategory: "chandelier", price: 289, vendor: "Wayfair",
    color: "Matte Black",
  }),
  furn("room-dining", "Buffet Sideboard", {
    category: "storage", subcategory: "sideboard", price: 549, vendor: "HostGPO",
    color: "Natural Oak",
  }),
];

const kitchen = room("room-kitchen", "Kitchen", "kitchen", 12, 13);
kitchen.furniture = [
  furn("room-kitchen", "Counter Stool (Set of 2)", {
    category: "seating", subcategory: "counter-stool", price: 189, vendor: "Wayfair",
    color: "Walnut/Black", quantity: 2,
  }),
  furn("room-kitchen", "12-Piece Cookware Set", {
    category: "kitchen-dining", subcategory: "cookware", price: 199, vendor: "Costco",
  }),
  furn("room-kitchen", "16-Piece Dinnerware Set", {
    category: "kitchen-dining", subcategory: "dinnerware", price: 89, vendor: "Costco",
    quantity: 2, status: "ordered",
  }),
  furn("room-kitchen", "Drip Coffee Maker", {
    category: "kitchen-dining", subcategory: "small-appliance", price: 79, vendor: "Amazon",
    color: "Stainless",
  }),
  furn("room-kitchen", "Knife Block Set", {
    category: "kitchen-dining", subcategory: "cutlery", price: 129, vendor: "Amazon",
  }),
  furn("room-kitchen", "Glassware Set (12)", {
    category: "kitchen-dining", subcategory: "glassware", price: 45, vendor: "HostGPO",
    quantity: 2,
  }),
];

const bedroom1 = room("room-bed1", "Bedroom 1", "primary-bedroom", 14, 15, {
  selectedBedConfig: kingConfig,
  floor: 2,
});
bedroom1.furniture = [
  furn("room-bed1", "Hanna King Bed Frame", {
    category: "beds-mattresses", subcategory: "bed-frame", price: 899, vendor: "Article",
    color: "Oak", material: "wood", widthIn: 80, depthIn: 85, heightIn: 44, status: "ordered",
  }),
  furn("room-bed1", "King Hybrid Mattress", {
    category: "beds-mattresses", subcategory: "mattress", price: 649, vendor: "Costco",
    status: "delivered",
  }),
  furn("room-bed1", "Mid-Century Nightstand", {
    category: "storage", subcategory: "nightstand", price: 179, vendor: "Wayfair",
    color: "Walnut", quantity: 2,
  }),
  furn("room-bed1", "6-Drawer Dresser", {
    category: "storage", subcategory: "dresser", price: 499, vendor: "West Elm",
    color: "Acorn",
  }),
  furn("room-bed1", "Ceramic Table Lamp", {
    category: "lighting", subcategory: "table-lamp", price: 59, vendor: "Amazon",
    color: "White", quantity: 2,
  }),
  furn("room-bed1", "Linen Duvet Set (King)", {
    category: "rugs-textiles", subcategory: "bedding", price: 149, vendor: "HostGPO",
    color: "Oatmeal",
  }),
];

const bedroom2 = room("room-bed2", "Bedroom 2", "bedroom", 12, 12, {
  selectedBedConfig: queenConfig,
  floor: 2,
});
bedroom2.furniture = [
  furn("room-bed2", "Talsa Queen Bed Frame", {
    category: "beds-mattresses", subcategory: "bed-frame", price: 699, vendor: "Article",
    color: "Walnut",
  }),
  furn("room-bed2", "Queen Memory Foam Mattress", {
    category: "beds-mattresses", subcategory: "mattress", price: 449, vendor: "Amazon",
  }),
  furn("room-bed2", "2-Drawer Nightstand", {
    category: "storage", subcategory: "nightstand", price: 129, vendor: "Wayfair",
    color: "White Oak", quantity: 2,
  }),
  furn("room-bed2", "Rattan Table Lamp", {
    category: "lighting", subcategory: "table-lamp", price: 49, vendor: "Amazon",
    quantity: 2,
  }),
  furn("room-bed2", "5x8 Washable Rug", {
    category: "rugs-textiles", subcategory: "area-rug", price: 159, vendor: "Wayfair",
    color: "Sage",
  }),
];

const bedroom3 = room("room-bed3", "Bedroom 3", "bedroom", 11, 13, {
  selectedBedConfig: queenBunkConfig,
  floor: 2,
});
bedroom3.furniture = [
  furn("room-bed3", "Queen-over-Queen Bunk Bed", {
    category: "beds-mattresses", subcategory: "bunk-bed", price: 1599, vendor: "Wayfair",
    color: "White", material: "wood", widthIn: 65, depthIn: 84, heightIn: 71,
  }),
  furn("room-bed3", "Queen Mattress (Bunk-Rated)", {
    category: "beds-mattresses", subcategory: "mattress", price: 379, vendor: "Costco",
    quantity: 2,
  }),
  furn("room-bed3", "Kids Storage Cubby", {
    category: "storage", subcategory: "bookcase", price: 139, vendor: "Wayfair",
    color: "White",
  }),
  furn("room-bed3", "Clip-On Bunk Reading Light", {
    category: "lighting", subcategory: "wall-sconce", price: 25, vendor: "Amazon",
    quantity: 2,
  }),
  furn("room-bed3", "Twin XL Sleeper Chair", {
    category: "seating", subcategory: "sleeper-chair", price: 449, vendor: "West Elm",
    color: "Dove Grey",
  }),
];

const bathroom1 = room("room-bath1", "Bathroom 1", "bathroom", 8, 10, { floor: 2 });
bathroom1.furniture = [
  furn("room-bath1", "6-Piece Towel Set", {
    category: "bathroom", subcategory: "towels", price: 49, vendor: "HostGPO",
    color: "White", quantity: 2,
  }),
  furn("room-bath1", "Bamboo Bath Mat", {
    category: "bathroom", subcategory: "bath-mat", price: 35, vendor: "Amazon",
  }),
  furn("room-bath1", "Round LED Mirror", {
    category: "bathroom", subcategory: "mirror", price: 179, vendor: "Wayfair",
    color: "Black Frame",
  }),
  furn("room-bath1", "Over-Toilet Storage Shelf", {
    category: "storage", subcategory: "bathroom-storage", price: 89, vendor: "Wayfair",
    color: "Bamboo",
  }),
];

const bathroom2 = room("room-bath2", "Bathroom 2", "bathroom", 6, 9);
bathroom2.furniture = [
  furn("room-bath2", "6-Piece Towel Set", {
    category: "bathroom", subcategory: "towels", price: 49, vendor: "HostGPO",
    color: "White", quantity: 2,
  }),
  furn("room-bath2", "Shower Curtain & Liner", {
    category: "bathroom", subcategory: "shower-curtain", price: 29, vendor: "Amazon",
    color: "Waffle White",
  }),
  furn("room-bath2", "Arched Vanity Mirror", {
    category: "bathroom", subcategory: "mirror", price: 119, vendor: "Wayfair",
    color: "Gold Frame",
  }),
  furn("room-bath2", "Hair Dryer", {
    category: "bathroom", subcategory: "appliance", price: 39, vendor: "Amazon",
  }),
];

const exterior = room("room-exterior", "Exterior", "outdoor", 20, 24);
exterior.furniture = [
  furn("room-exterior", "Reni 4-Piece Outdoor Lounge Set", {
    category: "outdoor", subcategory: "outdoor-sofa", price: 1499, vendor: "Article",
    color: "Beach Sand",
  }),
  furn("room-exterior", "7-Piece Outdoor Dining Set", {
    category: "outdoor", subcategory: "outdoor-dining", price: 899, vendor: "Costco",
  }),
  furn("room-exterior", "Propane Fire Pit Table", {
    category: "outdoor", subcategory: "fire-pit", price: 329, vendor: "Wayfair",
    color: "Slate",
  }),
  furn("room-exterior", "Cantilever Patio Umbrella", {
    category: "outdoor", subcategory: "umbrella", price: 189, vendor: "Amazon",
    color: "Navy",
  }),
  furn("room-exterior", "Outdoor String Lights (48 ft)", {
    category: "lighting", subcategory: "string-lights", price: 45, vendor: "Amazon",
    quantity: 2,
  }),
  furn("room-exterior", "Charcoal Grill", {
    category: "outdoor", subcategory: "grill", price: 249, vendor: "Costco",
  }),
];

const rooms: Room[] = [
  livingRoom,
  diningRoom,
  kitchen,
  bedroom1,
  bedroom2,
  bedroom3,
  bathroom1,
  bathroom2,
  exterior,
];

// ── Renovation finishes + scope ──

const paintFinish: FinishItem = {
  id: "fin-paint-1",
  name: "Swiss Coffee Interior Paint",
  category: "paint",
  subcategory: "interior-wall",
  vendor: "Sherwin-Williams",
  vendorSku: "SW-7551",
  vendorUrl: "",
  imageUrl: "",
  price: 58,
  unit: "gallon",
  color: "Swiss Coffee",
  finish: "eggshell",
  material: "latex",
  style: "transitional",
  trade: "painter",
  notes: "",
};

const tileFinish: FinishItem = {
  id: "fin-tile-1",
  name: "Hexagon Marble Mosaic Tile",
  category: "tile",
  subcategory: "floor-tile",
  vendor: "Floor & Decor",
  vendorSku: "FD-100485",
  vendorUrl: "",
  imageUrl: "",
  price: 11,
  unit: "sqft",
  color: "Carrara White",
  finish: "honed",
  material: "marble",
  style: "transitional",
  leadTimeDays: 14,
  trade: "tile-installer",
  notes: "",
};

const finishes: SelectedFinish[] = [
  {
    item: paintFinish,
    quantity: 8,
    roomId: "room-living",
    status: "approved",
    notes: "Whole main level walls + trim",
  },
  {
    item: tileFinish,
    quantity: 60,
    roomId: "room-bath1",
    status: "ordered",
    notes: "Primary bath floor",
  },
];

const scope: ScopeItem[] = [
  {
    id: "scope-1",
    description: "Demo existing bath floor, install hex marble mosaic, regrout tub surround",
    roomId: "room-bath1",
    trade: "tile-installer",
    laborHours: 18,
    materialCost: 240,
    laborCost: 1350,
    notes: "",
  },
  {
    id: "scope-2",
    description: "Replace 6 dated light fixtures with new LED fixtures (client-supplied)",
    roomId: "room-living",
    trade: "electrician",
    laborHours: 6,
    materialCost: 90,
    laborCost: 540,
    notes: "",
  },
];

// ── Project ──

export const DEMO_PROJECT: Project = {
  id: "demo-project-hiddenwoods",
  name: "Kelly & Zyaire — 2 Hiddenwoods Ct",
  projectType: "full-redesign",
  renovationScope: ["cosmetic", "bathroom-remodel"],
  client: {
    name: "Kelly & Zyaire",
    email: "kelly.zyaire@example.com",
    phone: "(443) 555-0182",
    preferences: "Warm neutrals, durable STR-friendly fabrics, no glass tables.",
  },
  property: {
    address: "2 Hiddenwoods Ct",
    city: "Edgewood",
    state: "MD",
    squareFootage: 1800,
    bedrooms: 3,
    bathrooms: 2,
    floors: 2,
    matterportLink: "",
    polycamLink: "",
    spoakLink: "",
  },
  rooms,
  moodBoards: [],
  team: [],
  tasks: [],
  finishes,
  scope,
  targetGuests: 8,
  style: "transitional",
  budget: 45000,
  renovationBudget: 6000,
  status: "in-progress",
  createdAt: "2026-05-01T12:00:00.000Z",
  updatedAt: "2026-06-10T12:00:00.000Z",
  notes: "STR conversion — target listing date mid-July.",
};

export default DEMO_PROJECT;
