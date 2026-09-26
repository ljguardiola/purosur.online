import type { ElectronApplication, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { launchApp } from "./launch-app";

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

async function portCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __ports: unknown[] }).__ports.length);
}

describe("the core process's supervision and message gate", () => {
  let app: ElectronApplication;
  let page: Page;
  let logs: string[];

  beforeAll(async () => {
    const launched = await launchApp();
    app = launched.app;
    logs = launched.logs;
    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    // `expect.poll` only runs inside a test; `vi.waitFor` retries the same assertion in a hook.
    await vi.waitFor(
      async () => {
        expect(
          (await coreProcesses(app)).length,
          "expected a core process to be running",
        ).toBeGreaterThan(0);
      },
      { timeout: 20_000, interval: 100 },
    );

    // Installed before any page script runs, so no port main posts to a document can arrive
    // ahead of its listener. The first document was already loading before the script existed,
    // so the reload hands the test a document under it; its own `did-finish-load` port is the
    // one waited for here.
    await app.context().addInitScript(() => {
      (window as unknown as { __ports: MessagePort[] }).__ports = [];
      window.addEventListener("message", (event) => {
        if (event.data === "core-port" && event.ports[0]) {
          (window as unknown as { __ports: MessagePort[] }).__ports.push(event.ports[0]);
        }
      });
    });
    await page.reload();
    await vi.waitFor(
      async () => {
        expect(
          await portCount(page),
          "expected the reloaded page to receive its post-load core port",
        ).toBeGreaterThanOrEqual(1);
      },
      { timeout: 20_000, interval: 100 },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it("has a core utility process running", async () => {
    const cores = await coreProcesses(app);
    expect(cores.length).toBeGreaterThan(0);
  });

  it("restarts the core after it is killed and hands the renderer a fresh port", async () => {
    const before = await coreProcesses(app);
    const killed = before[0];
    if (killed === undefined) {
      throw new Error("expected a core process to be running before killing it");
    }
    // The page's post-load port has already arrived (see beforeAll), and main only posts another
    // one on a later load or a core restart, so any port counted beyond this snapshot came from
    // the restart.
    const portsBefore = await portCount(page);
    process.kill(killed.pid, "SIGKILL");

    // Catches core-supervisor.ts no longer restarting a killed core, or index.ts's
    // onProcessStarted no longer reconnecting the already-loaded renderer (no port arrives after
    // the kill): either way this never becomes true and the poll times out.
    await expect
      .poll(
        async () => {
          const list = await coreProcesses(app);
          return (
            list.some((process) => process.pid !== killed.pid) &&
            (await portCount(page)) > portsBefore
          );
        },
        { timeout: 20_000, interval: 100, message: "expected a new core process and a fresh port" },
      )
      .toBe(true);

    const after = await coreProcesses(app);
    expect(after.some((process) => process.pid !== killed.pid)).toBe(true);
    expect(await portCount(page)).toBeGreaterThan(portsBefore);
  });

  it("rejects an invalid message, records it without its payload values, and accepts a valid one", async () => {
    logs.length = 0;

    await page.evaluate(() => {
      const port = (window as unknown as { __ports: MessagePort[] }).__ports.at(-1);
      port?.start();
      port?.postMessage({ type: "bogus", secret: "4111-1111" });
      port?.postMessage({ type: "ping" });
      // Queued after the ping on the same port, so its own rejection log only appears once the
      // ping ahead of it has already been handled — this is what this test waits for instead of
      // a fixed sleep.
      port?.postMessage({ type: "end-marker" });
    });
    // Catches the gate rejecting a valid "ping" too: that would still eventually log the
    // end-marker's rejection, but with 3 rejections total instead of 2 below.
    await expect
      .poll(() => logs.join("").includes("messageType: 'end-marker'"), {
        timeout: 10_000,
        message: "expected the end-marker message's own rejection to be logged",
      })
      .toBe(true);

    const joined = logs.join("");
    expect(joined).toContain("core: rejected message");
    expect(joined).not.toContain("4111-1111");
    expect(joined.match(/core: rejected message/g)).toHaveLength(2);
  });

  it("still renders the app after a reload", async () => {
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(
      () => (document.querySelector("#root")?.textContent ?? "").trim().length > 0,
    );

    const text = await page.locator("#root").innerText();
    expect(text.trim().length).toBeGreaterThan(0);
  });
});
