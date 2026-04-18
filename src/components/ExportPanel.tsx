"use client";

import { useState } from "react";
import type { Project, ExportRow } from "@/lib/types";
import { getTotalSleeping } from "@/lib/sleep-optimizer";
import { logActivity } from "@/lib/store";
import { getStudioSettings } from "@/lib/studio-settings";
import { downloadMasterlistXlsx } from "@/lib/masterlist-export";

interface Props {
  project: Project;
}

// Tax + shipping default rate (Teeco standard ~8% combined)
const DEFAULT_TAX_SHIPPING_RATE = 0.08;

export default function ExportPanel({ project }: Props) {
  const rows = buildExportRows(project);
  const totalCost = rows.reduce((s, r) => s + r.totalPrice, 0);
  const sleeping = getTotalSleeping(project.rooms);
  const settings = getStudioSettings();
  const [generating, setGenerating] = useState(false);

  async function downloadXlsx() {
    setGenerating(true);
    try {
      await downloadMasterlistXlsx(project);
      logActivity(project.id, "exported", "Exported Teeco masterlist xlsx");
    } finally {
      setGenerating(false);
    }
  }

  function downloadCSV() {
    const headers = [
      "Room",
      "Item",
      "Category",
      "Qty",
      "Unit Price",
      "Total Price",
      "Dimensions",
      "Vendor",
      "Vendor URL",
      "Color",
      "Material",
      "Notes",
    ];

    const csvRows = [headers.join(",")];

    for (const row of rows) {
      csvRows.push(
        [
          quote(row.room),
          quote(row.itemName),
          quote(row.category),
          row.quantity,
          row.unitPrice.toFixed(2),
          row.totalPrice.toFixed(2),
          quote(row.dimensions),
          quote(row.vendor),
          quote(row.vendorUrl),
          quote(row.color),
          quote(row.material),
          quote(row.notes),
        ].join(",")
      );
    }

    // Add totals row
    csvRows.push("");
    csvRows.push(
      [
        quote("TOTAL"),
        "",
        "",
        rows.reduce((s, r) => s + r.quantity, 0),
        "",
        totalCost.toFixed(2),
        "",
        "",
        "",
        "",
        "",
        "",
      ].join(",")
    );

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(project.name)}-furniture-list.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logActivity(project.id, "exported", `Exported furniture list CSV (${rows.length} items)`);
  }

  /**
   * Teeco Masterlist format — matches Jeff's production spreadsheet column-for-column.
   * Columns: Room | Item | Detail | Source | Alternative | Quantity | Status | Cost | Total | T&S | Final | Link
   */
  function downloadTeecoMasterlist() {
    const headers = [
      "Room", "Item", "Detail", "Source", "Alternative",
      "Quantity", "Status", "Cost", "Total", "T&S (Tax/Shipping)", "Final", "Link",
    ];
    const csvRows = [headers.join(",")];

    // Furniture from rooms
    for (const room of project.rooms) {
      for (const f of room.furniture) {
        const cost = f.item.price;
        const total = cost * f.quantity;
        const tax = total * DEFAULT_TAX_SHIPPING_RATE;
        const final = total + tax;
        csvRows.push([
          quote(room.name),
          quote(f.item.subcategory || f.item.category.replace(/-/g, " ")),
          quote(`${f.item.name}${f.item.color ? ` (${f.item.color})` : ""}`),
          quote(f.item.vendor),
          "", // Alternative — blank, filled in manually
          f.quantity,
          "Need to order",
          cost.toFixed(2),
          total.toFixed(2),
          tax.toFixed(2),
          final.toFixed(2),
          quote(f.item.vendorUrl),
        ].join(","));
      }
    }

    // Finishes
    for (const f of project.finishes ?? []) {
      const room = project.rooms.find(r => r.id === f.roomId);
      const cost = f.item.price;
      const total = cost * f.quantity;
      const tax = total * DEFAULT_TAX_SHIPPING_RATE;
      const final = total + tax;
      const statusMap: Record<string, string> = {
        "spec'd": "Need to order",
        "approved": "Need to order",
        "ordered": "Ordered",
        "delivered": "Received",
        "installed": "Installed",
      };
      csvRows.push([
        quote(room?.name ?? "General"),
        quote(f.item.subcategory || f.item.category.replace(/-/g, " ")),
        quote(`${f.item.name}${f.item.color ? ` (${f.item.color})` : ""}${f.item.finish ? ` ${f.item.finish}` : ""}`),
        quote(f.item.vendor),
        "",
        f.quantity,
        quote(statusMap[f.status] || f.status),
        cost.toFixed(2),
        total.toFixed(2),
        tax.toFixed(2),
        final.toFixed(2),
        quote(f.item.vendorUrl),
      ].join(","));
    }

    // Scope of work labor + materials
    for (const s of project.scope ?? []) {
      const room = project.rooms.find(r => r.id === s.roomId);
      if (s.laborCost > 0) {
        csvRows.push([
          quote(room?.name ?? "General"),
          "Labor",
          quote(s.description),
          "", "", // Source, Alternative
          s.laborHours || 1,
          "Pending",
          s.laborHours > 0 ? (s.laborCost / s.laborHours).toFixed(2) : s.laborCost.toFixed(2),
          s.laborCost.toFixed(2),
          "0.00",
          s.laborCost.toFixed(2),
          "",
        ].join(","));
      }
      if (s.materialCost > 0) {
        const tax = s.materialCost * DEFAULT_TAX_SHIPPING_RATE;
        csvRows.push([
          quote(room?.name ?? "General"),
          "Materials",
          quote(s.description),
          "", "",
          1,
          "Pending",
          s.materialCost.toFixed(2),
          s.materialCost.toFixed(2),
          tax.toFixed(2),
          (s.materialCost + tax).toFixed(2),
          "",
        ].join(","));
      }
    }

    // Totals row
    const grandTotal = rows.reduce((s, r) => s + r.totalPrice, 0)
      + (project.finishes ?? []).reduce((s, f) => s + f.item.price * f.quantity, 0)
      + (project.scope ?? []).reduce((s, sc) => s + sc.laborCost + sc.materialCost, 0);
    const grandTax = grandTotal * DEFAULT_TAX_SHIPPING_RATE;

    csvRows.push("");
    csvRows.push([
      "TOTAL", "", "", "", "", "", "", "", grandTotal.toFixed(2), grandTax.toFixed(2), (grandTotal + grandTax).toFixed(2), "",
    ].join(","));

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(project.name)}-masterlist.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logActivity(project.id, "exported", "Exported Teeco masterlist CSV");
  }

  function downloadSleepPlan() {
    const lines = [
      `SLEEP PLAN: ${project.name}`,
      `Target Guests: ${project.targetGuests}`,
      `Total Capacity: ${sleeping}`,
      "",
      "Room,Configuration,Sleeps",
    ];

    for (const room of project.rooms) {
      if (room.selectedBedConfig) {
        lines.push(
          `${room.name},${room.selectedBedConfig.name},${room.selectedBedConfig.totalSleeps}`
        );
      }
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(project.name)}-sleep-plan.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logActivity(project.id, "exported", `Exported sleep plan CSV (${sleeping} guests)`);
  }

  function downloadFullBrief() {
    const lines: string[] = [];

    lines.push("═".repeat(60));
    lines.push(`DESIGN BRIEF: ${project.name}`);
    lines.push("═".repeat(60));
    lines.push("");

    // Property
    lines.push("PROPERTY");
    lines.push("─".repeat(40));
    lines.push(`Address: ${project.property.address}`);
    lines.push(
      `Location: ${project.property.city}, ${project.property.state}`
    );
    lines.push(`Size: ${project.property.squareFootage} sqft`);
    lines.push(
      `Layout: ${project.property.bedrooms} bed / ${project.property.bathrooms} bath / ${project.property.floors} floor(s)`
    );
    lines.push("");

    // Client
    lines.push("CLIENT");
    lines.push("─".repeat(40));
    lines.push(`Name: ${project.client.name}`);
    lines.push(`Email: ${project.client.email}`);
    lines.push(`Phone: ${project.client.phone}`);
    if (project.client.preferences) {
      lines.push(`Preferences: ${project.client.preferences}`);
    }
    lines.push("");

    // Design
    lines.push("DESIGN");
    lines.push("─".repeat(40));
    lines.push(`Style: ${project.style}`);
    lines.push(`Target Guests: ${project.targetGuests}`);
    lines.push(`Current Capacity: ${sleeping}`);
    if (project.budget) {
      lines.push(`Budget: $${project.budget.toLocaleString()}`);
    }
    lines.push(`Furniture Cost: $${totalCost.toLocaleString()}`);
    lines.push("");

    // Sleep Plan
    lines.push("SLEEP PLAN");
    lines.push("─".repeat(40));
    for (const room of project.rooms) {
      if (room.selectedBedConfig && room.selectedBedConfig.totalSleeps > 0) {
        lines.push(
          `  ${room.name}: ${room.selectedBedConfig.name} (sleeps ${room.selectedBedConfig.totalSleeps})`
        );
      }
    }
    lines.push(`  TOTAL: ${sleeping} guests`);
    lines.push("");

    // Rooms + Furniture
    lines.push("ROOM-BY-ROOM FURNITURE");
    lines.push("─".repeat(40));
    for (const room of project.rooms) {
      if (room.furniture.length === 0) continue;
      lines.push("");
      lines.push(`  ${room.name.toUpperCase()}`);
      const roomTotal = room.furniture.reduce(
        (s, f) => s + f.item.price * f.quantity,
        0
      );
      for (const f of room.furniture) {
        lines.push(
          `    - ${f.item.name} (x${f.quantity}) — $${(f.item.price * f.quantity).toLocaleString()} — ${f.item.vendor}`
        );
      }
      lines.push(`    Room Total: $${roomTotal.toLocaleString()}`);
    }
    lines.push("");
    lines.push(`GRAND TOTAL: $${totalCost.toLocaleString()}`);

    // Mood Boards
    if (project.moodBoards.length > 0) {
      lines.push("");
      lines.push("MOOD BOARDS");
      lines.push("─".repeat(40));
      for (const board of project.moodBoards) {
        lines.push(`  ${board.name} (${board.style})`);
        lines.push(`  Colors: ${board.colorPalette.join(", ")}`);
        if (board.inspirationNotes) {
          lines.push(`  Notes: ${board.inspirationNotes}`);
        }
        lines.push("");
      }
    }

    // Scan Links
    lines.push("SCAN LINKS");
    lines.push("─".repeat(40));
    if (project.property.matterportLink)
      lines.push(`  Matterport: ${project.property.matterportLink}`);
    if (project.property.polycamLink)
      lines.push(`  Polycam: ${project.property.polycamLink}`);
    if (project.property.spoakLink)
      lines.push(`  Spoak: ${project.property.spoakLink}`);

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(project.name)}-design-brief.txt`;
    a.click();
    logActivity(project.id, "exported", "Exported full design brief");
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Export & Deliver</h2>
        <p className="text-sm text-brand-600">
          Download your complete design package as spreadsheets and briefs.
        </p>
      </div>

      {/* Export Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="card text-center border-amber/40 bg-amber/5">
          <div className="mb-3 text-3xl">⭐</div>
          <h3 className="font-semibold text-brand-900">Teeco Masterlist (Excel)</h3>
          <p className="text-xs text-brand-600 mt-1 mb-3">
            Multi-sheet xlsx: Action Plan · Common · Bedrooms · Kitchen · Baths · Exterior · Budget Tally.
            Status column color-coded (green=ordered, amber=alt-pending). Send straight to client.
          </p>
          <button
            onClick={downloadXlsx}
            className="btn-primary btn-sm w-full mb-2"
            disabled={generating || rows.length === 0}
          >
            {generating ? "Generating..." : "Download .xlsx"}
          </button>
          <button
            onClick={downloadTeecoMasterlist}
            className="text-[10px] text-brand-600 hover:text-amber-dark hover:underline"
            disabled={rows.length === 0 && (project.finishes?.length ?? 0) === 0 && (project.scope?.length ?? 0) === 0}
          >
            or download CSV (single sheet)
          </button>
        </div>

        <div className="card text-center">
          <div className="mb-3 text-3xl">📊</div>
          <h3 className="font-semibold text-brand-900">Furniture List</h3>
          <p className="text-xs text-brand-600 mt-1 mb-4">
            CSV with all items, quantities, pricing, vendors, and dimensions.
          </p>
          <button
            onClick={downloadCSV}
            className="btn-primary btn-sm w-full"
            disabled={rows.length === 0}
          >
            Download CSV
          </button>
        </div>

        <div className="card text-center">
          <div className="mb-3 text-3xl">🛏️</div>
          <h3 className="font-semibold text-brand-900">Sleep Plan</h3>
          <p className="text-xs text-brand-600 mt-1 mb-4">
            Room-by-room bed configurations and total guest capacity.
          </p>
          <button
            onClick={downloadSleepPlan}
            className="btn-primary btn-sm w-full"
          >
            Download CSV
          </button>
        </div>

        <div className="card text-center">
          <div className="mb-3 text-3xl">📋</div>
          <h3 className="font-semibold text-brand-900">Full Design Brief</h3>
          <p className="text-xs text-brand-600 mt-1 mb-4">
            Complete project summary: property, client, sleep plan, furniture,
            mood boards.
          </p>
          <button
            onClick={downloadFullBrief}
            className="btn-accent btn-sm w-full mb-2"
          >
            Download Brief
          </button>
          <button
            onClick={() => window.open(`/projects/print?id=${project.id}`, "_blank")}
            className="btn-secondary btn-sm w-full"
          >
            Print-Friendly View
          </button>
        </div>
      </div>

      {/* Cost Breakdown */}
      {rows.length > 0 && (
        <div className="card mb-8">
          <h3 className="font-semibold mb-4">Cost Breakdown</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* By Category */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-2">
                By Category
              </h4>
              <div className="space-y-1.5">
                {getCategoryBreakdown(rows).map(({ category, total, pct }) => (
                  <div key={category} className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-brand-700 capitalize">
                          {category.replace(/-/g, " ")}
                        </span>
                        <span className="text-brand-900 font-medium">
                          ${total.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-brand-900/5">
                        <div
                          className="h-1.5 rounded-full bg-amber"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* By Room */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-2">
                By Room
              </h4>
              <div className="space-y-1.5">
                {getRoomBreakdown(project, totalCost).map(({ room, total, pct }) => (
                  <div key={room} className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-brand-700">{room}</span>
                        <span className="text-brand-900 font-medium">
                          ${total.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-brand-900/5">
                        <div
                          className="h-1.5 rounded-full bg-sage"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Table */}
      <div className="card">
        <h3 className="font-semibold mb-4">
          Furniture List Preview ({rows.length} items)
        </h3>

        {rows.length === 0 ? (
          <p className="text-sm text-brand-600 text-center py-8">
            No furniture selected yet. Go to the Furniture tab to add items.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-900/10 text-left">
                  <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wider text-brand-600">
                    Room
                  </th>
                  <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wider text-brand-600">
                    Item
                  </th>
                  <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wider text-brand-600">
                    Vendor
                  </th>
                  <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wider text-brand-600 text-right">
                    Qty
                  </th>
                  <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wider text-brand-600 text-right">
                    Unit
                  </th>
                  <th className="pb-2 text-xs font-semibold uppercase tracking-wider text-brand-600 text-right">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-brand-900/5 last:border-0"
                  >
                    <td className="py-2 pr-4 text-brand-600">
                      {row.room}
                    </td>
                    <td className="py-2 pr-4 font-medium text-brand-900">
                      {row.itemName}
                    </td>
                    <td className="py-2 pr-4 text-brand-600">{row.vendor}</td>
                    <td className="py-2 pr-4 text-right">{row.quantity}</td>
                    <td className="py-2 pr-4 text-right">
                      ${row.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 text-right font-medium">
                      ${row.totalPrice.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-900/20">
                  <td
                    colSpan={5}
                    className="py-3 text-right font-semibold text-brand-900"
                  >
                    Grand Total
                  </td>
                  <td className="py-3 text-right text-lg font-bold text-brand-900">
                    ${totalCost.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──

function buildExportRows(project: Project): ExportRow[] {
  const rows: ExportRow[] = [];
  for (const room of project.rooms) {
    for (const f of room.furniture) {
      rows.push({
        room: room.name,
        itemName: f.item.name,
        category: f.item.category,
        quantity: f.quantity,
        unitPrice: f.item.price,
        totalPrice: f.item.price * f.quantity,
        dimensions: `${f.item.widthIn}"W x ${f.item.depthIn}"D x ${f.item.heightIn}"H`,
        vendor: f.item.vendor,
        vendorUrl: f.item.vendorUrl,
        color: f.item.color,
        material: f.item.material,
        notes: f.notes,
      });
    }
  }
  return rows;
}

function quote(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getCategoryBreakdown(rows: ExportRow[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.category, (map.get(row.category) ?? 0) + row.totalPrice);
  }
  const total = rows.reduce((s, r) => s + r.totalPrice, 0);
  return Array.from(map.entries())
    .map(([category, catTotal]) => ({
      category,
      total: catTotal,
      pct: total > 0 ? (catTotal / total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

function getRoomBreakdown(project: Project, totalCost: number) {
  return project.rooms
    .map((room) => {
      const roomTotal = room.furniture.reduce(
        (s, f) => s + f.item.price * f.quantity,
        0
      );
      return {
        room: room.name,
        total: roomTotal,
        pct: totalCost > 0 ? (roomTotal / totalCost) * 100 : 0,
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}
