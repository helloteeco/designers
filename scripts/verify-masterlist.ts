/**
 * Verifies the Masterlist .xlsx generator against the exact target schema.
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

const STANDARD_HEADERS = ["Area", "Item", "Detail", "Source", "Alternative", "Quantity", "Status", "Cost", "Total", "T&S", "Final"];
const BEDROOMS_HEADERS = ["Area", "Room", "Item", "Detail", "Source", "Alternative", "Quantity", "Status", "Cost", "Total", "T&S", "Final"];
const CONSUMABLES_HEADERS = ["Area", "Item", "Source", "Alternative", "Quantity", "Status", "Cost", "Total", "T&S", "Final"];

const LINE_ITEM_SHEETS: Array<{ name: string; headers: string[]; grandCell: string; grandFormula: string }> = [
  { name: "Renovations", headers: STANDARD_HEADERS, grandCell: "L1", grandFormula: "SUM(K:K)" },
  { name: "Common", headers: STANDARD_HEADERS, grandCell: "L1", grandFormula: "SUM(K:K)" },
  { name: "Bedrooms", headers: BEDROOMS_HEADERS, grandCell: "M1", grandFormula: "SUM(L:L)" },
  { name: "Kitchen", headers: STANDARD_HEADERS, grandCell: "L1", grandFormula: "SUM(K:K)" },
  { name: "Baths", headers: STANDARD_HEADERS, grandCell: "L1", grandFormula: "SUM(K:K)" },
  { name: "Consumables and Other", headers: CONSUMABLES_HEADERS, grandCell: "K1", grandFormula: "SUM(J:J)" },
  { name: "Exterior", headers: STANDARD_HEADERS, grandCell: "L1", grandFormula: "SUM(K:K)" },
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

function headerValues(ws: ExcelJS.Worksheet, count: number): string[] {
  const out: string[] = [];
  for (let c = 1; c <= count; c++) out.push(String(ws.getRow(1).getCell(c).value ?? ""));
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

  // 3 — Per-tab header arrays
  group("Per-tab header arrays exact", () => {
    for (const s of LINE_ITEM_SHEETS) {
      const ws = wb.getWorksheet(s.name)!;
      const got = headerValues(ws, s.headers.length);
      assert(
        JSON.stringify(got) === JSON.stringify(s.headers),
        `${s.name} headers:\n  expected ${JSON.stringify(s.headers)}\n  got      ${JSON.stringify(got)}`
      );
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

  // 4 — Freeze panes
  group("Freeze panes ySplit=1 on 7 line-item sheets + Completed payments", () => {
    for (const name of [...LINE_ITEM_SHEETS.map(s => s.name), "Completed payments"]) {
      const ws = wb.getWorksheet(name)!;
      const v = ws.views?.[0] as { state?: string; ySplit?: number } | undefined;
      assert(v, `${name}: no sheet views`);
      assert(v.state === "frozen", `${name}: view state expected 'frozen', got '${v.state}'`);
      assert(v.ySplit === 1, `${name}: ySplit expected 1, got ${v.ySplit}`);
    }
  });

  // 5 — Autofilter present
  group("Autofilter present on line-item sheets + Completed payments", () => {
    for (const name of [...LINE_ITEM_SHEETS.map(s => s.name), "Completed payments"]) {
      assert(autoFilterPresent(wb.getWorksheet(name)!), `${name}: autoFilter missing`);
    }
  });

  // 6 — Header styling
  group("Header styling: fill FFE5E3DA, bold, size 10, row height 22.5", () => {
    const styled = [...LINE_ITEM_SHEETS.map(s => ({ name: s.name, cols: s.headers.length })),
      { name: "Budget Tally Sheet", cols: 3 },
      { name: "Completed payments", cols: 4 }];
    for (const { name, cols } of styled) {
      const ws = wb.getWorksheet(name)!;
      const row1 = ws.getRow(1);
      assert(row1.height === 22.5, `${name}: header row height expected 22.5, got ${row1.height}`);
      for (let c = 1; c <= cols; c++) {
        const cell = row1.getCell(c);
        assert(fillArgb(cell) === HEADER_FILL, `${name}!${cell.address}: header fill expected ${HEADER_FILL}, got ${fillArgb(cell)}`);
        assert(cell.font?.bold === true, `${name}!${cell.address}: header not bold`);
        assert(cell.font?.size === 10, `${name}!${cell.address}: header size expected 10, got ${cell.font?.size}`);
      }
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

  // 8 — Row formulas (sampled), incl. the Common =F*H quirk
  group("Row formulas: Common =F2*H2 quirk; Kitchen =H2*F2; Bedrooms J2=I2*G2; Consumables H2=G2*E2; T&S + Final chains", () => {
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

    const bedrooms = wb.getWorksheet("Bedrooms")!;
    assertFormula(bedrooms.getCell("J2"), "=I2*G2", "Bedrooms!J2");
    assertFormula(bedrooms.getCell("K2"), `=J2*${RATE}/100`, "Bedrooms!K2");
    assertFormula(bedrooms.getCell("L2"), "=K2+J2", "Bedrooms!L2");

    const cons = wb.getWorksheet("Consumables and Other")!;
    assertFormula(cons.getCell("H2"), "=G2*E2", "Consumables!H2");
    assertFormula(cons.getCell("I2"), `=H2*${RATE}/100`, "Consumables!I2");
    assertFormula(cons.getCell("J2"), "=I2+H2", "Consumables!J2");

    // Formulas exist on the LAST data row too (not just row 2)
    const lastCommon = lastDataRow(common, 1);
    assert(lastCommon > 2, "Common: expected multiple data rows from fixture");
    assertFormula(common.getCell(`I${lastCommon}`), `=F${lastCommon}*H${lastCommon}`, `Common!I${lastCommon}`);
  });

  // 9 — Money numFmts
  group("Money numFmts on Cost/Total/T&S/Final (Quantity left General)", () => {
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
    // Consumables Cost cells are blank (no invented prices) but formatted
    assert(cons.getCell("G2").value === null || cons.getCell("G2").value === undefined,
      `Consumables!G2 should be blank, got ${JSON.stringify(cons.getCell("G2").value)}`);
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

  // 11 — Bedroom band fills
  group("Bedroom band fills: B1 peach FFFCE5CD / B2 green FFD9EAD3 / B3 blue FFCFE2F3", () => {
    const ws = wb.getWorksheet("Bedrooms")!;
    const expected: Record<string, string> = {
      "Bedroom 1": "FFFCE5CD",
      "Bedroom 2": "FFD9EAD3",
      "Bedroom 3": "FFCFE2F3",
    };
    const seen: Record<string, boolean> = {};
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const roomName = String(row.getCell(2).value ?? "");
      const status = String(row.getCell(8).value ?? "");
      const want = expected[roomName];
      if (!want) return;
      if (status === "Ordered") return; // grey override — checked in group 10
      seen[roomName] = true;
      assert(String(row.getCell(1).value) === "Bedroom", `Bedrooms row ${n}: Area expected 'Bedroom', got '${row.getCell(1).value}'`);
      for (let c = 1; c <= 12; c++) {
        const argb = fillArgb(row.getCell(c) as ExcelJS.Cell);
        assert(argb === want, `Bedrooms row ${n} (${roomName}) col ${c}: band fill expected ${want}, got ${argb}`);
      }
    });
    for (const name of Object.keys(expected)) {
      assert(seen[name], `Bedrooms: no non-Ordered row found for ${name} to verify band fill`);
    }
  });

  // 12 — Budget Tally cross-sheet formulas
  group("Budget Tally formulas verbatim (incl. ='Consumables and Other'!K1, B12 =SUM(B8+B10))", () => {
    const ws = wb.getWorksheet("Budget Tally Sheet")!;
    const rows: Array<[string, string, string, boolean?]> = [
      ["A2", "Exterior", "=Exterior!L1"],
      ["A3", "Common", "=Common!L1"],
      ["A4", "Kitchen", "=Kitchen!L1"],
      ["A5", "Bedrooms", "=Bedrooms!M1"],
      ["A6", "Baths", "=Baths!L1"],
      ["A7", "Consumables and Other", "='Consumables and Other'!K1"],
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
    assert(Math.abs(widthA - 28) < 1, `Budget Tally col A width expected ~28, got ${widthA}`);
  });

  // 13 — Completed payments
  group("Completed payments: F1 =SUM(C:C) money, E1 'Grand total:' bold, H1 '*Ordering notes', col C money", () => {
    const ws = wb.getWorksheet("Completed payments")!;
    assertFormula(ws.getCell("F1"), "=SUM(C:C)", "Completed payments F1");
    assert(ws.getCell("F1").numFmt === MONEY_FMT, `Completed payments F1: numFmt expected ${MONEY_FMT}, got ${ws.getCell("F1").numFmt}`);
    assert(ws.getCell("E1").value === "Grand total:", `Completed payments E1: got '${ws.getCell("E1").value}'`);
    assert(ws.getCell("E1").font?.bold === true, "Completed payments E1: expected bold");
    assert(ws.getCell("H1").value === "*Ordering notes", `Completed payments H1: got '${ws.getCell("H1").value}'`);
    assert(ws.getColumn(3).numFmt === MONEY_FMT, `Completed payments col C numFmt expected ${MONEY_FMT}, got ${ws.getColumn(3).numFmt}`);
  });

  // 14 — Action Plan
  group("Action Plan: A1 merged + FF787060 + address, occupancy line, legend swatches, col widths A=31 B=66", () => {
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

    // Section labels + headers
    const colAText: string[] = [];
    ws.eachRow(row => colAText.push(String(row.getCell(1).value ?? "")));
    for (const label of ["Items to Address", "Schedule", "Legend", "Query", "Action"]) {
      assert(colAText.includes(label), `Action Plan: missing section/header text '${label}' in column A`);
    }

    // Legend swatch fills somewhere in column A
    const swatches = ["FFFFFF00", "FF00FFFF", "FFFF9900", "FF00FF00"];
    const fillsInColA = new Set<string>();
    ws.eachRow(row => {
      const argb = fillArgb(row.getCell(1) as ExcelJS.Cell);
      if (argb) fillsInColA.add(argb);
    });
    for (const argb of swatches) {
      assert(fillsInColA.has(argb), `Action Plan legend: swatch fill ${argb} not found in column A`);
    }

    const wA = ws.getColumn(1).width ?? 0;
    const wB = ws.getColumn(2).width ?? 0;
    assert(Math.abs(wA - 31) < 0.01, `Action Plan col A width expected 31, got ${wA}`);
    assert(Math.abs(wB - 66) < 0.01, `Action Plan col B width expected 66, got ${wB}`);
  });

  // 15 — No conditional formatting anywhere
  group("No conditional-formatting rules on any sheet (direct fills only)", () => {
    for (const ws of wb.worksheets) {
      const cf = (ws.model as { conditionalFormattings?: unknown[] }).conditionalFormattings;
      assert(!cf || cf.length === 0, `${ws.name}: found ${cf?.length} conditionalFormatting rule(s)`);
    }
  });

  // 16 — Status mapping + blank statuses
  group("Status column: 'Ordered' for ordered/delivered, blank otherwise; Consumables all blank", () => {
    const common = wb.getWorksheet("Common")!;
    const statuses = new Set<string>();
    common.eachRow((row, n) => {
      if (n > 1) statuses.add(String(row.getCell(7).value ?? ""));
    });
    for (const s of statuses) {
      assert(s === "Ordered" || s === "", `Common: unexpected Status value '${s}' (only 'Ordered' or blank allowed)`);
    }
    const cons = wb.getWorksheet("Consumables and Other")!;
    cons.eachRow((row, n) => {
      if (n > 1) {
        const v = String(row.getCell(6).value ?? "");
        assert(v === "", `Consumables row ${n}: Status should be blank, got '${v}'`);
      }
    });
    assert(lastDataRow(cons, 1) === 17, `Consumables: expected 16 starter rows (last data row 17), got ${lastDataRow(cons, 1)}`);
  });

  // 17 — Source hints
  group("Source hints: Wayfair/Article/West Elm carry Minoan notes; Costco/Amazon/HostGPO passthrough", () => {
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
        const v = String(row.getCell(srcCol).value ?? "");
        if (v) seen.add(v);
        for (const bare of Object.keys(hints)) {
          assert(v !== bare, `${s.name} row ${n}: Source '${bare}' missing its Minoan hint`);
        }
      });
    }
    for (const hinted of Object.values(hints)) {
      assert(seen.has(hinted), `No row found with hinted source '${hinted}'`);
    }
    for (const plain of ["Costco", "Amazon", "HostGPO"]) {
      assert(seen.has(plain), `No row found with passthrough source '${plain}'`);
    }
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
