import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

// See e2e/README.md. Everything here can be overridden from the environment.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.E2E_BASE ?? "http://localhost:5199";
const OUT = process.env.E2E_OUT ?? path.join(os.tmpdir(), "hrms-e2e");
const PASSWORD = "Password123!";
// The scratch backend uses MAIL_MAILER=log, so one-time codes and links are read back from its log.
const LOG = process.env.E2E_MAIL_LOG ?? path.join(HERE, "../../backend/storage/logs/laravel.log");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
fs.mkdirSync(OUT, { recursive: true });
const data = JSON.parse(fs.readFileSync(process.env.E2E_DATA ?? path.join(OUT, "recruitment-seed.json"), "utf8"));

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const pageErrors = [];

async function context(view = "table") {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.addInitScript((v) => {
    localStorage.setItem("hrms_session_v", "3");
    localStorage.setItem("recruitment.candidates.view", v);
  }, view);
  return ctx;
}

async function login() {
  const ctx = await context();
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  page.on("pageerror", (error) => pageErrors.push(`staff: ${error.message}`));
  await page.goto(`${BASE}/auth/login`);
  await page.fill("#email", "recruiter@acme.test");
  await page.fill("#password", PASSWORD);
  await page.press("#password", "Enter");
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 60000 });
  await page.waitForTimeout(2500);
  return { page, ctx };
}

async function guest() {
  const ctx = await context();
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  page.on("pageerror", (error) => pageErrors.push(`guest: ${error.message}`));
  return page;
}

async function step(name, fn, page) {
  try {
    await fn();
    record(name, true);
  } catch (error) {
    record(name, false, String(error.message).split("\n")[0]);
    if (page) await page.screenshot({ path: path.join(OUT, `fail-${name.replace(/[^a-z0-9]+/gi, "-")}.png`) }).catch(() => {});
  }
}

const visible = (locator, timeout = 45000) => locator.first().waitFor({ state: "visible", timeout });
const modalClose = (page) => page.locator("div.fixed.inset-0").getByRole("button", { name: "Close", exact: true }).first();

const { page } = await login();

// ---- candidates table: fit, select all matching, bulk ---------------------------------
await step("candidates table shows fit scores and ranks best fit first", async () => {
  await page.goto(`${BASE}/recruitment/candidates`);
  await visible(page.getByRole("columnheader", { name: /Fit/ }));
  await page.getByLabel("Best fit first").check();
  await visible(page.getByText("100% fit"));
  const firstRow = await page.locator("tbody tr").first().innerText();
  if (!/100% fit|PHP|Applicant/.test(firstRow)) throw new Error("first row is not a strong fit: " + firstRow);
}, page);

await step("minimum fit filter narrows the list", async () => {
  await page.getByLabel("Minimum fit score").fill("90");
  await page.waitForTimeout(1500);
  const rows = await page.locator("tbody tr").allInnerTexts();
  if (rows.some((row) => /Applicant (01|02|04|05)\b/.test(row))) throw new Error("weak candidates still listed");
  await page.getByLabel("Minimum fit score").fill("");
  await page.waitForTimeout(1500);
}, page);

await step("ticking the page offers to select everything matching, and a bulk tag applies to all of them", async () => {
  await page.getByLabel("Best fit first").uncheck();
  await page.getByLabel("Select all candidates on this page").check();
  const offer = page.getByRole("button", { name: /Select all \d+ matching this filter/ });
  await visible(offer);
  await offer.click();
  await visible(page.getByText(/selected \(everything matching this filter/));
  await page.getByLabel("Bulk action").selectOption("tag");
  await visible(page.getByText(/everyone who matches the current filter/));
  await page.getByLabel("Tags").fill("smoke-tag");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await visible(page.getByText(/of \d+ candidates updated/));
  const summary = await page.getByText(/of \d+ candidates updated/).first().innerText();
  const [, done, total] = summary.match(/(\d+) of (\d+)/);
  if (done !== total || Number(total) < 30) throw new Error("unexpected summary: " + summary);
  await page.getByRole("button", { name: "Done" }).click();
}, page);

await step("unticking one person leaves them out of a filter-wide action", async () => {
  await page.getByLabel("Select all candidates on this page").check();
  await page.getByRole("button", { name: /Select all \d+ matching this filter/ }).click();
  await page.getByLabel("Select Applicant 05").uncheck().catch(async () => {
    // Applicant 05 may be on a later page; untick whoever is first instead.
    await page.locator("tbody input[type=checkbox]").first().uncheck();
  });
  await visible(page.getByText(/1 left out/));
  await page.getByRole("button", { name: "Clear selection" }).click();
}, page);

// ---- board selection --------------------------------------------------------------------
await step("board view lets cards be ticked and bulk acted on", async () => {
  await page.getByRole("button", { name: "board", exact: true }).click();
  await visible(page.getByLabel(/Select Applicant/));
  await page.getByLabel(/Select Applicant/).first().check();
  await visible(page.getByText("1 selected"));
  await page.getByLabel("Select everyone loaded in Applied").check();
  await visible(page.getByRole("region", { name: "Selection toolbar" }));
  await page.getByRole("button", { name: "Clear selection" }).click();
  await page.getByRole("button", { name: "table", exact: true }).click();
}, page);

// ---- email templates ---------------------------------------------------------------------
await step("saved email templates: add starters and use one in an email", async () => {
  await page.getByRole("button", { name: "Email templates" }).click();
  await page.getByRole("button", { name: "Add ready-made templates" }).click();
  await visible(page.getByText("Application received"));
  await visible(page.getByText("Not moving forward"));
  await modalClose(page).click();
}, page);

// ---- candidate detail: duplicates merge, messages, fit -----------------------------------
await step("candidate page shows duplicates, unread message and can merge them", async () => {
  await page.goto(`${BASE}/recruitment/candidates/${data.dupA}`);
  await visible(page.getByText("Also applied elsewhere"));
  await visible(page.getByText(/1 unread message/));
  await page.getByRole("tab", { name: /Messages/ }).click();
  await visible(page.getByText("Hello, is the role remote?"));
  await page.getByLabel(/Write to Dana/).fill("Yes, fully remote.");
  await page.getByRole("button", { name: "Send message" }).click();
  await visible(page.getByText("Yes, fully remote."));
  await page.getByRole("tab", { name: "Overview" }).click();
  await page.getByRole("button", { name: "Merge into this record" }).click();
  await visible(page.getByText(/folded into/));
  await page.getByRole("button", { name: /Merge 1 application/ }).click();
  await visible(page.getByText("Merged applications"));
  if (await page.getByText("Also applied elsewhere").count()) throw new Error("duplicate panel still shown");
}, page);

// ---- jobs: suggestions, budgets, settings -------------------------------------------------
await step("jobs: talent pool matches are listed for an opening", async () => {
  await page.goto(`${BASE}/recruitment/jobs`);
  await visible(page.getByRole("button", { name: "Pool matches" }));
  await page.getByRole("row", { name: /Backend Engineer/ }).getByRole("button", { name: "Pool matches" }).click();
  await visible(page.getByText("Pool Paula"));
  await visible(page.getByText("100% fit"));
  await modalClose(page).click();
}, page);

await step("jobs: headcount budget can be set and shows its usage", async () => {
  await page.getByRole("button", { name: "Headcount budgets" }).click();
  await page.getByLabel("Department").selectOption({ label: "Engineering" });
  await page.getByLabel("New positions").fill("2");
  await page.getByLabel("Salary budget (optional)").fill("300000");
  await page.getByRole("button", { name: "Save budget" }).click();
  await visible(page.getByRole("cell", { name: "Engineering" }));
  await modalClose(page).click();
}, page);

await step("jobs: a role over the budget shows the Company Admin warning in the form", async () => {
  await page.getByRole("button", { name: "New Job" }).click();
  await page.fill("#job-title", "Over budget role");
  await page.selectOption("#job-dept", { label: "Engineering" });
  await page.fill("#job-positions", "5");
  await page.fill("#job-max", "100000");
  await visible(page.getByText(/needs the Company Admin's approval as well as HR's/), 30000);
  await page.getByRole("button", { name: "Cancel" }).click();
}, page);

await step("careers settings carry the cost threshold and retention periods", async () => {
  await page.getByRole("button", { name: "Careers page" }).click();
  await page.getByLabel("Extra approval above this cost").fill("500000");
  await page.getByLabel("Keep talent pool entries for (months)").fill("6");
  await page.getByLabel("Erase rejected candidates after (months)").fill("24");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await visible(page.getByText("Settings saved"));
}, page);

// ---- candidate portal (a guest) ------------------------------------------------------------
const portal = await guest();
const portalUrl = `${BASE}/candidate-portal/${data.tokens.portal}`;

await step("portal: candidate asks to reschedule and writes to the team", async () => {
  await portal.goto(portalUrl);
  await visible(portal.getByTestId("portal-status"));
  await portal.getByRole("button", { name: "Ask to reschedule" }).click();
  await portal.getByLabel("Why do you need to move it?").fill("Clash with my notice period");
  await portal.getByRole("button", { name: "Send request" }).click();
  await visible(portal.getByText(/You asked to reschedule/));
  await portal.getByLabel("Write to the hiring team").fill("Could we do Thursday afternoon?");
  await portal.getByRole("button", { name: "Send message" }).click();
  await visible(portal.getByText("Could we do Thursday afternoon?"));
}, portal);

await step("portal: accepting the offer needs the emailed code and records a signature", async () => {
  await portal.getByRole("button", { name: "Accept offer" }).click();
  await portal.getByRole("button", { name: "Email me a code" }).click();
  await visible(portal.getByText(/Sent to/));
  const log = fs.readFileSync(LOG, "utf8");
  const matches = [...log.matchAll(/Your verification code is: (\d{6})/g)];
  if (!matches.length) throw new Error("no code found in the mail log");
  const code = matches[matches.length - 1][1];
  await portal.getByLabel(/Step 2/).fill(code);
  await portal.getByLabel(/Step 3/).fill("Portal Person");
  await portal.getByLabel(/agree to sign this offer electronically/).check();
  await portal.getByRole("button", { name: "Sign and accept" }).click();
  await visible(portal.getByText(/You accepted/));
  await visible(portal.getByText(/Signed electronically by Portal Person/));
}, portal);

await step("staff see the reschedule request, the message and the signature", async () => {
  await page.goto(`${BASE}/recruitment/candidates/${data.portalId}`);
  await visible(page.getByText("The candidate asked to move an interview"));
  await visible(page.getByText(/Clash with my notice period/));
  await visible(page.getByText(/1 unread message/));
  await page.getByRole("tab", { name: /Offers/ }).click();
  await visible(page.getByText("Electronic signature"));
  await visible(page.getByText(/document fingerprint/));
}, page);

await step("portal: a candidate can withdraw", async () => {
  await portal.goto(portalUrl);
  await portal.getByRole("button", { name: "Withdraw my application" }).click();
  await portal.getByRole("button", { name: "Yes, withdraw" }).click();
  await portal.getByTestId("portal-status").filter({ hasText: /withdrawn/i }).waitFor({ state: "visible", timeout: 45000 });
}, portal);

// ---- talent pool consent --------------------------------------------------------------------
await step("talent pool: ask to stay on file, the candidate refuses, they leave the pool", async () => {
  await page.goto(`${BASE}/recruitment/talent-pool`);
  await visible(page.getByText("Pool Paula"));
  await page.getByRole("row", { name: /Pool Paula/ }).getByRole("button", { name: "Ask to stay on file" }).click();
  await visible(page.getByText("Request sent"));

  const pool = await guest();
  await pool.goto(`${BASE}/candidate-portal/${data.tokens.pool}`).catch(() => {});
  // The request rotated the link, so the earlier token is dead: the page must say so rather than break.
  await visible(pool.getByText(/This link is not valid/));
  const log = fs.readFileSync(LOG, "utf8");
  const links = [...log.matchAll(/candidate-portal\/([A-Za-z0-9]{48})/g)];
  const token = links[links.length - 1][1];
  await pool.goto(`${BASE}/candidate-portal/${token}`);
  await visible(pool.getByText(/keep your details on file/));
  await pool.getByRole("button", { name: "No, do not keep my details" }).click();
  await visible(pool.getByText(/asked us not to keep your details/));

  await page.reload();
  await visible(page.getByText(/Nobody is in the talent pool/));
}, page);

await browser.close();

console.log("\n" + "-".repeat(60));
const failed = results.filter((result) => !result.ok);
console.log(`${results.length - failed.length}/${results.length} steps passed`);
if (pageErrors.length) {
  console.log("PAGE ERRORS:");
  [...new Set(pageErrors)].forEach((error) => console.log("  " + error));
}
process.exit(failed.length || pageErrors.length ? 1 : 0);
