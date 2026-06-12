/**
 * Dev tool — extracts the REAL Teeco masterlist reference workbook
 * (scripts/reference/hiddenwoods-masterlist.xlsx, gitignored) into
 * scripts/reference/hiddenwoods-items.json (committed, derived data).
 *
 * The JSON is the ground truth used to drive parity work on
 * src/lib/masterlist-export.ts and src/lib/str-provisioning.ts:
 *   - every populated row of every tab (cell values, formulas, hyperlinks)
 *   - per-cell fills (argb)
 *   - per-tab metadata: header row values (exact, incl. newlines), views,
 *     autoFilter range, column widths, row heights
 *
 * Run: npx tsx scripts/reference/extract-reference.ts
 */

import ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";

const XLSX_PATH = path.join(__dirname, "hiddenwoods-masterlist.xlsx");
const OUT_PATH = path.join(__dirname, "hiddenwoods-items.json");

type CellDump =
  | string
  | number
  | boolean
  | null
  | { formula: string; result?: unknown }
  | { text: string; hyperlink: string }
  | { richText: string }
  | { error: string };

interface RowDump {
  tab: string;
  rowNumber: number;
  cells: Record<string, CellDump>; // column letter -> value
  fills: Record<string, string>; // column letter -> argb (solid pattern fills only)
  height?: number;
}

interface TabMeta {
  name: string;
  headerRow: CellDump[]; // row 1 values, exact (incl. embedded newlines)
  headerRowHeight?: number;
  views: unknown[];
  autoFilter: unknown;
  columnWidths: Record<string, number>; // column letter -> width
  rowHeights: Record<string, number>; // rowNumber -> explicit height
  mergedCells: string[];
  rowCount: number;
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

function dumpCellValue(cell: ExcelJS.Cell): CellDump {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if (typeof o.formula === "string" || typeof o.sharedFormula === "string") {
      return { formula: (o.formula as string) ?? cell.formula ?? "", result: o.result };
    }
    if (typeof o.hyperlink === "string") {
      const t = o.text;
      const text =
        typeof t === "string"
          ? t
          : t && typeof t === "object" && Array.isArray((t as { richText?: unknown[] }).richText)
            ? ((t as { richText: Array<{ text: string }> }).richText.map(r => r.text).join(""))
            : String(t ?? "");
      return { text, hyperlink: o.hyperlink as string };
    }
    if (Array.isArray(o.richText)) {
      return { richText: (o.richText as Array<{ text: string }>).map(r => r.text).join("") };
    }
    if (o.error !== undefined) return { error: String(o.error) };
    return { error: `unhandled cell value: ${JSON.stringify(v)}` };
  }
  return { error: `unhandled cell type: ${typeof v}` };
}

function fillArgb(cell: ExcelJS.Cell): string | undefined {
  const f = cell.fill as ExcelJS.FillPattern | undefined;
  if (f && f.type === "pattern" && f.pattern === "solid") return f.fgColor?.argb;
  return undefined;
}

async function main(): Promise<void> {
  if (!fs.existsSync(XLSX_PATH)) {
    console.error(`Reference workbook not found: ${XLSX_PATH}`);
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);

  const tabs: TabMeta[] = [];
  const rows: RowDump[] = [];

  for (const ws of wb.worksheets) {
    const columnWidths: Record<string, number> = {};
    for (let c = 1; c <= ws.columnCount + 2; c++) {
      const col = ws.getColumn(c);
      if (col && typeof col.width === "number") columnWidths[colLetter(c)] = col.width;
    }

    const rowHeights: Record<string, number> = {};
    const headerRow: CellDump[] = [];
    const header = ws.getRow(1);
    for (let c = 1; c <= Math.max(ws.columnCount, header.cellCount); c++) {
      headerRow.push(dumpCellValue(header.getCell(c)));
    }
    // trim trailing nulls
    while (headerRow.length && headerRow[headerRow.length - 1] === null) headerRow.pop();

    // Last row that carries an actual value. Google-Sheets exports style
    // hundreds of empty rows below the data (all-white fills) — we only dump
    // style-only rows when they sit INSIDE the populated region (e.g. the
    // Action Plan's white spacer row 3).
    let lastValueRow = 0;
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      let hasValue = false;
      row.eachCell({ includeEmpty: false }, cell => {
        if (cell.value !== null && cell.value !== undefined) hasValue = true;
      });
      if (hasValue) lastValueRow = rowNumber;
    });

    for (let rowNumber = 1; rowNumber <= lastValueRow; rowNumber++) {
      const row = ws.getRow(rowNumber);
      if (typeof row.height === "number") rowHeights[String(rowNumber)] = row.height;
      const cells: Record<string, CellDump> = {};
      const fills: Record<string, string> = {};
      let populated = false;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const letter = colLetter(colNumber);
        const v = dumpCellValue(cell);
        if (v !== null) {
          cells[letter] = v;
          populated = true;
        }
        const argb = fillArgb(cell);
        if (argb) {
          fills[letter] = argb;
          populated = true;
        }
      });
      if (populated) {
        rows.push({
          tab: ws.name,
          rowNumber,
          cells,
          fills,
          ...(typeof row.height === "number" ? { height: row.height } : {}),
        });
      }
    }

    const model = ws.model as { merges?: string[] };
    tabs.push({
      name: ws.name,
      headerRow,
      headerRowHeight: typeof header.height === "number" ? header.height : undefined,
      views: (ws.views as unknown[]) ?? [],
      autoFilter: ws.autoFilter ?? (ws.model as { autoFilter?: unknown }).autoFilter ?? null,
      columnWidths,
      rowHeights,
      mergedCells: model.merges ?? [],
      rowCount: ws.rowCount,
    });
  }

  const out = {
    source: path.basename(XLSX_PATH),
    extractedAt: new Date().toISOString(),
    workbookViews: wb.views ?? [],
    tabOrder: wb.worksheets.map(ws => ws.name),
    tabs,
    rows,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`Tabs: ${out.tabOrder.join(" | ")}`);
  console.log(`Rows dumped: ${rows.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
