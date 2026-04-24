/**
 * Title-vs-description keyword matcher.
 *
 * Why this exists: Gemini's grounded search sometimes hallucinates product URLs
 * — it'll hand us an Amazon page for a romance novel when we asked for a dining
 * chair. The og:image fallback used to dutifully pull the book cover off that
 * page and paste it onto the composite board. This helper catches the mismatch
 * by comparing a page's <title>/og:title against the designer's description.
 *
 * Kept dependency-free + browser-safe so server routes and the client both
 * import the same logic.
 */

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "in", "on", "for", "with", "to", "by",
  "at", "from", "as", "is", "it", "its", "this", "that", "these", "those",
  "be", "been", "being", "was", "were", "has", "have", "had", "do", "does",
  "new", "set", "piece", "style", "design", "item", "product", "pc", "pcs",
  "best", "top", "premium", "quality", "modern", "classic", "beautiful",
  "inch", "inches", "ft", "cm", "mm", "size", "small", "medium", "large",
  // common filler vendor noise that shouldn't count toward matches
  "buy", "shop", "online", "sale", "free", "shipping", "deal", "deals",
]);

// Furniture / home-goods taxonomy words that MUST appear in the title for the
// match to count. If the description says "dining chair" and the title says
// "cookbook", no number of color/material matches should save it — the core
// noun has to appear. These are grouped so plurals / variations all count.
const CATEGORY_GROUPS: string[][] = [
  ["chair", "chairs", "stool", "stools", "seat", "seating"],
  ["sofa", "sofas", "sectional", "sectionals", "couch", "couches", "loveseat", "loveseats"],
  ["table", "tables", "desk", "desks", "console", "consoles"],
  ["bed", "beds", "headboard", "headboards", "bunk", "bunks", "frame"],
  ["mattress", "mattresses"],
  ["dresser", "dressers", "cabinet", "cabinets", "nightstand", "nightstands", "bedside"],
  ["shelf", "shelves", "shelving", "bookshelf", "bookshelves", "bookcase", "bookcases", "credenza", "credenzas"],
  ["rug", "rugs", "runner", "carpet"],
  ["lamp", "lamps", "pendant", "pendants", "chandelier", "chandeliers", "sconce", "sconces", "light", "lights", "lighting", "fixture", "fixtures"],
  ["mirror", "mirrors"],
  ["art", "painting", "paintings", "print", "prints", "poster", "posters", "wall"],
  ["pillow", "pillows", "throw", "throws", "blanket", "blankets"],
  ["curtain", "curtains", "drape", "drapes", "draperies"],
  ["blind", "blinds", "shade", "shades", "shutter", "shutters"],
  ["vase", "vases", "bowl", "bowls", "planter", "planters", "pot", "pots"],
  ["plant", "plants", "tree", "trees", "greenery", "foliage"],
  ["ottoman", "ottomans", "bench", "benches"],
  ["sink", "sinks", "faucet", "faucets", "vanity", "vanities"],
  ["stove", "range", "oven", "ovens", "cooktop", "cooktops"],
  ["fridge", "refrigerator", "refrigerators"],
  ["microwave", "dishwasher", "dishwashers"],
  ["toilet", "toilets", "tub", "tubs", "bathtub", "bathtubs", "shower", "showers"],
];

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+|-/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

function categoryGroupsIn(tokens: string[]): Set<number> {
  const tset = new Set(tokens);
  const hit = new Set<number>();
  for (let i = 0; i < CATEGORY_GROUPS.length; i++) {
    if (CATEGORY_GROUPS[i].some((w) => tset.has(w))) hit.add(i);
  }
  return hit;
}

export interface TitleMatchResult {
  /** True when the title plausibly describes the same kind of product. */
  isMatch: boolean;
  /** How many non-stopword tokens from the description appear in the title. */
  keywordOverlap: number;
  /** True when at least one shared category group (e.g. both mention "chair"). */
  categoryMatch: boolean;
  /** For logging — the raw overlapping words. */
  matchedKeywords: string[];
}

/**
 * Decide whether a page's title (or og:title) plausibly describes the same
 * kind of product as the designer's description.
 *
 * Acceptance rule — must satisfy BOTH:
 *   1. At least one shared CATEGORY group (chair vs chair, table vs table).
 *      This blocks "dining chair" → "cookbook" even if 5 adjective words
 *      happen to overlap.
 *   2. At least 1 meaningful keyword overlap beyond the category itself.
 *
 * Exception: if the description has no category word at all (e.g. "fiddle
 * leaf fig tree"), we fall back to pure keyword overlap — require 2+ shared
 * non-stopword tokens. This is still tighter than the old behavior of
 * trusting any og:image without checks.
 */
export function titleMatchesDescription(title: string, description: string): TitleMatchResult {
  if (!title || !description) {
    return { isMatch: false, keywordOverlap: 0, categoryMatch: false, matchedKeywords: [] };
  }

  const titleTokens = tokenize(title);
  const descTokens = tokenize(description);

  const titleCats = categoryGroupsIn(titleTokens);
  const descCats = categoryGroupsIn(descTokens);

  let categoryMatch = false;
  for (const c of descCats) if (titleCats.has(c)) { categoryMatch = true; break; }

  const titleSet = new Set(titleTokens);
  const matchedKeywords = descTokens.filter((t) => titleSet.has(t));

  // Neither side has a category word → generic goods, fall back to overlap
  if (descCats.size === 0 && titleCats.size === 0) {
    return {
      isMatch: matchedKeywords.length >= 2,
      keywordOverlap: matchedKeywords.length,
      categoryMatch: false,
      matchedKeywords,
    };
  }

  // Description has a category word but the title doesn't mention ANY furniture
  // category → almost certainly the wrong kind of page.
  if (descCats.size > 0 && titleCats.size === 0) {
    return {
      isMatch: false,
      keywordOverlap: matchedKeywords.length,
      categoryMatch: false,
      matchedKeywords,
    };
  }

  return {
    isMatch: categoryMatch && matchedKeywords.length >= 1,
    keywordOverlap: matchedKeywords.length,
    categoryMatch,
    matchedKeywords,
  };
}
