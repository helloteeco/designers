/**
 * Designer dogfood: 251 Pelfrey Dr, Campton KY.
 *
 * Simulates the real workflow — "I opened the Matterport, screenshotted each
 * room, exported the floor plan, now make me the deliverables":
 *   1. Generates stand-in assets (schematic floor-plan SVG with labeled
 *      dimensions, exterior photo, 8 room screenshots) in /tmp/assets.
 *   2. Drives the REAL UI in Chromium: New Project → Import (scan link +
 *      plan upload) → Confirm rooms → Style → Review → Export.
 *   3. Saves a screenshot of every screen to /tmp/dogfood, downloads the
 *      Masterlist, prints the Install Guide PDF.
 *
 * Run: npx tsx scripts/dogfood-pelfrey.ts
 */
import { chromium, Page } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";

const BASE = "http://localhost:3100";
const ASSETS = "/tmp/assets";
const OUT = "/tmp/dogfood";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const log = (m: string) => console.log(`  • ${m}`);

// ─────────────────── 1. Asset generation ───────────────────

// Matterport-schematic-style plan: room rects + "LABEL W'H" × L'I"" text.
const FLOORPLAN_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="760" viewBox="0 0 1100 760">
  <rect width="1100" height="760" fill="#ffffff"/>
  <g fill="none" stroke="#1a1a1a" stroke-width="5">
    <rect x="40" y="40" width="1020" height="680"/>
    <line x1="560" y1="40" x2="560" y2="430"/>
    <line x1="40" y1="430" x2="1060" y2="430"/>
    <line x1="330" y1="430" x2="330" y2="720"/>
    <line x1="620" y1="430" x2="620" y2="720"/>
    <line x1="840" y1="430" x2="840" y2="720"/>
    <line x1="560" y1="240" x2="1060" y2="240"/>
    <line x1="810" y1="40" x2="810" y2="240"/>
  </g>
  <g font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#1a1a1a" text-anchor="middle">
    <text x="300" y="230">LIVING ROOM 18'4" x 14'2"</text>
    <text x="685" y="135">KITCHEN 12'6" x 11'8"</text>
    <text x="935" y="135">DINING 11'0" x 10'4"</text>
    <text x="810" y="340">PRIMARY BEDROOM 14'0" x 12'6"</text>
    <text x="185" y="580">BEDROOM 2 12'0" x 11'0"</text>
    <text x="475" y="580">BEDROOM 3 11'6" x 10'8"</text>
    <text x="730" y="580">BATHROOM 1 8'0" x 6'0"</text>
    <text x="950" y="580">BATHROOM 2 7'6" x 5'0"</text>
  </g>
</svg>`;

// Stylized "room photo" — gradient walls, floor, window, furniture masses.
function roomPhotoSvg(label: string, wallA: string, wallB: string, accent: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="960" viewBox="0 0 1280 960">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${wallA}"/><stop offset="1" stop-color="${wallB}"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b08e6a"/><stop offset="1" stop-color="#8a6c4e"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="620" fill="url(#wall)"/>
  <rect y="620" width="1280" height="340" fill="url(#floor)"/>
  <rect x="120" y="120" width="300" height="360" fill="#cfe6f2" stroke="#fff" stroke-width="14"/>
  <line x1="270" y1="120" x2="270" y2="480" stroke="#fff" stroke-width="8"/>
  <rect x="560" y="430" width="560" height="260" rx="22" fill="${accent}"/>
  <rect x="600" y="360" width="480" height="90" rx="14" fill="${accent}" opacity="0.85"/>
  <rect x="170" y="640" width="780" height="220" rx="8" fill="#e8ddcd" opacity="0.65"/>
  <circle cx="1130" cy="240" r="56" fill="#f2e7d2"/>
  <text x="50" y="930" font-family="Helvetica, Arial" font-size="34" fill="#ffffff" opacity="0.85">${label} — Matterport screenshot</text>
</svg>`;
}

const ROOM_PHOTOS: Array<[file: string, label: string, a: string, b: string, accent: string]> = [
  ["living", "Living Room", "#dcd5c9", "#c8bfae", "#5d6b5d"],
  ["kitchen", "Kitchen", "#e5e1d8", "#d6d0c2", "#7a6a55"],
  ["dining", "Dining", "#e0d8ce", "#cfc4b4", "#6b5747"],
  ["primary", "Primary Bedroom", "#d8d2c8", "#c4baa9", "#4f5d6b"],
  ["bed2", "Bedroom 2", "#ddd7cd", "#cac0b0", "#6b4f5d"],
  ["bed3", "Bedroom 3", "#e2dcd2", "#cec5b5", "#5d684f"],
  ["bath1", "Bathroom 1", "#e8e6e1", "#d8d5cf", "#8fa3ad"],
  ["bath2", "Bathroom 2", "#e6e4df", "#d6d3cd", "#9aada3"],
];

const EXTERIOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#bfd6e4"/><stop offset="1" stop-color="#e8eef2"/></linearGradient></defs>
  <rect width="1600" height="640" fill="url(#sky)"/>
  <rect y="640" width="1600" height="360" fill="#7d8f6d"/>
  <polygon points="800,140 360,460 1240,460" fill="#5c4a3a"/>
  <rect x="430" y="460" width="740" height="320" fill="#8a7158"/>
  <rect x="700" y="560" width="140" height="220" fill="#3e3228"/>
  <rect x="500" y="540" width="130" height="120" fill="#cfe2ee" stroke="#3e3228" stroke-width="10"/>
  <rect x="950" y="540" width="130" height="120" fill="#cfe2ee" stroke="#3e3228" stroke-width="10"/>
  <text x="60" y="950" font-family="Helvetica" font-size="40" fill="#fff" opacity="0.8">251 Pelfrey Dr — exterior</text>
</svg>`;

async function svgToPng(page: Page, svg: string, outPath: string, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: w, height: h } });
}

// ─────────────────── 2. The walkthrough ───────────────────

(async () => {
  fs.mkdirSync(ASSETS, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(ASSETS, "floorplan.svg"), FLOORPLAN_SVG);

  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem("designStudio_user"))
      localStorage.setItem("designStudio_user", JSON.stringify({ name: "Dogfood Designer", email: "designer@teeco.co" }));
  });

  // Render photo assets.
  const gen = await ctx.newPage();
  await svgToPng(gen, EXTERIOR_SVG, path.join(ASSETS, "exterior.png"), 1600, 1000);
  for (const [file, label, a, b, accent] of ROOM_PHOTOS) {
    await svgToPng(gen, roomPhotoSvg(label, a, b, accent), path.join(ASSETS, `room-${file}.png`), 1280, 960);
  }
  await gen.close();
  log(`assets generated in ${ASSETS}`);

  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const shot = (n: string) => page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: true });

  // ── New Project ──
  await page.goto(`${BASE}/projects/new`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("e.g. Sarah & Mike Thompson").fill("The Pelfrey Project");
  await page.getByPlaceholder("123 Mountain View Dr").fill("251 Pelfrey Dr");
  await page.getByPlaceholder("Gatlinburg").fill("Campton");
  await page.getByPlaceholder("TN").fill("KY");
  await page.locator('input[type="file"][accept="image/*"]').first()
    .setInputFiles(path.join(ASSETS, "exterior.png"));
  await page.waitForTimeout(800);
  await shot("01-new-project-filled");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL((u) => /\/projects\/[^/?]+$/.test(u.pathname) && !u.pathname.endsWith("/new"), { timeout: 15000 });
  const projectUrl = page.url();
  log(`project created: ${projectUrl}`);

  // ── Step 1: Import scan ──
  await page.getByText("Import scan", { exact: false }).first().waitFor({ timeout: 10000 });
  // Paste the Matterport share link a client would send.
  const linkInput = page.locator('input[placeholder*="matterport" i], input[placeholder*="scan" i], input[placeholder*="link" i]').first();
  if (await linkInput.isVisible().catch(() => false)) {
    await linkInput.fill("https://my.matterport.com/show/?m=PelfreyDr251Demo");
    log("pasted Matterport link");
  } else {
    log("!! no scan-link input found on step 1");
  }
  // Upload the floor plan.
  const planInput = page.locator('input[type="file"]').last();
  await planInput.setInputFiles(path.join(ASSETS, "floorplan.svg"));
  await page.waitForTimeout(600);
  await shot("02-step1-before-import");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  // Wait for import to finish (button flips to Continue or step advances).
  await page.waitForTimeout(4000);
  await shot("03-step1-after-import");

  // Advance if still on step 1.
  const cont = page.getByRole("button", { name: "Continue", exact: true });
  if (await cont.isVisible().catch(() => false)) await cont.click();

  // ── Step 2: Confirm rooms ──
  const looksGood = page.getByRole("button", { name: "Looks good" });
  await looksGood.waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  await shot("04-step2-rooms");
  const dirtyNames = await page.locator("text=/\\d+\\s*[xX×]\\s*\\d+/").count().catch(() => 0);
  log(`step 2 — room rows with dimension garbage in the NAME: ${dirtyNames} (want 0)`);
  if (dirtyNames > 0) log("!! FIX FAILED: room names still carry dimensions");
  await looksGood.click();

  // ── Step 3: Style ──
  const useStyle = page.getByRole("button", { name: "Use this style" });
  await useStyle.waitFor({ timeout: 10000 });
  await shot("05-step3-style");
  // A designer picks deliberately: choose Mountain-ish/rustic preset if present.
  const rustic = page.getByText(/Mountain|Rustic|Lodge/i).first();
  if (await rustic.isVisible().catch(() => false)) await rustic.click();
  await shot("06-step3-style-picked");
  await useStyle.click();

  // ── Step 4: Review furniture & renders ──
  const approve = page.getByRole("button", { name: "Approve all & continue" });
  await approve.waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500); // auto-design fill
  await shot("07-step4-review");
  // Upload Matterport screenshots for every room via the new affordance.
  const photoFiles = ["living", "kitchen", "dining", "primary", "bed2", "bed3", "bath1", "bath2"];
  const addButtons = page.getByRole("button", { name: /Add room photo|Add photo/i });
  let uploaded = 0;
  for (const f of photoFiles) {
    const btn = addButtons.first();
    if (!(await btn.isVisible().catch(() => false))) break;
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await page.locator('input[type="file"][accept="image/*"]').last()
      .setInputFiles(path.join(ASSETS, `room-${f}.png`));
    await page.waitForTimeout(900);
    uploaded++;
  }
  log(`step 4 — uploaded ${uploaded} room photos via Add-photo buttons`);
  await shot("07b-step4-photos-added");
  const annotated = await page.evaluate(() => {
    const ps = JSON.parse(localStorage.getItem("designStudio_projects") || "[]");
    const pr = ps[ps.length - 1];
    return {
      withAnnotation: pr.rooms.filter((r: any) => r.annotation).length,
      withPhoto: pr.rooms.filter((r: any) => r.referenceImageUrl).length,
      names: pr.rooms.map((r: any) => r.name),
    };
  });
  log(`rooms with plan annotation: ${annotated.withAnnotation}/8 · with photo: ${annotated.withPhoto}/8`);
  log(`room names: ${annotated.names.join(" | ")}`);
  await approve.click();

  // ── Step 5: Export ──
  await page.getByText("Download Install Guide (PDF)").waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  await shot("08-step5-export");

  // Place 3 markers on the plan like a designer would.
  const markerChip = page.getByRole("button", { name: /^Art$/i }).first();
  if (await markerChip.isVisible().catch(() => false)) {
    const planImg = page.locator("img[src*='svg'], img[alt*='plan' i]").last();
    if (await planImg.isVisible().catch(() => false)) {
      await planImg.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await markerChip.click();
      const box = await planImg.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.3);
        await page.getByRole("button", { name: /^TV$/i }).first().click();
        await page.mouse.click(box.x + box.width * 0.27, box.y + box.height * 0.33);
        await page.getByRole("button", { name: /^Mirror$/i }).first().click();
        await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.7);
        log("placed Art/TV/Mirror markers");
      }
    } else {
      log("!! marker editor visible but plan image not found");
    }
  } else {
    log("!! marker chips not visible on step 5");
  }
  await shot("09-step5-markers");

  // Download the Masterlist.
  const dl = page.waitForEvent("download", { timeout: 30000 });
  await page.getByText("Download Masterlist (.xlsx)").click();
  await (await dl).saveAs(path.join(OUT, "pelfrey-masterlist.xlsx"));
  log("masterlist downloaded");

  // Open + print the Install Guide.
  const popupP = page.waitForEvent("popup", { timeout: 15000 });
  await page.getByText("Download Install Guide (PDF)").click();
  const guide = await popupP;
  await guide.waitForLoadState("networkidle");
  await guide.locator(".guide-page").first().waitFor({ timeout: 15000 });
  const pages = await guide.locator(".guide-page").count();
  log(`install guide pages: ${pages}`);
  for (const [idx, name] of [[0, "cover"], [1, "floorplan"], [2, "room1"], [3, "room2"]] as const) {
    if (idx < pages) await guide.locator(".guide-page").nth(idx).screenshot({ path: path.join(OUT, `guide-${name}.png`) });
  }
  await guide.emulateMedia({ media: "print" });
  await guide.pdf({ path: path.join(OUT, "pelfrey-install-guide.pdf"), preferCSSPageSize: true, printBackground: true });
  log("install guide PDF printed");
  await guide.close();

  console.log("\nPage errors during run:", errors.length ? errors : "none");
  console.log(`Artifacts in ${OUT}`);
  await browser.close();
})().catch((e) => { console.error("DOGFOOD FAILED:", e.message ?? e); process.exit(1); });
