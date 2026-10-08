import type { ElectronApplication, JSHandle, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchApp } from "./launch-app";
import { until, untilLogged } from "./test-support/until";

// A fresh data folder holds no enrollment, so a core that is up shows the enrollment screen.
const CORE_UP_TEXT = "Dar de alta esta caja";
const CORE_DOWN_TITLE = "Esperá un momento";
const CORE_DOWN_BODY = "La caja vuelve a funcionar sola en unos minutos.";

// Electron's own service name for a Node.js utility process, robust against other utility
// processes (network, audio, storage...) Electron itself may also spawn.
const CORE_SERVICE_NAME = "node.mojom.NodeService";

interface UtilityProcessInfo {
  pid: number;
  serviceName: string;
}

interface NoticeShown {
  title: boolean;
  body: boolean;
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
  await until(async () => (await liveCore(app)) !== undefined);
  const current = await liveCore(app);
  if (current === undefined) {
    throw new Error("expected a core process to kill");
  }
  process.kill(current.pid, "SIGKILL");
}

function portsReceived(ports: JSHandle<MessagePort[]>): Promise<number> {
  return ports.evaluate((received) => received.length);
}

// Waits for a new port instead of a fixed time or PID: Windows can reuse the killed core's freed
// process id, but every core hands the window a port of its own.
async function killAndWaitForTheNextCore(
  app: ElectronApplication,
  ports: JSHandle<MessagePort[]>,
): Promise<void> {
  const portsBefore = await portsReceived(ports);
  await killTheRunningCore(app);
  await until(async () => (await portsReceived(ports)) > portsBefore);
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
  let ports: JSHandle<MessagePort[]>;
  let logs: string[];

  beforeAll(async () => {
    // A short periodic retry interval so the recovery half of this test doesn't also wait the
    // real 90s default; never honored in a packaged build.
    const launched = await launchApp(undefined, { POS_CORE_RETRY_INTERVAL_MS: "1000" });
    app = launched.app;
    logs = launched.logs;
    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.getByText(CORE_UP_TEXT).waitFor({ state: "visible" });

    ports = await page.evaluateHandle(() => {
      const received: MessagePort[] = [];
      window.addEventListener("message", (event) => {
        if (event.data === "core-port" && event.ports[0]) {
          received.push(event.ports[0]);
        }
      });
      return received;
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("shows the blocking notice once bounded restarts are exhausted, and clears it once a periodic retry's core is up", async () => {
    for (let attempt = 0; attempt < BOUNDED_RESTART_ATTEMPTS; attempt++) {
      await killAndWaitForTheNextCore(app, ports);
    }

    // Recorded by the page itself from every change the renderer makes, however briefly the notice
    // stays up; a retry's core that is back without the notice ever shown ends the wait unseen.
    const notice = await page.evaluateHandle(
      ({ title, body, upText }) => {
        const shown = new Promise<NoticeShown>((resolve) => {
          let retryCoreArrived = false;
          const showsCoreUp = (): boolean => document.body.textContent?.includes(upText) ?? false;
          const endUnseen = (): void => {
            observer.disconnect();
            window.removeEventListener("message", onMessage);
            resolve({ title: false, body: false });
          };
          const alertIn = (node: Node): Element | undefined => {
            const element = node instanceof Element ? node : node.parentElement;
            const enclosing = element?.closest('[role="alert"]');
            const alerts = [
              ...(enclosing ? [enclosing] : []),
              ...(element?.querySelectorAll('[role="alert"]') ?? []),
            ];
            return alerts.find((alert) => alert.textContent?.includes(title));
          };
          const observer = new MutationObserver((records) => {
            for (const record of records) {
              for (const node of [record.target, ...record.addedNodes]) {
                const alert = alertIn(node);
                if (alert !== undefined) {
                  observer.disconnect();
                  window.removeEventListener("message", onMessage);
                  resolve({ title: true, body: alert.textContent?.includes(body) ?? false });
                  return;
                }
              }
            }
            if (retryCoreArrived && showsCoreUp()) {
              endUnseen();
            }
          });
          const onMessage = (event: MessageEvent): void => {
            if (event.data === "core-port") {
              retryCoreArrived = true;
              if (showsCoreUp()) {
                endUnseen();
              }
            }
          };
          observer.observe(document.body, { childList: true, characterData: true, subtree: true });
          window.addEventListener("message", onMessage);
        });
        return { shown };
      },
      { title: CORE_DOWN_TITLE, body: CORE_DOWN_BODY, upText: CORE_UP_TEXT },
    );
    await killTheRunningCore(app);

    expect(await notice.evaluate((probe) => probe.shown)).toEqual({ title: true, body: true });

    await until(() => page.getByText(CORE_UP_TEXT).isVisible());
    expect(await page.getByText(CORE_DOWN_TITLE).count()).toBe(0);

    const cores = await coreProcesses(app);
    expect(cores.length).toBeGreaterThan(0);
    expect(cores.every((core) => isAlive(core.pid))).toBe(true);

    logs.length = 0;
    await ports.evaluate((received) => {
      const port = received.at(-1);
      port?.start();
      port?.postMessage({ type: "bogus" });
    });
    await untilLogged({ app, logs }, "core: rejected message");
    expect(logs.join("")).toContain("core: rejected message");
  });
});
