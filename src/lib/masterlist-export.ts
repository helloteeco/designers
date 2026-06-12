/**
 * Teeco Masterlist .xlsx generator.
 *
 * Reproduces Jeff's production masterlist workbook exactly, verified against
 * the REAL Hiddenwoods reference (scripts/reference/hiddenwoods-items.json):
 *   Action Plan · Renovations · Common · Bedrooms · Kitchen · Baths ·
 *   Consumables and Other · Exterior · Budget Tally Sheet · Completed payments
 *
 * Parity notes (all mirrored from the reference workbook):
 *   - Common's first column header is `Room` (other line-item tabs: `Area`).
 *   - The T&S header is two lines: "T&S\nTax/Shipping" (wrapText).
 *   - Bedrooms taxonomy: Area = grouping (Bedding/Furniture/Decor/…),
 *     Room = "ALL" or a specific room name.
 *   - Source cells are hyperlinks ({text, hyperlink}) whenever a URL exists.
 *   - Row formula operand order is replicated PER TAB: Common Total =F{n}*H{n}
 *     (qty*cost) while other tabs use cost*qty; Exterior Final =I{n}+J{n}
 *     (total+T&S) while other tabs use T&S+total.
 *   - Freeze ySplit=1 on Common/Bedrooms/Kitchen/Baths/Consumables/Exterior;
 *     Renovations + Completed payments are NOT frozen in the real file, and
 *     Completed payments has no autofilter.
 *   - All coloring is direct cell fills — no conditional-formatting rules.
 *
 * Real masterlists are full STR provisioning lists, not just big furniture:
 * `includeProvisioning` (default TRUE) appends the mined provisioning blocks
 * from src/lib/str-provisioning.ts to the designer's furniture rows.
 *
 * This module is importable from Node (no top-level window/document access):
 * `buildMasterlistWorkbook` does the pure workbook construction, while
 * `downloadMasterlistXlsx` adds the browser download plumbing and reads the
 * studio T&S rate from settings.
 */

import type * as ExcelJS from "exceljs";
import type { FurnitureCategory, Project, Room, RoomType, SelectedFurniture } from "./types";
import { getStudioSettings } from "./studio-settings";
import { buildProvisioningRows, type ProvisioningRow } from "./str-provisioning";

// ── Constants ──

const MONEY_FMT = '"$"#,##0.00';

const HEADER_FILL = "FFE5E3DA"; // taupe
const ORDERED_FILL = "FFCCCCCC"; // grey — full-row highlight for Ordered items
const ACTION_PLAN_TITLE_FILL = "FF787060";
const WHITE_FILL = "FFFFFFFF";

/** Two-line T&S header, exactly as the reference stores it. */
const TS_HEADER = "T&S\nTax/Shipping";

/** Bedroom band tints, cycled for bedrooms 4+. */
const BEDROOM_BAND_FILLS = ["FFFCE5CD", "FFD9EAD3", "FFCFE2F3"]; // peach, green, blue

/** Legend swatch rows on the Action Plan sheet (verbatim from the reference). */
const LEGEND_ROWS: Array<{ argb: string; label: string; text: string }> = [
  { argb: "FFFFFF00", label: "yellow highlight", text: "smart tech + reno items for contractors to install" },
  { argb: "FF00FFFF", label: "blue highlight", text: "Long lead time items (>2 weeks delivery)" },
  { argb: "FFFF9900", label: "orange highlight", text: "purchase via Minoan" },
  { argb: "FF00FF00", label: "green highlight", text: "purchase via HostGPO" },
];

/** Vendor → inline supplier/discount hint shown in the Source column. */
const SOURCE_HINTS: Record<string, string> = {
  Wayfair: "Wayfair (Use Minoan 10%)",
  Article: "Article (Use Minoan 20%)",
  "West Elm": "West Elm (Use Minoan 15%)",
};

export interface ConsumableEntry {
  item: string;
  source: string;
  quantity: number;
}

/**
 * Legacy STR consumables starter list. Only used when provisioning is
 * explicitly disabled (`includeProvisioning: false`) — the default export now
 * writes the real reference-mined blocks from str-provisioning.ts instead.
 */
export const DEFAULT_CONSUMABLES: ConsumableEntry[] = [
  { item: "Toilet paper", source: "Costco", quantity: 2 },
  { item: "Paper towels", source: "Costco", quantity: 2 },
  { item: "Trash bags", source: "Costco", quantity: 2 },
  { item: "Hand soap", source: "Amazon", quantity: 4 },
  { item: "Dish soap", source: "Amazon", quantity: 2 },
  { item: "Sponges", source: "Amazon", quantity: 1 },
  { item: "Laundry detergent", source: "Costco", quantity: 1 },
  { item: "Dishwasher pods", source: "Costco", quantity: 1 },
  { item: "Light bulbs", source: "Amazon", quantity: 2 },
  { item: "AA/AAA batteries", source: "Costco", quantity: 1 },
  { item: "First aid kit", source: "Amazon", quantity: 1 },
  { item: "Fire extinguisher", source: "Amazon", quantity: 2 },
  { item: "Smoke/CO detector", source: "Amazon", quantity: 2 },
  { item: "Plunger & toilet brush", source: "Amazon", quantity: 2 },
  { item: "Vacuum", source: "Amazon", quantity: 1 },
  { item: "Broom & dustpan", source: "Amazon", quantity: 1 },
];

// ── Small helpers ──

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function titleCase(s: string): string {
  return s
    .split(" ")
    .map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** "beds-mattresses" → "Beds Mattresses" */
function prettify(s: string): string {
  return titleCase(s.replace(/-/g, " ").trim());
}

function sourceWithHint(vendor: string): string {
  return SOURCE_HINTS[vendor] ?? vendor;
}

/** Plain text, or {text, hyperlink} when a URL exists (reference behavior). */
type CellText = string | { text: string; hyperlink: string };

function linkOrText(text: string, url?: string): CellText {
  return url ? { text, hyperlink: url } : text;
}

/** Which line-item tab a room's furniture lands on. */
function tabForRoomType(t: RoomType): "Kitchen" | "Baths" | "Bedrooms" | "Exterior" | "Common" {
  if (t === "kitchen") return "Kitchen";
  if (t === "bathroom") return "Baths";
  if (t === "bedroom" || t === "primary-bedroom") return "Bedrooms";
  if (t === "outdoor") return "Exterior";
  return "Common";
}

/**
 * Bedrooms-tab Area grouping for a designer furniture row. The reference tab
 * groups rows under taxonomy areas (Bedding / Closets / Main / …); designer
 * picks map onto sensible groupings by category.
 */
function bedroomGrouping(category: FurnitureCategory, subcategory: string): string {
  if (subcategory === "bedding") return "Bedding";
  if (category === "lighting") return "Lighting";
  if (category === "rugs-textiles" || category === "decor") return "Decor";
  return "Furniture";
}

function furnitureStatusLabel(f: SelectedFurniture): string {
  return f.status === "ordered" || f.status === "delivered" ? "Ordered" : "";
}

function furnitureDetail(f: SelectedFurniture): string {
  return `${f.item.name}${f.item.color ? ` (${f.item.color})` : ""}`;
}

function furnitureItemLabel(f: SelectedFurniture): string {
  return prettify(f.item.subcategory || f.item.category);
}

function furnitureAlternative(f: SelectedFurniture): CellText {
  if (f.altItem) return linkOrText(`${f.altItem.name} — ${f.altItem.vendor}`, f.altItem.vendorUrl || undefined);
  const alt = f.alternatives?.[0];
  return alt ? linkOrText(`${alt.name} — ${alt.vendor}`, alt.url || undefined) : "";
}

// ── Line-item sheet machinery ──

interface LineRow {
  area: string;
  room?: string; // Bedrooms sheet only
  item: string;
  detail?: string; // absent on Consumables sheet
  source: CellText;
  alternative: CellText;
  quantity: number | null; // null → blank cell ("as needed" provisioning rows)
  status: string; // "Ordered" or ""
  cost: number | null; // null → blank cell (still money-formatted)
  bandFill?: string; // bedroom band tint
}

type SheetVariant = "standard" | "bedrooms" | "consumables";

interface SheetLayout {
  headers: string[];
  qtyCol: number;
  costCol: number;
  totalCol: number;
  tsCol: number;
  finalCol: number;
}

const LAYOUTS: Record<SheetVariant, SheetLayout> = {
  // A–K data, grand total L1
  standard: {
    headers: ["Area", "Item", "Detail", "Source", "Alternative", "Quantity", "Status", "Cost", "Total", TS_HEADER, "Final"],
    qtyCol: 6,
    costCol: 8,
    totalCol: 9,
    tsCol: 10,
    finalCol: 11,
  },
  // A–L data (Room inserted at B), grand total M1
  bedrooms: {
    headers: ["Area", "Room", "Item", "Detail", "Source", "Alternative", "Quantity", "Status", "Cost", "Total", TS_HEADER, "Final"],
    qtyCol: 7,
    costCol: 9,
    totalCol: 10,
    tsCol: 11,
    finalCol: 12,
  },
  // A–J data (no Detail), grand total K1
  consumables: {
    headers: ["Area", "Item", "Source", "Alternative", "Quantity", "Status", "Cost", "Total", TS_HEADER, "Final"],
    qtyCol: 5,
    costCol: 7,
    totalCol: 8,
    tsCol: 9,
    finalCol: 10,
  },
};

/** Per-tab quirks, copied from the reference workbook (the JSON is canon). */
interface TabConfig {
  variant: SheetVariant;
  /** Common's first header is `Room`; everything else `Area`. */
  firstHeader: "Area" | "Room";
  /** Renovations is NOT frozen in the real file. */
  frozen: boolean;
  /** Total formula operand order: true → qty*cost (Common's =F{n}*H{n} quirk). */
  totalQtyFirst: boolean;
  /** Final formula operand order: true → total+T&S (Exterior's =I{n}+J{n}). */
  finalTotalFirst: boolean;
  /** Explicit column widths (letter → width) — only the real file's. */
  widths: Record<string, number>;
}

const TAB_CONFIGS: Record<string, TabConfig> = {
  Renovations: {
    variant: "standard", firstHeader: "Area", frozen: false,
    totalQtyFirst: false, finalTotalFirst: false,
    widths: { A: 26.63, B: 26.63, C: 24.88, D: 23.88 },
  },
  Common: {
    variant: "standard", firstHeader: "Room", frozen: true,
    totalQtyFirst: true, finalTotalFirst: false,
    widths: { A: 33, B: 16.38, C: 29.38, D: 22, E: 21.38 },
  },
  Bedrooms: {
    variant: "bedrooms", firstHeader: "Area", frozen: true,
    totalQtyFirst: false, finalTotalFirst: false,
    widths: { A: 28.5, B: 30.88, C: 50.75, D: 27.25, E: 22, F: 19 },
  },
  Kitchen: {
    variant: "standard", firstHeader: "Area", frozen: true,
    totalQtyFirst: false, finalTotalFirst: false,
    widths: { B: 17.88, C: 51.63, D: 20.63, E: 18.25 },
  },
  Baths: {
    variant: "standard", firstHeader: "Area", frozen: true,
    totalQtyFirst: false, finalTotalFirst: false,
    widths: { B: 35.38, C: 32.38, D: 18.5 },
  },
  "Consumables and Other": {
    variant: "consumables", firstHeader: "Area", frozen: true,
    totalQtyFirst: false, finalTotalFirst: false,
    widths: { A: 29.25, B: 56.25, C: 19.88 },
  },
  Exterior: {
    variant: "standard", firstHeader: "Area", frozen: true,
    totalQtyFirst: false, finalTotalFirst: true,
    widths: { A: 32.75, B: 31.25, C: 19.13, D: 16.75, J: 18.5 },
  },
};

function writeLineItemSheet(ws: ExcelJS.Worksheet, rows: LineRow[], rate: number): void {
  const config = TAB_CONFIGS[ws.name];
  const layout = LAYOUTS[config.variant];
  const lastDataCol = layout.headers.length;

  // Header row: bold, size 10, taupe fill, height 22.5, centered.
  // The T&S header carries a literal newline → wrapText.
  const headerRow = ws.getRow(1);
  headerRow.height = 22.5;
  layout.headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = i === 0 ? config.firstHeader : h;
    cell.font = { bold: true, size: 10 };
    cell.fill = solidFill(HEADER_FILL);
    cell.alignment =
      h === TS_HEADER
        ? { horizontal: "center", vertical: "middle", wrapText: true }
        : { horizontal: "center", vertical: "middle" };
  });

  // Grand total in the column just right of the data range, row 1
  const finalLetter = colLetter(layout.finalCol);
  const grandCell = headerRow.getCell(lastDataCol + 1);
  grandCell.value = { formula: `SUM(${finalLetter}:${finalLetter})` } as ExcelJS.CellFormulaValue;
  grandCell.font = { bold: true, size: 10 };
  grandCell.numFmt = MONEY_FMT;
  grandCell.alignment = { horizontal: "center", vertical: "middle" };

  // Freeze A2 — except Renovations, which the real file leaves unfrozen.
  if (config.frozen) {
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  // Column widths: only the explicit ones the real file carries.
  for (const [letter, width] of Object.entries(config.widths)) {
    ws.getColumn(letter).width = width;
  }

  const qtyLetter = colLetter(layout.qtyCol);
  const costLetter = colLetter(layout.costCol);
  const totalLetter = colLetter(layout.totalCol);
  const tsLetter = colLetter(layout.tsCol);

  rows.forEach((r, i) => {
    const n = i + 2;
    const row = ws.getRow(n);

    const text = (c: number, v: CellText): void => {
      row.getCell(c).value = v as ExcelJS.CellValue;
    };

    if (config.variant === "bedrooms") {
      text(1, r.area);
      text(2, r.room ?? "");
      text(3, r.item);
      text(4, r.detail ?? "");
      text(5, r.source);
      text(6, r.alternative);
    } else if (config.variant === "consumables") {
      text(1, r.area);
      text(2, r.item);
      text(3, r.source);
      text(4, r.alternative);
    } else {
      text(1, r.area);
      text(2, r.item);
      text(3, r.detail ?? "");
      text(4, r.source);
      text(5, r.alternative);
    }

    if (r.quantity !== null) row.getCell(layout.qtyCol).value = r.quantity; // numFmt General
    row.getCell(layout.qtyCol + 1).value = r.status; // Status sits right of Quantity

    const costCell = row.getCell(layout.costCol);
    if (r.cost !== null) costCell.value = r.cost;
    costCell.numFmt = MONEY_FMT;

    // Operand order is replicated per tab (Common qty*cost; others cost*qty).
    const totalFormula = config.totalQtyFirst
      ? `${qtyLetter}${n}*${costLetter}${n}`
      : `${costLetter}${n}*${qtyLetter}${n}`;
    const totalCell = row.getCell(layout.totalCol);
    totalCell.value = { formula: totalFormula } as ExcelJS.CellFormulaValue;
    totalCell.numFmt = MONEY_FMT;

    const tsCell = row.getCell(layout.tsCol);
    tsCell.value = { formula: `${totalLetter}${n}*${rate}/100` } as ExcelJS.CellFormulaValue;
    tsCell.numFmt = MONEY_FMT;

    // Final operand order is per tab too (Exterior total+T&S; others T&S+total).
    const finalFormula = config.finalTotalFirst
      ? `${totalLetter}${n}+${tsLetter}${n}`
      : `${tsLetter}${n}+${totalLetter}${n}`;
    const finalCell = row.getCell(layout.finalCol);
    finalCell.value = { formula: finalFormula } as ExcelJS.CellFormulaValue;
    finalCell.numFmt = MONEY_FMT;

    // Direct cell fills only. Ordered grey overrides the bedroom band tint.
    const fill = r.status === "Ordered" ? ORDERED_FILL : r.bandFill;
    if (fill) {
      for (let c = 1; c <= lastDataCol; c++) {
        row.getCell(c).fill = solidFill(fill);
      }
    }
  });

  // Auto-filter over the full used range (header through last data row)
  const lastDataRow = rows.length + 1;
  ws.autoFilter = `A1:${colLetter(lastDataCol)}${lastDataRow}`;
}

// ── Row builders ──

type FurnitureTab = "Common" | "Bedrooms" | "Kitchen" | "Baths" | "Exterior";

function buildFurnitureRows(project: Project): Record<FurnitureTab, LineRow[]> {
  const out: Record<FurnitureTab, LineRow[]> = {
    Common: [],
    Bedrooms: [],
    Kitchen: [],
    Baths: [],
    Exterior: [],
  };

  let bedroomIndex = -1;
  for (const room of project.rooms) {
    const tab = tabForRoomType(room.type);
    if (tab === "Bedrooms") bedroomIndex += 1;
    const bandFill = tab === "Bedrooms" ? BEDROOM_BAND_FILLS[bedroomIndex % BEDROOM_BAND_FILLS.length] : undefined;

    for (const f of room.furniture) {
      out[tab].push({
        // Bedrooms taxonomy: Area = grouping, Room = the bedroom's name.
        area: tab === "Bedrooms" ? bedroomGrouping(f.item.category, f.item.subcategory) : room.name,
        room: tab === "Bedrooms" ? room.name : undefined,
        item: furnitureItemLabel(f),
        detail: furnitureDetail(f),
        source: linkOrText(sourceWithHint(f.item.vendor), f.item.vendorUrl || undefined),
        alternative: furnitureAlternative(f),
        quantity: f.quantity,
        status: furnitureStatusLabel(f),
        cost: f.item.price,
        bandFill,
      });
    }
  }
  return out;
}

function buildRenovationRows(project: Project): LineRow[] {
  const roomName = (roomId: string): string =>
    project.rooms.find((r: Room) => r.id === roomId)?.name ?? "";

  const rows: LineRow[] = [];

  for (const fin of project.finishes ?? []) {
    const extras = [fin.item.finish, fin.item.color].filter(Boolean).join(", ");
    rows.push({
      area: roomName(fin.roomId),
      item: prettify(fin.item.category),
      detail: extras ? `${fin.item.name} (${extras})` : fin.item.name,
      source: linkOrText(sourceWithHint(fin.item.vendor), fin.item.vendorUrl || undefined),
      alternative: "",
      quantity: fin.quantity,
      status:
        fin.status === "ordered" || fin.status === "delivered" || fin.status === "installed"
          ? "Ordered"
          : "",
      cost: fin.item.price,
    });
  }

  for (const s of project.scope ?? []) {
    rows.push({
      area: roomName(s.roomId),
      item: prettify(s.trade),
      detail: s.description,
      source: "",
      alternative: "",
      quantity: 1,
      status: "",
      cost: s.materialCost + s.laborCost,
    });
  }

  return rows;
}

/** Legacy consumables rows — only when includeProvisioning is false. */
function buildLegacyConsumableRows(): LineRow[] {
  return DEFAULT_CONSUMABLES.map(c => ({
    area: "Consumables",
    item: c.item,
    source: sourceWithHint(c.source),
    alternative: "",
    quantity: c.quantity,
    status: "",
    cost: null, // no invented prices — formulas still written
  }));
}

function provisioningToLineRow(p: ProvisioningRow): LineRow {
  return {
    area: p.area,
    room: p.room,
    item: p.item,
    detail: p.detail,
    source: linkOrText(p.sourceText, p.sourceUrl),
    alternative: p.altText || p.altUrl ? linkOrText(p.altText ?? "", p.altUrl) : "",
    quantity: p.quantity,
    status: "",
    cost: p.unitCost ?? null,
  };
}

// ── Action Plan ──

function writeActionPlanSheet(ws: ExcelJS.Worksheet, project: Project): void {
  // Exact reference widths.
  ws.getColumn(1).width = 31.13;
  ws.getColumn(2).width = 65.75;

  const p = project.property;
  const cityState = [p.city, p.state].filter(Boolean).join(", ");
  // Reference format: "2 Hiddenwoods Ct. Columbus, GA" — period after street.
  const addressLine = [p.address, cityState].filter(Boolean).join(". ");

  ws.mergeCells("A1:B1");
  const a1 = ws.getCell("A1");
  a1.value = addressLine;
  a1.fill = solidFill(ACTION_PLAN_TITLE_FILL);
  a1.font = { bold: true, color: { argb: "FFFFFFFF" } };
  a1.alignment = { horizontal: "center", vertical: "middle" };

  const occupancyFromBeds = project.rooms.reduce(
    (sum, r) => sum + (r.selectedBedConfig?.totalSleeps ?? 0),
    0
  );
  const occupancy = occupancyFromBeds > 0 ? occupancyFromBeds : project.targetGuests;
  ws.mergeCells("A2:B2");
  const a2 = ws.getCell("A2");
  a2.value = `${p.squareFootage} Sq Ft. - Occupancy ${occupancy}`;
  a2.fill = solidFill(HEADER_FILL);
  a2.alignment = { horizontal: "center" };

  // Row 3: white spacer band (the reference paints A3:Z3 white).
  const spacer = ws.getRow(3);
  for (let c = 1; c <= 26; c++) {
    spacer.getCell(c).fill = solidFill(WHITE_FILL);
  }

  const taupe = (rowNum: number, cols: number): void => {
    const row = ws.getRow(rowNum);
    for (let c = 1; c <= cols; c++) row.getCell(c).fill = solidFill(HEADER_FILL);
  };

  // Items to Address (rows 4–5, taupe A:B)
  taupe(4, 2);
  const r4 = ws.getRow(4);
  r4.getCell(1).value = "Items to Address";
  r4.getCell(1).font = { bold: true };

  taupe(5, 2);
  const r5 = ws.getRow(5);
  r5.getCell(1).value = "Query";
  r5.getCell(2).value = "Solution";
  r5.getCell(1).font = { bold: true };
  r5.getCell(2).font = { bold: true };
  // rows 6–10 left blank for the designer

  // Schedule (rows 11–12, taupe spanning A:E)
  taupe(11, 5);
  const r11 = ws.getRow(11);
  r11.getCell(1).value = "Schedule";
  r11.getCell(1).font = { bold: true };

  taupe(12, 5);
  const r12 = ws.getRow(12);
  // "Action " carries a trailing space in the reference — kept verbatim.
  ["Action ", "Task Master/Vendor", "Contact Info", "Start Date", "End Date"].forEach((h, i) => {
    r12.getCell(i + 1).value = h;
    r12.getCell(i + 1).font = { bold: true };
  });
  // rows 13–26 left blank for the designer

  // Legend (row 27 label + swatch rows 28–31)
  taupe(27, 2);
  const r27 = ws.getRow(27);
  r27.getCell(1).value = "Legend:";
  r27.getCell(1).font = { bold: true };

  LEGEND_ROWS.forEach((legend, i) => {
    const row = ws.getRow(28 + i);
    row.getCell(1).value = legend.label;
    row.getCell(1).fill = solidFill(legend.argb);
    row.getCell(2).value = legend.text;
  });
}

// ── Budget Tally Sheet ──

function writeBudgetTallySheet(ws: ExcelJS.Worksheet): void {
  // Exact reference widths (E has an explicit width despite holding no data).
  ws.getColumn(1).width = 31.63;
  ws.getColumn(2).width = 27.75;
  ws.getColumn(3).width = 17.38;
  ws.getColumn(5).width = 18.13;

  // Header: bold + taupe on A1:C1 only (no oversized row in the real file).
  const headerRow = ws.getRow(1);
  ["Area", "Total", "Notes"].forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = solidFill(HEADER_FILL);
  });

  const entries: Array<{ row: number; label: string; formula: string; bold?: boolean }> = [
    { row: 2, label: "Exterior", formula: "Exterior!L1" },
    { row: 3, label: "Common", formula: "Common!L1" },
    { row: 4, label: "Kitchen", formula: "Kitchen!L1" },
    { row: 5, label: "Bedrooms", formula: "Bedrooms!M1" },
    { row: 6, label: "Baths", formula: "Baths!L1" },
    // Verbatim reference quirk: singular "Consumable and other".
    { row: 7, label: "Consumable and other", formula: "'Consumables and Other'!K1" },
    { row: 8, label: "Furnishing Total", formula: "SUM(B2:B7)", bold: true },
    { row: 10, label: "Renovation Items", formula: "Renovations!L1" },
    { row: 12, label: "Grand Total", formula: "SUM(B8+B10)", bold: true },
  ];

  for (const e of entries) {
    const row = ws.getRow(e.row);
    row.getCell(1).value = e.label;
    const b = row.getCell(2);
    b.value = { formula: e.formula } as ExcelJS.CellFormulaValue;
    b.numFmt = MONEY_FMT;
    if (e.bold) {
      row.getCell(1).font = { bold: true };
      b.font = { bold: true };
    }
  }
}

// ── Completed payments ──

function writeCompletedPaymentsSheet(ws: ExcelJS.Worksheet): void {
  const headerRow = ws.getRow(1);
  ["Date", "Source", "Total", "Receipt"].forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10 };
    cell.fill = solidFill(HEADER_FILL);
  });

  const e1 = headerRow.getCell(5);
  e1.value = "Grand total:";
  e1.font = { bold: true, size: 10 };

  const f1 = headerRow.getCell(6);
  f1.value = { formula: "SUM(C:C)" } as ExcelJS.CellFormulaValue;
  f1.font = { size: 10 };
  f1.numFmt = MONEY_FMT;

  const h1 = headerRow.getCell(8);
  h1.value = "*Ordering notes";
  h1.font = { italic: true, size: 10 };

  // The real file has NO freeze and NO autofilter on this tab, and the only
  // explicit column width is B.
  ws.getColumn(2).width = 18.38;
  ws.getColumn(3).numFmt = MONEY_FMT;
}

// ── Public API ──

/**
 * Build the full Teeco masterlist workbook. Pure — safe to call from Node
 * scripts (no window/document access).
 *
 * `includeProvisioning` (default true) appends the STR provisioning blocks
 * (bedding, bath kit, kitchen kit, install/safety/consumables, porch items,
 * games/frames) to the designer's furniture rows. Provisioning rows whose
 * item name matches an already-specced furniture item on the same tab
 * (case-insensitive) are skipped.
 */
export async function buildMasterlistWorkbook(
  project: Project,
  opts?: { taxShippingRatePercent?: number; includeProvisioning?: boolean }
): Promise<ExcelJS.Workbook> {
  const ExcelJSRuntime = (await import("exceljs")).default;
  const rate = opts?.taxShippingRatePercent ?? 7;
  const includeProvisioning = opts?.includeProvisioning ?? true;

  const wb = new ExcelJSRuntime.Workbook();
  wb.creator = "Teeco Design Studio";
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  // Active sheet on open = Action Plan (tab 0)
  wb.views = [
    { x: 0, y: 0, width: 20000, height: 20000, firstSheet: 0, activeTab: 0, visibility: "visible" },
  ];

  const furnitureRows = buildFurnitureRows(project);
  let consumableRows: LineRow[] = includeProvisioning ? [] : buildLegacyConsumableRows();

  if (includeProvisioning) {
    // Names of designer-specced items per tab — a provisioning row is skipped
    // when an identically-named furniture item already exists on that tab.
    const existingNames: Record<string, Set<string>> = {};
    for (const room of project.rooms) {
      const tab = tabForRoomType(room.type);
      const set = (existingNames[tab] ??= new Set<string>());
      for (const f of room.furniture) {
        set.add(f.item.name.trim().toLowerCase());
      }
    }

    for (const p of buildProvisioningRows(project)) {
      if (existingNames[p.tab]?.has(p.item.trim().toLowerCase())) continue;
      const row = provisioningToLineRow(p);
      if (p.tab === "Consumables and Other") consumableRows.push(row);
      else furnitureRows[p.tab].push(row);
    }
  }

  // Tabs in exact order — Action Plan first.
  const actionPlan = wb.addWorksheet("Action Plan");
  writeActionPlanSheet(actionPlan, project);

  writeLineItemSheet(wb.addWorksheet("Renovations"), buildRenovationRows(project), rate);
  writeLineItemSheet(wb.addWorksheet("Common"), furnitureRows.Common, rate);
  writeLineItemSheet(wb.addWorksheet("Bedrooms"), furnitureRows.Bedrooms, rate);
  writeLineItemSheet(wb.addWorksheet("Kitchen"), furnitureRows.Kitchen, rate);
  writeLineItemSheet(wb.addWorksheet("Baths"), furnitureRows.Baths, rate);
  writeLineItemSheet(wb.addWorksheet("Consumables and Other"), consumableRows, rate);
  writeLineItemSheet(wb.addWorksheet("Exterior"), furnitureRows.Exterior, rate);

  writeBudgetTallySheet(wb.addWorksheet("Budget Tally Sheet"));
  writeCompletedPaymentsSheet(wb.addWorksheet("Completed payments"));

  return wb;
}

/**
 * Browser entry point: build the workbook (T&S rate from studio settings)
 * and trigger a download. Called from ExportPanel.
 */
export async function downloadMasterlistXlsx(project: Project): Promise<void> {
  const rate = getStudioSettings().taxShippingRatePercent;
  const wb = await buildMasterlistWorkbook(project, { taxShippingRatePercent: rate });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(project.name)}-masterlist.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
}

/**
 * Sum totals across all rooms, with optional filter by status.
 * Used by the page header to show "Approved: $X / Spec'd: $Y" subtotals.
 */
export function totalsByStatus(project: Project): {
  spec: number;
  approved: number;
  ordered: number;
  delivered: number;
  altPending: number;
  all: number;
} {
  const buckets = { spec: 0, approved: 0, ordered: 0, delivered: 0, altPending: 0, all: 0 };
  for (const room of project.rooms) {
    for (const f of room.furniture) {
      const cost = f.item.price * f.quantity;
      buckets.all += cost;
      switch (f.status) {
        case "approved": buckets.approved += cost; break;
        case "ordered": buckets.ordered += cost; break;
        case "delivered": buckets.delivered += cost; break;
        case "alt-pending": buckets.altPending += cost; break;
        case "specced":
        default: buckets.spec += cost;
      }
    }
  }
  return buckets;
}

/**
 * Filter helper used by the order tab + header tile when showing
 * "approved-only" cost. Anything past the approval threshold counts.
 */
export function isApproved(item: SelectedFurniture): boolean {
  return item.status === "approved" || item.status === "ordered" || item.status === "delivered";
}
