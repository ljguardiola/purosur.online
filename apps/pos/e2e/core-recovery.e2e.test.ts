import type { ElectronApplication, Page } from "playwright";
import { _electron as electron } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APP_DIR, appEnv, E2E_CHANNEL_FILE, platformArgs, writeChannelFile } from "./launch-app";

const SHELL_READY_TEXT = "Puro Sur está listo";
const CORE_DOWN_TITLE = "Esperá un momento";
const CORE_DOWN_BODY = "La caja vuelve a funcionar sola en unos minutos.";

// Electron's own service name for a Node.js utility process, robust against other utility
// processes (network, audio, storage...) Electron itself may also spawn.
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

async function liveCore(app: ElectronApplication): Promise<UtilityProcessInfo | undefined> {
  // A killed core can linger in the metrics for a moment, so only a live one counts.
  return (await coreProcesses(app)).filter((core) => isAlive(core.pid)).at(-1);
}

async function killTheRunningCore(app: ElectronApplication): Promise<void> {
  // A new core hands the window its port as soon as it is forked, before it shows up in the
  // metrics, so the next kill waits for it to be listed.
  await expect
    .poll(() => liveCore(app), {
      timeout: 20_000,
      interval: 100,
      message: "expected a core process to kill",
    })
    .toBeDefined();
  const current = await liveCore(app);
  if (current === undefined) {
    throw new Error("expected a core process to kill");
  }
  process.kill(current.pid, "SIGKILL");
}

function portsReceived(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as NoticeProbe).__ports.length);
}

// Polls for a new port instead of a fixed time or PID: Windows can reuse the killed core's freed
// process id, but every core hands the window a port of its own.
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

// Mirrors the register's own bounded restart policy (maxAttempts 5); it isn't test-injectable, so
// reaching exhaustion takes six real crashes, one per bounded attempt plus the one that finds none left.
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
      // real 90s default; never honored in a packaged build.
      env: { ...appEnv(channelFile), POS_CORE_RETRY_INTERVAL_MS: "1000" },
    });
    app.process().stdout?.on("data", (chunk: Buffer) => logs.push(chunk.toString()));
    app.process().stderr?.on("data", (chunk: Buffer) => logs.push(chunk.toString()));
    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.getByText(SHELL_READY_TEXT).waitFor({ state: "visible", timeout: 10_000 });

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
      { title: CORE_DOWN_TITLE, body: CORE_DOWN_BODY },
    );
    await killTheRunningCore(app);

    expect(await page.evaluate(() => (window as unknown as NoticeProbe).__noticeShown)).toEqual({
      title: true,
      body: true,
    });

    await expect
      .poll(() => page.getByText(SHELL_READY_TEXT).isVisible(), { timeout: 10_000 })
      .toBe(true);
    expect(await page.getByText(CORE_DOWN_TITLE).count()).toBe(0);

    const cores = await coreProcesses(app);
    expect(cores.length).toBeGreaterThan(0);
    expect(cores.every((core) => isAlive(core.pid))).toBe(true);

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
