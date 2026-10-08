import type { ElectronApplication, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchApp } from "./launch-app";
import { until, untilLogged } from "./test-support/until";

// Electron's own service name for a Node.js utility process, robust against other utility
// processes (network, audio, storage...) Electron itself may also spawn.
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
  return page.evaluate(() =>
    "__ports" in window && Array.isArray(window.__ports) ? window.__ports.length : 0,
  );
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
    await until(async () => (await coreProcesses(app)).length > 0);

    // addInitScript runs before any page script, so no port main posts can arrive ahead of its
    // listener; the first document was already loading, so the reload puts the test under it.
    await app.context().addInitScript(() => {
      const ports: MessagePort[] = [];
      Object.assign(window, { __ports: ports });
      window.addEventListener("message", (event) => {
        if (event.data === "core-port" && event.ports[0]) {
          ports.push(event.ports[0]);
        }
      });
    });
    await page.reload();
    await until(async () => (await portCount(page)) >= 1);
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
    const portsBefore = await portCount(page);
    process.kill(killed.pid, "SIGKILL");

    await until(async () => {
      const list = await coreProcesses(app);
      return (
        list.some((process) => process.pid !== killed.pid) && (await portCount(page)) > portsBefore
      );
    });

    const after = await coreProcesses(app);
    expect(after.some((process) => process.pid !== killed.pid)).toBe(true);
    expect(await portCount(page)).toBeGreaterThan(portsBefore);
  });

  it("rejects an invalid message, records it without its payload values, and accepts a valid one", async () => {
    logs.length = 0;

    await page.evaluate(() => {
      const ports =
        "__ports" in window && Array.isArray(window.__ports)
          ? window.__ports.filter((candidate) => candidate instanceof MessagePort)
          : [];
      const port = ports.at(-1);
      port?.start();
      port?.postMessage({ type: "bogus", secret: "4111-1111" });
      port?.postMessage({ type: "ping" });
      // Same-port delivery is FIFO, so this message's own rejection log only appears after the
      // earlier ping is handled — a wait condition instead of a fixed sleep.
      port?.postMessage({ type: "end-marker" });
    });
    await untilLogged({ app, logs }, "messageType: 'end-marker'");

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
