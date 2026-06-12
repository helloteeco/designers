/**
 * Teeco Masterlist .xlsx generator.
 *
 * Reproduces Jeff's production masterlist workbook exactly:
 *   Action Plan · Renovations · Common · Bedrooms · Kitchen · Baths ·
 *   Consumables and Other · Exterior · Budget Tally Sheet · Completed payments
 *
 * All 10 tabs are always created (even when empty of data rows). All coloring
 * is direct cell fills — no conditional-formatting rules. The only totals are
 * the header SUM cells (L1/M1/K1) — no subtotal rows in the body.
 *
 * This module is importable from Node (no top-level window/document access):
 * `buildMasterlistWorkbook` does the pure workbook construction, while
 * `downloadMasterlistXlsx` adds the browser download plumbing and reads the
 * studio T&S rate from settings.
 */

import type * as ExcelJS from "exceljs";
import type { Project, Room, RoomType, SelectedFurniture } from "./types";
import { getStudioSettings } from "./studio-settings";

// ── Constants ──

const MONEY_FMT = '"$"#,##0.00';

const HEADER_FILL = "FFE5E3DA"; // taupe
const ORDERED_FILL = "FFCCCCCC"; // grey — full-row highlight for Ordered items
const ACTION_PLAN_TITLE_FILL = "FF787060";

/** Bedroom band tints, cycled for bedrooms 4+. */
const BEDROOM_BAND_FILLS = ["FFFCE5CD", "FFD9EAD3", "FFCFE2F3"]; // peach, green, blue

/** Legend swatches on the Action Plan sheet. */
const LEGEND_ROWS: Array<{ argb: string; text: string }> = [
  { argb: "FFFFFF00", text: "Smart tech / renovation items for contractors" },
  { argb: "FF00FFFF", text: "Long lead time (>2 weeks) — order first" },
  { argb: "FFFF9900", text: "Purchase via Minoan" },
  { argb: "FF00FF00", text: "Purchase via HostGPO" },
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

/** Standard STR consumables starter list written into "Consumables and Other". */
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

/** Which line-item tab a room's furniture lands on. */
function tabForRoomType(t: RoomType): "Kitchen" | "Baths" | "Bedrooms" | "Exterior" | "Common" {
  if (t === "kitchen") return "Kitchen";
  if (t === "bathroom") return "Baths";
  if (t === "bedroom" || t === "primary-bedroom") return "Bedrooms";
  if (t === "outdoor") return "Exterior";
  return "Common";
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

function furnitureAlternative(f: SelectedFurniture): string {
  if (f.altItem) return `${f.altItem.name} — ${f.altItem.vendor}`;
  const alt = f.alternatives?.[0];
  return alt ? `${alt.name} — ${alt.vendor}` : "";
}

// ── Line-item sheet machinery ──

interface LineRow {
  area: string;
  room?: string; // Bedrooms sheet only
  item: string;
  detail?: string; // absent on Consumables sheet
  source: string;
  alternative: string;
  quantity: number;
  status: string; // "Ordered" or ""
  cost: number | null; // null → blank cell (consumables)
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
  widths: number[];
}

const LAYOUTS: Record<SheetVariant, SheetLayout> = {
  // A–K data, grand total L1
  standard: {
    headers: ["Area", "Item", "Detail", "Source", "Alternative", "Quantity", "Status", "Cost", "Total", "T&S", "Final"],
    qtyCol: 6,
    costCol: 8,
    totalCol: 9,
    tsCol: 10,
    finalCol: 11,
    widths: [16, 20, 34, 26, 30, 9, 10, 11, 11, 11, 11],
  },
  // A–L data (Room inserted at B), grand total M1
  bedrooms: {
    headers: ["Area", "Room", "Item", "Detail", "Source", "Alternative", "Quantity", "Status", "Cost", "Total", "T&S", "Final"],
    qtyCol: 7,
    costCol: 9,
    totalCol: 10,
    tsCol: 11,
    finalCol: 12,
    widths: [12, 12, 20, 34, 26, 30, 9, 10, 11, 11, 11, 11],
  },
  // A–J data (no Detail), grand total K1
  consumables: {
    headers: ["Area", "Item", "Source", "Alternative", "Quantity", "Status", "Cost", "Total", "T&S", "Final"],
    qtyCol: 5,
    costCol: 7,
    totalCol: 8,
    tsCol: 9,
    finalCol: 10,
    widths: [14, 24, 26, 30, 9, 10, 11, 11, 11, 11],
  },
};

function writeLineItemSheet(
  ws: ExcelJS.Worksheet,
  variant: SheetVariant,
  rows: LineRow[],
  rate: number
): void {
  const layout = LAYOUTS[variant];
  const lastDataCol = layout.headers.length;

  // Header row: bold, size 10, taupe fill, height 22.5
  const headerRow = ws.getRow(1);
  headerRow.height = 22.5;
  layout.headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10 };
    cell.fill = solidFill(HEADER_FILL);
  });

  // Grand total in the column just right of the data range, row 1
  const finalLetter = colLetter(layout.finalCol);
  const grandCell = headerRow.getCell(lastDataCol + 1);
  grandCell.value = { formula: `SUM(${finalLetter}:${finalLetter})` } as ExcelJS.CellFormulaValue;
  grandCell.font = { bold: true };
  grandCell.numFmt = MONEY_FMT;

  // Freeze A2
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Column widths (cosmetic)
  layout.widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  ws.getColumn(lastDataCol + 1).width = 13;

  const qtyLetter = colLetter(layout.qtyCol);
  const costLetter = colLetter(layout.costCol);
  const totalLetter = colLetter(layout.totalCol);
  const tsLetter = colLetter(layout.tsCol);
  // The production sheet writes the Total formula as cost*qty everywhere
  // EXCEPT the Common sheet, which has it flipped (qty*cost). Reproduce it.
  const flipTotalOperands = ws.name === "Common";

  rows.forEach((r, i) => {
    const n = i + 2;
    const row = ws.getRow(n);

    if (variant === "bedrooms") {
      row.getCell(1).value = r.area;
      row.getCell(2).value = r.room ?? "";
      row.getCell(3).value = r.item;
      row.getCell(4).value = r.detail ?? "";
      row.getCell(5).value = r.source;
      row.getCell(6).value = r.alternative;
    } else if (variant === "consumables") {
      row.getCell(1).value = r.area;
      row.getCell(2).value = r.item;
      row.getCell(3).value = r.source;
      row.getCell(4).value = r.alternative;
    } else {
      row.getCell(1).value = r.area;
      row.getCell(2).value = r.item;
      row.getCell(3).value = r.detail ?? "";
      row.getCell(4).value = r.source;
      row.getCell(5).value = r.alternative;
    }

    row.getCell(layout.qtyCol).value = r.quantity; // numFmt General (default)
    row.getCell(layout.qtyCol + 1).value = r.status; // Status sits right of Quantity

    const costCell = row.getCell(layout.costCol);
    if (r.cost !== null) costCell.value = r.cost;
    costCell.numFmt = MONEY_FMT;

    const totalFormula = flipTotalOperands
      ? `${qtyLetter}${n}*${costLetter}${n}`
      : `${costLetter}${n}*${qtyLetter}${n}`;
    const totalCell = row.getCell(layout.totalCol);
    totalCell.value = { formula: totalFormula } as ExcelJS.CellFormulaValue;
    totalCell.numFmt = MONEY_FMT;

    const tsCell = row.getCell(layout.tsCol);
    tsCell.value = { formula: `${totalLetter}${n}*${rate}/100` } as ExcelJS.CellFormulaValue;
    tsCell.numFmt = MONEY_FMT;

    const finalCell = row.getCell(layout.finalCol);
    finalCell.value = { formula: `${tsLetter}${n}+${totalLetter}${n}` } as ExcelJS.CellFormulaValue;
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

function buildFurnitureRows(project: Project): Record<"Common" | "Bedrooms" | "Kitchen" | "Baths" | "Exterior", LineRow[]> {
  const out: Record<"Common" | "Bedrooms" | "Kitchen" | "Baths" | "Exterior", LineRow[]> = {
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
        area: tab === "Bedrooms" ? "Bedroom" : room.name,
        room: tab === "Bedrooms" ? room.name : undefined,
        item: furnitureItemLabel(f),
        detail: furnitureDetail(f),
        source: sourceWithHint(f.item.vendor),
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
      source: sourceWithHint(fin.item.vendor),
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

function buildConsumableRows(): LineRow[] {
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

// ── Action Plan ──

function writeActionPlanSheet(ws: ExcelJS.Worksheet, project: Project): void {
  ws.getColumn(1).width = 31;
  ws.getColumn(2).width = 66;

  const p = project.property;
  const cityState = [p.city, p.state].filter(Boolean).join(", ");
  const addressLine = [p.address, cityState].filter(Boolean).join(", ");

  ws.mergeCells("A1:B1");
  const a1 = ws.getCell("A1");
  a1.value = addressLine;
  a1.fill = solidFill(ACTION_PLAN_TITLE_FILL);
  a1.font = { bold: true, color: { argb: "FFFFFFFF" } };

  const occupancyFromBeds = project.rooms.reduce(
    (sum, r) => sum + (r.selectedBedConfig?.totalSleeps ?? 0),
    0
  );
  const occupancy = occupancyFromBeds > 0 ? occupancyFromBeds : project.targetGuests;
  ws.mergeCells("A2:B2");
  ws.getCell("A2").value = `${p.squareFootage} Sq Ft. - Occupancy ${occupancy}`;

  const sectionLabel = (rowNum: number, label: string): void => {
    const row = ws.getRow(rowNum);
    row.getCell(1).value = label;
    row.getCell(1).fill = solidFill(HEADER_FILL);
    row.getCell(1).font = { bold: true };
    row.getCell(2).fill = solidFill(HEADER_FILL);
  };

  // Items to Address
  sectionLabel(4, "Items to Address");
  const itaHeader = ws.getRow(5);
  itaHeader.getCell(1).value = "Query";
  itaHeader.getCell(2).value = "Solution";
  itaHeader.font = { bold: true };
  // rows 6–11 left blank for the designer

  // Schedule
  sectionLabel(13, "Schedule");
  const schedHeader = ws.getRow(14);
  ["Action", "Task Master/Vendor", "Contact Info", "Start Date", "End Date"].forEach((h, i) => {
    schedHeader.getCell(i + 1).value = h;
  });
  schedHeader.font = { bold: true };
  // rows 15–22 left blank for the designer

  // Legend
  sectionLabel(24, "Legend");
  LEGEND_ROWS.forEach((legend, i) => {
    const row = ws.getRow(25 + i);
    row.getCell(1).fill = solidFill(legend.argb);
    row.getCell(2).value = legend.text;
  });
}

// ── Budget Tally Sheet ──

function writeBudgetTallySheet(ws: ExcelJS.Worksheet): void {
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 40;

  const headerRow = ws.getRow(1);
  headerRow.height = 22.5;
  ["Area", "Total", "Notes"].forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10 };
    cell.fill = solidFill(HEADER_FILL);
  });

  const entries: Array<{ row: number; label: string; formula: string; bold?: boolean }> = [
    { row: 2, label: "Exterior", formula: "Exterior!L1" },
    { row: 3, label: "Common", formula: "Common!L1" },
    { row: 4, label: "Kitchen", formula: "Kitchen!L1" },
    { row: 5, label: "Bedrooms", formula: "Bedrooms!M1" },
    { row: 6, label: "Baths", formula: "Baths!L1" },
    { row: 7, label: "Consumables and Other", formula: "'Consumables and Other'!K1" },
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
  headerRow.height = 22.5;
  ["Date", "Source", "Total", "Receipt"].forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10 };
    cell.fill = solidFill(HEADER_FILL);
  });

  const e1 = headerRow.getCell(5);
  e1.value = "Grand total:";
  e1.font = { bold: true };

  const f1 = headerRow.getCell(6);
  f1.value = { formula: "SUM(C:C)" } as ExcelJS.CellFormulaValue;
  f1.numFmt = MONEY_FMT;

  headerRow.getCell(8).value = "*Ordering notes";

  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = "A1:D1";

  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 13;
  ws.getColumn(3).numFmt = MONEY_FMT;
  ws.getColumn(4).width = 30;
  ws.getColumn(6).width = 13;
  ws.getColumn(8).width = 24;
}

// ── Public API ──

/**
 * Build the full Teeco masterlist workbook. Pure — safe to call from Node
 * scripts (no window/document access).
 */
export async function buildMasterlistWorkbook(
  project: Project,
  opts?: { taxShippingRatePercent?: number }
): Promise<ExcelJS.Workbook> {
  const ExcelJSRuntime = (await import("exceljs")).default;
  const rate = opts?.taxShippingRatePercent ?? 7;

  const wb = new ExcelJSRuntime.Workbook();
  wb.creator = "Teeco Design Studio";
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  // Active sheet on open = Action Plan (tab 0)
  wb.views = [
    { x: 0, y: 0, width: 20000, height: 20000, firstSheet: 0, activeTab: 0, visibility: "visible" },
  ];

  const furnitureRows = buildFurnitureRows(project);

  // Tabs in exact order — Action Plan first.
  const actionPlan = wb.addWorksheet("Action Plan");
  writeActionPlanSheet(actionPlan, project);

  writeLineItemSheet(wb.addWorksheet("Renovations"), "standard", buildRenovationRows(project), rate);
  writeLineItemSheet(wb.addWorksheet("Common"), "standard", furnitureRows.Common, rate);
  writeLineItemSheet(wb.addWorksheet("Bedrooms"), "bedrooms", furnitureRows.Bedrooms, rate);
  writeLineItemSheet(wb.addWorksheet("Kitchen"), "standard", furnitureRows.Kitchen, rate);
  writeLineItemSheet(wb.addWorksheet("Baths"), "standard", furnitureRows.Baths, rate);
  writeLineItemSheet(wb.addWorksheet("Consumables and Other"), "consumables", buildConsumableRows(), rate);
  writeLineItemSheet(wb.addWorksheet("Exterior"), "standard", furnitureRows.Exterior, rate);

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
