import type { RetailerInfo, RetailerSlug, FurnitureCategory, DesignStyle, ProductAlternative, BudgetSuggestion } from "./types";
import { CATALOG } from "./furniture-catalog";
import type { FurnitureItem, SelectedFurniture, Room } from "./types";

// ── Retailer registry ──

export const RETAILERS: Record<RetailerSlug, RetailerInfo> = {
  wayfair:       { slug: "wayfair",       name: "Wayfair",         baseUrl: "https://www.wayfair.com",       searchUrl: "https://www.wayfair.com/keyword.php?keyword=", logoColor: "#7B2D8E", tier: "mid-range" },
  amazon:        { slug: "amazon",        name: "Amazon",          baseUrl: "https://www.amazon.com",        searchUrl: "https://www.amazon.com/s?k=",                 logoColor: "#FF9900", tier: "budget" },
  target:        { slug: "target",        name: "Target",          baseUrl: "https://www.target.com",        searchUrl: "https://www.target.com/s?searchTerm=",        logoColor: "#CC0000", tier: "budget" },
  walmart:       { slug: "walmart",       name: "Walmart",         baseUrl: "https://www.walmart.com",       searchUrl: "https://www.walmart.com/search?q=",           logoColor: "#0071CE", tier: "budget" },
  article:       { slug: "article",       name: "Article",         baseUrl: "https://www.article.com",       searchUrl: "https://www.article.com/catalog?query=",      logoColor: "#1A1A1A", tier: "premium" },
  "living-spaces":{ slug: "living-spaces", name: "Living Spaces",  baseUrl: "https://www.livingspaces.com",  searchUrl: "https://www.livingspaces.com/search?q=",      logoColor: "#2D2D2D", tier: "mid-range" },
  ikea:          { slug: "ikea",          name: "IKEA",            baseUrl: "https://www.ikea.com",          searchUrl: "https://www.ikea.com/us/en/search/?q=",       logoColor: "#0058A3", tier: "budget" },
  "west-elm":    { slug: "west-elm",      name: "West Elm",        baseUrl: "https://www.westelm.com",       searchUrl: "https://www.westelm.com/search/?query=",      logoColor: "#1E3A3A", tier: "premium" },
  "pottery-barn":{ slug: "pottery-barn",  name: "Pottery Barn",    baseUrl: "https://www.potterybarn.com",   searchUrl: "https://www.potterybarn.com/search/?query=",  logoColor: "#7B3F00", tier: "premium" },
  "crate-barrel":{ slug: "crate-barrel",  name: "Crate & Barrel",  baseUrl: "https://www.crateandbarrel.com",searchUrl: "https://www.crateandbarrel.com/search?query=", logoColor: "#1A1A1A", tier: "premium" },
  cb2:           { slug: "cb2",           name: "CB2",             baseUrl: "https://www.cb2.com",           searchUrl: "https://www.cb2.com/search?query=",           logoColor: "#1A1A1A", tier: "premium" },
  "world-market":{ slug: "world-market",  name: "World Market",    baseUrl: "https://www.worldmarket.com",   searchUrl: "https://www.worldmarket.com/search?query=",   logoColor: "#C5A04B", tier: "mid-range" },
  overstock:     { slug: "overstock",     name: "Overstock",       baseUrl: "https://www.overstock.com",     searchUrl: "https://www.overstock.com/search?keywords=",  logoColor: "#E31837", tier: "budget" },
  "home-depot":  { slug: "home-depot",    name: "Home Depot",      baseUrl: "https://www.homedepot.com",     searchUrl: "https://www.homedepot.com/s/",                logoColor: "#F96302", tier: "mid-range" },
  "rugs-usa":    { slug: "rugs-usa",      name: "Rugs USA",        baseUrl: "https://www.rugsusa.com",       searchUrl: "https://www.rugsusa.com/rugsusa/control/search?keywords=", logoColor: "#1A3A5C", tier: "budget" },
  etsy:          { slug: "etsy",          name: "Etsy",            baseUrl: "https://www.etsy.com",          searchUrl: "https://www.etsy.com/search?q=",              logoColor: "#F56400", tier: "mid-range" },
};

export function getRetailer(slug: RetailerSlug): RetailerInfo {
  return RETAILERS[slug];
}

export function getRetailersByTier(tier: "budget" | "mid-range" | "premium"): RetailerInfo[] {
  return Object.values(RETAILERS).filter((r) => r.tier === tier);
}

// ── Product search across catalog ──

export function generateSearchUrl(retailer: RetailerSlug, query: string): string {
  const info = RETAILERS[retailer];
  return `${info.searchUrl}${encodeURIComponent(query)}`;
}

export function findAlternatives(
  item: FurnitureItem,
  maxResults: number = 5
): ProductAlternative[] {
  const alternatives = CATALOG
    .filter((ci) =>
      ci.id !== item.id &&
      ci.category === item.category &&
      ci.subcategory === item.subcategory &&
      ci.price < item.price
    )
    .sort((a, b) => a.price - b.price)
    .slice(0, maxResults)
    .map((ci) => ({
      id: ci.id,
      name: ci.name,
      price: ci.price,
      retailer: vendorToSlug(ci.vendor),
      purchaseUrl: ci.vendorUrl,
      savings: item.price - ci.price,
      savingsPercent: Math.round(((item.price - ci.price) / item.price) * 100),
    }));

  return alternatives;
}

// ── Budget optimization ──

export function generateBudgetSuggestions(
  rooms: Room[],
  targetSavings: number
): BudgetSuggestion[] {
  const suggestions: BudgetSuggestion[] = [];
  let accumulatedSavings = 0;

  const allFurniture: { room: Room; sf: SelectedFurniture }[] = [];
  for (const room of rooms) {
    for (const sf of room.furniture) {
      allFurniture.push({ room, sf });
    }
  }

  allFurniture.sort((a, b) => (b.sf.item.price * b.sf.quantity) - (a.sf.item.price * a.sf.quantity));

  for (const { room, sf } of allFurniture) {
    if (accumulatedSavings >= targetSavings) break;

    const alts = findAlternatives(sf.item, 1);
    if (alts.length === 0) continue;

    const best = alts[0];
    const totalSavings = best.savings * sf.quantity;
    if (totalSavings <= 0) continue;

    suggestions.push({
      type: "swap",
      currentProduct: sf.item.name,
      currentPrice: sf.item.price * sf.quantity,
      suggestedProduct: best.name,
      suggestedPrice: best.price * sf.quantity,
      suggestedRetailer: best.retailer,
      suggestedUrl: best.purchaseUrl,
      savings: totalSavings,
      room: room.name,
    });

    accumulatedSavings += totalSavings;
  }

  return suggestions;
}

// ── Vendor name → slug mapping ──

function vendorToSlug(vendor: string): RetailerSlug {
  const map: Record<string, RetailerSlug> = {
    "Wayfair": "wayfair",
    "Amazon": "amazon",
    "Target": "target",
    "Walmart": "walmart",
    "Article": "article",
    "Living Spaces": "living-spaces",
    "IKEA": "ikea",
    "West Elm": "west-elm",
    "Pottery Barn": "pottery-barn",
    "Crate & Barrel": "crate-barrel",
    "CB2": "cb2",
    "World Market": "world-market",
    "Overstock": "overstock",
    "Home Depot": "home-depot",
    "Rugs USA": "rugs-usa",
    "Etsy": "etsy",
    "Francis Lofts & Bunks": "wayfair",
    "Adult Bunk Beds": "wayfair",
    "Zinus": "amazon",
    "Nectar": "amazon",
    "Wilding Wallbeds": "wayfair",
    "La-Z-Boy": "wayfair",
    "Brooklinen": "amazon",
    "Caraway": "amazon",
    "Henckels": "amazon",
    "Minted": "etsy",
    "simplehuman": "amazon",
    "Restoration Hardware": "crate-barrel",
  };
  return map[vendor] ?? "amazon";
}

// ── Price tier search ──

export function findByBudgetTier(
  category: FurnitureCategory,
  subcategory: string,
  tier: "budget" | "mid-range" | "premium"
): FurnitureItem[] {
  const priceRanges: Record<string, [number, number]> = {
    budget: [0, 300],
    "mid-range": [300, 1000],
    premium: [1000, Infinity],
  };
  const [min, max] = priceRanges[tier];
  return CATALOG.filter(
    (i) =>
      i.category === category &&
      (!subcategory || i.subcategory === subcategory) &&
      i.price >= min &&
      i.price < max
  ).sort((a, b) => a.price - b.price);
}

// ── Cross-retailer price comparison ──

export function compareAcrossRetailers(
  category: FurnitureCategory,
  subcategory: string
): { retailer: RetailerSlug; items: FurnitureItem[]; avgPrice: number; lowestPrice: number }[] {
  const byRetailer = new Map<string, FurnitureItem[]>();

  for (const item of CATALOG) {
    if (item.category !== category) continue;
    if (subcategory && item.subcategory !== subcategory) continue;
    const slug = vendorToSlug(item.vendor);
    if (!byRetailer.has(slug)) byRetailer.set(slug, []);
    byRetailer.get(slug)!.push(item);
  }

  return Array.from(byRetailer.entries())
    .map(([retailer, items]) => ({
      retailer: retailer as RetailerSlug,
      items: items.sort((a, b) => a.price - b.price),
      avgPrice: Math.round(items.reduce((s, i) => s + i.price, 0) / items.length),
      lowestPrice: Math.min(...items.map((i) => i.price)),
    }))
    .sort((a, b) => a.avgPrice - b.avgPrice);
}
