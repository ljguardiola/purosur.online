import type { ElectronApplication, Page } from "playwright";
import { _electron as electron } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { messages } from "../src/messages";
import {
  APP_DIR,
  appEnv,
  E2E_CHANNEL_FILE,
  platformArgs,
  sleep,
  writeChannelFile,
} from "./launch-app";

// Electron's own name for a Node.js utility process (see apps/pos/src/main/index.ts's
// `utilityProcess.fork`), robust against other utility processes (network, audio, storage...)
// that Electron itself may also spawn.
const CORE_SERVICE_NAME = "node.mojom.NodeService";

interface UtilityProcessInfo {
  pid: number;
  serviceName: string;
}

async function coreProcesses(app: ElectronApplication): Promise<UtilityProcessInfo[]> {
  const utilityProcesses = await app.evaluate(({ app: electronApp }) =>
    electronApp
      .getAppMetrics()
      .filter((metric) => metric.type === "Utility")
      .map((metric) => ({ pid: metric.pid, serviceName: metric.serviceName ?? "" })),
  );
  return utilityProcesses.filter((process) => process.serviceName === CORE_SERVICE_NAME);
}

async function killTheRunningCore(app: ElectronApplication): Promise<void> {
  const current = (await coreProcesses(app)).at(-1);
  if (current === undefined) {
    throw new Error("expected a core process to kill");
  }
  process.kill(current.pid, "SIGKILL");
}

// The register's own bounded restart policy (apps/pos/src/main/index.ts's RESTART_POLICY):
// maxAttempts 5 with this exact backoff. It is not test-injectable (only the periodic retry
// interval after exhaustion is, via POS_CORE_RETRY_INTERVAL_MS below), so reaching exhaustion in
// this test takes as long as it would for real: six crashes, one per bounded attempt plus the one
// that finds none left.
const BOUNDED_BACKOFF_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

describe("the register's own recovery once the core's bounded restarts run out", () => {
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    const channelFile = writeChannelFile(E2E_CHANNEL_FILE);
    app = await electron.launch({
      args: [APP_DIR, ...platformArgs()],
      // A short periodic retry interval so the recovery half of this test doesn't also wait the
      // real 90s default; never honored in a packaged build (see coreRetryIntervalMs).
      env: { ...appEnv(channelFile), POS_CORE_RETRY_INTERVAL_MS: "1000" },
    });
    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await sleep(1500);
  });

  afterAll(async () => {
    await app.close();
  });

  it("shows the blocking notice once bounded restarts are exhausted, and clears it once a periodic retry brings the core back", async () => {
    for (const delayMs of BOUNDED_BACKOFF_DELAYS_MS) {
      await killTheRunningCore(app);
      await sleep(delayMs + 1000);
    }
    // The sixth crash finds no bounded attempts left and exhausts the policy.
    await killTheRunningCore(app);

    await expect
      .poll(() => page.getByText(messages.coreDown.title).isVisible(), { timeout: 10_000 })
      .toBe(true);
    expect(await page.getByText(messages.coreDown.body).isVisible()).toBe(true);

    // No kill this time: the periodic retry's own core is left running, which is what "brought
    // back" means.
    await expect
      .poll(() => page.getByText(messages.coreDown.title).isVisible(), { timeout: 10_000 })
      .toBe(false);
    expect(await page.getByText(messages.shell.ready).isVisible()).toBe(true);
  }, 60_000);
});
