import type { ElectronApplication, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchApp, sleep } from "./launch-app";

describe("the register's hardened window", () => {
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    const launched = await launchApp();
    app = launched.app;
    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await sleep(1500);
  });

  afterAll(async () => {
    await app.close();
  });

  it("shows the window", async () => {
    const visible = await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false,
    );
    expect(visible).toBe(true);
  });

  it("renders the app", async () => {
    const text = await page.locator("#root").innerText();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it("isolates the renderer: contextIsolation, sandbox, and no nodeIntegration", async () => {
    // getLastWebPreferences() is a real, long-standing Electron API that this version's own type
    // declarations don't carry.
    interface WebContentsWithLastPreferences {
      getLastWebPreferences():
        | { contextIsolation?: boolean; sandbox?: boolean; nodeIntegration?: boolean }
        | undefined;
    }

    const preferences = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const webContents = window?.webContents as unknown as
        | WebContentsWithLastPreferences
        | undefined;
      const webPreferences = webContents?.getLastWebPreferences();
      return {
        contextIsolation: webPreferences?.contextIsolation,
        sandbox: webPreferences?.sandbox,
        nodeIntegration: webPreferences?.nodeIntegration,
      };
    });

    expect(preferences).toEqual({ contextIsolation: true, sandbox: true, nodeIntegration: false });
  });

  it("exposes nothing Node- or Sentry-shaped on the page's window", async () => {
    const exposed = await page.evaluate(() => ({
      require: typeof (window as unknown as Record<string, unknown>).require,
      process: typeof (window as unknown as Record<string, unknown>).process,
      sentryIpc: typeof (window as unknown as Record<string, unknown>).__SENTRY_IPC__,
      electron: typeof (window as unknown as Record<string, unknown>).electron,
    }));

    expect(exposed).toEqual({
      require: "undefined",
      process: "undefined",
      sentryIpc: "undefined",
      electron: "undefined",
    });
  });

  it("ships a strict CSP with no unsafe-inline", async () => {
    const csp = await page.evaluate(
      () =>
        document
          .querySelector('meta[http-equiv="Content-Security-Policy"]')
          ?.getAttribute("content") ?? null,
    );

    expect(csp).not.toBeNull();
    expect(csp).not.toContain("unsafe-inline");
  });

  it("blocks a remote image, a remote script, and an inline script", async () => {
    const violations = await page.evaluate(async () => {
      const violatedDirectives: string[] = [];
      document.addEventListener("securitypolicyviolation", (event) =>
        violatedDirectives.push(event.violatedDirective),
      );

      const image = document.createElement("img");
      image.src = "https://example.com/x.png";
      document.body.append(image);

      const script = document.createElement("script");
      script.src = "https://example.com/x.js";
      document.body.append(script);

      const inline = document.createElement("script");
      inline.textContent = "window.__inlineRan = true";
      document.body.append(inline);

      await new Promise((resolve) => setTimeout(resolve, 1000));
      return {
        violatedDirectives,
        inlineRan: (window as unknown as Record<string, unknown>).__inlineRan === true,
      };
    });

    expect(violations.violatedDirectives.some((directive) => directive.startsWith("img"))).toBe(
      true,
    );
    expect(violations.violatedDirectives.some((directive) => directive.startsWith("script"))).toBe(
      true,
    );
    expect(violations.inlineRan).toBe(false);
  });

  it("denies window.open and keeps a single window", async () => {
    const opened = await page.evaluate(() => window.open("https://example.com") === null);
    const windowCount = await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    );

    expect(opened).toBe(true);
    expect(windowCount).toBe(1);
  });

  it("blocks navigation to an external site", async () => {
    const before = page.url();
    await page.evaluate(() => {
      window.location.href = "https://example.com";
    });
    await sleep(1500);

    expect(page.url()).toBe(before);
  });

  it("blocks navigation to another local file", async () => {
    const before = page.url();
    await page.evaluate(() => {
      window.location.href = "file:///not-the-app.html";
    });
    await sleep(1000);

    expect(page.url()).toBe(before);
  });
});
