import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { FastifyInstance } from "fastify";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { EDGE_ORIGIN_SECRET_HEADER } from "./src/platform/edge-origin-guard.js";
import { buildTestApp, TEST_EDGE_ORIGIN_SECRET } from "./src/test-support/build-test-app.js";

const BACKOFFICE_ROOT = fileURLToPath(new URL("../backoffice/", import.meta.url));
const VITE_BIN = join(
  dirname(createRequire(`${BACKOFFICE_ROOT}package.json`).resolve("vite/package.json")),
  "bin/vite.js",
);

let staticDir: string;
let app: FastifyInstance;
let origin: string;
let browser: Browser;

// Vitest runs with NODE_ENV=test, which Vite would carry into the bundle and so build React's and
// react-aria's development code instead of what ships.
async function buildBackoffice(outDir: string): Promise<void> {
  await promisify(execFile)(
    process.execPath,
    [VITE_BIN, "build", "--outDir", outDir, "--emptyOutDir", "--logLevel", "error"],
    { cwd: BACKOFFICE_ROOT, env: { ...process.env, NODE_ENV: "production" } },
  );
}

// The build and the cloud's start end on their own, so the setup waits for them however long the
// machine takes.
beforeAll(async () => {
  staticDir = mkdtempSync(join(tmpdir(), "purosur-served-backoffice-"));
  await buildBackoffice(staticDir);
  app = buildTestApp({
    version: "abc1234",
    now: () => new Date("2026-01-05T12:00:00.000Z"),
    staticDir,
  });
  origin = await app.listen({ host: "127.0.0.1", port: 0 });
  browser = await chromium.connect(process.env["PLAYWRIGHT_SERVER_WS_ENDPOINT"] ?? "", {
    exposeNetwork: "<loopback>",
  });
}, 0);

afterAll(async () => {
  await browser?.close();
  await app?.close();
  rmSync(staticDir, { recursive: true, force: true });
});

// The press ends once the screen renders its button, and a policy or an error that keeps the
// screen from rendering reports a violation or the error first, so the test waits for whichever
// comes first however long it takes.
test("the built backoffice runs under the cloud's content security policy without a violation", {
  timeout: 0,
}, async () => {
  const context = await browser.newContext({
    extraHTTPHeaders: { [EDGE_ORIGIN_SECRET_HEADER]: TEST_EDGE_ORIGIN_SECRET },
  });
  context.setDefaultTimeout(0);
  const page = await context.newPage();
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { contentSecurityPolicyViolations: violations });
    document.addEventListener("securitypolicyviolation", (event) => {
      violations.push(
        `${event.effectiveDirective} blocked ${event.blockedURI} in ${event.sourceFile}`,
      );
    });
  });

  const pageErrors: string[] = [];
  const firstPageError = new Promise<void>((resolve) => {
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
      resolve();
    });
  });

  await page.goto(new URL("/sign-in", origin).href);
  await Promise.race([
    page.getByRole("button", { name: "Ingresar con passkey" }).click(),
    page.waitForFunction(
      () =>
        (window as unknown as { contentSecurityPolicyViolations: string[] })
          .contentSecurityPolicyViolations.length > 0,
    ),
    firstPageError,
  ]);

  const violations = await page.evaluate(
    () =>
      (window as unknown as { contentSecurityPolicyViolations: string[] })
        .contentSecurityPolicyViolations,
  );
  await context.close();
  expect(violations).toEqual([]);
  expect(pageErrors).toEqual([]);
});
