import type { ElectronApplication, Page } from "playwright";
import { _electron as electron } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { messages } from "../src/messages";
import { APP_DIR, appEnv, E2E_CHANNEL_FILE, platformArgs, writeChannelFile } from "./launch-app";

// Electron's own name for a Node.js utility process (see apps/pos/src/main/index.ts's
// `utilityProcess.fork`), robust against other utility processes (network, audio, storage...)
// that Electron itself may also spawn.
const CORE_SERVICE_NAME = "node.mojom.NodeService";

interface UtilityProcessInfo {
  pid: number;
  serviceName: string;
}

interface NoticeProbe {
  __ports: MessagePort[];
  __noticeShown: Promise<{ title: boolean; body: boolean }>;
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
  // A killed core can linger in the metrics for a moment, so only a live one is a target.
  const current = (await coreProcesses(app)).filter((core) => isAlive(core.pid)).at(-1);
  if (current === undefined) {
    throw new Error("expected a core process to kill");
  }
  process.kill(current.pid, "SIGKILL");
}

function portsReceived(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as NoticeProbe).__ports.length);
}

// Waits for the restart policy's next core instead of a fixed time: how long a core takes to come
// up after its backoff depends on the machine. Every core hands the window a port of its own, which
// marks a new core even when Windows gives it the killed core's freed process id.
async function killAndWaitForTheNextCore(app: ElectronApplication, page: Page): Promise<void> {
  const portsBefore = await portsReceived(page);
  await killTheRunningCore(app);
  await expect
    .poll(() => portsReceived(page), { timeout: 20_000, interval: 250 })
    .toBeGreaterThan(portsBefore);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// The register's own bounded restart policy (apps/pos/src/main/index.ts's RESTART_POLICY):
// maxAttempts 5, with a backoff of 0.5 s doubling to 8 s. It is not test-injectable (only the
// periodic retry interval after exhaustion is, via POS_CORE_RETRY_INTERVAL_MS below), so reaching
// exhaustion in this test takes as long as it would for real: six crashes, one per bounded attempt
// plus the one that finds none left.
const BOUNDED_RESTART_ATTEMPTS = 5;

describe("the register's own recovery once the core's bounded restarts run out", () => {
  let app: ElectronApplication;
  let page: Page;
  const logs: string[] = [];

  beforeAll(async () => {
    const channelFile = writeChannelFile(E2E_CHANNEL_FILE);
    app = await electron.launch({
      args: [APP_DIR, ...platformArgs()],
      // A short periodic retry interval so the recovery half of this test doesn't also wait the
      // real 90s default; never honored in a packaged build (see coreRetryIntervalMs).
      env: { ...appEnv(channelFile), POS_CORE_RETRY_INTERVAL_MS: "1000" },
    });
    app.process().stdout?.on("data", (chunk: Buffer) => logs.push(chunk.toString()));
    app.process().stderr?.on("data", (chunk: Buffer) => logs.push(chunk.toString()));
    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.getByText(messages.shell.ready).waitFor({ state: "visible", timeout: 10_000 });

    await page.evaluate(() => {
      const probe = window as unknown as NoticeProbe;
      probe.__ports = [];
      window.addEventListener("message", (event) => {
        if (event.data === "core-port" && event.ports[0]) {
          probe.__ports.push(event.ports[0]);
        }
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("shows the blocking notice once bounded restarts are exhausted, and clears it once a periodic retry's core is up", async () => {
    for (let attempt = 0; attempt < BOUNDED_RESTART_ATTEMPTS; attempt++) {
      await killAndWaitForTheNextCore(app, page);
    }

    // Recorded by the page itself the moment the notice renders, however briefly it stays up
    // before the periodic retry's core is ready.
    await page.evaluate(
      ({ title, body }) => {
        const probe = window as unknown as NoticeProbe;
        probe.__noticeShown = new Promise((resolve) => {
          const observer = new MutationObserver(() => {
            const alert = document.querySelector('[role="alert"]');
            if (alert?.textContent?.includes(title)) {
              observer.disconnect();
              resolve({ title: true, body: alert.textContent.includes(body) });
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
        });
      },
      { title: messages.coreDown.title, body: messages.coreDown.body },
    );
    // The sixth crash finds no bounded attempts left and exhausts the policy.
    await killTheRunningCore(app);

    expect(await page.evaluate(() => (window as unknown as NoticeProbe).__noticeShown)).toEqual({
      title: true,
      body: true,
    });

    // No kill this time: the periodic retry's own core is left running and reports itself ready.
    await expect
      .poll(() => page.getByText(messages.shell.ready).isVisible(), { timeout: 10_000 })
      .toBe(true);
    expect(await page.getByText(messages.coreDown.title).count()).toBe(0);

    const cores = await coreProcesses(app);
    expect(cores.length).toBeGreaterThan(0);
    expect(cores.every((core) => isAlive(core.pid))).toBe(true);

    // The renderer's latest port reaches that live core: an invalid message comes back as the
    // core's own rejection log.
    logs.length = 0;
    await page.evaluate(() => {
      const port = (window as unknown as NoticeProbe).__ports.at(-1);
      port?.start();
      port?.postMessage({ type: "bogus" });
    });
    await expect
      .poll(() => logs.join("").includes("core: rejected message"), { timeout: 5_000 })
      .toBe(true);
    // Five waits of up to 20 s each fit, so a stuck restart reports its own wait, not this limit.
  }, 180_000);
});
