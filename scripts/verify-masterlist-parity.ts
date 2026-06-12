/**
 * Structural parity check: generated masterlist vs Teeco's REAL reference
 * workbook (scripts/reference/hiddenwoods-masterlist.xlsx, gitignored).
 *
 * Builds a workbook from DEMO_PROJECT and diffs STRUCTURE — not content —
 * against the real file:
 *   - tab names + order
 *   - per-tab header arrays (incl. the two-line T&S header)
 *   - views/freeze state, autofilter presence
 *   - header styling (taupe fill, bold, size 10, row height 22.5)
 *   - grand-total formula cells
 *   - row-formula patterns sampled from row 2 (operand order per tab!)
 *   - Action Plan layout rows/fills/legend texts
 *   - Budget Tally labels + formulas (incl. `Consumable and other`)
 *   - column widths within ±0.2
 *
 * If the reference workbook is absent (e.g. CI), it skips with a notice.
 *
 * Run: npm run verify:parity   (or: npx tsx scripts/verify-masterlist-parity.ts)
 */

import ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";
import { buildMasterlistWorkbook } from "../src/lib/masterlist-export";
import { DEMO_PROJECT } from "./fixtures/demo-project";

const REF_PATH = path.join(__dirname, "reference", "hiddenwoods-masterlist.xlsx");
const GEN_PATH = "/tmp/masterlist-parity.xlsx";
const RATE = 7; // the reference workbook uses a 7% T&S rate

const LINE_ITEM_TABS = ["Renovations", "Common", "Bedrooms", "Kitchen", "Baths", "Consumables and Other", "Exterior"];

// ── Result collection ──

interface CheckResult {
  name: string;
  pass: boolean;
  expected?: string;
  got?: string;
}

const results: CheckResult[] = [];

function check(name: string, expected: unknown, got: unknown): void {
  const e = typeof expected === "string" ? expected : JSON.stringify(expected);
  const g = typeof got === "string" ? got : JSON.stringify(got);
  results.push({ name, pass: e === g, expected: e, got: g });
}

function checkClose(name: string, expected: number, got: number, tolerance: number): void {
  results.push({
    name,
    pass: Math.abs(expected - got) <= tolerance,
    expected: String(expected),
    got: String(got),
  });
}

// ── Cell readers (handle richText / hyperlink / formula values) ──

function textOf(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as { richText?: Array<{ text: string }>; text?: unknown; hyperlink?: string };
    if (Array.isArray(o.richText)) return o.richText.map(r => r.text).join("");
    if (o.hyperlink !== undefined) {
      if (typeof o.text === "string") return o.text;
      const t = o.text as { richText?: Array<{ text: string }> } | undefined;
      if (t && Array.isArray(t.richText)) return t.richText.map(r => r.text).join("");
      return String(o.text ?? "");
    }
  }
  return String(v);
}

function formulaOf(cell: ExcelJS.Cell): string {
  const v = cell.value as { formula?: string; sharedFormula?: string } | null;
  if (v && typeof v === "object") {
    if (typeof v.formula === "string") return v.formula;
    if (typeof v.sharedFormula === "string") return cell.formula ?? "";
  }
  return "";
}

function fillArgb(cell: ExcelJS.Cell): string {
  const f = cell.fill as ExcelJS.FillPattern | undefined;
  if (f && f.type === "pattern" && f.pattern === "solid") return f.fgColor?.argb ?? "";
  return "";
}

function headerArray(ws: ExcelJS.Worksheet, count: number): string[] {
  const out: string[] = [];
  for (let c = 1; c <= count; c++) out.push(textOf(ws.getRow(1).getCell(c)));
  return out;
}

function viewDesc(ws: ExcelJS.Worksheet): string {
  const v = ws.views?.[0] as { state?: string; ySplit?: number } | undefined;
  if (v && v.state === "frozen") return `frozen ySplit=${v.ySplit}`;
  return "unfrozen";
}

function autoFilterDesc(ws: ExcelJS.Worksheet): string {
  const af = ws.autoFilter ?? (ws.model as { autoFilter?: unknown }).autoFilter;
  return af !== undefined && af !== null && af !== "" ? "present" : "absent";
}

/** Data column count of a line-item tab (where the grand total sits +1). */
function dataCols(tab: string): number {
  if (tab === "Bedrooms") return 12;
  if (tab === "Consumables and Other") return 10;
  return 11;
}

// ── Main ──

async function main(): Promise<void> {
  if (!fs.existsSync(REF_PATH)) {
    console.log("");
    console.log(`NOTICE: reference workbook not found at ${REF_PATH}`);
    console.log("Parity check SKIPPED (this is expected in CI — the real .xlsx is gitignored).");
    console.log("");
    return;
  }

  const built = await buildMasterlistWorkbook(DEMO_PROJECT, { taxShippingRatePercent: RATE });
  await built.xlsx.writeFile(GEN_PATH);

  const gen = new ExcelJS.Workbook();
  await gen.xlsx.readFile(GEN_PATH);
  const ref = new ExcelJS.Workbook();
  await ref.xlsx.readFile(REF_PATH);

  // 1 — Tab names + order
  check("Tab order", ref.worksheets.map(w => w.name), gen.worksheets.map(w => w.name));

  for (const tab of LINE_ITEM_TABS) {
    const r = ref.getWorksheet(tab)!;
    const g = gen.getWorksheet(tab)!;
    const cols = dataCols(tab);

    // 2 — Header arrays (incl. two-line T&S header)
    check(`${tab}: header array`, headerArray(r, cols), headerArray(g, cols));

    // 3 — Views / freeze
    check(`${tab}: freeze state`, viewDesc(r), viewDesc(g));

    // 4 — Autofilter presence
    check(`${tab}: autofilter`, autoFilterDesc(r), autoFilterDesc(g));

    // 5 — Header styling
    const rA1 = r.getCell("A1");
    const gA1 = g.getCell("A1");
    check(`${tab}: header fill`, fillArgb(rA1), fillArgb(gA1));
    check(`${tab}: header bold`, String(rA1.font?.bold === true), String(gA1.font?.bold === true));
    check(`${tab}: header font size`, String(rA1.font?.size), String(gA1.font?.size));
    check(`${tab}: header row height`, String(r.getRow(1).height), String(g.getRow(1).height));

    // 6 — Grand-total formula cell
    const grandAddr = `${String.fromCharCode(65 + cols)}1`; // col right of data range
    check(`${tab}: grand total ${grandAddr}`, formulaOf(r.getCell(grandAddr)), formulaOf(g.getCell(grandAddr)));

    // 7 — Row-formula pattern from row 2 (operand order per tab!)
    const totalCol = cols === 12 ? "J" : cols === 10 ? "H" : "I";
    const tsCol = cols === 12 ? "K" : cols === 10 ? "I" : "J";
    const finalCol = cols === 12 ? "L" : cols === 10 ? "J" : "K";
    for (const col of [totalCol, tsCol, finalCol]) {
      check(`${tab}: row formula ${col}2`, formulaOf(r.getCell(`${col}2`)), formulaOf(g.getCell(`${col}2`)));
    }

    // 8 — Column widths (only those explicit in the reference), ±0.2
    for (let c = 1; c <= cols; c++) {
      const rw = r.getColumn(c).width;
      if (typeof rw !== "number") continue;
      checkClose(`${tab}: col ${String.fromCharCode(64 + c)} width`, rw, g.getColumn(c).width ?? 0, 0.2);
    }
  }

  // 9 — Action Plan layout
  {
    const r = ref.getWorksheet("Action Plan")!;
    const g = gen.getWorksheet("Action Plan")!;
    check("Action Plan: freeze state", viewDesc(r), viewDesc(g));
    check("Action Plan: A1 title fill", fillArgb(r.getCell("A1")), fillArgb(g.getCell("A1")));
    check("Action Plan: A1 bold white", `${r.getCell("A1").font?.bold}/${r.getCell("A1").font?.color?.argb}`, `${g.getCell("A1").font?.bold}/${g.getCell("A1").font?.color?.argb}`);
    check("Action Plan: A1 merged", String(r.getCell("B1").isMerged), String(g.getCell("B1").isMerged));
    check("Action Plan: A2 merged", String(r.getCell("B2").isMerged), String(g.getCell("B2").isMerged));
    check(
      "Action Plan: A2 occupancy pattern",
      String(/^\d+ Sq Ft\. - Occupancy \d+$/.test(textOf(r.getCell("A2")))),
      String(/^\d+ Sq Ft\. - Occupancy \d+$/.test(textOf(g.getCell("A2"))))
    );
    check("Action Plan: A2 fill", fillArgb(r.getCell("A2")), fillArgb(g.getCell("A2")));
    check("Action Plan: row 3 white spacer (A3)", fillArgb(r.getCell("A3")), fillArgb(g.getCell("A3")));
    check("Action Plan: row 3 white spacer (M3)", fillArgb(r.getCell("M3")), fillArgb(g.getCell("M3")));
    for (const addr of ["A4", "A5", "B5", "A11", "A12", "B12", "C12", "D12", "E12", "A27"]) {
      check(`Action Plan: ${addr} text`, textOf(r.getCell(addr)), textOf(g.getCell(addr)));
      check(`Action Plan: ${addr} fill`, fillArgb(r.getCell(addr)), fillArgb(g.getCell(addr)));
    }
    check("Action Plan: Schedule header spans A-E (E11 fill)", fillArgb(r.getCell("E11")), fillArgb(g.getCell("E11")));
    check("Action Plan: Legend B27 fill", fillArgb(r.getCell("B27")), fillArgb(g.getCell("B27")));
    for (let row = 28; row <= 31; row++) {
      check(`Action Plan: legend A${row} label`, textOf(r.getCell(`A${row}`)), textOf(g.getCell(`A${row}`)));
      check(`Action Plan: legend A${row} swatch`, fillArgb(r.getCell(`A${row}`)), fillArgb(g.getCell(`A${row}`)));
      check(`Action Plan: legend B${row} text`, textOf(r.getCell(`B${row}`)), textOf(g.getCell(`B${row}`)));
    }
    checkClose("Action Plan: col A width", r.getColumn(1).width ?? 0, g.getColumn(1).width ?? 0, 0.2);
    checkClose("Action Plan: col B width", r.getColumn(2).width ?? 0, g.getColumn(2).width ?? 0, 0.2);
  }

  // 10 — Budget Tally Sheet
  {
    const r = ref.getWorksheet("Budget Tally Sheet")!;
    const g = gen.getWorksheet("Budget Tally Sheet")!;
    check("Budget Tally: header array", headerArray(r, 3), headerArray(g, 3));
    check("Budget Tally: header fill A1", fillArgb(r.getCell("A1")), fillArgb(g.getCell("A1")));
    check("Budget Tally: header fill C1", fillArgb(r.getCell("C1")), fillArgb(g.getCell("C1")));
    check("Budget Tally: D1 unfilled", fillArgb(r.getCell("D1")), fillArgb(g.getCell("D1")));
    for (const row of [2, 3, 4, 5, 6, 7, 8, 10, 12]) {
      check(`Budget Tally: A${row} label`, textOf(r.getCell(`A${row}`)), textOf(g.getCell(`A${row}`)));
      check(`Budget Tally: B${row} formula`, formulaOf(r.getCell(`B${row}`)), formulaOf(g.getCell(`B${row}`)));
    }
    for (const c of [1, 2, 3, 5]) {
      checkClose(`Budget Tally: col ${String.fromCharCode(64 + c)} width`, r.getColumn(c).width ?? 0, g.getColumn(c).width ?? 0, 0.2);
    }
  }

  // 11 — Completed payments
  {
    const r = ref.getWorksheet("Completed payments")!;
    const g = gen.getWorksheet("Completed payments")!;
    check("Completed payments: header array", headerArray(r, 5), headerArray(g, 5));
    check("Completed payments: F1 formula", formulaOf(r.getCell("F1")), formulaOf(g.getCell("F1")));
    check("Completed payments: H1 text", textOf(r.getCell("H1")), textOf(g.getCell("H1")));
    check("Completed payments: freeze state", viewDesc(r), viewDesc(g));
    check("Completed payments: autofilter", autoFilterDesc(r), autoFilterDesc(g));
    checkClose("Completed payments: col B width", r.getColumn(2).width ?? 0, g.getColumn(2).width ?? 0, 0.2);
  }

  // ── Report ──

  const failed = results.filter(r => !r.pass);
  const nameWidth = Math.min(58, Math.max(...results.map(r => r.name.length)));

  console.log("");
  console.log(`Masterlist parity: generated (DEMO_PROJECT) vs ${path.basename(REF_PATH)}`);
  console.log("─".repeat(nameWidth + 8));
  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    console.log(`  ${status}  ${r.name.padEnd(nameWidth)}`);
    if (!r.pass) {
      console.log(`        reference: ${r.expected}`);
      console.log(`        generated: ${r.got}`);
    }
  }
  console.log("─".repeat(nameWidth + 8));
  console.log(`${results.length - failed.length}/${results.length} parity checks passed${failed.length ? ` — ${failed.length} FAILED` : ""}.`);
  console.log("");

  if (failed.length > 0) process.exit(1);
}

main().catch(err => {
  console.error("Parity check crashed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
