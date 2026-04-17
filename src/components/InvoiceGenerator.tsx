"use client";

import { useState, useMemo } from "react";
import { getStudioSettings, calculateClientPrice, type StudioSettings } from "@/lib/studio-settings";
import { logActivity } from "@/lib/store";
import { useToast } from "./Toast";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
}

type DocType = "proposal" | "invoice" | "receipt";

interface LineItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  category: string;
}

export default function InvoiceGenerator({ project }: Props) {
  const toast = useToast();
  const settings = getStudioSettings();
  const [docType, setDocType] = useState<DocType>("proposal");
  const [docNumber, setDocNumber] = useState(() => generateDocNumber(docType));
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState(settings.briefFooterNote);
  const [paymentTerms, setPaymentTerms] = useState("Net 14");
  const [depositPercent, setDepositPercent] = useState(50);

  // Build line items from project
  const { lineItems, furnitureSubtotal, finishesSubtotal, scopeLabor, scopeMaterial } = useMemo(() => {
    const items: LineItem[] = [];
    let furnTotal = 0;
    let finishTotal = 0;
    let scopeLab = 0;
    let scopeMat = 0;

    // Furniture
    for (const room of project.rooms ?? []) {
      for (const f of room.furniture ?? []) {
        const unitPrice = calculateClientPrice(f.item.price, settings);
        items.push({
          description: `${f.item.name} (${f.item.color}) — ${room.name}`,
          qty: f.quantity,
          unit: "each",
          unitPrice,
          category: "Furnishings",
        });
        furnTotal += unitPrice * f.quantity;
      }
    }

    // Finishes
    for (const f of project.finishes ?? []) {
      const room = project.rooms.find(r => r.id === f.roomId);
      const unitPrice = calculateClientPrice(f.item.price, settings);
      items.push({
        description: `${f.item.name} (${f.item.color}) — ${room?.name ?? "General"}`,
        qty: f.quantity,
        unit: f.item.unit,
        unitPrice,
        category: "Finishes & Materials",
      });
      finishTotal += unitPrice * f.quantity;
    }

    // Scope of work
    for (const s of project.scope ?? []) {
      const room = project.rooms.find(r => r.id === s.roomId);
      if (s.laborCost > 0) {
        items.push({
          description: `Labor: ${s.description}${room ? ` (${room.name})` : ""}`,
          qty: s.laborHours,
          unit: "hrs",
          unitPrice: s.laborHours > 0 ? s.laborCost / s.laborHours : 0,
          category: "Labor",
        });
        scopeLab += s.laborCost;
      }
      if (s.materialCost > 0) {
        items.push({
          description: `Materials: ${s.description}${room ? ` (${room.name})` : ""}`,
          qty: 1,
          unit: "lot",
          unitPrice: s.materialCost,
          category: "Contractor Materials",
        });
        scopeMat += s.materialCost;
      }
    }

    return {
      lineItems: items,
      furnitureSubtotal: furnTotal,
      finishesSubtotal: finishTotal,
      scopeLabor: scopeLab,
      scopeMaterial: scopeMat,
    };
  }, [project, settings]);

  const designFee = settings.preferredMarkupType === "flat" ? settings.defaultFlatDesignFee : 0;
  const subtotal = furnitureSubtotal + finishesSubtotal + scopeLabor + scopeMaterial + designFee;
  const contingency = project.projectType === "renovation" || project.projectType === "full-redesign"
    ? subtotal * (settings.contingencyPercent / 100)
    : 0;
  const total = subtotal + contingency;
  const depositAmount = total * (depositPercent / 100);

  function downloadDocument() {
    const lines: string[] = [];
    const W = 72;

    // Header
    lines.push("=".repeat(W));
    lines.push(docType === "proposal" ? "DESIGN PROPOSAL" : docType === "invoice" ? "INVOICE" : "RECEIPT");
    lines.push("=".repeat(W));
    lines.push("");

    if (settings.studioName) {
      lines.push(settings.studioName);
      if (settings.studioAddress) lines.push(settings.studioAddress);
      if (settings.studioEmail) lines.push(settings.studioEmail);
      if (settings.studioPhone) lines.push(settings.studioPhone);
      if (settings.studioWebsite) lines.push(settings.studioWebsite);
      lines.push("");
    }

    // Doc meta
    lines.push(`${docType.toUpperCase()} #:  ${docNumber}`);
    lines.push(`Issue Date:    ${issueDate}`);
    if (docType !== "receipt") lines.push(`Due Date:      ${dueDate}`);
    lines.push(`Payment Terms: ${paymentTerms}`);
    lines.push("");

    // Bill to
    lines.push("BILL TO");
    lines.push("-".repeat(W));
    lines.push(project.client.name || "Client Name");
    if (project.client.email) lines.push(project.client.email);
    if (project.client.phone) lines.push(project.client.phone);
    if (project.property.address) {
      lines.push(project.property.address);
      lines.push(`${project.property.city}, ${project.property.state}`);
    }
    lines.push("");

    // Project meta
    lines.push("PROJECT");
    lines.push("-".repeat(W));
    lines.push(`Project:       ${project.name}`);
    lines.push(`Type:          ${project.projectType.replace(/-/g, " ")}`);
    lines.push(`Style:         ${project.style.replace(/-/g, " ")}`);
    lines.push(`Property:      ${project.property.squareFootage.toLocaleString()} sqft, ${project.property.bedrooms}bd/${project.property.bathrooms}ba`);
    lines.push("");

    // Line items grouped by category
    const grouped = new Map<string, LineItem[]>();
    for (const item of lineItems) {
      const list = grouped.get(item.category) ?? [];
      list.push(item);
      grouped.set(item.category, list);
    }

    for (const [category, items] of Array.from(grouped.entries())) {
      lines.push(category.toUpperCase());
      lines.push("-".repeat(W));
      lines.push(pad("Description", 40) + pad("Qty", 6, "right") + pad("Unit", 6, "right") + pad("Total", 18, "right"));
      let catTotal = 0;
      for (const item of items) {
        const total = item.qty * item.unitPrice;
        catTotal += total;
        lines.push(
          pad(item.description.slice(0, 38), 40) +
          pad(item.qty.toString(), 6, "right") +
          pad(formatCurrency(item.unitPrice), 6, "right") +
          pad(formatCurrency(total), 18, "right")
        );
      }
      lines.push(pad("Subtotal", 52) + pad(formatCurrency(catTotal), 18, "right"));
      lines.push("");
    }

    // Design fee
    if (designFee > 0) {
      lines.push("DESIGN SERVICES");
      lines.push("-".repeat(W));
      lines.push(pad("Design fee (flat)", 54) + pad(formatCurrency(designFee), 18, "right"));
      lines.push("");
    }

    // Totals
    lines.push("=".repeat(W));
    lines.push(pad("Subtotal", 54) + pad(formatCurrency(subtotal), 18, "right"));
    if (contingency > 0) {
      lines.push(pad(`Contingency (${settings.contingencyPercent}%)`, 54) + pad(formatCurrency(contingency), 18, "right"));
    }
    lines.push(pad("TOTAL", 54) + pad(formatCurrency(total), 18, "right"));
    lines.push("");

    if (docType === "proposal" || docType === "invoice") {
      lines.push(pad(`Deposit Due (${depositPercent}%)`, 54) + pad(formatCurrency(depositAmount), 18, "right"));
      lines.push(pad(`Balance Due`, 54) + pad(formatCurrency(total - depositAmount), 18, "right"));
      lines.push("");
    }

    // Notes
    if (notes) {
      lines.push("NOTES");
      lines.push("-".repeat(W));
      lines.push(notes);
      lines.push("");
    }

    // Payment info / Acceptance
    if (docType === "proposal") {
      lines.push("ACCEPTANCE");
      lines.push("-".repeat(W));
      lines.push("Client signature: _____________________________  Date: _________");
      lines.push("");
      lines.push("By signing, client accepts the scope, pricing, and terms above.");
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(project.name)}-${docType}-${docNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${docType === "proposal" ? "Proposal" : docType === "invoice" ? "Invoice" : "Receipt"} downloaded`);
    logActivity(project.id, "document_generated", `Generated ${docType} ${docNumber}`);
  }

  function openPrintView() {
    window.print();
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Proposals &amp; Invoices</h2>
          <p className="text-sm text-brand-600">
            Generate professional proposals, invoices, and receipts with your pricing markup applied.
            {settings.preferredMarkupType === "percent" && ` Client pricing: +${settings.defaultMarkupPercent}% markup.`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={openPrintView} className="btn-secondary btn-sm">
            Print / PDF
          </button>
          <button onClick={downloadDocument} className="btn-primary btn-sm">
            Download .txt
          </button>
        </div>
      </div>

      {/* Doc Type Tabs */}
      <div className="flex gap-1 mb-6 rounded-xl bg-white border border-brand-900/10 p-1 w-fit">
        {(["proposal", "invoice", "receipt"] as const).map(t => (
          <button
            key={t}
            onClick={() => {
              setDocType(t);
              setDocNumber(generateDocNumber(t));
            }}
            className={docType === t ? "tab-active" : "tab"}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Settings Reminder */}
      {!settings.studioName && (
        <div className="mb-4 rounded-lg bg-amber/10 border border-amber/30 px-4 py-2 text-xs text-brand-700">
          Your studio name isn&apos;t set. Go to{" "}
          <a href="/settings" className="underline font-semibold">Settings → Studio Profile</a>
          {" "}to add your name, logo, and contact info to every document.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Meta + Totals */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="text-sm font-semibold mb-3">Document Details</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Document Number</label>
                <input
                  className="input"
                  value={docNumber}
                  onChange={e => setDocNumber(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Issue Date</label>
                <input
                  type="date"
                  className="input"
                  value={issueDate}
                  onChange={e => setIssueDate(e.target.value)}
                />
              </div>
              {docType !== "receipt" && (
                <div>
                  <label className="label">Due Date</label>
                  <input
                    type="date"
                    className="input"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                  />
                </div>
              )}
              <div>
                <label className="label">Payment Terms</label>
                <select
                  className="select"
                  value={paymentTerms}
                  onChange={e => setPaymentTerms(e.target.value)}
                >
                  <option>Due on receipt</option>
                  <option>Net 7</option>
                  <option>Net 14</option>
                  <option>Net 30</option>
                  <option>50% deposit, balance on completion</option>
                </select>
              </div>
              {(docType === "proposal" || docType === "invoice") && (
                <div>
                  <label className="label">Deposit %</label>
                  <input
                    type="number"
                    className="input"
                    value={depositPercent}
                    onChange={e => setDepositPercent(parseFloat(e.target.value) || 0)}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="card bg-brand-900 text-white">
            <h3 className="text-sm font-semibold mb-3 text-amber">Totals</h3>
            <div className="space-y-2 text-sm">
              {furnitureSubtotal > 0 && (
                <TotalRow label="Furnishings" value={furnitureSubtotal} />
              )}
              {finishesSubtotal > 0 && (
                <TotalRow label="Finishes &amp; Materials" value={finishesSubtotal} />
              )}
              {scopeLabor > 0 && <TotalRow label="Labor" value={scopeLabor} />}
              {scopeMaterial > 0 && <TotalRow label="Contractor Materials" value={scopeMaterial} />}
              {designFee > 0 && <TotalRow label="Design Fee" value={designFee} />}
              <div className="border-t border-white/10 pt-2 mt-2">
                <TotalRow label="Subtotal" value={subtotal} />
                {contingency > 0 && (
                  <TotalRow label={`Contingency ${settings.contingencyPercent}%`} value={contingency} />
                )}
              </div>
              <div className="border-t border-white/20 pt-2 mt-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-white/80">Total</span>
                  <span className="text-2xl font-bold text-amber">${total.toLocaleString()}</span>
                </div>
                {depositAmount > 0 && (docType === "proposal" || docType === "invoice") && (
                  <div className="mt-2 text-xs text-white/60">
                    Deposit due ({depositPercent}%): ${depositAmount.toLocaleString()}
                    <br />
                    Balance: ${(total - depositAmount).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live Preview */}
        <div className="lg:col-span-2">
          <div className="card print:shadow-none print:border-0">
            {/* Header */}
            <div className="flex items-start justify-between mb-8 pb-6 border-b border-brand-900/10">
              <div>
                {settings.studioLogoUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={settings.studioLogoUrl} alt={settings.studioName} className="h-10 mb-3" />
                )}
                <div className="text-xl font-bold text-brand-900">{settings.studioName || "Your Studio Name"}</div>
                <div className="text-xs text-brand-600 leading-relaxed">
                  {settings.studioAddress && <div>{settings.studioAddress}</div>}
                  {settings.studioEmail && <div>{settings.studioEmail}</div>}
                  {settings.studioPhone && <div>{settings.studioPhone}</div>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-brand-600">{docType}</div>
                <div className="text-lg font-bold text-brand-900">{docNumber}</div>
                <div className="text-xs text-brand-600 mt-2">
                  Issued: {issueDate}
                  {docType !== "receipt" && <><br />Due: {dueDate}</>}
                </div>
              </div>
            </div>

            {/* Bill to */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-brand-600 mb-1">Bill To</div>
                <div className="text-sm text-brand-900 font-medium">{project.client.name || "Client Name"}</div>
                <div className="text-xs text-brand-600">
                  {project.client.email && <div>{project.client.email}</div>}
                  {project.client.phone && <div>{project.client.phone}</div>}
                  {project.property.address && <div>{project.property.address}</div>}
                  {project.property.city && <div>{project.property.city}, {project.property.state}</div>}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-brand-600 mb-1">Project</div>
                <div className="text-sm text-brand-900 font-medium">{project.name}</div>
                <div className="text-xs text-brand-600 capitalize">
                  {project.projectType.replace(/-/g, " ")} &middot; {project.style.replace(/-/g, " ")}
                </div>
                <div className="text-xs text-brand-600">
                  {project.property.squareFootage.toLocaleString()} sqft
                </div>
              </div>
            </div>

            {/* Line items */}
            {lineItems.length > 0 ? (
              <table className="w-full text-sm mb-6">
                <thead>
                  <tr className="border-b-2 border-brand-900/20">
                    <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-brand-600">Description</th>
                    <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-brand-600">Qty</th>
                    <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-brand-600">Unit</th>
                    <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-brand-600">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => (
                    <tr key={i} className="border-b border-brand-900/5">
                      <td className="py-2 text-brand-900">{item.description}</td>
                      <td className="py-2 text-right text-brand-700">{item.qty} {item.unit}</td>
                      <td className="py-2 text-right text-brand-700">${item.unitPrice.toFixed(2)}</td>
                      <td className="py-2 text-right font-medium text-brand-900">${(item.qty * item.unitPrice).toFixed(2)}</td>
                    </tr>
                  ))}
                  {designFee > 0 && (
                    <tr className="border-b border-brand-900/5">
                      <td className="py-2 text-brand-900">Design services (flat fee)</td>
                      <td className="py-2 text-right">1</td>
                      <td className="py-2 text-right">${designFee}</td>
                      <td className="py-2 text-right font-medium">${designFee.toFixed(2)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <div className="rounded-lg bg-brand-900/5 p-4 text-sm text-brand-600 text-center">
                No line items yet. Add furniture, finishes, or scope items to populate this document.
              </div>
            )}

            {/* Totals */}
            <div className="flex justify-end mb-6">
              <div className="w-72 space-y-1 text-sm">
                <div className="flex justify-between text-brand-700">
                  <span>Subtotal</span>
                  <span>${subtotal.toLocaleString()}</span>
                </div>
                {contingency > 0 && (
                  <div className="flex justify-between text-brand-700">
                    <span>Contingency ({settings.contingencyPercent}%)</span>
                    <span>${contingency.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-brand-900/20 font-bold text-brand-900 text-base">
                  <span>Total</span>
                  <span>${total.toLocaleString()}</span>
                </div>
                {depositAmount > 0 && (docType === "proposal" || docType === "invoice") && (
                  <>
                    <div className="flex justify-between pt-2 text-amber-dark">
                      <span>Deposit ({depositPercent}%)</span>
                      <span>${depositAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-brand-600">
                      <span>Balance Due</span>
                      <span>${(total - depositAmount).toLocaleString()}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Notes */}
            {notes && (
              <div className="border-t border-brand-900/5 pt-4 mb-4">
                <div className="text-[10px] uppercase tracking-wider text-brand-600 mb-1">Notes</div>
                <p className="text-sm text-brand-700">{notes}</p>
              </div>
            )}

            {docType === "proposal" && (
              <div className="border-t border-brand-900/5 pt-6 mt-6">
                <div className="text-[10px] uppercase tracking-wider text-brand-600 mb-3">Acceptance</div>
                <div className="grid grid-cols-2 gap-6 text-sm">
                  <div>
                    <div className="border-b border-brand-900/40 pb-1 mb-1">&nbsp;</div>
                    <div className="text-[10px] text-brand-600">Client Signature</div>
                  </div>
                  <div>
                    <div className="border-b border-brand-900/40 pb-1 mb-1">&nbsp;</div>
                    <div className="text-[10px] text-brand-600">Date</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Editable notes field */}
          <div className="card mt-4">
            <label className="label">Notes / Terms (shown on document)</label>
            <textarea
              className="input min-h-[80px]"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Payment instructions, project timeline, warranty terms..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-white/70" dangerouslySetInnerHTML={{ __html: label }} />
      <span>${value.toLocaleString()}</span>
    </div>
  );
}

function generateDocNumber(type: DocType): string {
  const prefix = type === "proposal" ? "P" : type === "invoice" ? "INV" : "R";
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${year}-${rand}`;
}

function formatCurrency(n: number): string {
  return "$" + n.toFixed(2);
}

function pad(s: string, len: number, align: "left" | "right" = "left"): string {
  if (s.length >= len) return s.slice(0, len);
  const padding = " ".repeat(len - s.length);
  return align === "right" ? padding + s : s + padding;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
