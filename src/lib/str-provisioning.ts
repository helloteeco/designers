/**
 * STR provisioning engine — the "fill the house" template mined from Teeco's
 * real Hiddenwoods masterlist (scripts/reference/hiddenwoods-items.json).
 *
 * Real masterlists are full short-term-rental provisioning lists, not just
 * big furniture: bedding scaled per sleeping surface, a per-bathroom kit, a
 * complete kitchen kit, install/safety/consumable blocks, and porch/backyard
 * extras. Every entry below is a REAL row from the reference workbook —
 * item/detail/source text, URLs and unit costs are verbatim (including the
 * reference's own trailing spaces and spelling quirks, e.g. "Fire
 * extingisher"), only the quantity is re-derived per project via `qtyRule`.
 *
 * `buildProvisioningRows(project)` resolves quantities from the project:
 *   - sleeping surfaces ("bed sets"): sum of bed quantities in each room's
 *     selectedBedConfig, counting bunks/trundles as 2 surfaces
 *     (fallback: property bedroom count)
 *   - bedrooms / bathrooms: room counts (fallback: property counts)
 *   - TVs: planMarkers of type 'tv' (fallback: 1 living TV + 1 per bedroom)
 *   - outdoor-only items are dropped when the project has no outdoor room
 */

import type { Project } from "./types";

// ── Quantity rules ──

export type QtyRule =
  | { kind: "fixed"; n: number | null }
  | { kind: "perBed"; n: number }
  | { kind: "perBedSet"; n: number }
  | { kind: "perBedroom"; n: number }
  | { kind: "perBathroom"; n: number }
  | { kind: "perTv"; n: number };

/** Fixed quantity; `null` reproduces the reference's blank "as needed" qty. */
export const fixed = (n: number | null): QtyRule => ({ kind: "fixed", n });
/** n × number of bed UNITS (a bunk bed counts once). */
export const perBed = (n: number): QtyRule => ({ kind: "perBed", n });
/** n × number of SLEEPING SURFACES (a queen-over-queen bunk counts twice). */
export const perBedSet = (n: number): QtyRule => ({ kind: "perBedSet", n });
export const perBedroom = (n: number): QtyRule => ({ kind: "perBedroom", n });
export const perBathroom = (n: number): QtyRule => ({ kind: "perBathroom", n });
export const perTv = (n: number): QtyRule => ({ kind: "perTv", n });

// ── Template ──

export type ProvisioningTab =
  | "Common"
  | "Bedrooms"
  | "Kitchen"
  | "Baths"
  | "Consumables and Other"
  | "Exterior";

export interface ProvisioningEntry {
  tab: ProvisioningTab;
  /** First taxonomy column: tab-specific grouping ("Bedding", "Install Items",
   *  "all", "Front porch", "Living room", …) — verbatim from the reference. */
  area: string;
  /** Bedrooms tab only: "ALL"/"All" or a room name. */
  room?: string;
  item: string;
  detail?: string;
  sourceText: string;
  sourceUrl?: string;
  altText?: string;
  altUrl?: string;
  qtyRule: QtyRule;
  unitCost?: number;
  /** Only included when the project has an outdoor room. */
  outdoorOnly?: boolean;
}

export const STR_PROVISIONING_TEMPLATE: ProvisioningEntry[] = [
  // ── Bedrooms ──
  { tab: "Bedrooms", area: "Bedding", room: "ALL", item: "bedsheet sets (2 sets per bed)", detail: "Queen sheets 6 piece set", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/gp/product/B079S37WXN?ie=UTF8&linkCode=sl1&tag=robuilt-20&linkId=680bbff3608c047e868e60125faff678&language=en_US&ref_=as_li_ss_tl&th=1", qtyRule: perBedSet(2), unitCost: 28.49 },
  { tab: "Bedrooms", area: "Bedding", room: "ALL", item: "duvet cover (2 sets per bed)", detail: "Queen size", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B01B87TMOS?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B01B87TMOS&asc_item-id=amzn1.ideas.CE0AMHPFROL6&ref_=hype_hm_sf_e_asin", qtyRule: perBedSet(2), unitCost: 26.59 },
  { tab: "Bedrooms", area: "Bedding", room: "ALL", item: "duvet inserts (1 set per bed)", detail: "Queen size", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B01JPECQBM?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B01JPECQBM&asc_item-id=amzn1.ideas.CE0AMHPFROL6&ref_=hype_hm_sf_e_asin", qtyRule: perBedSet(1), unitCost: 22.79 },
  { tab: "Bedrooms", area: "Bedding", room: "ALL", item: "mattress protectors encasement (1 set per bed)", detail: "Queen size waterproof pack of 2", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B07TWMLSVM?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B07TWMLSVM&asc_item-id=amzn1.ideas.CE0AMHPFROL6&ref_=hype_hm_sf_e_asin", qtyRule: perBedSet(1), unitCost: 30.79 },
  { tab: "Bedrooms", area: "Bedding", room: "ALL", item: "mattress protectors fitted (1 set per bed)", detail: "Queen size waterproof pack of 2", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B07Q1X9JTM?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B00MRH9NCK&asc_item-id=amzn1.ideas.CE0AMHPFROL6&ref_=hype_hm_sf_e_asin&th=1", qtyRule: perBedSet(1), unitCost: 27.99 },
  { tab: "Bedrooms", area: "Bedding", room: "ALL", item: "mattresses *Note: get separate 6\" mattresses for any top bunks", detail: "Queen mattress", sourceText: "HostGPO", sourceUrl: "https://portal.hostgpo.com/collections/helix/products/helix-x-hostgpo-hospitality-10-mattress?variant=46703626354930", qtyRule: perBedSet(1), unitCost: 375 },
  { tab: "Bedrooms", area: "Bedding", room: "ALL", item: "pillow protectors (1 set per bed)", detail: "Standard size set of 4", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B09TRDT1KF?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B09TRDT1KF&asc_item-id=amzn1.ideas.CE0AMHPFROL6&ref_=hype_hm_sf_e_asin", qtyRule: perBedSet(1), unitCost: 11.94 },
  { tab: "Bedrooms", area: "Bedding", room: "ALL", item: "pillows (4 pillows per queen/king. 2 pillows per twin)", detail: "standard size set of 4", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0D6R9LGBF/ref=sspa_dk_detail_2?pd_rd_i=B0D6R9LGBF&pd_rd_w=2mgPH&content-id=amzn1.sym.386c274b-4bfe-4421-9052-a1a56db557ab&pf_rd_p=386c274b-4bfe-4421-9052-a1a56db557ab&pf_rd_r=A02F6QWM54CMRD0S52ZV&pd_rd_wg=OmgU4&pd_rd_r=504a012d-757c-46f9-ab0e-f43c3036b41c&sp_csd=d2lkZ2V0TmFtZT1zcF9kZXRhaWxfdGhlbWF0aWM&th=1", qtyRule: perBedSet(1), unitCost: 27.99 },
  { tab: "Bedrooms", area: "Closets", room: "ALL", item: "Hangers (~5 per closet)", detail: "20 pack", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B01MPY18P3?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B01MPY18P3&asc_item-id=amzn1.ideas.CE0AMHPFROL6&ref_=hype_hm_sf_e_asin", qtyRule: fixed(1), unitCost: 26.59 },
  { tab: "Bedrooms", area: "Closets", room: "ALL", item: "luggage rack (1-2 per bedroom)", detail: "set of 2", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B07J2K3MK9?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B07J2K3MK9&asc_item-id=amzn1.ideas.CE0AMHPFROL6&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: perBedroom(1), unitCost: 29.34 },
  { tab: "Bedrooms", area: "Main", room: "All", item: "Mirror full body (1 per bedroom)", detail: "64x21", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/OLIXIS-Bedroom-Hanging-Aluminum-Standing/dp/B0F93DVZXR/ref=sr_1_5?crid=1Y0NWW629AKEB&dib=eyJ2IjoiMSJ9._jEs7X25AYLAcQv552egezhAx0u6X-eTySUFB5sj0ebQgcVA3QBckwSyIQPe3kwttG9S-lmkgV-UhzEFlNsjG3MZ8LHjhuQ2DroysLMzhhT1BXYnk2Dmc2_JmI7pMCbsf10tJdYkH_QPdSditO5D4zjyJJGdaXtE1SzpAMfexs_7yoA4oyKru0f1ZovCJs2aRXSi0CNJR-JEz9Q7wzBTU_KA3Nf4w0ZmyFjLds9BF1lE5jmSwhupu-hCEJduo9holvfT8iCgJveJltADWHKKJUsyvqcC3wK3dx3hItO7fP4.N1ymKPaeWapGES9gL_FxpdYvpqDBLMIpt8NqeX9oziU&dib_tag=se&keywords=21x64+inch+Arched+Full+Length+Mirror&qid=1768598149&s=home-garden&sprefix=21x64+inch+arched+full+length+mirror%2Caps%2C115&sr=1-5", qtyRule: perBedroom(1), unitCost: 49.99 },
  // ── Baths ──
  { tab: "Baths", area: "all", item: "Hair dryer", detail: "Revlon Compact (1 per bathroom)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B003TQPRGY?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B003TQPRGY&asc_item-id=amzn1.ideas.2113948QHHEL7&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: perBathroom(1), unitCost: 10.02 },
  { tab: "Baths", area: "all", item: "Plunger ", detail: "Black (1 per bathroom)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B09FYFZ5R6?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B09FYFZ5R6&asc_item-id=amzn1.ideas.2113948QHHEL7", qtyRule: perBathroom(1), unitCost: 23.99 },
  { tab: "Baths", area: "all", item: "Shower caddy", detail: "black (1 per bathroom)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B09MFDXZHJ?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B09MFDXZHJ&asc_item-id=amzn1.ideas.2113948QHHEL7&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: perBathroom(1), unitCost: 9.99 },
  { tab: "Baths", area: "all", item: "Waste basket", detail: "waste basket", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B072LNJDBP?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B072LNJDBP&asc_item-id=amzn1.ideas.2113948QHHEL7&th=1", qtyRule: perBathroom(1), unitCost: 26.99 },
  { tab: "Baths", area: "all", item: "Shower Curtain Rod", detail: "Black", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0B38BWZDQ?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0B38BWZDQ&asc_item-id=amzn1.ideas.2113948QHHEL7&ref_=hype_hm_sf_e_asin", qtyRule: perBathroom(1), unitCost: 31.49 },
  { tab: "Baths", area: "all", item: "Shower Curtain Hooks", detail: "Black 24 pcs", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B09VXD54XV?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B09VXD54XV&asc_item-id=amzn1.ideas.2113948QHHEL7&ref_=hype_hm_sf_e_asin", qtyRule: perBathroom(1), unitCost: 7.99 },
  { tab: "Baths", area: "all", item: "Shower Liner", detail: "White", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B08BZFRQLS?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B08BZFRQLS&asc_item-id=amzn1.ideas.2113948QHHEL7&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: perBathroom(1), unitCost: 9.98 },
  { tab: "Baths", area: "all", item: "Bath towels bundle", detail: "(qty 2 sets max occupancy) 4 bath towel, 2 hand towel, 1 bath mat, 1 washcloth", sourceText: "Costco", sourceUrl: "https://www.costco.com/grandeur-hospitality-towels-and-bath-mats.product.100459223.html", qtyRule: fixed(1), unitCost: 243.92 },
  { tab: "Baths", area: "all", item: "Shower Curtain", detail: "woven white", sourceText: "Target", sourceUrl: "https://www.target.com/p/woven-shower-curtain-white-threshold-8482/-/A-52810317", qtyRule: perBathroom(1), unitCost: 25 },
  { tab: "Baths", area: "all", item: "Metal basket", detail: "13.75x6x6 (to hold tp)", sourceText: "Target", sourceUrl: "https://www.target.com/p/13-75-34-x-6-34-x-6-34-small-rectangular-wire-natural-wood-handles-basket-black-brightroom-8482/-/A-83378209?preselect=83378209", qtyRule: perBathroom(1), unitCost: 12 },
  { tab: "Baths", area: "all", item: "towels for hot tub/pool", detail: "(qty 2 sets max occupancy)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B008BOC2XU?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B008BOC2XU&asc_item-id=amzn1.ideas.2113948QHHEL7", qtyRule: fixed(6), unitCost: 43.94, outdoorOnly: true },
  { tab: "Baths", area: "all", item: "Floating shelves", detail: "for above toilet if needed", sourceText: "", qtyRule: fixed(1) },
  { tab: "Baths", area: "all", item: "Bath towels ", detail: "white (qty 2x max occupancy)", sourceText: "if you don't use Costco", altText: "Amazon", altUrl: "https://www.amazon.com/dp/B0849TZ57C?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0849TZ57C&asc_item-id=amzn1.ideas.2113948QHHEL7&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(6) },
  { tab: "Baths", area: "all", item: "Hand towels ", detail: "white (qty 2x max occupancy)", sourceText: "if you don't use Costco", altText: "Amazon", altUrl: "https://www.amazon.com/dp/B07YFLLJCV?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B07YFLLJCV&asc_item-id=amzn1.ideas.2113948QHHEL7&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(4) },
  { tab: "Baths", area: "all", item: "Washcloths ", detail: "white (qty 2x max occupancy)", sourceText: "if you don't use Costco", altText: "Amazon", altUrl: "https://www.amazon.com/dp/B007JCHA6E?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B007JCHA6E&asc_item-id=amzn1.ideas.2113948QHHEL7&ref_=hype_hm_sf_e_asin", qtyRule: fixed(1) },
  { tab: "Baths", area: "all", item: "Bath mats", detail: "white (qty 2x no of full bathrooms)", sourceText: "if you don't use Costco", altText: "Amazon", altUrl: "https://www.amazon.com/dp/B009SZ2P7E?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B009SZ2P7E&asc_item-id=amzn1.ideas.2113948QHHEL7&ref_=hype_hm_sf_e_asin", qtyRule: perBathroom(1) },
  { tab: "Baths", area: "all", item: "Makeup washcloths", detail: "black 20 pack", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0B9SN76DK?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0B9SN76DK&asc_item-id=amzn1.ideas.2113948QHHEL7&ref_=hype_hm_sf_e_asin", qtyRule: fixed(1), unitCost: 20.49 },
  { tab: "Baths", area: "all", item: "Bathroom Hardware Accessory Set", detail: "4 piece Black ", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B01B5NEYRA?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B01B5NEYRA&asc_item-id=amzn1.ideas.2113948QHHEL7&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: perBathroom(1), unitCost: 44.99 },
  { tab: "Baths", area: "all", item: "Bathroom Towel Hooks", detail: "Black", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0BLH6WZ17?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0BLH6WZ17&asc_item-id=amzn1.ideas.2113948QHHEL7&th=1", qtyRule: perBathroom(1), unitCost: 5.99 },
  // ── Kitchen ──
  { tab: "Kitchen", area: "Dining", item: "coasters", detail: "(get set to match table occupancy + small set for coffee tables)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0BWTVG92M?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0BWTVG92M&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(2), unitCost: 9.77 },
  { tab: "Kitchen", area: "Kitchen", item: "Coffee maker", detail: "Keurig ", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0892TW82K?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0892TW82K&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 107.68 },
  { tab: "Kitchen", area: "Kitchen", item: "Cookware", detail: "Baking pans/trays", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0C6XBTQ7F?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0C6XBTQ7F&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_mixed_d_asin", altText: "Amazon", altUrl: "https://www.amazon.com/dp/B09H4KM229/ref=sspa_dk_detail_1?pd_rd_i=B09H4KM229&pd_rd_w=HOPqR&content-id=amzn1.sym.386c274b-4bfe-4421-9052-a1a56db557ab&pf_rd_p=386c274b-4bfe-4421-9052-a1a56db557ab&pf_rd_r=2CGT8D9H3110Z8H2SWG2&pd_rd_wg=Y0e6s&pd_rd_r=87286ac0-49ca-4d06-ab3d-e3dc03539d84&sp_csd=d2lkZ2V0TmFtZT1zcF9kZXRhaWxfdGhlbWF0aWM&th=1", qtyRule: fixed(1), unitCost: 17.94 },
  { tab: "Kitchen", area: "Kitchen", item: "Cookware", detail: "BBQ Tools", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B07B4349JM?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B07B4349JM&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 17.6 },
  { tab: "Kitchen", area: "Kitchen", item: "Cookware", detail: "Bottle opener", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B018W2ALAQ?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B018W2ALAQ&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 5.99 },
  { tab: "Kitchen", area: "Kitchen", item: "Cookware", detail: "Can opener", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B07YP2VH4B?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B07YP2VH4B&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 14.35 },
  { tab: "Kitchen", area: "Kitchen", item: "Cookware", detail: "Colander", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0BKRQQNPS?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0BKRQQNPS&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 13.99 },
  { tab: "Kitchen", area: "Kitchen", item: "Cookware", detail: "Cooking utensils", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B07G2M4WQ5?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B07G2M4WQ5&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 19.94 },
  { tab: "Kitchen", area: "Kitchen", item: "Cookware", detail: "Cutting board set", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0BYZRKRG7?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0BYZRKRG7&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 24.99 },
  { tab: "Kitchen", area: "Kitchen", item: "Cookware", detail: "Knife block", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B00R3Z46JQ?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B00R3Z46JQ&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 29.91 },
  { tab: "Kitchen", area: "Kitchen", item: "Cookware", detail: "Mixing bowls", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B07GY54Y5J?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B07GY54Y5J&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 14.99 },
  { tab: "Kitchen", area: "Kitchen", item: "Cookware", detail: "Paper towel holder", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B09DKH8XDS?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B09DKH8XDS&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 7.99 },
  { tab: "Kitchen", area: "Kitchen", item: "Cookware", detail: "Pot holders", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B08J8FKXJZ?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B08J8FKXJZ&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 7.69 },
  { tab: "Kitchen", area: "Kitchen", item: "Cookware", detail: "Utensil tray", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B08S7CPB3L?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B08S7CPB3L&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 27.54 },
  { tab: "Kitchen", area: "Kitchen", item: "Kettle", detail: "electric", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0BRT94C91?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0BRT94C91&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 44.95 },
  { tab: "Kitchen", area: "Kitchen", item: "Blender", detail: "min blender", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B00065L6CU?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B00065L6CU&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1), unitCost: 24.95 },
  { tab: "Kitchen", area: "Kitchen", item: "Tableware", detail: "cutlery set (qty should accommodate max occupancy)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B07ZVC6DMM?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B07ZVC6DMM&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(2), unitCost: 27.99 },
  { tab: "Kitchen", area: "Kitchen", item: "Tableware", detail: "glasses set (qty should accommodate max occupancy)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B00O8ZTWQQ?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B00O8ZTWQQ&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(2), unitCost: 27.37 },
  { tab: "Kitchen", area: "Kitchen", item: "Tableware", detail: "Mugs set (qty should accommodate max occupancy)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0B325KWHK?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0B325KWHK&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(2), unitCost: 15.99 },
  { tab: "Kitchen", area: "Kitchen", item: "Tableware", detail: "plates and bowls (qty should accommodate max occupancy)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B019EEUQ2O?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B019EEUQ2O&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(2), unitCost: 40.49 },
  { tab: "Kitchen", area: "Kitchen", item: "wine glasses", detail: "set of 12 tempered glass", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0BPHNLMJV?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0BPHNLMJV&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1), unitCost: 29.99 },
  { tab: "Kitchen", area: "Kitchen", item: "Brita", detail: "brita (if fridge has no water filter)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B09W4ZWCMP?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B09W4ZWCMP&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1) },
  { tab: "Kitchen", area: "Kitchen", item: "Ice maker", detail: "Ice maker (if fridge doesn't have ice maker)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0CNVL19YJ?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0CNVL19YJ&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1) },
  { tab: "Kitchen", area: "Kitchen", item: "Cookware", detail: "Pots and pans 12 piece", sourceText: "Costco", sourceUrl: "https://www.costco.com/kirkland-signature-12-piece-non-stick-cookware-set.product.100494015.html", altText: "Amazon", altUrl: "https://www.amazon.com/dp/B004KSN8XY?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B004KSN8XY&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1), unitCost: 129.99 },
  { tab: "Kitchen", area: "Kitchen", item: "Trash bin", detail: "Trash bin", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B00KG8L37U?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B00KG8L37U&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1), unitCost: 148.85 },
  { tab: "Kitchen", area: "Kitchen", item: "canister", detail: "to hold kcups", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B09SPCJ8PH/ref=sspa_dk_detail_0?pd_rd_i=B09SPCJ8PH&pd_rd_w=x3Yz5&content-id=amzn1.sym.8c2f9165-8e93-42a1-8313-73d3809141a2&pf_rd_p=8c2f9165-8e93-42a1-8313-73d3809141a2&pf_rd_r=1TX9KYY0JQTJS20H80T5&pd_rd_wg=CQrWs&pd_rd_r=901b52c5-afdf-4609-8958-95a3794b2416&sp_csd=d2lkZ2V0TmFtZT1zcF9kZXRhaWw&th=1", qtyRule: fixed(1), unitCost: 19.88 },
  { tab: "Kitchen", area: "Kitchen", item: "canister", detail: "to hold creamers", sourceText: "Target", sourceUrl: "https://www.target.com/p/medium-glass-bath-canister-brass-threshold-8482/-/A-87646690", qtyRule: fixed(1), unitCost: 15 },
  { tab: "Kitchen", area: "Kitchen", item: "Toaster", detail: "toaster", sourceText: "Target", sourceUrl: "https://www.target.com/p/hamilton-beach-2-slice-toaster-stainless-steel/-/A-52062134?ref=tgt_adv_xsf&AFID=google&CPNG=Appliances&adgroup=72-9&lnm=d30042528f072ba8a22b19c81250437cd47a2f30330f0ed03551c4efdaf3409e", qtyRule: fixed(1), unitCost: 19.99 },
  { tab: "Kitchen", area: "Kitchen", item: "kitchen towels", detail: "khaki pack of 6", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0CJ2KRQT3?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0CJ2KRQT3&asc_item-id=amzn1.ideas.2FKFMXY3VQ34X&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1), unitCost: 25.47 },
  // ── Common ──
  { tab: "Common", area: "Entryway", item: "frame", detail: "8x10 for guidebook QR code display", sourceText: "Walmart", sourceUrl: "https://www.walmart.com/ip/Better-Homes-Gardens-14x18-Matted-to-8x10-Metal-Gallery-Wall-Picture-Frame-Black/406730714?wmlspartner=wlpa&selectedSellerId=0&wl13=2291&adid=22222222277406730714_117755028669_12420145346&wmlspartner=wmtlabs&wl0=&wl1=g&wl2=c&wl3=501107745824&wl4=pla-306310554666&wl5=9061249&wl6=&wl7=&wl8=&wl9=pla&wl10=8175035&wl11=local&wl12=406730714&wl13=2291&veh=sem_LIA&gclsrc=aw.ds&&adid=22222222237406730714_117755028669_12420145346&wl0=&wl1=g&wl2=c&wl3=501107745824&wl4=pla-306310554666&wl5=9061249&wl6=&wl7=&wl8=&wl9=pla&wl10=8175035&wl11=local&wl12=406730714&veh=sem&gad_source=1&gclid=CjwKCAjw5v2wBhBrEiwAXDDoJYNADw3TQ2iZQjgRmSenPbuN9hS3w-qfc1eLjInXmSz08YUVOow3PRoCW-sQAvD_BwE", qtyRule: fixed(1), unitCost: 4.5 },
  { tab: "Common", area: "Living room", item: "board game", detail: "Monopoly deal", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B00NQQTZCO?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B00NQQTZCO&asc_item-id=amzn1.ideas.1YMXCHD3YLH3L&ref_=aip_sf_list_spv_ons_list_d_asin", qtyRule: fixed(1), unitCost: 6.89 },
  { tab: "Common", area: "Living room", item: "board game", detail: "Yahtzee", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B00TLEMRKM?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B00TLEMRKM&asc_item-id=amzn1.ideas.1YMXCHD3YLH3L&ref_=aip_sf_list_spv_ons_list_d_asin", qtyRule: fixed(1), unitCost: 8.84 },
  { tab: "Common", area: "Living room", item: "board game", detail: "Uno", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B07P6MZPK3?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B07P6MZPK3&asc_item-id=amzn1.ideas.1YMXCHD3YLH3L&ref_=aip_sf_list_spv_ons_list_d_asin", qtyRule: fixed(1), unitCost: 11.26 },
  { tab: "Common", area: "Living room", item: "Coffee table book", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/Minimalista-Step-Step-Better-Wardrobe/dp/1984859277/ref=pd_ybh_a_d_sccl_177/130-4210999-8395331?pd_rd_w=0VlR1&content-id=amzn1.sym.67f8cf21-ade4-4299-b433-69e404eeecf1&pf_rd_p=67f8cf21-ade4-4299-b433-69e404eeecf1&pf_rd_r=7CJ2PN7RCBKX7V5N9ZXA&pd_rd_wg=1ci48&pd_rd_r=51af25e2-71d4-4be5-b9d9-be96ba3c02dd&pd_rd_i=1984859277&psc=1", qtyRule: fixed(1), unitCost: 19 },
  { tab: "Common", area: "Living room", item: "board game", detail: "Codenames", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B014Q1XX9S?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B014Q1XX9S&asc_item-id=amzn1.ideas.1YMXCHD3YLH3L&ref_=aip_sf_list_spv_ons_list_d_asin", qtyRule: fixed(1), unitCost: 19.94 },
  { tab: "Common", area: "Living room", item: "Coffee table book", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/Call-Home-Details-That-Matter/dp/0593235525/ref=pd_ybh_a_d_sccl_176/130-4210999-8395331?pd_rd_w=0VlR1&content-id=amzn1.sym.67f8cf21-ade4-4299-b433-69e404eeecf1&pf_rd_p=67f8cf21-ade4-4299-b433-69e404eeecf1&pf_rd_r=7CJ2PN7RCBKX7V5N9ZXA&pd_rd_wg=1ci48&pd_rd_r=51af25e2-71d4-4be5-b9d9-be96ba3c02dd&pd_rd_i=0593235525&psc=1", qtyRule: fixed(1), unitCost: 21.98 },
  // ── Consumables and Other ──
  { tab: "Consumables and Other", area: "Install Items", item: "Cable wall plate (1 set per tv)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B071X8RLJL?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B071X8RLJL&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: perTv(1), unitCost: 6.64 },
  { tab: "Consumables and Other", area: "Consumables", item: "Dryer sheets", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B003FULBQ4?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B003FULBQ4&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 7.99 },
  { tab: "Consumables and Other", area: "Install Items", item: "surge protector (1 per tv)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B00TP1C1UC?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B00TP1C1UC&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: perTv(1), unitCost: 8.35 },
  { tab: "Consumables and Other", area: "Install Items", item: "extension cord 9ft (1 per bedroom)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0B96T2817?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0B96T2817&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: perBedroom(1), unitCost: 8.99 },
  { tab: "Consumables and Other", area: "Safety", item: "Flashlights 2 pack", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B073VZZKK5?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B073VZZKK5&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ", qtyRule: fixed(1), unitCost: 8.99 },
  { tab: "Consumables and Other", area: "Consumables", item: "Oil", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B000VCFZRU?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B000VCFZRU&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_mixed_d_asin", altText: "Amazon", altUrl: "http://amazon.com/Amazon-Grocery-Vegetable-Previously-Packaging/dp/B07MK2XKKV/ref=pd_ci_mcx_pspc_dp_2_t_1?pd_rd_w=xMU37&content-id=amzn1.sym.6f456dc5-a498-43db-bac0-ac08e93d86a8%3Aamzn1.symc.0c860dae-4d5b-448f-86ff-ff4a635376f2&pf_rd_p=6f456dc5-a498-43db-bac0-ac08e93d86a8&pf_rd_r=JBMHZ5KZAJH1623Y2KQF&pd_rd_wg=h5GlP&pd_rd_r=51848a29-5c85-4131-bb3d-4124cb2b6572&pd_rd_i=B07MK2XKKV", qtyRule: fixed(1), unitCost: 9.37 },
  { tab: "Consumables and Other", area: "Safety", item: "First Aid kit", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B08127GKPR?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B08127GKPR&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ", qtyRule: fixed(1), unitCost: 9.69 },
  { tab: "Consumables and Other", area: "Install Items", item: "Batteries AAA - 20 pack", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B00LH3DMUO?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B00LH3DMUO&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1), unitCost: 9.72 },
  { tab: "Consumables and Other", area: "Photography staging", item: "Smore's kit", sourceText: "Target", sourceUrl: "https://www.target.com/p/hershey-39-s-s-39-mores-3-ingredient-kit-box-14oz/-/A-93246365", qtyRule: fixed(1), unitCost: 9.99 },
  { tab: "Consumables and Other", area: "Consumables", item: "Spices", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/McCormick-Pepper-Grinders-Himalayan-Peppercorn/dp/B07BQ4KKLR/ref=sr_1_15_sspa?dib=eyJ2IjoiMSJ9.DPKih0lsQ37l2AI0gmkQZtGf2KBnkJ6XKNLv6ejirP78gX5khF0X9EaXllThU9JL7rEnujhT7bD4lQrFOq7OxiqStZx5cYYRBXsw9wQstx6vL2nM4SjA-FTaaOXrm7eQ4C76Li1ecmrodAnD9WvfCjYG0OfVp1pWBcPDbAX8-DA44ep5V4kWhWPBZA-ojcP8jpaH-RVwnrzSKJ9jAdyNie3tXrOGDP81tTcO5TUQathE412CcgzynsANy32SvS-P8a1qQua411mOg19qi1_TeOEIhXQieT8vvjzaH4hjzyE.P4Qq9akGMdlKkePjh656onlCbJ-XlMbm-c119revKds&dib_tag=se&keywords=spices&qid=1767632297&sr=8-15-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9tdGY&psc=1", qtyRule: fixed(1), unitCost: 11.46 },
  { tab: "Consumables and Other", area: "Install Items", item: "Emergency lockbox", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0BL757Z3Y?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0BL757Z3Y&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1), unitCost: 11.98 },
  { tab: "Consumables and Other", area: "Install Items", item: "charging station (1 per bedroom)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B07V32PJ59?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B07V32PJ59&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: perBedroom(1), unitCost: 11.99 },
  { tab: "Consumables and Other", area: "Consumables", item: "Dish soap dispenser (use Teeco account)", sourceText: "Public Goods", sourceUrl: "https://www.publicgoods.com/products/dish-soap-pump", qtyRule: fixed(1), unitCost: 12.57 },
  { tab: "Consumables and Other", area: "Install Items", item: "Batteries AA - 20 pack", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B094D541XW?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B094D541XW&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1), unitCost: 12.74 },
  { tab: "Consumables and Other", area: "Safety", item: "Lighters 4 pack", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B00GUQWAS8?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B00GUQWAS8&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ", qtyRule: fixed(1), unitCost: 13.05 },
  { tab: "Consumables and Other", area: "Cleaning supplies", item: "Broom", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B08Z9ZLLVX?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B08Z9ZLLVX&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 13.12 },
  { tab: "Consumables and Other", area: "Install Items", item: "Supply closet lock mechanical", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0BRCCKB82?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0BRCCKB82&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1), unitCost: 13.57 },
  { tab: "Consumables and Other", area: "Consumables", item: "Dish soap refill (use Teeco account)", sourceText: "Public Goods", sourceUrl: "https://www.publicgoods.com/products/dish-soap-refill", qtyRule: fixed(1), unitCost: 13.97 },
  { tab: "Consumables and Other", area: "Consumables", item: "Dish pods", sourceText: "Costco", sourceUrl: "https://www.costco.com/kirkland-signature-platinum-performance-ultrashine-dishwasher-detergent-pacs%2c-115-count.product.100737171.html", altText: "Amazon", altUrl: "https://www.amazon.com/Cascade-Complete-ActionPacs-Dishwasher-Detergent/dp/B01NCJSM2T/ref=sr_1_4?c=ts&dib=eyJ2IjoiMSJ9.Vmznv6FFvrMnJqzO2AcRlmgJ5aUa2FUKOngTV_zbkPV92iWyA0ybQ6QswDpAsbpgy7nZsbUhrpuYpxLmWoaISme-8fKQ1B_aEs_c3T6P6UGFBMdMhQtodmjndhN0A4rFgjUlQm6R5v6tGVoubUQg3TmAJt0lIYOadz2X-kRmNKb49yXAkjkUZs-KpYRhJM5hWAmSy3sk99xJd16yn-9OjnVwRXYnNcOgy-b_ppNXtIakcKzeHmTSkOyXRd3zUBM1RdfeRXExpAnwYEb6mk6izC8h0sauHihUZNpyIkC7vqM.YT2vVijYfUISgwhA98tkZu7bx-5DXvaVT8ugiisj-f8&dib_tag=se&keywords=Dishwasher+Detergent&qid=1767632357&s=hpc&sr=1-4&ts_id=15693671", qtyRule: fixed(1), unitCost: 13.99 },
  { tab: "Consumables and Other", area: "Consumables", item: "Small trash bags (bathroom)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B08CXQTFT9?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B08CXQTFT9&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 14.48 },
  { tab: "Consumables and Other", area: "Consumables", item: "Creamer", sourceText: "Costco", sourceUrl: "https://www.costco.com/nestl%c3%a9-coffee-mate-liquid-creamer%2c-french-vanilla%2c-180-count.product.100449826.html", altText: "Amazon", altUrl: "https://www.amazon.com/dp/B00451U9Q0?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B00451U9Q0&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 14.99 },
  { tab: "Consumables and Other", area: "Consumables", item: "All purpose cleaner", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B09NWJC635?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B09NWJC635&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 15.21 },
  { tab: "Consumables and Other", area: "Consumables", item: "sponges", sourceText: "Costco", sourceUrl: "https://www.costco.com/scotch-brite-zero-scratch-sponge%2c-24-count.product.4000141369.html", altText: "Amazon", altUrl: "https://www.amazon.com/dp/B07DN72JPN?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B07DN72JPN&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1), unitCost: 18.49 },
  { tab: "Consumables and Other", area: "Install Items", item: "drawer liner (as needed)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B07773PQG7?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B07773PQG7&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1), unitCost: 19.79 },
  { tab: "Consumables and Other", area: "Cleaning supplies", item: "Swiffer", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B07YQDH1N1?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B07YQDH1N1&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 19.99 },
  { tab: "Consumables and Other", area: "Consumables", item: "Big trash bags (kitchen)", sourceText: "Costco", sourceUrl: "https://www.costco.com/kirkland-signature-flex-tech-13-gallon-scented-kitchen-trash-bags%2c-200-count.product.100520272.html", altText: "Amazon", altUrl: "https://www.amazon.com/dp/B09CD6Z7GB?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B09CD6Z7GB&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 19.99 },
  { tab: "Consumables and Other", area: "Cleaning supplies", item: "Iron", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B01NB05WI5?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B01NB05WI5&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 20.99 },
  { tab: "Consumables and Other", area: "Photography staging", item: "S'mores roasting sticks", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0C9T2RK2F?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0C9T2RK2F&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1), unitCost: 20.99 },
  { tab: "Consumables and Other", area: "Install Items", item: "Laundry pods container", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0CPP41XVL?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0CPP41XVL&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_mixed_d_asin", altText: "Amazon", altUrl: "https://www.amazon.com/dp/B0DCF52C2Q/ref=sspa_dk_detail_4?pd_rd_i=B0DCF52C2Q&pd_rd_w=Bs0I6&content-id=amzn1.sym.f2f1cf8f-cab4-44dc-82ba-0ca811fb90cc&pf_rd_p=f2f1cf8f-cab4-44dc-82ba-0ca811fb90cc&pf_rd_r=X6G9WAA731NF3DSVAY1M&pd_rd_wg=12mAO&pd_rd_r=ffcf984b-01a8-4e7c-b98a-f8b9b547ddf2&sp_csd=d2lkZ2V0TmFtZT1zcF9kZXRhaWxfdGhlbWF0aWM&th=1", qtyRule: fixed(1), unitCost: 21.99 },
  { tab: "Consumables and Other", area: "Install Items", item: "light bulbs pack of 8 soft white", sourceText: "Lowe's", sourceUrl: "https://www.lowes.com/pd/GE-Relax-60-Watt-EQ-A19-Soft-White-Dimmable-LED-Light-Bulb-8-Pack/1000444903", qtyRule: fixed(1), unitCost: 22.98 },
  { tab: "Consumables and Other", area: "Consumables", item: "Laundry detergent", sourceText: "Costco", sourceUrl: "https://www.costco.com/kirkland-signature-ultra-clean-he-laundry-detergent-pacs%2c-152-count.product.100307201.html", altText: "Amazon", altUrl: "https://www.amazon.com/dp/B09CLRVRRH?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B09CLRVRRH&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 23.49 },
  { tab: "Consumables and Other", area: "Consumables", item: "Paper towel", sourceText: "Costco", sourceUrl: "https://www.costco.com/kirkland-signature-paper-towels%2c-2-ply%2c-160-sheets%2c-12-count.product.100234271.html", altText: "Amazon", altUrl: "https://www.amazon.com/dp/B0CT67D4JH?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0CT67D4JH&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1), unitCost: 23.99 },
  { tab: "Consumables and Other", area: "Consumables", item: "Toilet paper ", sourceText: "Costco", sourceUrl: "https://www.costco.com/kirkland-signature-bath-tissue%2c-2-ply%2c-380-sheets%2c-30-rolls.product.100645583.html", altText: "Amazon", altUrl: "https://www.amazon.com/dp/B09NW8PNH8?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B09NW8PNH8&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1), unitCost: 24.99 },
  { tab: "Consumables and Other", area: "Safety", item: "Fire extingisher ", sourceText: "Lowe's", sourceUrl: "https://www.lowes.com/pd/First-Alert-Fire-Extinguisher-Rechargeable/3057083?cm_mmc=shp-_-c-_-prd-_-elc-_-ggl-_-LIA_ELC_205_Wiring-Devices-Cords-Fire-_-3057083-_-local-_-0-_-0&gclid=CjwKCAjw15eqBhBZEiwAbDomEtFO9RYJ5mdxwQN_-_0qf6za122bAkk4Ofgt7oIKLP14vdTdT-azORoCbBgQAvD_BwE&gclsrc=aw.ds", qtyRule: fixed(1), unitCost: 26.98 },
  { tab: "Consumables and Other", area: "Install Items", item: "laundry basket", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0882ZPRF7?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0882ZPRF7&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1), unitCost: 28.21 },
  { tab: "Consumables and Other", area: "Consumables", item: "Foil", sourceText: "Costco", sourceUrl: "https://www.costco.com/reynolds-wrap-aluminum-foil%2c-12%22-x-83.33-yd%2c-2-count.product.100343988.html", altText: "Amazon", altUrl: "https://www.amazon.com/dp/B0014D0T9E?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0014D0T9E&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 28.99 },
  { tab: "Consumables and Other", area: "Consumables", item: "Coffee", sourceText: "Costco", sourceUrl: "https://www.costco.com/starbucks-classic-roasts-variety-pack-k-cup-pod%2c-64-count.product.4000244852.html", altText: "Amazon", altUrl: "https://www.amazon.com/dp/B009GDBNF8?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B009GDBNF8&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 44.99 },
  { tab: "Consumables and Other", area: "Cleaning supplies", item: "Ironing Board - beige", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0C7FCQK85?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0C7FCQK85&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1), unitCost: 52.99 },
  { tab: "Consumables and Other", area: "Consumables", item: "Bath & Body essentials bundle (use Minoan)", sourceText: "Public Goods Wholesale", sourceUrl: "https://wholesale.publicgoods.com/products/bath-body-essentials-bundle", qtyRule: fixed(1), unitCost: 61.85 },
  { tab: "Consumables and Other", area: "Consumables", item: "Bath & body essentials refills (use Use Minoan)", sourceText: "Public Goods Wholesale", sourceUrl: "https://wholesale.publicgoods.com/products/bath-body-essentials-gallon-refill-bundle", qtyRule: fixed(1), unitCost: 77.12 },
  { tab: "Consumables and Other", area: "Consumables", item: "hot tub chemicals", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0B4PWYTYD?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0B4PWYTYD&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(1), unitCost: 87.39, outdoorOnly: true },
  { tab: "Consumables and Other", area: "Cleaning supplies", item: "Vacuum (cleaner prefers with cord)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B00C351GBC?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B00C351GBC&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_mixed_d_asin", altText: "Amazon", altUrl: "https://www.amazon.com/dp/B00JH98GR4?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B00JH98GR4&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 119.99 },
  { tab: "Consumables and Other", area: "Install Items", item: "organizers for supply closet (as needed)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B07WHLR87X?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B07WHLR87X&asc_item-id=amzn1.ideas.2YYZKORT5YSKJ&ref_=aip_sf_list_spv_ons_d_asin", qtyRule: fixed(null) },
  { tab: "Consumables and Other", area: "Install Items", item: "door hallway lever for front door (if needed)", sourceText: "Lowe's", sourceUrl: "https://www.lowes.com/pd/Kwikset-Signature-Series-Halifax-Matte-Black-Universal-Interior-Hall-Closet-Passage-Door-Handle/5004300989", qtyRule: fixed(1) },
  { tab: "Consumables and Other", area: "Install Items", item: "light switch lock (if it controls Ring camera)", sourceText: "Lowe's", sourceUrl: "https://www.lowes.com/pd/Style-Selections-1-Gang-Clear-Single-Switch-Guard-Wall-Plate/50426934?store=&cm_mmc=shp-_-c-_-prd-_-elc-_-ggl-_-PMAX_ELC_000_Priority_Item_Omni-_-50426934-_-online-_-0-_-0&gclsrc=aw.ds&gad_source=1&gad_campaignid=22871724451&gbraid=0AAAAAD2B2W8cdTl1vbRnv3nCnhEURbTWn&gclid=Cj0KCQjwvJHIBhCgARIsAEQnWlBSrXJaMGQZ5CBc04rPtPcr5QrgHho5bz1LyH2SfBeS005KvGHQyiwaAkAYEALw_wcB", qtyRule: fixed(null) },
  { tab: "Consumables and Other", area: "Install Items", item: "Minut device (purchased by Teeco only if Teeco is managing)", sourceText: "Minut", sourceUrl: "https://store.minut.com/", qtyRule: fixed(1) },
  { tab: "Consumables and Other", area: "Install Items", item: "StayFi device (purchased by client only if Teeco is managing)", sourceText: "StayFi", sourceUrl: "https://shop.stayfi.com/products/unifi-wifi-7-long-range-meshable-access-point", qtyRule: fixed(1) },
  { tab: "Consumables and Other", area: "Install Items", item: "carbon monoxide detector (if needed)", sourceText: "", qtyRule: fixed(null) },
  { tab: "Consumables and Other", area: "Local Items", item: "propane tank for grill and fire pit", sourceText: "", qtyRule: fixed(2), outdoorOnly: true },
  { tab: "Consumables and Other", area: "Local Items", item: "smoke detector (if needed)", sourceText: "", qtyRule: fixed(null) },
  { tab: "Consumables and Other", area: "Local Items", item: "Bottle of wine or beer (purchase local)", sourceText: "", qtyRule: fixed(null) },
  { tab: "Consumables and Other", area: "Local Items", item: "Dinner napkins or placemats (get set to match table occupancy)", sourceText: "", qtyRule: fixed(null) },
  { tab: "Consumables and Other", area: "Local Items", item: "Firewood bundle", sourceText: "", qtyRule: fixed(null) },
  // ── Exterior ──
  { tab: "Exterior", area: "Front porch", item: "welcome mat", sourceText: "Target", sourceUrl: "https://www.target.com/p/1-39-6-34-x2-39-6-34-so-happy-you-39-re-here-doormat-natural-threshold-8482/-/A-82253413?ref=tgt_adv_xsp&AFID=google&fndsrc=tgtao&DFA=71700000012735301&CPNG=PLA_Home%2BDecor%2BShopping_Local%7CHome%2BDecor_Ecomm_Home&adgroup=SC_Doormats&LID=700000001170770pgs&LNM=PRODUCT_GROUP&network=g&device=c&location=9061249&targetid=aud-468500407640:pla-1869860193992&ds_rl=1246978&ds_rl=1247068&gclid=CjwKCAjwgqejBhBAEiwAuWHioAzNSXARMo4GNp69viXnWnlEVQ5Oz4lYZgk7gMa4a0LLekHwlMkLfRoCccYQAvD_BwE&gclsrc=aw.ds", qtyRule: fixed(1), unitCost: 13 },
  { tab: "Exterior", area: "Front porch", item: "welcome rug", sourceText: "Target", sourceUrl: "https://www.target.com/p/2-39-x3-39-indoor-outdoor-woven-tapestry-rug-black-threshold-8482/-/A-85074426", qtyRule: fixed(1), unitCost: 15 },
  { tab: "Exterior", area: "Backyard", item: "string lights solar (as needed)", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B09YD5W7TB?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B09YD5W7TB&asc_item-id=amzn1.ideas.122NFO9FHVJBN&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(2), unitCost: 30.39, outdoorOnly: true },
  { tab: "Exterior", area: "Backyard", item: "grill cover", sourceText: "Lowe's", sourceUrl: "https://www.lowes.com/pd/Char-Broil-4-5-Burner-Grill-Cover-55-Grill-Cover-with-Handles/5013684963", qtyRule: fixed(1), unitCost: 50.98, outdoorOnly: true },
  { tab: "Exterior", area: "Backyard", item: "corn hole game", sourceText: "Amazon", sourceUrl: "https://www.amazon.com/dp/B0BN7JLMJZ?linkCode=ssc&tag=onamzteecoco-20&creativeASIN=B0BN7JLMJZ&asc_item-id=amzn1.ideas.122NFO9FHVJBN&ref_=aip_sf_list_spv_ons_mixed_d_asin", qtyRule: fixed(1), unitCost: 64.99, outdoorOnly: true },
  { tab: "Exterior", area: "Backyard", item: "covers for outdoor furniture as needed", sourceText: "", qtyRule: fixed(null), outdoorOnly: true },
  { tab: "Exterior", area: "Backyard", item: "Outdoor storage box (for towels)", sourceText: "", qtyRule: fixed(1), outdoorOnly: true },
  { tab: "Exterior", area: "Backyard", item: "Water hose (if needed for hot tub)", sourceText: "", qtyRule: fixed(null), outdoorOnly: true },
];

// ── Project counts ──

export interface ProvisioningCounts {
  /** Bed units — a bunk counts once. */
  bedUnits: number;
  /** Sleeping surfaces — a bunk/trundle counts twice. */
  sleepingSurfaces: number;
  bedrooms: number;
  bathrooms: number;
  tvs: number;
  hasOutdoor: boolean;
}

/** Bed types that carry two sleeping surfaces per unit. */
const DOUBLE_SURFACE_BEDS = new Set([
  "queen-over-queen-bunk",
  "twin-over-twin-bunk",
  "twin-over-full-bunk",
  "daybed-trundle",
]);

export function provisioningCounts(project: Project): ProvisioningCounts {
  let bedUnits = 0;
  let sleepingSurfaces = 0;
  for (const room of project.rooms) {
    for (const bed of room.selectedBedConfig?.beds ?? []) {
      bedUnits += bed.quantity;
      sleepingSurfaces += bed.quantity * (DOUBLE_SURFACE_BEDS.has(bed.type) ? 2 : 1);
    }
  }

  const bedroomRooms = project.rooms.filter(
    r => r.type === "bedroom" || r.type === "primary-bedroom"
  ).length;
  const bedrooms = bedroomRooms > 0 ? bedroomRooms : Math.max(1, project.property.bedrooms);

  if (bedUnits === 0) {
    bedUnits = bedrooms;
    sleepingSurfaces = bedrooms;
  }

  const bathroomRooms = project.rooms.filter(r => r.type === "bathroom").length;
  const bathrooms = bathroomRooms > 0 ? bathroomRooms : Math.max(1, project.property.bathrooms);

  const tvMarkers = (project.property.planMarkers ?? []).filter(m => m.type === "tv").length;
  const tvs = tvMarkers > 0 ? tvMarkers : 1 + bedrooms;

  const hasOutdoor = project.rooms.some(r => r.type === "outdoor");

  return { bedUnits, sleepingSurfaces, bedrooms, bathrooms, tvs, hasOutdoor };
}

// ── Row resolution ──

export interface ProvisioningRow {
  tab: ProvisioningTab;
  area: string;
  room?: string;
  item: string;
  detail?: string;
  sourceText: string;
  sourceUrl?: string;
  altText?: string;
  altUrl?: string;
  /** null → blank Quantity cell (reference leaves "as needed" rows blank). */
  quantity: number | null;
  unitCost?: number;
}

function resolveQuantity(rule: QtyRule, c: ProvisioningCounts): number | null {
  switch (rule.kind) {
    case "fixed": return rule.n;
    case "perBed": return rule.n * c.bedUnits;
    case "perBedSet": return rule.n * c.sleepingSurfaces;
    case "perBedroom": return rule.n * c.bedrooms;
    case "perBathroom": return rule.n * c.bathrooms;
    case "perTv": return rule.n * c.tvs;
  }
}

/**
 * Resolve the template against a project. Pure data — the masterlist exporter
 * turns these into sheet rows (and dedupes against designer-specced items).
 */
export function buildProvisioningRows(project: Project): ProvisioningRow[] {
  const counts = provisioningCounts(project);
  const rows: ProvisioningRow[] = [];
  for (const entry of STR_PROVISIONING_TEMPLATE) {
    if (entry.outdoorOnly && !counts.hasOutdoor) continue;
    const { qtyRule, outdoorOnly, ...rest } = entry;
    void outdoorOnly;
    rows.push({ ...rest, quantity: resolveQuantity(qtyRule, counts) });
  }
  return rows;
}
