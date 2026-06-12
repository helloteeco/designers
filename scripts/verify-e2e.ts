/**
 * End-to-end verification of the scan → deliverables flow.
 *
 * Part A — first-time designer walkthrough against a running server
 *   (npm run start, port 3100), with NO Gemini key: new project →
 *   import (skip) → confirm rooms (zero-room gate) → style → review
 *   (graceful render failure) → export (gating + real .xlsx download).
 * Part B — Install Guide on the rich demo fixture: 26 .guide-page
 *   elements in the reference order, then page.pdf() and structural
 *   assertions on the actual PDF text.
 *
 * Run: npx tsx scripts/verify-e2e.ts
 */
import { chromium, Page, BrowserContext } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFParse } = require("pdf-parse");
import { DEMO_PROJECT } from "./fixtures/demo-project";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const SHOTS = "/tmp/e2e-shots";
const PASS: string[] = [];

function ok(label: string, cond: boolean, detail?: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${label}${detail ? ` — ${detail}` : ""}`);
  PASS.push(label);
  console.log(`  ✅ ${label}`);
}

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
// A visible fake floor plan so the plan page/thumbnails have real pixels.
const PLAN_SVG =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#fff" stroke="#2B2B2B" stroke-width="6"/><line x1="400" y1="0" x2="400" y2="500" stroke="#2B2B2B" stroke-width="4"/><line x1="0" y1="250" x2="800" y2="250" stroke="#2B2B2B" stroke-width="4"/><text x="120" y="120" font-size="28" fill="#2B2B2B">LIVING</text><text x="520" y="120" font-size="28" fill="#2B2B2B">KITCHEN</text><text x="120" y="380" font-size="28" fill="#2B2B2B">BED 1</text><text x="520" y="380" font-size="28" fill="#2B2B2B">BED 2</text></svg>`
  ).toString("base64");

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

// ───────────────────────── Part A ─────────────────────────

async function partA(ctx: BrowserContext) {
  console.log("\nPart A — first-time designer walkthrough (no Gemini key)");
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto(`${BASE}/projects/new`, { waitUntil: "networkidle" });
  await shoot(page, "a1-new-project");

  // Simplified default screen: exactly client / address / city / state / photo.
  ok("New Project: simplified single screen", await page.getByText("Client name(s)").isVisible());
  ok(
    "New Project: advanced wizard hidden by default",
    !(await page.getByText("Import Property").first().isVisible().catch(() => false))
  );
  await page.getByPlaceholder("e.g. Sarah & Mike Thompson").fill("Kelly & Zyaire");
  await page.getByPlaceholder("123 Mountain View Dr").fill("2 Hiddenwoods Ct");
  await page.getByPlaceholder("Gatlinburg").fill("Edgewood");
  await page.getByPlaceholder("TN").fill("MD");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[^/?]+$/, { timeout: 15000 });
  ok("Create project → lands on project page", true);

  // Step 1 — Import scan (guided is the default view).
  await page.getByText("Import scan", { exact: false }).first().waitFor({ timeout: 10000 });
  await shoot(page, "a2-step1-import");
  ok("Step 1 visible with step indicator", await page.getByText("Confirm rooms").first().isVisible());
  await page.getByRole("button", { name: "No scan? Add rooms manually in the next step." }).click();

  // Step 2 — Confirm rooms; zero-room gate must hold.
  const looksGood = page.getByRole("button", { name: "Looks good" });
  await looksGood.waitFor({ timeout: 10000 });
  await shoot(page, "a3-step2-rooms-empty");
  ok("Step 2: zero rooms → primary disabled", await looksGood.isDisabled());
  await page.getByRole("button", { name: "+ Add your first room" }).click();
  await page.getByRole("button", { name: "+ Add a room" }).click(); // second room
  ok("Step 2: rooms added inline", true);
  await shoot(page, "a4-step2-rooms");
  await looksGood.click();

  // Step 3 — Pick a style (default preselected, one click through).
  const useStyle = page.getByRole("button", { name: "Use this style" });
  await useStyle.waitFor({ timeout: 10000 });
  await shoot(page, "a5-step3-style");
  await useStyle.click();

  // Step 4 — Review: auto-filled furniture; render failure must be graceful.
  const approve = page.getByRole("button", { name: "Approve all & continue" });
  await approve.waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500); // allow auto-design to persist
  await shoot(page, "a6-step4-review");
  const genBtn = page.getByRole("button", { name: /Generate render/i }).first();
  if (await genBtn.isVisible().catch(() => false)) {
    await genBtn.click();
    await page
      .getByText(/AI rendering isn't connected yet/i)
      .first()
      .waitFor({ timeout: 30000 });
    ok("Step 4: missing Gemini key → plain-language inline error (no dead end)", true);
    await shoot(page, "a7-step4-render-error");
  } else {
    ok("Step 4: no render button found (skipped graceful-failure check)", false, "expected Generate render button");
  }
  await approve.click();

  // Step 5 — Export.
  await page.getByText("Download Install Guide (PDF)").waitFor({ timeout: 10000 });
  await shoot(page, "a8-step5-export");
  ok("Step 5: both deliverable buttons present", await page.getByText("Download Masterlist (.xlsx)").isVisible());

  // Real .xlsx download through the UI.
  const dl = page.waitForEvent("download", { timeout: 30000 });
  await page.getByText("Download Masterlist (.xlsx)").click();
  const download = await dl;
  const xlsxPath = "/tmp/masterlist-ui.xlsx";
  await download.saveAs(xlsxPath);
  ok("Step 5: Masterlist .xlsx downloads via UI", fs.existsSync(xlsxPath) && fs.statSync(xlsxPath).size > 5000);

  // Re-open the downloaded workbook and check the tab contract end-to-end.
  const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const tabs = wb.worksheets.map((w) => w.name);
  const EXPECTED_TABS = [
    "Action Plan", "Renovations", "Common", "Bedrooms", "Kitchen", "Baths",
    "Consumables and Other", "Exterior", "Budget Tally Sheet", "Completed payments",
  ];
  ok("UI-downloaded workbook has the 10 reference tabs in order", JSON.stringify(tabs) === JSON.stringify(EXPECTED_TABS), tabs.join(", "));

  // Install Guide opens from step 5 (popup) and renders pages with footers.
  const popupP = page.waitForEvent("popup", { timeout: 15000 });
  await page.getByText("Download Install Guide (PDF)").click();
  const guide = await popupP;
  await guide.waitForLoadState("networkidle");
  await guide.locator(".guide-page").first().waitFor({ timeout: 15000 });
  const n = await guide.locator(".guide-page").count();
  const footer1 = await guide.locator(".guide-page").first().innerText();
  ok(`Install Guide opens from step 5 (${n} pages for minimal project)`, n >= 8);
  // Footer is CSS-uppercased; innerText reflects the rendered transform.
  ok("Install Guide pages carry Page X of N footers", new RegExp(`Page 1 of ${n}`, "i").test(footer1));
  await guide.close();

  // Advanced Mode toggle: full workspace appears, guided returns when off.
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.locator('button:has-text("Brief")').first().waitFor({ timeout: 10000 });
  ok("Advanced Mode ON → full tab workspace", true);
  await shoot(page, "a9-advanced-tabs");
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByText("Download Install Guide (PDF)").waitFor({ timeout: 10000 });
  ok("Advanced Mode OFF → guided view returns", true);

  const realErrors = consoleErrors.filter((e) => !/Failed to load resource|favicon|404/i.test(e));
  ok("No page crashes during walkthrough", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
  await page.close();
}

// ───────────────────────── Part B ─────────────────────────

function enrichedDemoProject() {
  const p = JSON.parse(JSON.stringify(DEMO_PROJECT));
  p.id = "e2e-demo";
  const plan = {
    id: "plan1", name: "Main Floor", url: PLAN_SVG, type: "image",
    uploadedAt: new Date().toISOString(), notes: "", isPrimary: true,
  };
  p.property.floorPlans = [plan];
  p.property.heroImageUrl = PNG_1PX;
  p.property.planMarkers = [
    { id: "m1", type: "art", x: 22, y: 28 },
    { id: "m2", type: "mirror", x: 48, y: 44 },
    { id: "m3", type: "tv", x: 70, y: 30 },
  ];
  const byName = (frag: string) =>
    p.rooms.find((r: { name: string }) => r.name.toLowerCase().includes(frag));
  for (const r of p.rooms) {
    r.sceneSnapshot = PNG_1PX;
    r.annotation = { floorPlanId: "plan1", x: 10, y: 10, width: 35, height: 35 };
  }
  // Reference multi-view set: Living ×2 boards, Kitchen ×2, Bedroom 2 ×2.
  byName("living").extraBoardImageUrls = [PNG_1PX];
  byName("kitchen").extraBoardImageUrls = [PNG_1PX];
  byName("bedroom 2").extraBoardImageUrls = [PNG_1PX];
  // AI renders: living/kitchen/bedrooms via aiRenderUrls; dining via legacy originalRenderUrl.
  byName("living").aiRenderUrls = [PNG_1PX];
  byName("kitchen").aiRenderUrls = [PNG_1PX];
  byName("bedroom 1").aiRenderUrls = [PNG_1PX];
  byName("bedroom 2").aiRenderUrls = [PNG_1PX, PNG_1PX];
  byName("bedroom 3").aiRenderUrls = [PNG_1PX];
  byName("dining").originalRenderUrl = PNG_1PX;
  return p;
}

async function partB(ctx: BrowserContext) {
  console.log("\nPart B — Install Guide 26-page reference structure + printed PDF");
  const proj = enrichedDemoProject();
  const page = await ctx.newPage();
  await page.addInitScript((projJson: string) => {
    localStorage.setItem("designStudio_projects", projJson);
    localStorage.setItem(
      "designStudio_settings",
      JSON.stringify({ studioName: "Teeco Design", studioEmail: "design@teeco.co", studioPhone: "(555) 010-2030" })
    );
  }, JSON.stringify([proj]));

  await page.goto(`${BASE}/projects/install-guide?id=${proj.id}`, { waitUntil: "networkidle" });
  await page.locator(".guide-page").first().waitFor({ timeout: 15000 });
  const count = await page.locator(".guide-page").count();
  ok("Reference room set → exactly 26 pages", count === 26, `got ${count}`);

  const texts: string[] = await page.locator(".guide-page").allInnerTexts();
  const has = (i: number, re: RegExp) => re.test(texts[i] ?? "");
  // Cover renders the headline on two lines and joins couple names with "+"
  // (reference deliverable: "Kelly + Zyaire").
  ok("p1 Cover: DESIGN & INSTALL GUIDE + client + address",
    has(0, /DESIGN &\s*INSTALL GUIDE/i) && has(0, /Kelly \+ Zyaire/i) && has(0, /2 Hiddenwoods Ct/i));
  ok("p2 Floor Plan: title + occupancy + Art/Mirror/TV key",
    has(1, /FLOOR PLAN/i) && has(1, /OCCUPANCY/i) && has(1, /\bART\b/i) && has(1, /\bMIRROR\b/i) && has(1, /\bTV\b/i));
  ok("p2 occupancy breakdown includes bunk line", has(1, /Queen over Queen Bunk/i));
  ok("p3–4 Living boards", has(2, /LIVING/i) && has(3, /LIVING/i));
  ok("p5 Living AI render + verbatim disclaimer", has(4, /AI RENDER/i) &&
    has(4, /\*This rendering is AI generated and is not exact/i) &&
    has(4, /visual inspiration only/i));
  ok("p6 Dining board / p7 Dining AI (legacy render fallback)", has(5, /DINING/i) && has(6, /AI RENDER/i));
  ok("p8–9 Kitchen boards / p10 Kitchen AI", has(7, /KITCHEN/i) && has(8, /KITCHEN/i) && has(9, /AI RENDER/i));
  ok("p11–17 Bedrooms (boards + AI, Bedroom 2 ×2 boards)",
    has(10, /BEDROOM 1/i) && has(11, /AI RENDER/i) && has(12, /BEDROOM 2/i) &&
    has(13, /BEDROOM 2/i) && has(14, /AI RENDER/i) && has(15, /BEDROOM 3/i) && has(16, /AI RENDER/i));
  ok("bedroom pages include TIPS block", /TIPS/i.test(texts[10]));
  ok("p18–19 Bathrooms with install heights + expanded key",
    has(17, /BATHROOM/i) && has(17, /42|70|26/) && has(17, /Towel/i) && has(18, /BATHROOM/i));
  ok("p20 Exterior board-only (no key legend)", has(19, /EXTERIOR/i) && !/Mirror/i.test(texts[19]));
  ok("p21 Curtains/Art rules", has(20, /CURTAIN/i) && has(20, /6|10/) && has(20, /60/));
  ok("p22 Rug/Pillows/Blankets — real diagrams, no placeholders",
    has(21, /RUG/i) && has(21, /PILLOW/i) && !/\[pillow placement reference\]/.test(texts[21]));
  ok("p23 Ordering Tips with HostGPO + Minoan", has(22, /HostGPO/i) && has(22, /Minoan/i));
  ok("p24 Pre-Install / p25 Install Execution (6 steps each)",
    has(23, /PRE-INSTALL/i) && has(24, /INSTALL EXECUTION/i) && /6|six/i.test(texts[23] + texts[24]));
  ok("p26 Contact: designer + teeco.co", has(25, /teeco\.co/i) && has(25, /Teeco Design/i));
  for (let i = 0; i < 26; i++) {
    if (!new RegExp(`Page ${i + 1} of 26`, "i").test(texts[i])) {
      throw new Error(`Missing footer on page ${i + 1}`);
    }
  }
  ok("Every page carries 'Page X of 26' footer", true);
  const title = await page.title();
  ok("PDF metadata title set from address", /2 Hiddenwoods Ct.*Design & Install Guide/.test(title), title);

  // Screenshots of key pages for human review.
  const grab = async (idx: number, name: string) =>
    page.locator(".guide-page").nth(idx).screenshot({ path: path.join(SHOTS, name) });
  await grab(0, "b-p01-cover.png");
  await grab(1, "b-p02-floorplan.png");
  await grab(2, "b-p03-living-board.png");
  await grab(4, "b-p05-living-ai.png");
  await grab(17, "b-p18-bathroom.png");
  await grab(21, "b-p22-rug-pillows.png");
  await grab(25, "b-p26-contact.png");

  // Print the actual PDF and verify its structure.
  const pdfPath = "/tmp/install-guide.pdf";
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
  const parser = new PDFParse({ data: new Uint8Array(fs.readFileSync(pdfPath)) });
  const parsed = await parser.getText();
  const numPages = parsed.total ?? parsed.pages?.length;
  ok("Printed PDF has 26 pages", numPages === 26, `got ${numPages}`);
  // Letter-spaced (tracked) titles extract as "D E S I G N …" — compare on
  // whitespace-squashed lowercase text instead.
  const squash = (parsed.text as string).replace(/\s+/g, "").toLowerCase();
  for (const frag of [
    "design&installguide", "floorplan", "airender", "hostgpo", "minoan",
    "page1of26", "page26of26", "teeco.co", "aigenerated",
  ]) {
    ok(`Printed PDF contains "${frag}" (squashed match)`, squash.includes(frag));
  }
  await page.close();
}

// ───────────────────────── main ─────────────────────────

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  // Full Chromium is installed in this environment; the separate headless
  // shell is not — point Playwright at the real binary.
  const browser = await chromium.launch({
    executablePath:
      process.env.E2E_CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  // Pre-seed a signed-in localStorage user for every page in this context.
  await ctx.addInitScript(() => {
    if (!localStorage.getItem("designStudio_user")) {
      localStorage.setItem("designStudio_user", JSON.stringify({ name: "E2E Designer", email: "e2e@teeco.co" }));
    }
  });
  try {
    await partA(ctx);
    await partB(ctx);
    console.log(`\nE2E verification PASSED — ${PASS.length} assertions.`);
    console.log(`Screenshots: ${SHOTS} · PDF: /tmp/install-guide.pdf · XLSX: /tmp/masterlist-ui.xlsx`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("\n❌ E2E verification FAILED:", e.message ?? e);
  process.exit(1);
});
