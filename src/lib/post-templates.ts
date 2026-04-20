// Types, defaults, and character-budget heuristics for the Canva-style
// carousel post builder. Slides are modeled after the Dr. Jeff Chheuy
// template the user posts (1080x1080, profile row, typed body).

export type SlideType =
  | "hook-opener" // big hook + optional numbered list preview + optional small footer lines
  | "personal-story" // 3-5 short paragraphs, can bold inline via **word**
  | "criteria-bullets" // intro line + bullet list + optional closing line
  | "market-detail" // #N header + subtitle + bullets + stat lines (Gross Rev Potential / Avg Home Price)
  | "numbered-list" // heading + numbered items
  | "plain-text" // simple paragraphs
  | "cta"; // closing DM call-to-action

export interface HookOpenerSlide {
  type: "hook-opener";
  headline: string; // e.g. "These are the best rural Airbnb markets for 2026:"
  items?: string[]; // numbered preview list, rendered "1. ..."
  footer?: string[]; // short closing paragraphs
}

export interface PersonalStorySlide {
  type: "personal-story";
  paragraphs: string[]; // each string is one paragraph; **word** renders bold
}

export interface CriteriaBulletsSlide {
  type: "criteria-bullets";
  heading: string;
  bullets: string[];
  footer?: string;
}

export interface MarketDetailSlide {
  type: "market-detail";
  rank: number; // 1, 2, 3...
  title: string; // "Wolfe County, KY"
  subtitle?: string; // "(Red River Gorge)"
  bullets: string[];
  stats?: { label: string; value: string }[]; // [{label:"Gross Rev Potential", value:"$75,940/year"}]
}

export interface NumberedListSlide {
  type: "numbered-list";
  heading: string;
  items: string[];
}

export interface PlainTextSlide {
  type: "plain-text";
  paragraphs: string[];
}

export interface CtaSlide {
  type: "cta";
  paragraphs: string[]; // **word** renders bold
}

export type Slide =
  | ({ id: string } & HookOpenerSlide)
  | ({ id: string } & PersonalStorySlide)
  | ({ id: string } & CriteriaBulletsSlide)
  | ({ id: string } & MarketDetailSlide)
  | ({ id: string } & NumberedListSlide)
  | ({ id: string } & PlainTextSlide)
  | ({ id: string } & CtaSlide);

export interface CarouselPost {
  slides: Slide[];
  caption: string;
  hooks: string[]; // 3 alternate first-slide hooks
}

export interface PostBuilderProfile {
  displayName: string; // "Dr.Jeff Chheuy"
  handle: string; // "@jeffchheuy" (leading @ optional, we normalize)
  avatarDataUrl: string | null; // uploaded image as data URL, persisted to localStorage
  verified: boolean; // show the blue check
}

export interface PostBuilderParams {
  slideCount: number; // target slide count; 6-12 typical, default 10
  readingLevel: string; // "3rd grade" default
  audience: string; // "high income earners with $65k saved" default
  tone: string; // "confident, direct, no-fluff"
  // per-slide character budgets — the prompt references these and the
  // renderer warns when exceeded. Keeps slides readable, no flood.
  maxCharsBody: number; // default 280 for hook/story/cta body blocks
  maxBullets: number; // default 6 bullets per slide
  maxCharsBullet: number; // default 60 chars per bullet
}

export const DEFAULT_PARAMS: PostBuilderParams = {
  slideCount: 10,
  readingLevel: "3rd grade",
  audience: "high income earners with $65k saved",
  tone: "confident, direct, no-fluff",
  maxCharsBody: 280,
  maxBullets: 6,
  maxCharsBullet: 60,
};

export const DEFAULT_PROFILE: PostBuilderProfile = {
  displayName: "Dr.Jeff Chheuy",
  handle: "@jeffchheuy",
  avatarDataUrl: null,
  verified: true,
};

// Local-storage keys
export const LS_KEY_PROFILE = "postBuilder.profile";
export const LS_KEY_PARAMS = "postBuilder.params";
export const LS_KEY_LAST_POST = "postBuilder.lastPost";

export function normalizeHandle(h: string): string {
  const trimmed = h.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

export function newSlideId(): string {
  return `slide_${Math.random().toString(36).slice(2, 10)}`;
}

// Approximate character count used by a slide's body content. Used by the
// UI to flag slides that exceed the budget so the user sees "too much text".
export function slideCharCount(slide: Slide): number {
  switch (slide.type) {
    case "hook-opener":
      return (
        slide.headline.length +
        (slide.items?.join(" ").length ?? 0) +
        (slide.footer?.join(" ").length ?? 0)
      );
    case "personal-story":
      return slide.paragraphs.join(" ").length;
    case "criteria-bullets":
      return (
        slide.heading.length +
        slide.bullets.join(" ").length +
        (slide.footer?.length ?? 0)
      );
    case "market-detail":
      return (
        slide.title.length +
        (slide.subtitle?.length ?? 0) +
        slide.bullets.join(" ").length +
        (slide.stats?.map((s) => s.label + s.value).join(" ").length ?? 0)
      );
    case "numbered-list":
      return slide.heading.length + slide.items.join(" ").length;
    case "plain-text":
      return slide.paragraphs.join(" ").length;
    case "cta":
      return slide.paragraphs.join(" ").length;
  }
}

// Raw shape returned by the /analyze API. We attach ids on the client to
// keep server responses small.
export type RawSlide = Omit<Slide, "id">;
export interface RawCarouselPost {
  slides: RawSlide[];
  caption: string;
  hooks: string[];
}

export function attachIds(raw: RawCarouselPost): CarouselPost {
  return {
    slides: raw.slides.map((s) => ({ ...s, id: newSlideId() }) as Slide),
    caption: raw.caption,
    hooks: raw.hooks,
  };
}
