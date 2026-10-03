import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = path.resolve(appRoot, "../..");
const require = createRequire(import.meta.url);
const capture = process.argv.includes("--capture");
const unknownFlags = process.argv.slice(2).filter((arg) => arg !== "--capture");
assert.equal(
  unknownFlags.length,
  0,
  `Unknown arguments: ${unknownFlags.join(" ")}`,
);
const errors = [];
const network = [];
const frames = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server;
let browser;
let serverLogs = "";
let phase = "startup";

function git(...args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

async function freePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

function localUrl(value) {
  const parsed = new URL(value);
  assert.equal(parsed.protocol, "http:", "Use a local HTTP production server.");
  assert.equal(
    parsed.hostname,
    "127.0.0.1",
    "INCOGNITO_BASE_URL must use 127.0.0.1.",
  );
  assert.equal(
    parsed.username + parsed.password,
    "",
    "Do not embed credentials in the URL.",
  );
  assert.equal(
    parsed.pathname,
    "/",
    "INCOGNITO_BASE_URL must point at the app root.",
  );
  assert.equal(
    parsed.search + parsed.hash,
    "",
    "Use the app root without query or fragment.",
  );
  return parsed.origin;
}

async function startApp() {
  if (process.env.INCOGNITO_BASE_URL) {
    return localUrl(process.env.INCOGNITO_BASE_URL);
  }
  const port = await freePort();
  server = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next"),
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    {
      cwd: appRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    },
  );
  server.stdout.on("data", (data) => {
    serverLogs = (serverLogs + data).slice(-12_000);
  });
  server.stderr.on("data", (data) => {
    serverLogs = (serverLogs + data).slice(-12_000);
  });
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `Next exited before readiness. Build @ckb-ccc/app first.\n${serverLogs}`,
      );
    }
    try {
      const result = await fetch(origin, {
        signal: AbortSignal.timeout(2_000),
      });
      if (result.ok) return origin;
    } catch {
      /* The server is still starting. */
    }
    await delay(250);
  }
  throw new Error(`Next did not become ready.\n${serverLogs}`);
}

async function launchBrowser() {
  const failures = [];
  for (const channel of [undefined, "msedge", "chrome"]) {
    try {
      return await chromium.launch({
        headless: true,
        ...(channel ? { channel } : {}),
      });
    } catch (error) {
      failures.push(error.message.split("\n")[0]);
    }
  }
  throw new Error(
    `Install Chromium with pnpm exec playwright install chromium.\n${failures.join("\n")}`,
  );
}

async function checkEventually(check, message) {
  let cause;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      cause = error;
    }
    await delay(75);
  }
  throw new Error(message, { cause });
}

async function textContains(locator, text) {
  await checkEventually(
    async () => (await locator.textContent())?.includes(text),
    `Expected text: ${text}`,
  );
}

async function absent(locator, description) {
  await checkEventually(
    async () => (await locator.count()) === 0,
    `${description} should be cleared`,
  );
}

async function noOverflow(page, description) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.content <= dimensions.viewport + 1,
    `${description} overflows horizontally: ${JSON.stringify(dimensions)}`,
  );
  const clippedControls = await page
    .getByTestId("incognito-module")
    .locator("input, button, textarea, select")
    .evaluateAll((controls) =>
      controls
        .filter((control) => {
          const bounds = control.getBoundingClientRect();
          return (
            bounds.width > 0 &&
            (bounds.left < -1 ||
              bounds.right > document.documentElement.clientWidth + 1)
          );
        })
        .map(
          (control) =>
            control.getAttribute("aria-label") ??
            control.getAttribute("data-testid") ??
            control.textContent,
        ),
    );
  assert.deepEqual(clippedControls, [], `${description} clips module controls`);
}

async function screenshot(page, name, caption) {
  await noOverflow(page, name);
  if (!capture) return;
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  // Capture a genuinely tall viewport. Chromium's fullPage mode otherwise
  // paints CCC's closed fixed-position log drawer below the original viewport,
  // covering content that is unobscured during normal browsing.
  const originalViewport = page.viewportSize();
  const captureViewport = {
    width: originalViewport.width,
    height: Math.max(
      originalViewport.height,
      await page.evaluate(() => document.documentElement.scrollHeight),
    ),
  };
  await page.setViewportSize(captureViewport);
  const bytes = await page.screenshot({
    fullPage: false,
    animations: "disabled",
  });
  frames.push({
    name,
    caption,
    capturedAt: new Date().toISOString(),
    bytes,
    viewport: captureViewport,
  });
  await page.setViewportSize(originalViewport);
}

async function newContext(origin, width) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    reducedMotion: "reduce",
    locale: "en-US",
    colorScheme: "dark",
    permissions: ["clipboard-read", "clipboard-write"],
    serviceWorkers: "block",
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) {
      assert.equal(
        request.method(),
        "GET",
        "The visual demo should only load local assets, not make writes.",
      );
      return route.continue();
    }
    const type = request.resourceType();
    // Chromium classifies the host application's existing SVG favicon as
    // "other". Exempt only that exact asset; it remains blocked and recorded.
    const hostFavicon =
      type === "other" &&
      url.href ===
        "https://raw.githubusercontent.com/ckb-devrel/ccc/refs/heads/dev/assets/logo.svg";
    const presentationOnly =
      (["image", "font", "stylesheet", "media"].includes(type) ||
        hostFavicon) &&
      request.method() === "GET";
    network.push({
      phase,
      type,
      method: request.method(),
      host: url.host,
      path: url.pathname,
      presentationOnly,
      blocked: true,
    });
    return route.abort("blockedbyclient");
  });
  await context.routeWebSocket("**/*", (socket) => {
    network.push({
      phase,
      type: "websocket",
      host: new URL(socket.url()).host,
      presentationOnly: false,
      blocked: true,
    });
    socket.close();
  });
  context.on("page", (page) =>
    page.on("pageerror", (error) =>
      errors.push({ phase, message: error.message }),
    ),
  );
  return context;
}

async function openModule(page, origin) {
  await page.goto(origin, { waitUntil: "networkidle" });
  await page
    .getByRole("button", {
      name: "Compare Incognito · local demo",
      exact: true,
    })
    .click();
  const module = page.getByTestId("incognito-module");
  await module.waitFor({ state: "visible" });
  assert.equal(new URL(page.url()).hash, "#incognito");
  return module;
}

async function desktopChecks(origin) {
  phase = "desktop host bootstrap";
  const context = await newContext(origin, 1440);
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: "networkidle" });
  await page
    .getByRole("button", {
      name: "Compare Incognito · local demo",
      exact: true,
    })
    .waitFor();
  await screenshot(
    page,
    "01-ccc-tool-matrix.png",
    "Actual CCC fork tool matrix with the new local Incognito entry; existing CCC modules retained.",
  );
  phase = "desktop incognito module";
  await page
    .getByRole("button", {
      name: "Compare Incognito · local demo",
      exact: true,
    })
    .click();
  const module = page.getByTestId("incognito-module");
  await module.waitFor({ state: "visible" });
  await textContains(module, "TESTNET FIXTURES");
  await textContains(module, "SIMULATED");
  assert.equal(
    await module.getByTestId("incognito-toggle").getAttribute("aria-checked"),
    "false",
  );
  assert.equal(await module.locator('input[type="password"]').count(), 0);
  const copy = module.getByRole("button", {
    name: "Copy fixture receiving identity",
    exact: true,
  });
  const normalIdentity = await copy.getAttribute("title");
  assert.ok(normalIdentity.startsWith("ckt1"));
  await copy.click();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    normalIdentity,
  );
  await screenshot(
    page,
    "02-normal-mode.png",
    "Normal mode in CCC's native module workspace. Public fixture address; no connected wallet or chain operation.",
  );

  const recipient = module.getByTestId("recipient-input");
  const amount = module.getByTestId("amount-input");
  const build = module.getByTestId("build-preview");
  await recipient.fill("invalid-address");
  await build.click();
  await module.getByRole("alert").waitFor();
  await absent(
    module.getByTestId("unsigned-preview"),
    "Invalid-address preview",
  );
  await module
    .getByRole("button", { name: "Use fixture recipient", exact: true })
    .click();
  await amount.fill("1");
  await build.click();
  await textContains(module.getByRole("alert"), "capacity");
  await amount.fill("200");
  await build.click();
  await module.getByTestId("unsigned-preview").waitFor();
  const normalDraft = JSON.parse(
    await module.getByTestId("unsigned-preview").locator("pre").textContent(),
  );
  assert.deepEqual(normalDraft.inputs, []);
  assert.deepEqual(normalDraft.witnesses, []);
  assert.equal(normalDraft.outputs.length, 1);
  assert.equal(normalDraft.outputsData[0], "0x");
  await module.getByTestId("view-receive").click();
  await module.getByTestId("normal-receive").waitFor();
  await module.getByTestId("view-send").click();

  await module.getByTestId("incognito-toggle").click();
  await absent(module.getByTestId("unsigned-preview"), "Mode-changed draft");
  const stealthIdentity = await copy.getAttribute("title");
  assert.notEqual(stealthIdentity, normalIdentity);
  assert.ok(stealthIdentity.startsWith("0x"));
  await copy.click();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    stealthIdentity,
  );
  assert.equal(await build.isDisabled(), true);
  await screenshot(
    page,
    "03-incognito-mode.png",
    "Incognito enabled in the same CCC module, showing the public fixture meta-address. Target experience; chain steps simulated.",
  );
  await recipient.fill("invalid-meta-address");
  await module.getByTestId("derive-address").click();
  await module.getByRole("alert").waitFor();
  await absent(
    module.getByTestId("derived-payment"),
    "Invalid meta-address derivation",
  );
  await module
    .getByRole("button", { name: "Use fixture recipient", exact: true })
    .click();
  await module.getByTestId("derive-address").click();
  const derived = module.getByTestId("derived-payment");
  await derived.waitFor();
  const firstAddress = await derived.locator("code").first().textContent();
  await module.getByTestId("derive-address").click();
  const secondAddress = await derived.locator("code").first().textContent();
  assert.notEqual(
    firstAddress,
    secondAddress,
    "Each derive operation must use fresh ephemeral randomness.",
  );
  assert.ok(secondAddress.startsWith("ckt1"));
  assert.match(
    await derived.locator("code").nth(1).textContent(),
    /^0x0[23][0-9a-f]{64}$/,
  );
  await build.click();
  await textContains(
    module.getByTestId("unsigned-preview"),
    "Fresh change destination",
  );
  const stealthDraft = JSON.parse(
    await module.getByTestId("unsigned-preview").locator("pre").textContent(),
  );
  assert.deepEqual(stealthDraft.inputs, []);
  assert.deepEqual(stealthDraft.witnesses, []);
  assert.notEqual(
    stealthDraft.outputs[0].lock.args,
    normalDraft.outputs[0].lock.args,
  );
  await module.getByTestId("fresh-change").uncheck();
  await absent(module.getByTestId("unsigned-preview"), "Changed-policy draft");
  await build.click();
  assert.ok(
    !(await module.getByTestId("unsigned-preview").textContent()).includes(
      "Fresh change destination",
    ),
  );
  await textContains(
    module.getByTestId("change-hygiene"),
    "Fresh change is off",
  );
  await module.getByTestId("fresh-change").check();
  await build.click();
  await screenshot(
    page,
    "04-stealth-send.png",
    "Real local one-time address derivation and unsigned CCC output. Input selection, fees, signing, broadcast and settlement are simulated; not deployment evidence.",
  );

  await module.getByTestId("view-receive").click();
  await module.getByTestId("scan-fixtures").click();
  await textContains(
    module.getByTestId("scan-result"),
    "1 matching fixture(s)",
  );
  await module.getByTestId("spend-preview").click();
  await textContains(
    module.getByTestId("spend-result"),
    "Spend authority checked",
  );
  await textContains(
    module.getByTestId("spend-result"),
    "fixture is not marked spent",
  );
  const spendDestinations = await module
    .getByTestId("spend-result")
    .locator("code")
    .allTextContents();
  assert.equal(spendDestinations.length, 2);
  assert.notEqual(spendDestinations[0], spendDestinations[1]);
  await screenshot(
    page,
    "05-scan-receive.png",
    "Matching public fixture and local spend-authority preview. No indexer query, live cell, signed spend or settlement exists.",
  );
  await module.getByTestId("view-profile").selectOption("unrelated");
  await absent(module.getByTestId("scan-result"), "Previous scan");
  await absent(module.getByTestId("spend-result"), "Previous spend");
  await module.getByTestId("scan-fixtures").click();
  await textContains(
    module.getByTestId("scan-result"),
    "0 matching fixture(s)",
  );
  await absent(
    module.getByTestId("spend-preview"),
    "Unrelated-profile spend action",
  );
  await module.getByTestId("view-profile").selectOption("matching");
  await module.getByTestId("scan-fixtures").click();
  await textContains(
    module.getByTestId("scan-result"),
    "1 matching fixture(s)",
  );

  await module.getByRole("button", { name: "Reset demo", exact: true }).click();
  assert.equal(
    await module.getByTestId("incognito-toggle").getAttribute("aria-checked"),
    "false",
  );
  await absent(module.getByTestId("derived-payment"), "Reset derivation");
  await absent(module.getByTestId("unsigned-preview"), "Reset draft");
  await module.getByTestId("incognito-toggle").click();
  await module.getByTestId("view-receive").click();
  await absent(module.getByTestId("scan-result"), "Reset scan");
  await absent(module.getByTestId("spend-result"), "Reset spend");
  await module.getByTestId("view-send").click();
  await module
    .locator("summary", { hasText: "Compare Normal and Incognito" })
    .click();
  await screenshot(
    page,
    "06-mode-comparison.png",
    "Side-by-side explanation of Normal and Incognito inside the existing CCC workspace. Both modes disclose amounts and sender inputs.",
  );
  await module
    .locator("summary", { hasText: "Compare Normal and Incognito" })
    .click();
  await module.getByTestId("view-disclosure").click();
  await textContains(
    module.getByTestId("disclosure-panel"),
    "Amounts and sender inputs are NOT hidden.",
  );
  await textContains(
    module.getByTestId("disclosure-panel"),
    "not prove deployment compatibility",
  );
  assert.equal(
    await module.locator('a[href*="explorer"]').count(),
    0,
    "Fixture results must not imply on-chain evidence.",
  );
  await screenshot(
    page,
    "07-disclosure.png",
    "Honest disclosure: recipient linkage is reduced; amounts, sender inputs, timing and transaction relationships remain visible. No deployment claim.",
  );

  // Existing CCC functionality stays in place and still requires a real signer.
  phase = "desktop upstream module";
  await page.evaluate(() => {
    window.location.hash = "transfer";
  });
  await page
    .getByRole("button", { name: /Connect wallet/ })
    .waitFor({ state: "visible" });
  await absent(
    page.getByTestId("incognito-module"),
    "Previous Incognito workspace",
  );
  phase = "desktop incognito return";
  await page.evaluate(() => {
    window.location.hash = "incognito";
  });
  await page.getByTestId("incognito-module").waitFor({ state: "visible" });
  assert.equal(
    await page.getByTestId("incognito-toggle").getAttribute("aria-checked"),
    "false",
  );
  await context.close();
}

async function mobileChecks(origin) {
  phase = "mobile bootstrap";
  const context = await newContext(origin, 390);
  const page = await context.newPage();
  const module = await openModule(page, origin);
  phase = "mobile incognito module";
  await noOverflow(page, "Mobile Normal mode");
  await module.getByTestId("incognito-toggle").click();
  await module.getByTestId("derive-address").click();
  await module.getByTestId("build-preview").click();
  await module.getByTestId("unsigned-preview").waitFor();
  await noOverflow(page, "Mobile send preview");
  await module.getByTestId("view-receive").click();
  await module.getByTestId("scan-fixtures").click();
  await module.getByTestId("spend-preview").click();
  await module.getByTestId("spend-result").waitFor();
  await noOverflow(page, "Mobile receive preview");
  await module.getByTestId("view-disclosure").click();
  await textContains(
    module.getByTestId("disclosure-panel"),
    "Amounts and sender inputs are NOT hidden.",
  );
  await screenshot(
    page,
    "08-mobile-disclosure.png",
    "390px responsive view of the same native CCC Incognito module; local fixture demo with visible disclosure.",
  );
  await context.close();
}

async function sourceDigests() {
  const files = [];
  async function walk(relative) {
    for (const entry of await readdir(path.join(repositoryRoot, relative), {
      withFileTypes: true,
    })) {
      const candidate = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(candidate);
      else if (entry.isFile()) files.push(candidate);
    }
  }
  await walk("packages/app/src");
  await walk("packages/stealth/src");
  files.push(
    "packages/app/package.json",
    "packages/stealth/package.json",
    "pnpm-lock.yaml",
    "packages/app/scripts/check-incognito.mjs",
  );
  return Promise.all(
    files.sort().map(async (file) => ({
      file,
      sha256: createHash("sha256")
        .update(await readFile(path.join(repositoryRoot, file)))
        .digest("hex"),
    })),
  );
}

async function writeEvidence() {
  const output = path.join(appRoot, "evidence/incognito");
  await mkdir(output, { recursive: true });
  const records = [];
  for (const frame of frames) {
    await writeFile(path.join(output, frame.name), frame.bytes);
    records.push({
      file: frame.name,
      caption: frame.caption,
      capturedAt: frame.capturedAt,
      viewport: frame.viewport,
      image: {
        width: frame.bytes.readUInt32BE(16),
        height: frame.bytes.readUInt32BE(20),
      },
      sha256: createHash("sha256").update(frame.bytes).digest("hex"),
    });
  }
  const manifest = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    source:
      "Actual locally rendered CCC fork, with no injected DOM or fabricated settlement data.",
    scope:
      "Visual testnet-fixture demo; not deployment evidence. Local cryptography and unsigned outputs; all chain-dependent steps simulated.",
    repository: "https://github.com/willy264/ccc",
    branch: git("branch", "--show-current"),
    head: git("rev-parse", "HEAD"),
    upstream: "https://github.com/ckb-devrel/ccc",
    // Pinned fork point: capture also works in a clone without an upstream remote.
    upstreamBase: "722cfe28bb184145e14887d54162d55fbe3dcadb",
    dirtySourceAtCapture:
      git(
        "status",
        "--porcelain",
        "--",
        "packages/app/src",
        "packages/stealth",
        "packages/app/package.json",
        "pnpm-lock.yaml",
        "packages/app/scripts/check-incognito.mjs",
      ) !== "",
    browser: browser.version(),
    pageErrors: errors,
    blockedExternalRequests: network,
    sourceDigests: await sourceDigests(),
    screenshots: records,
  };
  await writeFile(
    path.join(output, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `Saved ${records.length} screenshots and SHA-256 evidence manifest to packages/app/evidence/incognito/.`,
  );
}

try {
  const origin = await startApp();
  browser = await launchBrowser();
  await desktopChecks(origin);
  await mobileChecks(origin);
  assert.deepEqual(errors, [], "Unexpected browser runtime errors");
  const dataRequests = network.filter((request) => !request.presentationOnly);
  assert.deepEqual(
    dataRequests,
    [],
    "Unexpected external data request: the demo must not query RPC, sign or broadcast.",
  );
  if (capture) await writeEvidence();
  console.log(
    `Passed: native CCC integration; normal/incognito previews; fresh addresses/change; matching/unrelated fixtures; spend/reset; disclosure; 1440px/390px layouts. ${network.length} external presentation requests blocked, no external data requests or browser runtime errors.`,
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill();
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      delay(3_000),
    ]);
  }
}
