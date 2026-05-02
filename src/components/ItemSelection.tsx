"use client";

import { useState, useEffect, useCallback } from "react";
import { saveProject, getProject as getProjectFromStore, logActivity } from "@/lib/store";
import { retryFetch } from "@/lib/api-retry";
import { finalizeCutout } from "@/lib/scene-storage";
import { useToast } from "./Toast";
import TabHelp from "./TabHelp";
import type { Project, Room, SelectedFurniture, SourcedAlternative } from "@/lib/types";

interface Props {
  project: Project;
  room: Room;
  onUpdate: () => void;
}

interface ProductMatch {
  name: string;
  vendor: string;
  price: number | null;
  url: string;
  imageUrl?: string;
  dimensions?: string;
  rating?: number | null;
  reviewCount?: number | null;
  deliveryEstimate?: string | null;
  inStock?: boolean | null;
}

/**
 * Item Selection — the designer's quality gate for product choices.
 *
 * For each item on the composite board, shows:
 *   - The AI-generated cutout image (always available)
 *   - Item description/name
 *   - Up to 3 real product matches (from alternatives or freshly sourced)
 *   - A "Lock In" button to select a real product
 *
 * When designer locks in a product:
 *   - Updates room.furniture[i].item with real product data
 *   - Sets room.furniture[i].status to "approved"
 *   - Sets room.furniture[i].lockedIn to true
 *   - Updates the composite board item's image
 *   - Saves project
 */
export default function ItemSelection({ project, room, onUpdate }: Props) {
  const toast = useToast();
  const [sourcingIdx, setSourcingIdx] = useState<number | null>(null);
  const [lockingIdx, setLockingIdx] = useState<number | null>(null);

  const furniture = room.furniture ?? [];
  const lockedCount = furniture.filter(f => f.lockedIn).length;
  const totalCount = furniture.length;

  // Fetch alternatives for items that don't have any yet
  const fetchAlternatives = useCallback(async (furnitureIdx: number) => {
    const f = furniture[furnitureIdx];
    if (!f) return;
    setSourcingIdx(furnitureIdx);
    try {
      const res = await retryFetch("/api/source-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: f.item.name,
          styleHint: project.style,
          budget: project.budget ? Math.round(project.budget / Math.max(totalCount, 1)) : undefined,
          roomType: room.type,
        }),
      }, { maxRetries: 2, baseDelayMs: 2000 });
      if (res.ok) {
        const result = (await res.json()) as { options?: ProductMatch[] };
        const options = result?.options ?? [];
        if (options.length > 0) {
          const fresh = getProjectFromStore(project.id);
          if (fresh) {
            const rr = fresh.rooms.find(r => r.id === room.id);
            if (rr) {
              const fItem = rr.furniture[furnitureIdx];
              if (fItem) {
                fItem.alternatives = options.filter(a => a.name) as SourcedAlternative[];
                saveProject(fresh);
                onUpdate();
              }
            }
          }
        } else {
          toast.info("No matching products found — try adjusting the item description.");
        }
      }
    } catch {
      toast.error("Failed to find product matches. Try again.");
    } finally {
      setSourcingIdx(null);
    }
  }, [furniture, project, room, totalCount, onUpdate, toast]);

  // Lock in a specific alternative as the chosen product
  async function lockInProduct(furnitureIdx: number, alt: ProductMatch) {
    setLockingIdx(furnitureIdx);
    try {
      // Generate a clean cutout from the real product image
      let realCutoutUrl = alt.imageUrl || "";
      if (realCutoutUrl) {
        try {
          const cutRes = await retryFetch("/api/generate-cutout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: alt.name,
              imageUrl: realCutoutUrl,
              vendor: alt.vendor,
            }),
          }, { maxRetries: 2, baseDelayMs: 2000 });
          if (cutRes.ok) {
            const j = (await cutRes.json()) as { imageUrl?: string; imageDataUrl?: string };
            realCutoutUrl = j.imageUrl ?? j.imageDataUrl ?? realCutoutUrl;
          }
        } catch {
          // If cutout generation fails, use the raw product image
        }
        // Finalize: transparent bg + upload
        const cleaned = await finalizeCutout(realCutoutUrl);
        if (cleaned) realCutoutUrl = cleaned;
      }

      const fresh = getProjectFromStore(project.id);
      if (!fresh) return;
      const rr = fresh.rooms.find(r => r.id === room.id);
      if (!rr) return;
      const fItem = rr.furniture[furnitureIdx];
      if (!fItem) return;

      // Preserve the AI cutout URL before overwriting
      if (!fItem.aiCutoutUrl && fItem.item.imageUrl) {
        fItem.aiCutoutUrl = fItem.item.imageUrl;
      }

      // Update the furniture item with real product data
      fItem.item = {
        ...fItem.item,
        name: alt.name || fItem.item.name,
        vendor: alt.vendor || fItem.item.vendor,
        vendorUrl: alt.url || fItem.item.vendorUrl,
        price: alt.price ?? fItem.item.price,
        imageUrl: realCutoutUrl || fItem.item.imageUrl,
      };
      fItem.status = "approved";
      fItem.lockedIn = true;

      // Update the scene item's visual if we have a real cutout
      // (The composite board reads imageUrl from the furniture item directly)

      saveProject(fresh);
      onUpdate();
      logActivity(project.id, "item_locked_in", `Locked in "${alt.name}" from ${alt.vendor} for ${room.name}`);
      toast.success(`Locked in: ${alt.name}`);
    } catch (err) {
      toast.error(`Failed to lock in product: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setLockingIdx(null);
    }
  }

  if (totalCount === 0) {
    return (
      <div className="card text-center py-12">
        <div className="text-4xl mb-3">🛋️</div>
        <p className="text-brand-600">No items on the board yet. Generate a render and extract items first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TabHelp tabId="item-selection" title="How Item Selection works">
        Each item on your board starts with an AI picture. Here you pick the real product
        you want to buy. Click "Find real product matches" to see 3 options. Pick the one
        you like and hit "Lock In." Once all items are locked, your Excel sheet is ready to send to the client.
      </TabHelp>

      {/* Progress bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-brand-900">
            Product Selection Progress
          </span>
          <span className={`text-sm font-bold ${lockedCount === totalCount ? "text-emerald-600" : "text-amber-600"}`}>
            {lockedCount}/{totalCount} locked in
          </span>
        </div>
        <div className="w-full h-2 bg-brand-900/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              lockedCount === totalCount ? "bg-emerald-500" : "bg-amber-400"
            }`}
            style={{ width: `${totalCount > 0 ? (lockedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
        {lockedCount < totalCount && (
          <p className="text-xs text-brand-600 mt-2">
            Lock in all items before exporting the Excel sheet. Unlocked items will show AI-generated images only.
          </p>
        )}
      </div>

      {/* Item list */}
      {furniture.map((f, idx) => (
        <ItemCard
          key={f.item.id}
          furniture={f}
          index={idx}
          isSourcing={sourcingIdx === idx}
          isLocking={lockingIdx === idx}
          onFetchAlternatives={() => fetchAlternatives(idx)}
          onLockIn={(alt) => lockInProduct(idx, alt)}
        />
      ))}
    </div>
  );
}

// ── Item Card ──────────────────────────────────────────────────────────

interface ItemCardProps {
  furniture: SelectedFurniture;
  index: number;
  isSourcing: boolean;
  isLocking: boolean;
  onFetchAlternatives: () => void;
  onLockIn: (alt: ProductMatch) => void;
}

function ItemCard({ furniture, index, isSourcing, isLocking, onFetchAlternatives, onLockIn }: ItemCardProps) {
  const [expanded, setExpanded] = useState(!furniture.lockedIn);
  const alts = furniture.alternatives ?? [];
  const hasAlts = alts.length > 0;

  return (
    <div className={`card overflow-hidden transition-all ${
      furniture.lockedIn
        ? "border-emerald-200 bg-emerald-50/30"
        : "border-amber-200 bg-amber-50/20"
    }`}>
      {/* Header row */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-brand-900/[0.02]"
        onClick={() => setExpanded(!expanded)}
      >
        {/* AI cutout thumbnail */}
        <div className="shrink-0 w-14 h-14 rounded-lg border border-brand-900/10 bg-white overflow-hidden flex items-center justify-center">
          {furniture.item.imageUrl ? (
            <img
              src={furniture.item.imageUrl}
              alt={furniture.item.name}
              className="w-full h-full object-contain"
            />
          ) : (
            <span className="text-2xl">🪑</span>
          )}
        </div>

        {/* Item info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-brand-900 truncate">{furniture.item.name}</p>
          <p className="text-xs text-brand-600">
            {furniture.item.vendor !== "—" ? furniture.item.vendor : "No vendor yet"}
            {furniture.item.price > 0 && ` · $${furniture.item.price.toLocaleString()}`}
          </p>
        </div>

        {/* Status badge */}
        <div className="shrink-0">
          {furniture.lockedIn ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
              ✓ Locked
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
              ○ Pick product
            </span>
          )}
        </div>

        {/* Expand arrow */}
        <span className={`text-brand-600 transition-transform ${expanded ? "rotate-180" : ""}`}>
          ▾
        </span>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-brand-900/5 p-3 space-y-3">
          {/* AI cutout comparison */}
          {furniture.aiCutoutUrl && furniture.lockedIn && (
            <div className="flex items-center gap-3 p-2 rounded-lg bg-white border border-brand-900/5">
              <div className="shrink-0">
                <p className="text-[10px] font-semibold text-brand-600 mb-1">AI Cutout</p>
                <div className="w-12 h-12 rounded border border-brand-900/10 overflow-hidden">
                  <img src={furniture.aiCutoutUrl} alt="AI generated" className="w-full h-full object-contain" />
                </div>
              </div>
              <span className="text-brand-600">→</span>
              <div className="shrink-0">
                <p className="text-[10px] font-semibold text-emerald-600 mb-1">Locked Product</p>
                <div className="w-12 h-12 rounded border border-emerald-200 overflow-hidden">
                  <img src={furniture.item.imageUrl} alt="Real product" className="w-full h-full object-contain" />
                </div>
              </div>
            </div>
          )}

          {/* Product matches */}
          {!hasAlts && !isSourcing && (
            <button
              onClick={(e) => { e.stopPropagation(); onFetchAlternatives(); }}
              className="w-full py-2 px-3 rounded-lg border border-brand-900/10 bg-white text-sm font-medium text-brand-700 hover:bg-brand-900/[0.03] transition"
            >
              🔍 Find real product matches
            </button>
          )}

          {isSourcing && (
            <div className="flex items-center gap-2 py-3 justify-center">
              <div className="w-4 h-4 border-2 border-brand-900/20 border-t-brand-900 rounded-full animate-spin" />
              <span className="text-xs text-brand-600">Searching for matching products...</span>
            </div>
          )}

          {hasAlts && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-brand-700">
                  {furniture.lockedIn ? "Other options:" : "Pick a product:"}
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); onFetchAlternatives(); }}
                  className="text-[10px] text-brand-600 hover:text-brand-900 underline"
                  disabled={isSourcing}
                >
                  Re-search
                </button>
              </div>
              {alts.slice(0, 3).map((alt, altIdx) => (
                <ProductMatchCard
                  key={`${alt.name}-${altIdx}`}
                  match={alt}
                  isLocking={isLocking}
                  isLocked={!!furniture.lockedIn && furniture.item.vendorUrl === alt.url}
                  onLockIn={() => onLockIn(alt)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Product Match Card ─────────────────────────────────────────────────

interface ProductMatchCardProps {
  match: ProductMatch;
  isLocking: boolean;
  isLocked: boolean;
  onLockIn: () => void;
}

function ProductMatchCard({ match, isLocking, isLocked, onLockIn }: ProductMatchCardProps) {
  return (
    <div className={`flex items-center gap-3 p-2 rounded-lg border transition ${
      isLocked
        ? "border-emerald-300 bg-emerald-50"
        : "border-brand-900/10 bg-white hover:border-brand-900/20"
    }`}>
      {/* Product image */}
      <div className="shrink-0 w-12 h-12 rounded border border-brand-900/10 bg-white overflow-hidden flex items-center justify-center">
        {match.imageUrl ? (
          <img src={match.imageUrl} alt={match.name} className="w-full h-full object-contain" />
        ) : (
          <span className="text-xs text-brand-400">No img</span>
        )}
      </div>

      {/* Product info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-brand-900 truncate">{match.name}</p>
        <p className="text-[10px] text-brand-600 truncate">
          {match.vendor}
          {match.price != null && ` · $${match.price.toLocaleString()}`}
          {match.dimensions && ` · ${match.dimensions}`}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {match.rating != null && (
            <span className="text-[10px] text-amber-600">
              {"★".repeat(Math.round(match.rating))} {match.rating.toFixed(1)}
            </span>
          )}
          {match.reviewCount != null && (
            <span className="text-[10px] text-brand-500">({match.reviewCount} reviews)</span>
          )}
          {match.inStock === true && (
            <span className="text-[10px] text-emerald-600 font-medium">In stock</span>
          )}
          {match.inStock === false && (
            <span className="text-[10px] text-red-500 font-medium">Out of stock</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex flex-col gap-1">
        {isLocked ? (
          <span className="text-[10px] font-bold text-emerald-600 px-2 py-1">✓ Locked</span>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onLockIn(); }}
            disabled={isLocking}
            className="px-2 py-1 rounded text-[10px] font-bold bg-brand-900 text-white hover:bg-brand-800 disabled:opacity-50 transition"
          >
            {isLocking ? "..." : "Lock In"}
          </button>
        )}
        {match.url && (
          <a
            href={match.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-brand-600 hover:text-brand-900 text-center underline"
            onClick={(e) => e.stopPropagation()}
          >
            View
          </a>
        )}
      </div>
    </div>
  );
}
