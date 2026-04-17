/**
 * Studio-level settings — company info, designer defaults, billing config.
 * Persisted to localStorage. Independent of Supabase.
 */

export interface StudioSettings {
  // Branding
  studioName: string;
  studioLogoUrl: string;
  studioPrimaryColor: string;
  studioAccentColor: string;
  studioEmail: string;
  studioPhone: string;
  studioAddress: string;
  studioWebsite: string;

  // Designer defaults
  defaultMarkupPercent: number; // markup on furniture for client billing
  defaultHourlyRate: number;
  defaultFlatDesignFee: number;
  preferredMarkupType: "percent" | "flat" | "hourly";

  // Budget guidance
  targetCostPerSqft: number; // dollar target per sqft
  contingencyPercent: number; // % buffer for renovations

  // Preferred vendors
  preferredVendors: string[];

  // Print/export
  showPricingToClient: boolean;
  showVendorLinksToClient: boolean;
  briefFooterNote: string;
}

const SETTINGS_KEY = "designStudio_settings";

export const DEFAULT_SETTINGS: StudioSettings = {
  studioName: "",
  studioLogoUrl: "",
  studioPrimaryColor: "#1a1a1a",
  studioAccentColor: "#D4A574",
  studioEmail: "",
  studioPhone: "",
  studioAddress: "",
  studioWebsite: "",
  defaultMarkupPercent: 25,
  defaultHourlyRate: 150,
  defaultFlatDesignFee: 3500,
  preferredMarkupType: "percent",
  targetCostPerSqft: 15,
  contingencyPercent: 15,
  preferredVendors: ["Wayfair", "Amazon", "Target", "IKEA", "West Elm", "Article"],
  showPricingToClient: true,
  showVendorLinksToClient: true,
  briefFooterNote: "Thank you for trusting us with your design. Questions? Reach out any time.",
};

export function getStudioSettings(): StudioSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveStudioSettings(settings: Partial<StudioSettings>): StudioSettings {
  const current = getStudioSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  return updated;
}

export function resetStudioSettings(): void {
  localStorage.removeItem(SETTINGS_KEY);
}

// ── Data Backup/Restore ──

export interface BackupPayload {
  version: number;
  exportedAt: string;
  projects: unknown[];
  settings: StudioSettings;
  customVendors: string[];
  customItems: unknown[];
  inspirationItems: Record<string, unknown[]>;
  shoppingPurchased: Record<string, string[]>;
}

const CUSTOM_ITEMS_KEY = "designStudio_customItems";
const CUSTOM_VENDORS_KEY = "designStudio_customVendors";

export function exportAllData(): BackupPayload {
  if (typeof window === "undefined") {
    throw new Error("exportAllData must be called in browser");
  }

  const projects = JSON.parse(localStorage.getItem("designStudio_projects") ?? "[]");
  const customItems = JSON.parse(localStorage.getItem(CUSTOM_ITEMS_KEY) ?? "[]");
  const customVendors = JSON.parse(localStorage.getItem(CUSTOM_VENDORS_KEY) ?? "[]");

  const inspirationItems: Record<string, unknown[]> = {};
  const shoppingPurchased: Record<string, string[]> = {};
  for (const p of projects as Array<{ id: string }>) {
    const insp = localStorage.getItem(`inspiration_${p.id}`);
    if (insp) inspirationItems[p.id] = JSON.parse(insp);
    const shop = localStorage.getItem(`shopping_${p.id}`);
    if (shop) shoppingPurchased[p.id] = JSON.parse(shop);
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects,
    settings: getStudioSettings(),
    customVendors,
    customItems,
    inspirationItems,
    shoppingPurchased,
  };
}

export function downloadBackup(studioName: string = "designstudio"): void {
  const payload = exportAllData();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = studioName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "designstudio";
  a.href = url;
  a.download = `${safeName}-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importBackup(payload: BackupPayload): { projectsImported: number; replaced: boolean } {
  if (!payload || payload.version !== 1) {
    throw new Error("Invalid backup file — unsupported version.");
  }
  if (!Array.isArray(payload.projects)) {
    throw new Error("Backup file is missing projects.");
  }

  localStorage.setItem("designStudio_projects", JSON.stringify(payload.projects));

  if (payload.settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload.settings));
  }
  if (Array.isArray(payload.customItems)) {
    localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(payload.customItems));
  }
  if (Array.isArray(payload.customVendors)) {
    localStorage.setItem(CUSTOM_VENDORS_KEY, JSON.stringify(payload.customVendors));
  }
  if (payload.inspirationItems) {
    for (const [pid, items] of Object.entries(payload.inspirationItems)) {
      localStorage.setItem(`inspiration_${pid}`, JSON.stringify(items));
    }
  }
  if (payload.shoppingPurchased) {
    for (const [pid, ids] of Object.entries(payload.shoppingPurchased)) {
      localStorage.setItem(`shopping_${pid}`, JSON.stringify(ids));
    }
  }

  return {
    projectsImported: payload.projects.length,
    replaced: true,
  };
}

// ── Custom furniture items ──

import type { FurnitureItem } from "./types";

export function getCustomItems(): FurnitureItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_ITEMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomItem(item: FurnitureItem): void {
  const items = getCustomItems();
  const idx = items.findIndex(i => i.id === item.id);
  if (idx >= 0) items[idx] = item;
  else items.push(item);
  localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(items));
}

export function deleteCustomItem(id: string): void {
  const items = getCustomItems().filter(i => i.id !== id);
  localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(items));
}

// ── Pricing calculator ──

export function calculateClientPrice(
  wholesalePrice: number,
  settings?: StudioSettings
): number {
  const s = settings ?? getStudioSettings();
  if (s.preferredMarkupType === "percent") {
    return wholesalePrice * (1 + s.defaultMarkupPercent / 100);
  }
  return wholesalePrice;
}
