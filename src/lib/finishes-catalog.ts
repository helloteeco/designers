/**
 * Finishes catalog for renovation projects.
 * Curated hospitality-grade products designers commonly spec for vacation rentals.
 *
 * Covers: tile, flooring, paint, faucets, plumbing, lighting, cabinet hardware,
 * door hardware, countertops, backsplash, appliances.
 */

import type { FinishItem, FinishCategory, DesignStyle } from "./types";

export const FINISHES_CATALOG: FinishItem[] = [
  // ── TILE (Bathroom + Kitchen) ──
  {
    id: "tile-001", name: "Daltile Restore Bright White 3x6 Subway",
    category: "tile", subcategory: "wall-tile", vendor: "Home Depot",
    vendorSku: "RS0136MOD1P2", vendorUrl: "https://www.homedepot.com/p/Daltile-Restore-Bright-White",
    imageUrl: "", price: 0.49, unit: "each", color: "Bright White",
    finish: "Glossy", material: "Ceramic", dimensions: "3\" x 6\"",
    style: "modern", leadTimeDays: 3, trade: "tile-installer",
    notes: "Classic subway tile. Budget-friendly, widely available. Use for kitchen backsplash or shower surround.",
  },
  {
    id: "tile-002", name: "Bedrosians Cloe 2.5x8 Ceramic — White",
    category: "tile", subcategory: "wall-tile", vendor: "Bedrosians",
    vendorSku: "CLOE-WHITE", vendorUrl: "https://www.bedrosians.com",
    imageUrl: "", price: 8.99, unit: "sqft", color: "Matte White",
    finish: "Matte", material: "Ceramic", dimensions: "2.5\" x 8\"",
    style: "coastal", leadTimeDays: 10, trade: "tile-installer",
    notes: "Handmade look, high-end feel at mid-range price. Great for coastal + farmhouse.",
  },
  {
    id: "tile-003", name: "Emser Fixt Cement 12x24 Porcelain — Charcoal",
    category: "tile", subcategory: "floor-tile", vendor: "Emser",
    vendorSku: "FIXT-CHAR-1224", vendorUrl: "https://www.emser.com",
    imageUrl: "", price: 4.29, unit: "sqft", color: "Charcoal",
    finish: "Matte", material: "Porcelain", dimensions: "12\" x 24\"",
    style: "industrial", leadTimeDays: 7, trade: "tile-installer",
    notes: "Concrete-look porcelain. Durable, hides dirt, works for showers and floors.",
  },
  {
    id: "tile-004", name: "MSI Carrara White 12x24 Marble-Look Porcelain",
    category: "tile", subcategory: "floor-tile", vendor: "MSI",
    vendorSku: "CARRARA-1224", vendorUrl: "https://www.msisurfaces.com",
    imageUrl: "", price: 5.99, unit: "sqft", color: "White + Gray Veining",
    finish: "Polished", material: "Porcelain", dimensions: "12\" x 24\"",
    style: "contemporary", leadTimeDays: 5, trade: "tile-installer",
    notes: "Marble look without the maintenance. Use for primary bath floors.",
  },
  {
    id: "tile-005", name: "Bedrosians Cloe Picket — Deep Green",
    category: "tile", subcategory: "accent-tile", vendor: "Bedrosians",
    vendorSku: "CLOE-GREEN-PICKET", vendorUrl: "https://www.bedrosians.com",
    imageUrl: "", price: 12.99, unit: "sqft", color: "Deep Green",
    finish: "Glossy", material: "Ceramic", dimensions: "Picket shape",
    style: "mid-century", leadTimeDays: 14, trade: "tile-installer",
    notes: "Statement backsplash. Pairs with brass fixtures. Instagram-worthy.",
  },
  {
    id: "tile-006", name: "Jeffrey Court Hexagon Penny Round — Matte Black",
    category: "tile", subcategory: "floor-tile", vendor: "Home Depot",
    vendorSku: "PENNY-BLACK", vendorUrl: "https://www.homedepot.com",
    imageUrl: "", price: 6.99, unit: "sqft", color: "Matte Black",
    finish: "Matte", material: "Porcelain", dimensions: "1\" hexagon",
    style: "modern", leadTimeDays: 3, trade: "tile-installer",
    notes: "Great for shower floors (slip-resistant). Modern but timeless.",
  },

  // ── FLOORING ──
  {
    id: "floor-001", name: "CoreLuxe XD Highland Oak 12mm",
    category: "flooring", subcategory: "luxury-vinyl", vendor: "LL Flooring",
    vendorSku: "CL-XD-OAK", vendorUrl: "https://www.llflooring.com",
    imageUrl: "", price: 3.99, unit: "sqft", color: "Warm Oak",
    finish: "Matte", material: "Luxury Vinyl Plank (LVP)", dimensions: "7\" x 48\"",
    style: "farmhouse", leadTimeDays: 5, trade: "flooring-installer",
    notes: "Waterproof LVP — ideal for STRs. Easy to replace planks. 100% scratch-resistant.",
  },
  {
    id: "floor-002", name: "Mohawk RevWood Plus Knollcrest Oak",
    category: "flooring", subcategory: "engineered-wood", vendor: "Mohawk",
    vendorSku: "REVWOOD-KNOLL", vendorUrl: "https://www.mohawkflooring.com",
    imageUrl: "", price: 4.89, unit: "sqft", color: "Medium Oak",
    finish: "Matte", material: "Laminate (waterproof)", dimensions: "7.5\" x 54\"",
    style: "modern", leadTimeDays: 7, trade: "flooring-installer",
    notes: "Warmer, realistic wood look. Waterproof. Good for living areas in STRs.",
  },
  {
    id: "floor-003", name: "Shaw Floorte Premio Plank — Limed Oak",
    category: "flooring", subcategory: "luxury-vinyl", vendor: "Shaw",
    vendorSku: "FLOORTE-LIMED", vendorUrl: "https://shawfloors.com",
    imageUrl: "", price: 3.49, unit: "sqft", color: "Limed Oak (Gray)",
    finish: "Matte", material: "Luxury Vinyl Plank (LVP)", dimensions: "7\" x 48\"",
    style: "coastal", leadTimeDays: 5, trade: "flooring-installer",
    notes: "Cool-toned. Perfect for coastal or Scandinavian interiors. Waterproof.",
  },
  {
    id: "floor-004", name: "Pergo Outlast+ Vintage Pewter Oak",
    category: "flooring", subcategory: "laminate", vendor: "Home Depot",
    vendorSku: "PERGO-PEWTER", vendorUrl: "https://www.homedepot.com",
    imageUrl: "", price: 2.79, unit: "sqft", color: "Pewter Gray-Oak",
    finish: "Embossed", material: "Laminate (waterproof)", dimensions: "7.5\" x 47\"",
    style: "industrial", leadTimeDays: 3, trade: "flooring-installer",
    notes: "Budget-friendly, waterproof. Good for guest bedrooms and hallways.",
  },

  // ── PAINT ──
  {
    id: "paint-001", name: "Sherwin-Williams Alabaster SW 7008",
    category: "paint", subcategory: "wall-paint", vendor: "Sherwin-Williams",
    vendorSku: "SW7008", vendorUrl: "https://www.sherwin-williams.com",
    imageUrl: "", price: 55, unit: "gallon", color: "Soft White (#EDEAE0)",
    finish: "Eggshell", material: "Latex", dimensions: "",
    style: "modern", leadTimeDays: 1, trade: "painter",
    notes: "Warmest white on the market. Goes with EVERY style. Default whole-home white.",
  },
  {
    id: "paint-002", name: "Benjamin Moore Simply White OC-117",
    category: "paint", subcategory: "wall-paint", vendor: "Benjamin Moore",
    vendorSku: "OC-117", vendorUrl: "https://www.benjaminmoore.com",
    imageUrl: "", price: 65, unit: "gallon", color: "Crisp White",
    finish: "Eggshell", material: "Latex", dimensions: "",
    style: "contemporary", leadTimeDays: 1, trade: "painter",
    notes: "Cleaner, brighter than Alabaster. Great for coastal or modern.",
  },
  {
    id: "paint-003", name: "Farrow & Ball Pigeon No.25",
    category: "paint", subcategory: "accent-wall", vendor: "Farrow & Ball",
    vendorSku: "FB-25", vendorUrl: "https://www.farrow-ball.com",
    imageUrl: "", price: 125, unit: "gallon", color: "Deep Blue-Gray",
    finish: "Eggshell", material: "Latex", dimensions: "",
    style: "traditional", leadTimeDays: 5, trade: "painter",
    notes: "Moody statement color. Primary bedroom accent walls or powder rooms.",
  },
  {
    id: "paint-004", name: "Sherwin-Williams Urbane Bronze SW 7048",
    category: "paint", subcategory: "accent-wall", vendor: "Sherwin-Williams",
    vendorSku: "SW7048", vendorUrl: "https://www.sherwin-williams.com",
    imageUrl: "", price: 55, unit: "gallon", color: "Warm Bronze-Brown",
    finish: "Eggshell", material: "Latex", dimensions: "",
    style: "mountain-lodge", leadTimeDays: 1, trade: "painter",
    notes: "SW color of the year 2021. Great for mountain/rustic accent walls.",
  },
  {
    id: "paint-005", name: "Benjamin Moore Sea Salt CSP-95",
    category: "paint", subcategory: "accent-wall", vendor: "Benjamin Moore",
    vendorSku: "CSP-95", vendorUrl: "https://www.benjaminmoore.com",
    imageUrl: "", price: 65, unit: "gallon", color: "Soft Blue-Green",
    finish: "Eggshell", material: "Latex", dimensions: "",
    style: "coastal", leadTimeDays: 1, trade: "painter",
    notes: "Quintessential coastal accent. Calming. Works on bathroom walls and ceilings.",
  },

  // ── FAUCETS ──
  {
    id: "faucet-001", name: "Kohler Purist Single-Hole Bathroom Faucet",
    category: "faucets", subcategory: "bathroom-faucet", vendor: "Kohler",
    vendorSku: "K-14406-4", vendorUrl: "https://www.us.kohler.com",
    imageUrl: "", price: 465, unit: "each", color: "Polished Chrome",
    finish: "Polished Chrome", material: "Brass", dimensions: "",
    style: "modern", leadTimeDays: 7, trade: "plumber",
    notes: "Timeless modern design. Available in brass, matte black, nickel. Lifetime warranty.",
  },
  {
    id: "faucet-002", name: "Delta Trinsic Matte Black Bathroom Faucet",
    category: "faucets", subcategory: "bathroom-faucet", vendor: "Delta",
    vendorSku: "559-BLLPU", vendorUrl: "https://www.deltafaucet.com",
    imageUrl: "", price: 289, unit: "each", color: "Matte Black",
    finish: "Matte Black", material: "Brass", dimensions: "",
    style: "industrial", leadTimeDays: 5, trade: "plumber",
    notes: "Strong modern lines. Matte black is forgiving on fingerprints. Great for guest baths.",
  },
  {
    id: "faucet-003", name: "Moen Arbor Motion-Sense Kitchen Faucet",
    category: "faucets", subcategory: "kitchen-faucet", vendor: "Moen",
    vendorSku: "7594ESRS", vendorUrl: "https://www.moen.com",
    imageUrl: "", price: 399, unit: "each", color: "Spot Resist Stainless",
    finish: "Brushed Nickel", material: "Metal", dimensions: "",
    style: "contemporary", leadTimeDays: 3, trade: "plumber",
    notes: "Touchless — essential for STRs (hygiene). Pull-down sprayer. Battery or hardwired.",
  },
  {
    id: "faucet-004", name: "Kraus Bolden Commercial Kitchen Faucet",
    category: "faucets", subcategory: "kitchen-faucet", vendor: "Kraus",
    vendorSku: "KPF-1610SFACB", vendorUrl: "https://www.kraususa.com",
    imageUrl: "", price: 329, unit: "each", color: "Brushed Brass + Black",
    finish: "Dual Finish", material: "Brass", dimensions: "",
    style: "mid-century", leadTimeDays: 7, trade: "plumber",
    notes: "Industrial pro look. Spring neck. Photographs beautifully for listings.",
  },

  // ── PLUMBING FIXTURES ──
  {
    id: "plumb-001", name: "Kohler Archer Undermount Bathroom Sink",
    category: "plumbing-fixtures", subcategory: "bathroom-sink", vendor: "Kohler",
    vendorSku: "K-2355-0", vendorUrl: "https://www.us.kohler.com",
    imageUrl: "", price: 289, unit: "each", color: "White",
    finish: "Glazed", material: "Vitreous China", dimensions: "19.75\" x 15.75\"",
    style: "transitional", leadTimeDays: 7, trade: "plumber",
    notes: "Clean rectangle undermount. Works under any countertop. Bathroom workhorse.",
  },
  {
    id: "plumb-002", name: "Kohler Riverby Top-Mount Kitchen Sink 33\"",
    category: "plumbing-fixtures", subcategory: "kitchen-sink", vendor: "Kohler",
    vendorSku: "K-5871-4", vendorUrl: "https://www.us.kohler.com",
    imageUrl: "", price: 599, unit: "each", color: "White Cast Iron",
    finish: "Enameled", material: "Cast Iron", dimensions: "33\" x 22\"",
    style: "farmhouse", leadTimeDays: 10, trade: "plumber",
    notes: "Statement piece. Single bowl — guests love the large wash area.",
  },
  {
    id: "plumb-003", name: "Kohler Highline Classic Toilet",
    category: "plumbing-fixtures", subcategory: "toilet", vendor: "Kohler",
    vendorSku: "K-3998-0", vendorUrl: "https://www.us.kohler.com",
    imageUrl: "", price: 389, unit: "each", color: "White",
    finish: "Glazed", material: "Vitreous China", dimensions: "Comfort height",
    style: "modern", leadTimeDays: 5, trade: "plumber",
    notes: "Reliable workhorse. Comfort height (17-19\"). Dual flush optional.",
  },
  {
    id: "plumb-004", name: "Signature Hardware 60\" Freestanding Tub",
    category: "plumbing-fixtures", subcategory: "bathtub", vendor: "Signature Hardware",
    vendorSku: "SHT-SOLID-60", vendorUrl: "https://www.signaturehardware.com",
    imageUrl: "", price: 1499, unit: "each", color: "Matte White",
    finish: "Matte", material: "Acrylic", dimensions: "60\" x 30\"",
    style: "contemporary", leadTimeDays: 21, trade: "plumber",
    notes: "Statement piece. Photographs well. Lightweight acrylic vs. cast iron.",
  },

  // ── LIGHTING FIXTURES ──
  {
    id: "light-001", name: "Schoolhouse Isaac Sconce — Brass",
    category: "lighting-fixtures", subcategory: "wall-sconce", vendor: "Schoolhouse",
    vendorSku: "ISAAC-BR", vendorUrl: "https://www.schoolhouse.com",
    imageUrl: "", price: 179, unit: "each", color: "Natural Brass",
    finish: "Brushed Brass", material: "Brass + Glass", dimensions: "",
    style: "mid-century", leadTimeDays: 14, trade: "electrician",
    notes: "Bathroom vanity sconces. Warm, inviting. Pairs with brass faucets.",
  },
  {
    id: "light-002", name: "West Elm Sculptural Pendant — Matte Black",
    category: "lighting-fixtures", subcategory: "pendant", vendor: "West Elm",
    vendorSku: "WE-SCULPT-BLK", vendorUrl: "https://www.westelm.com",
    imageUrl: "", price: 249, unit: "each", color: "Matte Black",
    finish: "Matte", material: "Metal", dimensions: "",
    style: "modern", leadTimeDays: 10, trade: "electrician",
    notes: "Kitchen island pendant. Install 30-36\" above counter.",
  },
  {
    id: "light-003", name: "Visual Comfort Hicks Pendant — Polished Nickel",
    category: "lighting-fixtures", subcategory: "pendant", vendor: "Visual Comfort",
    vendorSku: "TOB5003PN", vendorUrl: "https://www.visualcomfort.com",
    imageUrl: "", price: 599, unit: "each", color: "Polished Nickel",
    finish: "Polished Nickel", material: "Metal + Glass", dimensions: "",
    style: "traditional", leadTimeDays: 21, trade: "electrician",
    notes: "High-end kitchen island pendant. Classic. Worth the splurge for primary listings.",
  },
  {
    id: "light-004", name: "Rejuvenation Roseland Flush Mount",
    category: "lighting-fixtures", subcategory: "flush-mount", vendor: "Rejuvenation",
    vendorSku: "ROSELAND-FM", vendorUrl: "https://www.rejuvenation.com",
    imageUrl: "", price: 329, unit: "each", color: "Brushed Brass",
    finish: "Brushed Brass", material: "Brass + Opal Glass", dimensions: "",
    style: "transitional", leadTimeDays: 14, trade: "electrician",
    notes: "Hallways, closets, small rooms. Clean, warm, works everywhere.",
  },

  // ── CABINET HARDWARE ──
  {
    id: "hw-001", name: "Emtek Round Knob — Flat Black",
    category: "cabinet-hardware", subcategory: "knob", vendor: "Emtek",
    vendorSku: "EMT-ROUND-BLK", vendorUrl: "https://www.emtek.com",
    imageUrl: "", price: 12, unit: "each", color: "Flat Black",
    finish: "Flat Black", material: "Brass", dimensions: "1.25\" diameter",
    style: "modern", leadTimeDays: 5, trade: "cabinet-maker",
    notes: "Simple round knob. Works with any style cabinet. Use on upper cabinets.",
  },
  {
    id: "hw-002", name: "Schaub Mountain 4\" Pull — Satin Brass",
    category: "cabinet-hardware", subcategory: "pull", vendor: "Schaub",
    vendorSku: "SCHAUB-MTN-SB", vendorUrl: "https://www.schaub.com",
    imageUrl: "", price: 28, unit: "each", color: "Satin Brass",
    finish: "Satin Brass", material: "Brass", dimensions: "4\" center-to-center",
    style: "farmhouse", leadTimeDays: 7, trade: "cabinet-maker",
    notes: "Beautiful farmhouse pull. Use on lower cabinets and drawers.",
  },
  {
    id: "hw-003", name: "Top Knobs Appliance Pull 12\" — Polished Chrome",
    category: "cabinet-hardware", subcategory: "appliance-pull", vendor: "Top Knobs",
    vendorSku: "TK-APL-12-PC", vendorUrl: "https://www.topknobs.com",
    imageUrl: "", price: 68, unit: "each", color: "Polished Chrome",
    finish: "Polished Chrome", material: "Metal", dimensions: "12\" center-to-center",
    style: "contemporary", leadTimeDays: 5, trade: "cabinet-maker",
    notes: "Refrigerator and freezer pulls. Long horizontal pull anchors the kitchen.",
  },

  // ── COUNTERTOPS ──
  {
    id: "ct-001", name: "Caesarstone Pure White 1141 Quartz",
    category: "countertops", subcategory: "kitchen-counter", vendor: "Caesarstone",
    vendorSku: "CS-1141", vendorUrl: "https://www.caesarstoneus.com",
    imageUrl: "", price: 65, unit: "sqft", color: "Pure White",
    finish: "Polished", material: "Engineered Quartz", dimensions: "Slab",
    style: "modern", leadTimeDays: 21, trade: "general-contractor",
    notes: "Timeless white quartz. Non-porous (stain-proof), heat-resistant. Best for STRs.",
  },
  {
    id: "ct-002", name: "MSI Calacatta Classique Quartz",
    category: "countertops", subcategory: "kitchen-counter", vendor: "MSI",
    vendorSku: "MSI-CALACATTA-CLASS", vendorUrl: "https://www.msisurfaces.com",
    imageUrl: "", price: 75, unit: "sqft", color: "White with Bold Gray Veining",
    finish: "Polished", material: "Engineered Quartz", dimensions: "Slab",
    style: "transitional", leadTimeDays: 21, trade: "general-contractor",
    notes: "Marble look — 90% of the beauty, 10% of the maintenance. Guest photos love it.",
  },
  {
    id: "ct-003", name: "Cambria Torquay Quartz",
    category: "countertops", subcategory: "kitchen-counter", vendor: "Cambria",
    vendorSku: "CAMBRIA-TORQUAY", vendorUrl: "https://www.cambriausa.com",
    imageUrl: "", price: 85, unit: "sqft", color: "Warm White + Soft Veining",
    finish: "Polished", material: "Engineered Quartz", dimensions: "Slab",
    style: "farmhouse", leadTimeDays: 28, trade: "general-contractor",
    notes: "Warmer tone than Caesarstone Pure White. USA-made. Lifetime warranty.",
  },

  // ── DOOR HARDWARE ──
  {
    id: "door-001", name: "Schlage Encode Smart Wi-Fi Deadbolt — Satin Nickel",
    category: "door-hardware", subcategory: "smart-lock", vendor: "Schlage",
    vendorSku: "BE489WB-CAM-619", vendorUrl: "https://www.schlage.com",
    imageUrl: "", price: 279, unit: "each", color: "Satin Nickel",
    finish: "Satin Nickel", material: "Metal", dimensions: "",
    style: "modern", leadTimeDays: 3, trade: "handyman",
    notes: "Jeff's preferred smart lock. Built-in Wi-Fi, no hub needed. Airbnb-integrated.",
  },
  {
    id: "door-002", name: "Emtek Modern Rectangular Entry Set",
    category: "door-hardware", subcategory: "entry-handle", vendor: "Emtek",
    vendorSku: "EMT-MOD-RECT", vendorUrl: "https://www.emtek.com",
    imageUrl: "", price: 249, unit: "each", color: "Flat Black",
    finish: "Flat Black", material: "Brass", dimensions: "",
    style: "contemporary", leadTimeDays: 10, trade: "handyman",
    notes: "Curb appeal. First impression for guests. Pairs with smart lock.",
  },
];

// ── Helpers ──

export function getFinishesByCategory(category: FinishCategory): FinishItem[] {
  return FINISHES_CATALOG.filter(f => f.category === category);
}

export function getFinishesByStyle(style: DesignStyle): FinishItem[] {
  return FINISHES_CATALOG.filter(f => f.style === style);
}

export function getFinishesByTrade(trade: string): FinishItem[] {
  return FINISHES_CATALOG.filter(f => f.trade === trade);
}

export function searchFinishes(query: string): FinishItem[] {
  const q = query.toLowerCase();
  return FINISHES_CATALOG.filter(f =>
    f.name.toLowerCase().includes(q) ||
    f.category.toLowerCase().includes(q) ||
    f.subcategory.toLowerCase().includes(q) ||
    f.vendor.toLowerCase().includes(q) ||
    f.color.toLowerCase().includes(q) ||
    f.material.toLowerCase().includes(q)
  );
}

export const FINISH_CATEGORY_LABELS: Record<FinishCategory, string> = {
  "tile": "Tile",
  "flooring": "Flooring",
  "paint": "Paint",
  "faucets": "Faucets",
  "plumbing-fixtures": "Plumbing Fixtures",
  "lighting-fixtures": "Lighting Fixtures",
  "cabinet-hardware": "Cabinet Hardware",
  "door-hardware": "Door Hardware",
  "countertops": "Countertops",
  "backsplash": "Backsplash",
  "wall-treatment": "Wall Treatment",
  "window-treatment": "Window Treatment",
  "appliances": "Appliances",
};

export const TRADE_LABELS: Record<string, string> = {
  "general-contractor": "General Contractor",
  "plumber": "Plumber",
  "electrician": "Electrician",
  "tile-installer": "Tile Installer",
  "flooring-installer": "Flooring Installer",
  "painter": "Painter",
  "cabinet-maker": "Cabinet Maker",
  "carpenter": "Carpenter",
  "hvac": "HVAC",
  "drywall": "Drywall",
  "handyman": "Handyman",
  "interior-designer": "Interior Designer",
  "project-manager": "Project Manager",
};
