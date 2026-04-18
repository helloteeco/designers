import type { Project, Room, SelectedFurniture, FurnitureStatus } from "./types";

// Default tax + shipping rate (Teeco standard ~8% combined).
const TAX_SHIPPING_RATE = 0.08;

/**
 * Map a room type to one of Teeco's masterlist sheet names.
 * Matches the tab structure of Jeff's production Google Sheet:
 *   Action Plan · Renovations · Common · Bedrooms · Kitchen · Baths ·
 *   Consumables and Other · Exterior · Budget Tally Sheet
 */
function sheetForRoom(room: Room): string {
  const t = room.type;
  if (t === "primary-bedroom" || t === "bedroom" || t === "loft" || t === "bonus-room") return "Bedrooms";
  if (t === "kitchen") return "Kitchen";
  if (t === "bathroom") return "Baths";
  if (t === "outdoor") return "Exterior";
  return "Common";
}

/** ARGB fill colors for the Status column, matching the Teeco color key. */
function statusFill(status: FurnitureStatus | undefined): string | null {
  switch (status) {
    case "approved":
    case "ordered":
    case "delivered":
      return "FFD1FAE5"; // emerald-100
    case "alt-pending":
      return "FFFFE4B5"; // amber-100
    case "specced":
    default:
      return null;
  }
}

function statusLabel(status: FurnitureStatus | undefined): string {
  switch (status) {
    case "approved": return "Approved";
    case "ordered": return "Ordered";
    case "delivered": return "Delivered";
    case "alt-pending": return "Alt Pending";
    case "specced":
    default:
      return "Spec'd";
  }
}

interface Row {
  area: string;
  room: string;
  item: string;
  detail: string;
  source: string;
  altSource: string;
  qty: number;
  status: FurnitureStatus | undefined;
  cost: number;
  total: number;
  taxShip: number;
  final: number;
  link: string;
}

function buildRowsForSheet(project: Project, sheetName: string): Row[] {
  const out: Row[] = [];
  for (const room of project.rooms) {
    if (sheetForRoom(room) !== sheetName) continue;
    for (const f of room.furniture) {
      const cost = f.item.price;
      const total = cost * f.quantity;
      const taxShip = total * TAX_SHIPPING_RATE;
      out.push({
        area: sheetName,
        room: room.name,
        item: f.item.subcategory || f.item.category.replace(/-/g, " "),
        detail: `${f.item.name}${f.item.color ? ` (${f.item.color})` : ""}`,
        source: f.item.vendor,
        altSource: f.altItem?.vendor ? `${f.altItem.name} — ${f.altItem.vendor}` : "",
        qty: f.quantity,
        status: f.status,
        cost,
        total,
        taxShip,
        final: total + taxShip,
        link: f.item.vendorUrl,
      });
    }
  }
  return out;
}

/**
 * Export the project as a Teeco-format multi-sheet xlsx.
 * Sheets: Action Plan (placeholder) · Common · Bedrooms · Kitchen · Baths ·
 * Exterior · Budget Tally. Status column is colored per row.
 *
 * Loaded dynamically because exceljs is ~500 KB and only needed at export time.
 */
export async function downloadMasterlistXlsx(project: Project): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Teeco Design Studio";
  wb.created = new Date();

  // Action Plan — top-of-file checklist for the designer/client
  const ap = wb.addWorksheet("Action Plan");
  ap.columns = [
    { header: "Step", key: "step", width: 28 },
    { header: "Owner", key: "owner", width: 14 },
    { header: "Status", key: "status", width: 14 },
    { header: "Notes", key: "notes", width: 50 },
  ];
  styleHeader(ap);
  [
    { step: "Approve concept board", owner: "Client", status: "Pending" },
    { step: "Approve masterlist", owner: "Client", status: "Pending" },
    { step: "Order all furniture", owner: "Designer", status: "Pending" },
    { step: "Schedule install date", owner: "Designer", status: "Pending" },
    { step: "Final walkthrough", owner: "Both", status: "Pending" },
  ].forEach(r => ap.addRow(r));

  // Per-area sheets
  const sheetOrder = ["Common", "Bedrooms", "Kitchen", "Baths", "Exterior"];
  for (const sheetName of sheetOrder) {
    const rows = buildRowsForSheet(project, sheetName);
    if (rows.length === 0) continue;
    const ws = wb.addWorksheet(sheetName);
    ws.columns = [
      { header: "Room", key: "room", width: 18 },
      { header: "Item", key: "item", width: 18 },
      { header: "Detail", key: "detail", width: 30 },
      { header: "Source", key: "source", width: 16 },
      { header: "Alternative", key: "altSource", width: 24 },
      { header: "Qty", key: "qty", width: 6 },
      { header: "Status", key: "status", width: 12 },
      { header: "Cost", key: "cost", width: 10 },
      { header: "Total", key: "total", width: 10 },
      { header: "T&S", key: "taxShip", width: 10 },
      { header: "Final", key: "final", width: 10 },
      { header: "Link", key: "link", width: 40 },
    ];
    styleHeader(ws);

    for (const r of rows) {
      const row = ws.addRow({
        room: r.room,
        item: r.item,
        detail: r.detail,
        source: r.source,
        altSource: r.altSource,
        qty: r.qty,
        status: statusLabel(r.status),
        cost: r.cost,
        total: r.total,
        taxShip: r.taxShip,
        final: r.final,
        link: r.link,
      });
      // Color the Status cell per Teeco's convention
      const fill = statusFill(r.status);
      if (fill) {
        row.getCell("status").fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: fill },
        };
      }
      // Money columns formatted as $
      ["cost", "total", "taxShip", "final"].forEach(col => {
        row.getCell(col).numFmt = '"$"#,##0.00';
      });
    }

    // Subtotal row
    const subtotal = rows.reduce((s, r) => s + r.final, 0);
    const subRow = ws.addRow({
      room: "",
      item: "",
      detail: "",
      source: "",
      altSource: "",
      qty: rows.reduce((s, r) => s + r.qty, 0),
      status: "SUBTOTAL",
      cost: "",
      total: rows.reduce((s, r) => s + r.total, 0),
      taxShip: rows.reduce((s, r) => s + r.taxShip, 0),
      final: subtotal,
      link: "",
    });
    subRow.font = { bold: true };
    ["total", "taxShip", "final"].forEach(col => {
      subRow.getCell(col).numFmt = '"$"#,##0.00';
    });
  }

  // Budget Tally — per-area + grand total
  const bt = wb.addWorksheet("Budget Tally");
  bt.columns = [
    { header: "Area", key: "area", width: 18 },
    { header: "Items", key: "items", width: 8 },
    { header: "Subtotal", key: "subtotal", width: 14 },
    { header: "T&S", key: "taxShip", width: 14 },
    { header: "Approved Only", key: "approved", width: 16 },
    { header: "Final w/ T&S", key: "final", width: 16 },
  ];
  styleHeader(bt);
  let grandFinal = 0;
  let grandApproved = 0;
  for (const sheetName of sheetOrder) {
    const rows = buildRowsForSheet(project, sheetName);
    if (rows.length === 0) continue;
    const subtotal = rows.reduce((s, r) => s + r.total, 0);
    const taxShip = rows.reduce((s, r) => s + r.taxShip, 0);
    const final = subtotal + taxShip;
    const approved = rows
      .filter(r => r.status === "approved" || r.status === "ordered" || r.status === "delivered")
      .reduce((s, r) => s + r.final, 0);
    grandFinal += final;
    grandApproved += approved;
    const row = bt.addRow({
      area: sheetName,
      items: rows.length,
      subtotal,
      taxShip,
      approved,
      final,
    });
    ["subtotal", "taxShip", "approved", "final"].forEach(col => {
      row.getCell(col).numFmt = '"$"#,##0.00';
    });
  }
  bt.addRow({});
  const totalRow = bt.addRow({
    area: "GRAND TOTAL",
    items: project.rooms.reduce((s, r) => s + r.furniture.length, 0),
    subtotal: "",
    taxShip: "",
    approved: grandApproved,
    final: grandFinal,
  });
  totalRow.font = { bold: true };
  ["approved", "final"].forEach(col => {
    totalRow.getCell(col).numFmt = '"$"#,##0.00';
  });
  if (project.budget > 0) {
    const budgetRow = bt.addRow({
      area: "Budget",
      final: project.budget,
    });
    budgetRow.getCell("final").numFmt = '"$"#,##0.00';
    const overUnder = project.budget - grandFinal;
    const ouRow = bt.addRow({
      area: overUnder >= 0 ? "Under Budget" : "Over Budget",
      final: Math.abs(overUnder),
    });
    ouRow.font = { bold: true, color: { argb: overUnder >= 0 ? "FF065F46" : "FFB91C1C" } };
    ouRow.getCell("final").numFmt = '"$"#,##0.00';
  }

  // Trigger download
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(project.name)}-masterlist.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function styleHeader(ws: import("exceljs").Worksheet): void {
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F2937" }, // brand-900-ish
  };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };
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
