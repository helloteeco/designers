/**
 * Verifies the Masterlist .xlsx generator against the corrected schema
 * (mined from the REAL Hiddenwoods reference workbook — see
 * scripts/reference/hiddenwoods-items.json).
 *
 * Builds the workbook from the DEMO_PROJECT fixture, writes it to
 * /tmp/masterlist-verify.xlsx, re-reads it with exceljs, and asserts every
 * spec'd detail. Throws (exit 1) with a clear message on any failure.
 *
 * Run: npm run verify:masterlist   (or: npx tsx scripts/verify-masterlist.ts)
 */

import ExcelJS from "exceljs";
import { buildMasterlistWorkbook } from "../src/lib/masterlist-export";
import { DEMO_PROJECT } from "./fixtures/demo-project";

const OUT_PATH = "/tmp/masterlist-verify.xlsx";
const MONEY_FMT = '"$"#,##0.00';
const HEADER_FILL = "FFE5E3DA";
const RATE = 7;

const TS_HEADER = "T&S\nTax/Shipping";

const EXPECTED_TABS = [
  "Action Plan",
  "Renovations",
  "Common",
  "Bedrooms",
  "Kitchen",
  "Baths",
  "Consumables and Other",
  "Exterior",
  "Budget Tally Sheet",
  "Completed payments",
];

const STANDARD_HEADERS = ["Area", "Item", "Detail", "Source", "Alternative", "Quantity", "Status", "Cost", "Total", TS_HEADER, "Final"];
// Common's first column header is `Room` (reference deviation from old spec).
const COMMON_HEADERS = ["Room", ...STANDARD_HEADERS.slice(1)];
const BEDROOMS_HEADERS = ["Area", "Room", "Item", "Detail", "Source", "Alternative", "Quantity", "Status", "Cost", "Total", TS_HEADER, "Final"];
const CONSUMABLES_HEADERS = ["Area", "Item", "Source", "Alternative", "Quantity", "Status", "Cost", "Total", TS_HEADER, "Final"];

const LINE_ITEM_SHEETS: Array<{ name: string; headers: string[]; grandCell: string; grandFormula: string; frozen: boolean }> = [
  { name: "Renovations", headers: STANDARD_HEADERS, grandCell: "L1", grandFormula: "SUM(K:K)", frozen: false },
  { name: "Common", headers: COMMON_HEADERS, grandCell: "L1", grandFormula: "SUM(K:K)", frozen: true },
  { name: "Bedrooms", headers: BEDROOMS_HEADERS, grandCell: "M1", grandFormula: "SUM(L:L)", frozen: true },
  { name: "Kitchen", headers: STANDARD_HEADERS, grandCell: "L1", grandFormula: "SUM(K:K)", frozen: true },
  { name: "Baths", headers: STANDARD_HEADERS, grandCell: "L1", grandFormula: "SUM(K:K)", frozen: true },
  { name: "Consumables and Other", headers: CONSUMABLES_HEADERS, grandCell: "K1", grandFormula: "SUM(J:J)", frozen: true },
  { name: "Exterior", headers: STANDARD_HEADERS, grandCell: "L1", grandFormula: "SUM(K:K)", frozen: true },
];

// ── Assertion helpers ──

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

const passedGroups: string[] = [];
function group(name: string, fn: () => void): void {
  fn();
  passedGroups.push(name);
}

function fillArgb(cell: ExcelJS.Cell): string | undefined {
  const f = cell.fill as ExcelJS.FillPattern | undefined;
  if (f && f.type === "pattern" && f.pattern === "solid") return f.fgColor?.argb;
  return undefined;
}

function formulaOf(cell: ExcelJS.Cell): string {
  const v = cell.value as { formula?: string; sharedFormula?: string } | null;
  if (v && typeof v === "object") {
    if (typeof v.formula === "string") return v.formula;
    if (typeof v.sharedFormula === "string") return cell.formula ?? "";
  }
  return "";
}

/** Compare against the spec's "=..." notation (xlsx stores formulas without '='). */
function assertFormula(cell: ExcelJS.Cell, specFormula: string, where: string): void {
  const expected = specFormula.replace(/^=/, "");
  const actual = formulaOf(cell);
  assert(actual === expected, `${where}: expected formula \`=${expected}\`, got \`${actual ? "=" + actual : JSON.stringify(cell.value)}\``);
}

/** Plain-text view of a cell that may hold a string or {text, hyperlink}. */
function textOf(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "hyperlink" in (v as object)) {
    const hv = v as { text?: unknown };
    return typeof hv.text === "string" ? hv.text : String(hv.text ?? "");
  }
  return String(v);
}

function hyperlinkOf(cell: ExcelJS.Cell): string | undefined {
  const v = cell.value;
  if (v && typeof v === "object" && "hyperlink" in (v as object)) {
    return (v as { hyperlink?: string }).hyperlink;
  }
  return undefined;
}

function headerValues(ws: ExcelJS.Worksheet, count: number): string[] {
  const out: string[] = [];
  for (let c = 1; c <= count; c++) out.push(textOf(ws.getRow(1).getCell(c)));
  return out;
}

function autoFilterPresent(ws: ExcelJS.Worksheet): boolean {
  const af = ws.autoFilter ?? (ws.model as { autoFilter?: unknown }).autoFilter;
  return af !== undefined && af !== null && af !== "";
}

function lastDataRow(ws: ExcelJS.Worksheet, col: number): number {
  let last = 1;
  ws.eachRow((row, n) => {
    if (n > 1 && row.getCell(col).value !== null && row.getCell(col).value !== undefined) last = n;
  });
  return last;
}

/** First row (2-based data region) whose `col` text matches exactly. */
function findRow(ws: ExcelJS.Worksheet, col: number, text: string): number {
  let found = 0;
  ws.eachRow((row, n) => {
    if (n > 1 && !found && textOf(row.getCell(col) as ExcelJS.Cell) === text) found = n;
  });
  return found;
}

// ── Main ──

async function main(): Promise<void> {
  const built = await buildMasterlistWorkbook(DEMO_PROJECT, { taxShippingRatePercent: RATE });
  await built.xlsx.writeFile(OUT_PATH);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(OUT_PATH);

  // 1 — Tab names and order
  group("Tab names + order (10 tabs, exact order)", () => {
    const names = wb.worksheets.map(ws => ws.name);
    assert(
      JSON.stringify(names) === JSON.stringify(EXPECTED_TABS),
      `tab order mismatch:\n  expected ${JSON.stringify(EXPECTED_TABS)}\n  got      ${JSON.stringify(names)}`
    );
  });

  // 2 — Active tab
  group("Active tab on open = Action Plan (activeTab 0)", () => {
    assert(wb.worksheets[0].name === "Action Plan", "first worksheet is not Action Plan");
    const views = wb.views ?? [];
    assert(views.length > 0, "workbook.views missing");
    assert(views[0].activeTab === 0, `workbook.views[0].activeTab expected 0, got ${views[0].activeTab}`);
  });

  // 3 — Per-tab header arrays (incl. Common `Room` + two-line T&S)
  group("Per-tab header arrays exact (Common first col `Room`, T&S two-line)", () => {
    for (const s of LINE_ITEM_SHEETS) {
      const ws = wb.getWorksheet(s.name)!;
      const got = headerValues(ws, s.headers.length);
      assert(
        JSON.stringify(got) === JSON.stringify(s.headers),
        `${s.name} headers:\n  expected ${JSON.stringify(s.headers)}\n  got      ${JSON.stringify(got)}`
      );
      // T&S header cell wraps its literal newline
      const tsCol = s.headers.indexOf(TS_HEADER) + 1;
      const tsCell = ws.getRow(1).getCell(tsCol);
      assert(tsCell.alignment?.wrapText === true, `${s.name}: T&S header cell missing wrapText`);
    }
    const bt = wb.getWorksheet("Budget Tally Sheet")!;
    assert(
      JSON.stringify(headerValues(bt, 3)) === JSON.stringify(["Area", "Total", "Notes"]),
      `Budget Tally Sheet headers: got ${JSON.stringify(headerValues(bt, 3))}`
    );
    const cp = wb.getWorksheet("Completed payments")!;
    assert(
      JSON.stringify(headerValues(cp, 4)) === JSON.stringify(["Date", "Source", "Total", "Receipt"]),
      `Completed payments headers: got ${JSON.stringify(headerValues(cp, 4))}`
    );
  });

  // 4 — Freeze panes (reference: Renovations + Completed payments NOT frozen)
  group("Freeze ySplit=1 on 6 line-item sheets; Renovations/Completed payments unfrozen", () => {
    for (const s of LINE_ITEM_SHEETS) {
      const ws = wb.getWorksheet(s.name)!;
      const v = ws.views?.[0] as { state?: string; ySplit?: number } | undefined;
      if (s.frozen) {
        assert(v, `${s.name}: no sheet views`);
        assert(v.state === "frozen", `${s.name}: view state expected 'frozen', got '${v.state}'`);
        assert(v.ySplit === 1, `${s.name}: ySplit expected 1, got ${v.ySplit}`);
      } else {
        assert(!v || v.state !== "frozen", `${s.name}: should NOT be frozen (reference is unfrozen)`);
      }
    }
    const cp = wb.getWorksheet("Completed payments")!;
    const cpView = cp.views?.[0] as { state?: string } | undefined;
    assert(!cpView || cpView.state !== "frozen", "Completed payments: should NOT be frozen");
  });

  // 5 — Autofilter present on line-item sheets only
  group("Autofilter on all 7 line-item sheets; none on Completed payments", () => {
    for (const s of LINE_ITEM_SHEETS) {
      assert(autoFilterPresent(wb.getWorksheet(s.name)!), `${s.name}: autoFilter missing`);
    }
    assert(!autoFilterPresent(wb.getWorksheet("Completed payments")!), "Completed payments: autoFilter should be absent");
  });

  // 6 — Header styling
  group("Header styling: line-item fill FFE5E3DA bold size 10 height 22.5; BT/CP fill+bold, default height", () => {
    for (const s of LINE_ITEM_SHEETS) {
      const ws = wb.getWorksheet(s.name)!;
      const row1 = ws.getRow(1);
      assert(row1.height === 22.5, `${s.name}: header row height expected 22.5, got ${row1.height}`);
      for (let c = 1; c <= s.headers.length; c++) {
        const cell = row1.getCell(c);
        assert(fillArgb(cell) === HEADER_FILL, `${s.name}!${cell.address}: header fill expected ${HEADER_FILL}, got ${fillArgb(cell)}`);
        assert(cell.font?.bold === true, `${s.name}!${cell.address}: header not bold`);
        assert(cell.font?.size === 10, `${s.name}!${cell.address}: header size expected 10, got ${cell.font?.size}`);
      }
    }
    const bt = wb.getWorksheet("Budget Tally Sheet")!;
    assert(bt.getRow(1).height !== 22.5, "Budget Tally: header height should be default (reference has no tall header)");
    for (let c = 1; c <= 3; c++) {
      const cell = bt.getRow(1).getCell(c);
      assert(fillArgb(cell) === HEADER_FILL, `Budget Tally!${cell.address}: header fill expected ${HEADER_FILL}`);
      assert(cell.font?.bold === true, `Budget Tally!${cell.address}: header not bold`);
    }
    assert(fillArgb(bt.getRow(1).getCell(4)) === undefined, "Budget Tally D1 should be unfilled (taupe only A1:C1)");
    const cp = wb.getWorksheet("Completed payments")!;
    assert(cp.getRow(1).height !== 22.5, "Completed payments: header height should be default");
    for (let c = 1; c <= 4; c++) {
      const cell = cp.getRow(1).getCell(c);
      assert(fillArgb(cell) === HEADER_FILL, `Completed payments!${cell.address}: header fill expected ${HEADER_FILL}`);
      assert(cell.font?.bold === true, `Completed payments!${cell.address}: header not bold`);
    }
  });

  // 7 — Grand total formulas
  group("Grand totals: L1=SUM(K:K) / Bedrooms M1=SUM(L:L) / Consumables K1=SUM(J:J), bold + money", () => {
    for (const s of LINE_ITEM_SHEETS) {
      const ws = wb.getWorksheet(s.name)!;
      const cell = ws.getCell(s.grandCell);
      assertFormula(cell, `=${s.grandFormula}`, `${s.name}!${s.grandCell}`);
      assert(cell.font?.bold === true, `${s.name}!${s.grandCell}: grand total not bold`);
      assert(cell.numFmt === MONEY_FMT, `${s.name}!${s.grandCell}: numFmt expected ${MONEY_FMT}, got ${cell.numFmt}`);
    }
  });

  // 8 — Row formulas, per-tab operand order (Common =F*H; Exterior Final =I+J)
  group("Row formulas: Common =F2*H2 + K2=J2+I2; Exterior K2=I2+J2 (total first); Bedrooms/Consumables chains", () => {
    const common = wb.getWorksheet("Common")!;
    assertFormula(common.getCell("I2"), "=F2*H2", "Common!I2 (verbatim quirk)");
    assertFormula(common.getCell("J2"), `=I2*${RATE}/100`, "Common!J2");
    assertFormula(common.getCell("K2"), "=J2+I2", "Common!K2");

    const kitchen = wb.getWorksheet("Kitchen")!;
    assertFormula(kitchen.getCell("I2"), "=H2*F2", "Kitchen!I2");
    assertFormula(kitchen.getCell("J2"), `=I2*${RATE}/100`, "Kitchen!J2");
    assertFormula(kitchen.getCell("K2"), "=J2+I2", "Kitchen!K2");

    const reno = wb.getWorksheet("Renovations")!;
    assertFormula(reno.getCell("I2"), "=H2*F2", "Renovations!I2");
    assertFormula(reno.getCell("K2"), "=J2+I2", "Renovations!K2");

    const bedrooms = wb.getWorksheet("Bedrooms")!;
    assertFormula(bedrooms.getCell("J2"), "=I2*G2", "Bedrooms!J2");
    assertFormula(bedrooms.getCell("K2"), `=J2*${RATE}/100`, "Bedrooms!K2");
    assertFormula(bedrooms.getCell("L2"), "=K2+J2", "Bedrooms!L2");

    const cons = wb.getWorksheet("Consumables and Other")!;
    assertFormula(cons.getCell("H2"), "=G2*E2", "Consumables!H2");
    assertFormula(cons.getCell("I2"), `=H2*${RATE}/100`, "Consumables!I2");
    assertFormula(cons.getCell("J2"), "=I2+H2", "Consumables!J2");

    // Exterior's Final formula is total+T&S — operand order flipped vs other tabs.
    const ext = wb.getWorksheet("Exterior")!;
    assertFormula(ext.getCell("I2"), "=H2*F2", "Exterior!I2");
    assertFormula(ext.getCell("J2"), `=I2*${RATE}/100`, "Exterior!J2");
    assertFormula(ext.getCell("K2"), "=I2+J2", "Exterior!K2 (total-first variant)");

    // Formulas exist on the LAST data row too (not just row 2)
    const lastCommon = lastDataRow(common, 1);
    assert(lastCommon > 2, "Common: expected multiple data rows from fixture");
    assertFormula(common.getCell(`I${lastCommon}`), `=F${lastCommon}*H${lastCommon}`, `Common!I${lastCommon}`);
  });

  // 9 — Money numFmts
  group("Money numFmts on Cost/Total/T&S/Final (Quantity left General); blank costs still formatted", () => {
    const kitchen = wb.getWorksheet("Kitchen")!;
    for (const addr of ["H2", "I2", "J2", "K2"]) {
      assert(kitchen.getCell(addr).numFmt === MONEY_FMT, `Kitchen!${addr}: numFmt expected ${MONEY_FMT}, got ${kitchen.getCell(addr).numFmt}`);
    }
    assert(kitchen.getCell("F2").numFmt === undefined || kitchen.getCell("F2").numFmt === "General",
      `Kitchen!F2 (Quantity): expected General numFmt, got ${kitchen.getCell("F2").numFmt}`);
    const cons = wb.getWorksheet("Consumables and Other")!;
    for (const addr of ["G2", "H2", "I2", "J2"]) {
      assert(cons.getCell(addr).numFmt === MONEY_FMT, `Consumables!${addr}: numFmt expected ${MONEY_FMT}, got ${cons.getCell(addr).numFmt}`);
    }
    // "As needed" provisioning rows keep a blank-but-formatted Cost cell
    const orgRow = findRow(cons, 2, "organizers for supply closet (as needed)");
    assert(orgRow > 0, "Consumables: 'organizers for supply closet (as needed)' row missing");
    const orgCost = cons.getRow(orgRow).getCell(7);
    assert(orgCost.value === null || orgCost.value === undefined, `Consumables!G${orgRow} should be blank, got ${JSON.stringify(orgCost.value)}`);
    assert(orgCost.numFmt === MONEY_FMT, `Consumables!G${orgRow}: blank cost should still carry money numFmt`);
  });

  // 10 — Ordered row grey fill across full width
  group("Ordered rows: Status='Ordered' + FFCCCCCC fill across full data width", () => {
    const checks: Array<{ sheet: string; statusCol: number; width: number }> = [
      { sheet: "Common", statusCol: 7, width: 11 },
      { sheet: "Bedrooms", statusCol: 8, width: 12 },
    ];
    for (const chk of checks) {
      const ws = wb.getWorksheet(chk.sheet)!;
      let found = 0;
      ws.eachRow((row, n) => {
        if (n === 1) return;
        if (row.getCell(chk.statusCol).value === "Ordered") {
          found++;
          for (let c = 1; c <= chk.width; c++) {
            const argb = fillArgb(row.getCell(c) as ExcelJS.Cell);
            assert(argb === "FFCCCCCC", `${chk.sheet} row ${n} col ${c}: Ordered row fill expected FFCCCCCC, got ${argb}`);
          }
        }
      });
      assert(found > 0, `${chk.sheet}: fixture should produce at least one Ordered row`);
    }
  });

  // 11 — Bedrooms taxonomy + band fills
  group("Bedrooms: Area=grouping / Room=name; band fills B1 peach / B2 green / B3 blue; ALL rows unbanded", () => {
    const ws = wb.getWorksheet("Bedrooms")!;
    const expected: Record<string, string> = {
      "Bedroom 1": "FFFCE5CD",
      "Bedroom 2": "FFD9EAD3",
      "Bedroom 3": "FFCFE2F3",
    };
    const groupings = new Set(["Furniture", "Decor", "Lighting", "Bedding"]);
    const seen: Record<string, boolean> = {};
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const roomName = textOf(row.getCell(2) as ExcelJS.Cell);
      const status = textOf(row.getCell(8) as ExcelJS.Cell);
      if (roomName === "ALL" || roomName === "All") {
        assert(fillArgb(row.getCell(1) as ExcelJS.Cell) === undefined,
          `Bedrooms row ${n}: provisioning (Room=ALL) rows must not carry a band fill`);
        return;
      }
      const want = expected[roomName];
      if (!want) return;
      if (status === "Ordered") return; // grey override — checked in group 10
      seen[roomName] = true;
      const area = textOf(row.getCell(1) as ExcelJS.Cell);
      assert(groupings.has(area), `Bedrooms row ${n}: Area expected a grouping (${[...groupings].join("/")}), got '${area}'`);
      for (let c = 1; c <= 12; c++) {
        const argb = fillArgb(row.getCell(c) as ExcelJS.Cell);
        assert(argb === want, `Bedrooms row ${n} (${roomName}) col ${c}: band fill expected ${want}, got ${argb}`);
      }
    });
    for (const name of Object.keys(expected)) {
      assert(seen[name], `Bedrooms: no non-Ordered row found for ${name} to verify band fill`);
    }
  });

  // 12 — Budget Tally cross-sheet formulas (incl. the `Consumable and other` quirk)
  group("Budget Tally verbatim: labels (row 7 'Consumable and other'), formulas, widths", () => {
    const ws = wb.getWorksheet("Budget Tally Sheet")!;
    const rows: Array<[string, string, string, boolean?]> = [
      ["A2", "Exterior", "=Exterior!L1"],
      ["A3", "Common", "=Common!L1"],
      ["A4", "Kitchen", "=Kitchen!L1"],
      ["A5", "Bedrooms", "=Bedrooms!M1"],
      ["A6", "Baths", "=Baths!L1"],
      ["A7", "Consumable and other", "='Consumables and Other'!K1"],
      ["A8", "Furnishing Total", "=SUM(B2:B7)", true],
      ["A10", "Renovation Items", "=Renovations!L1"],
      ["A12", "Grand Total", "=SUM(B8+B10)", true],
    ];
    for (const [aAddr, label, formula, bold] of rows) {
      const bAddr = aAddr.replace("A", "B");
      assert(ws.getCell(aAddr).value === label, `Budget Tally ${aAddr}: expected '${label}', got '${ws.getCell(aAddr).value}'`);
      assertFormula(ws.getCell(bAddr), formula, `Budget Tally ${bAddr}`);
      assert(ws.getCell(bAddr).numFmt === MONEY_FMT, `Budget Tally ${bAddr}: numFmt expected ${MONEY_FMT}, got ${ws.getCell(bAddr).numFmt}`);
      if (bold) assert(ws.getCell(bAddr).font?.bold === true, `Budget Tally ${bAddr}: expected bold`);
    }
    const widthA = ws.getColumn(1).width ?? 0;
    assert(Math.abs(widthA - 31.63) < 0.05, `Budget Tally col A width expected 31.63, got ${widthA}`);
    const widthB = ws.getColumn(2).width ?? 0;
    assert(Math.abs(widthB - 27.75) < 0.05, `Budget Tally col B width expected 27.75, got ${widthB}`);
  });

  // 13 — Completed payments
  group("Completed payments: F1 =SUM(C:C) money, E1 bold 'Grand total:', H1 italic '*Ordering notes', B width 18.38", () => {
    const ws = wb.getWorksheet("Completed payments")!;
    assertFormula(ws.getCell("F1"), "=SUM(C:C)", "Completed payments F1");
    assert(ws.getCell("F1").numFmt === MONEY_FMT, `Completed payments F1: numFmt expected ${MONEY_FMT}, got ${ws.getCell("F1").numFmt}`);
    assert(ws.getCell("E1").value === "Grand total:", `Completed payments E1: got '${ws.getCell("E1").value}'`);
    assert(ws.getCell("E1").font?.bold === true, "Completed payments E1: expected bold");
    assert(ws.getCell("H1").value === "*Ordering notes", `Completed payments H1: got '${ws.getCell("H1").value}'`);
    assert(ws.getCell("H1").font?.italic === true, "Completed payments H1: expected italic (reference styling)");
    assert(ws.getColumn(3).numFmt === MONEY_FMT, `Completed payments col C numFmt expected ${MONEY_FMT}, got ${ws.getColumn(3).numFmt}`);
    const widthB = ws.getColumn(2).width ?? 0;
    assert(Math.abs(widthB - 18.38) < 0.05, `Completed payments col B width expected 18.38, got ${widthB}`);
  });

  // 14 — Action Plan exact layout
  group("Action Plan layout: A1/A2 merged+filled, white spacer r3, r4-5/r11-12/r27 taupe sections, legend texts, widths", () => {
    const ws = wb.getWorksheet("Action Plan")!;
    const a1 = ws.getCell("A1");
    assert(fillArgb(a1) === "FF787060", `Action Plan A1 fill expected FF787060, got ${fillArgb(a1)}`);
    assert(String(a1.value).includes("2 Hiddenwoods Ct"), `Action Plan A1 should carry the address, got '${a1.value}'`);
    assert(String(a1.value).includes("Edgewood, MD"), `Action Plan A1 should carry city/state, got '${a1.value}'`);
    assert(a1.font?.bold === true, "Action Plan A1: expected bold");
    assert(a1.font?.color?.argb === "FFFFFFFF", `Action Plan A1: expected white font, got ${a1.font?.color?.argb}`);
    assert(ws.getCell("B1").isMerged && ws.getCell("B1").master.address === "A1", "Action Plan A1:B1 not merged");
    assert(ws.getCell("B2").isMerged && ws.getCell("B2").master.address === "A2", "Action Plan A2:B2 not merged");
    assert(String(ws.getCell("A2").value) === "1800 Sq Ft. - Occupancy 8",
      `Action Plan A2 expected '1800 Sq Ft. - Occupancy 8', got '${ws.getCell("A2").value}'`);
    assert(fillArgb(ws.getCell("A2")) === HEADER_FILL, `Action Plan A2: expected taupe fill, got ${fillArgb(ws.getCell("A2"))}`);

    // Row 3 white spacer band
    for (const addr of ["A3", "B3", "M3", "Z3"]) {
      assert(fillArgb(ws.getCell(addr)) === "FFFFFFFF", `Action Plan ${addr}: expected white spacer fill, got ${fillArgb(ws.getCell(addr))}`);
    }

    // Section rows at exact positions
    assert(ws.getCell("A4").value === "Items to Address", `Action Plan A4: got '${ws.getCell("A4").value}'`);
    assert(fillArgb(ws.getCell("A4")) === HEADER_FILL && fillArgb(ws.getCell("B4")) === HEADER_FILL, "Action Plan r4: A/B taupe expected");
    assert(ws.getCell("A5").value === "Query" && ws.getCell("B5").value === "Solution", "Action Plan r5: Query|Solution expected");
    assert(fillArgb(ws.getCell("A5")) === HEADER_FILL && fillArgb(ws.getCell("B5")) === HEADER_FILL, "Action Plan r5: A/B taupe expected");
    assert(ws.getCell("A11").value === "Schedule", `Action Plan A11: got '${ws.getCell("A11").value}'`);
    const r12 = ["Action ", "Task Master/Vendor", "Contact Info", "Start Date", "End Date"];
    r12.forEach((h, i) => {
      const cell = ws.getRow(12).getCell(i + 1);
      assert(cell.value === h, `Action Plan r12 col ${i + 1}: expected '${h}', got '${cell.value}'`);
      assert(fillArgb(cell as ExcelJS.Cell) === HEADER_FILL, `Action Plan r12 col ${i + 1}: taupe expected`);
    });
    for (let c = 1; c <= 5; c++) {
      assert(fillArgb(ws.getRow(11).getCell(c) as ExcelJS.Cell) === HEADER_FILL, `Action Plan r11 col ${c}: taupe expected (spans A-E)`);
    }
    assert(ws.getCell("A27").value === "Legend:", `Action Plan A27: got '${ws.getCell("A27").value}'`);
    assert(fillArgb(ws.getCell("A27")) === HEADER_FILL && fillArgb(ws.getCell("B27")) === HEADER_FILL, "Action Plan r27: A/B taupe expected");

    // Legend swatch rows 28-31 with verbatim texts
    const legend: Array<[number, string, string, string]> = [
      [28, "FFFFFF00", "yellow highlight", "smart tech + reno items for contractors to install"],
      [29, "FF00FFFF", "blue highlight", "Long lead time items (>2 weeks delivery)"],
      [30, "FFFF9900", "orange highlight", "purchase via Minoan"],
      [31, "FF00FF00", "green highlight", "purchase via HostGPO"],
    ];
    for (const [rowNum, argb, label, text] of legend) {
      const row = ws.getRow(rowNum);
      assert(fillArgb(row.getCell(1) as ExcelJS.Cell) === argb, `Action Plan A${rowNum}: swatch fill expected ${argb}, got ${fillArgb(row.getCell(1) as ExcelJS.Cell)}`);
      assert(row.getCell(1).value === label, `Action Plan A${rowNum}: expected '${label}', got '${row.getCell(1).value}'`);
      assert(row.getCell(2).value === text, `Action Plan B${rowNum}: expected '${text}', got '${row.getCell(2).value}'`);
    }

    const wA = ws.getColumn(1).width ?? 0;
    const wB = ws.getColumn(2).width ?? 0;
    assert(Math.abs(wA - 31.13) < 0.05, `Action Plan col A width expected 31.13, got ${wA}`);
    assert(Math.abs(wB - 65.75) < 0.05, `Action Plan col B width expected 65.75, got ${wB}`);
  });

  // 15 — Per-tab column widths (reference values)
  group("Column widths per tab (Common A=33/B=16.38, Bedrooms C=50.75, Kitchen C=51.63, Exterior J=18.5, …)", () => {
    const widthChecks: Array<[string, string, number]> = [
      ["Common", "A", 33], ["Common", "B", 16.38], ["Common", "C", 29.38], ["Common", "D", 22], ["Common", "E", 21.38],
      ["Bedrooms", "A", 28.5], ["Bedrooms", "B", 30.88], ["Bedrooms", "C", 50.75], ["Bedrooms", "D", 27.25], ["Bedrooms", "E", 22], ["Bedrooms", "F", 19],
      ["Consumables and Other", "A", 29.25], ["Consumables and Other", "B", 56.25], ["Consumables and Other", "C", 19.88],
      ["Renovations", "A", 26.63], ["Renovations", "B", 26.63], ["Renovations", "C", 24.88], ["Renovations", "D", 23.88],
      ["Exterior", "A", 32.75], ["Exterior", "B", 31.25], ["Exterior", "C", 19.13], ["Exterior", "D", 16.75], ["Exterior", "J", 18.5],
      ["Kitchen", "B", 17.88], ["Kitchen", "C", 51.63], ["Kitchen", "D", 20.63], ["Kitchen", "E", 18.25],
      ["Baths", "B", 35.38], ["Baths", "C", 32.38], ["Baths", "D", 18.5],
    ];
    for (const [sheet, col, expected] of widthChecks) {
      const got = wb.getWorksheet(sheet)!.getColumn(col).width ?? 0;
      assert(Math.abs(got - expected) < 0.05, `${sheet} col ${col} width expected ${expected}, got ${got}`);
    }
  });

  // 16 — No conditional formatting anywhere
  group("No conditional-formatting rules on any sheet (direct fills only)", () => {
    for (const ws of wb.worksheets) {
      const cf = (ws.model as { conditionalFormattings?: unknown[] }).conditionalFormattings;
      assert(!cf || cf.length === 0, `${ws.name}: found ${cf?.length} conditionalFormatting rule(s)`);
    }
  });

  // 17 — Status mapping + blank statuses
  group("Status column: 'Ordered' for ordered/delivered, blank otherwise; provisioning rows blank", () => {
    const common = wb.getWorksheet("Common")!;
    const statuses = new Set<string>();
    common.eachRow((row, n) => {
      if (n > 1) statuses.add(textOf(row.getCell(7) as ExcelJS.Cell));
    });
    for (const s of statuses) {
      assert(s === "Ordered" || s === "", `Common: unexpected Status value '${s}' (only 'Ordered' or blank allowed)`);
    }
    const cons = wb.getWorksheet("Consumables and Other")!;
    cons.eachRow((row, n) => {
      if (n > 1) {
        const v = textOf(row.getCell(6) as ExcelJS.Cell);
        assert(v === "", `Consumables row ${n}: Status should be blank, got '${v}'`);
      }
    });
    // All 53 reference provisioning rows land on the tab (demo has an outdoor room)
    assert(lastDataRow(cons, 2) === 54, `Consumables: expected 53 provisioning rows (last data row 54), got ${lastDataRow(cons, 2)}`);
  });

  // 18 — Source hints + hyperlinks
  group("Source: Minoan hints intact; provisioning Source cells are {text, hyperlink}", () => {
    const hints: Record<string, string> = {
      Wayfair: "Wayfair (Use Minoan 10%)",
      Article: "Article (Use Minoan 20%)",
      "West Elm": "West Elm (Use Minoan 15%)",
    };
    const seen = new Set<string>();
    for (const s of LINE_ITEM_SHEETS) {
      const ws = wb.getWorksheet(s.name)!;
      const srcCol = s.name === "Bedrooms" ? 5 : s.name === "Consumables and Other" ? 3 : 4;
      ws.eachRow((row, n) => {
        if (n === 1) return;
        const v = textOf(row.getCell(srcCol) as ExcelJS.Cell);
        if (v) seen.add(v);
        for (const bare of Object.keys(hints)) {
          assert(v !== bare, `${s.name} row ${n}: Source '${bare}' missing its Minoan hint`);
        }
      });
    }
    for (const hinted of Object.values(hints)) {
      assert(seen.has(hinted), `No row found with hinted source '${hinted}'`);
    }
    // Provisioning rows carry real hyperlinks from the reference
    const bedrooms = wb.getWorksheet("Bedrooms")!;
    const sheetRow = findRow(bedrooms, 3, "bedsheet sets (2 sets per bed)");
    assert(sheetRow > 0, "Bedrooms: bedsheet sets provisioning row missing");
    const srcCell = bedrooms.getRow(sheetRow).getCell(5);
    assert(textOf(srcCell as ExcelJS.Cell) === "Amazon", `Bedrooms!E${sheetRow}: source text expected 'Amazon', got '${textOf(srcCell as ExcelJS.Cell)}'`);
    const link = hyperlinkOf(srcCell as ExcelJS.Cell);
    assert(link !== undefined && link.includes("amazon.com"), `Bedrooms!E${sheetRow}: source should be a hyperlink to amazon.com, got ${link}`);
  });

  // 19 — Provisioning quantities scale with the project
  group("Provisioning quantities: sheets 8 / protectors 4 / mattresses 4 (4 sleeping surfaces); bath kit ×2; TV kit ×4", () => {
    const bedrooms = wb.getWorksheet("Bedrooms")!;
    const expectBedrooms: Array<[string, number]> = [
      ["bedsheet sets (2 sets per bed)", 8], // 2 per sleeping surface × (King + Queen + QoQ bunk = 4)
      ["duvet cover (2 sets per bed)", 8],
      ["duvet inserts (1 set per bed)", 4],
      ["mattress protectors encasement (1 set per bed)", 4],
      ["mattress protectors fitted (1 set per bed)", 4],
      ['mattresses *Note: get separate 6" mattresses for any top bunks', 4],
      ["Mirror full body (1 per bedroom)", 3],
    ];
    for (const [item, qty] of expectBedrooms) {
      const n = findRow(bedrooms, 3, item);
      assert(n > 0, `Bedrooms: provisioning row '${item}' missing`);
      assert(bedrooms.getRow(n).getCell(7).value === qty, `Bedrooms '${item}': qty expected ${qty}, got ${bedrooms.getRow(n).getCell(7).value}`);
      const area = textOf(bedrooms.getRow(n).getCell(1) as ExcelJS.Cell);
      const roomVal = textOf(bedrooms.getRow(n).getCell(2) as ExcelJS.Cell);
      if (item.startsWith("Mirror")) {
        assert(area === "Main" && roomVal === "All", `Bedrooms '${item}': expected Main/All, got ${area}/${roomVal}`);
      } else {
        assert(area === "Bedding" && roomVal === "ALL", `Bedrooms '${item}': expected Bedding/ALL, got ${area}/${roomVal}`);
      }
    }

    const baths = wb.getWorksheet("Baths")!;
    for (const item of ["Plunger ", "Shower caddy", "Shower Curtain Rod", "Shower Liner"]) {
      const n = findRow(baths, 2, item);
      assert(n > 0, `Baths: provisioning row '${item}' missing`);
      assert(baths.getRow(n).getCell(6).value === 2, `Baths '${item}': qty expected 2 (2 bathrooms), got ${baths.getRow(n).getCell(6).value}`);
      assert(textOf(baths.getRow(n).getCell(1) as ExcelJS.Cell) === "all", `Baths '${item}': Area expected 'all'`);
    }

    const cons = wb.getWorksheet("Consumables and Other")!;
    const tvRow = findRow(cons, 2, "Cable wall plate (1 set per tv)");
    assert(tvRow > 0, "Consumables: cable wall plate row missing");
    assert(cons.getRow(tvRow).getCell(5).value === 4, `Cable wall plate qty expected 4 (1 living + 3 bedrooms), got ${cons.getRow(tvRow).getCell(5).value}`);
    const surgeRow = findRow(cons, 2, "surge protector (1 per tv)");
    assert(cons.getRow(surgeRow).getCell(5).value === 4, `Surge protector qty expected 4, got ${cons.getRow(surgeRow).getCell(5).value}`);
    const extRow = findRow(cons, 2, "extension cord 9ft (1 per bedroom)");
    assert(cons.getRow(extRow).getCell(5).value === 3, `Extension cord qty expected 3 (3 bedrooms), got ${cons.getRow(extRow).getCell(5).value}`);

    // Kitchen kit + Common extras + Exterior porch items landed
    const kitchen = wb.getWorksheet("Kitchen")!;
    const keurig = findRow(kitchen, 2, "Coffee maker");
    assert(keurig > 0 && textOf(kitchen.getRow(keurig).getCell(3) as ExcelJS.Cell).startsWith("Keurig"), "Kitchen: Keurig coffee maker provisioning row missing");
    assert(kitchen.getRow(keurig).getCell(8).value === 107.68, `Kitchen Keurig cost expected 107.68, got ${kitchen.getRow(keurig).getCell(8).value}`);
    const common = wb.getWorksheet("Common")!;
    const monopoly = findRow(common, 3, "Monopoly deal");
    assert(monopoly > 0, "Common: 'Monopoly deal' board game row missing");
    const ext = wb.getWorksheet("Exterior")!;
    assert(findRow(ext, 2, "welcome mat") > 0, "Exterior: welcome mat row missing");
    assert(findRow(ext, 2, "string lights solar (as needed)") > 0, "Exterior: backyard row missing (project has outdoor room)");
  });

  // 20 — Dedupe: designer-specced items suppress identically-named provisioning rows
  group("Dedupe: designer 'Hair Dryer' suppresses provisioning 'Hair dryer' on Baths (case-insensitive)", () => {
    const baths = wb.getWorksheet("Baths")!;
    let hairDryerProvisioningRows = 0;
    baths.eachRow((row, n) => {
      if (n > 1 && textOf(row.getCell(2) as ExcelJS.Cell).trim().toLowerCase() === "hair dryer") hairDryerProvisioningRows++;
    });
    assert(hairDryerProvisioningRows === 0,
      `Baths: provisioning 'Hair dryer' should be skipped (designer specced 'Hair Dryer'), found ${hairDryerProvisioningRows} row(s)`);
    // …but non-colliding provisioning rows are present
    assert(findRow(baths, 2, "Bath towels bundle") > 0, "Baths: 'Bath towels bundle' provisioning row missing");
  });

  // 21 — includeProvisioning:false falls back to legacy behavior
  const noProv = await buildMasterlistWorkbook(DEMO_PROJECT, { taxShippingRatePercent: RATE, includeProvisioning: false });
  const noProvBuf = await noProv.xlsx.writeBuffer();
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(noProvBuf as ArrayBuffer);
  group("includeProvisioning:false → legacy consumables starter, no provisioning rows", () => {
    const cons2 = wb2.getWorksheet("Consumables and Other")!;
    assert(lastDataRow(cons2, 2) === 17, `no-provisioning Consumables: expected 16 legacy rows (last data row 17), got ${lastDataRow(cons2, 2)}`);
    const bedrooms2 = wb2.getWorksheet("Bedrooms")!;
    assert(findRow(bedrooms2, 3, "bedsheet sets (2 sets per bed)") === 0, "no-provisioning Bedrooms: bedding block should be absent");
  });

  console.log("");
  console.log(`Masterlist verification PASSED — ${OUT_PATH}`);
  console.log("");
  for (const g of passedGroups) console.log(`  ✅ ${g}`);
  console.log("");
  console.log(`${passedGroups.length}/${passedGroups.length} assertion groups passed.`);
}

main().catch(err => {
  console.error("");
  console.error("❌ Masterlist verification FAILED");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
