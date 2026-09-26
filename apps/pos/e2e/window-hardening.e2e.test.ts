import type { ElectronApplication, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchApp } from "./launch-app";

interface NavigationAttempt {
  url: string;
  prevented: boolean;
}

/**
 * Registered after `guardWindow`'s own `will-navigate` listener (attached during app startup,
 * before this suite ever runs), so by the time this one runs for a given navigation,
 * `event.defaultPrevented` already reflects whatever `guardWindow`'s handler decided.
 */
async function recordNavigationAttempts(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const probe = globalThis as unknown as { __navigationAttempts: NavigationAttempt[] };
    probe.__navigationAttempts = [];
    window?.webContents.on("will-navigate", (event, url) => {
      probe.__navigationAttempts.push({ url, prevented: event.defaultPrevented });
    });
  });
}

async function lastNavigationAttemptFor(
  app: ElectronApplication,
  urlPrefix: string,
): Promise<NavigationAttempt | undefined> {
  const attempts = await app.evaluate((_electron, prefix) => {
    const probe = globalThis as unknown as { __navigationAttempts?: NavigationAttempt[] };
    return (probe.__navigationAttempts ?? []).filter((attempt) => attempt.url.startsWith(prefix));
  }, urlPrefix);
  return attempts.at(-1);
}

describe("the register's hardened window", () => {
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    const launched = await launchApp();
    app = launched.app;
    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await recordNavigationAttempts(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("shows the window", async () => {
    // Catches window-lifecycle.ts's `onceReadyToShow` no longer calling `show()`.
    await expect
      .poll(
        () =>
          app.evaluate(
            ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false,
          ),
        { timeout: 10_000, message: "expected the window to become visible" },
      )
      .toBe(true);
  });

  it("renders the app", async () => {
    await page.waitForFunction(
      () => (document.querySelector("#root")?.textContent ?? "").trim().length > 0,
    );
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
      const blockedUris: string[] = [];
      const allSeen = (): boolean =>
        blockedUris.includes("https://example.com/x.png") &&
        blockedUris.includes("https://example.com/x.js") &&
        blockedUris.includes("inline");
      // Resolves once every one of the three violations this test triggers has been recorded, so
      // this in-page wait is driven by the events themselves; the cap only bounds a run where a
      // policy change stops one of them from firing, and the assertions below then fail on it.
      const allViolationsSeen = new Promise<void>((resolve) => {
        document.addEventListener("securitypolicyviolation", (event) => {
          blockedUris.push(event.blockedURI);
          if (allSeen()) {
            resolve();
          }
        });
      });

      const image = document.createElement("img");
      image.src = "https://example.com/x.png";
      document.body.append(image);

      const script = document.createElement("script");
      script.src = "https://example.com/x.js";
      document.body.append(script);

      const inline = document.createElement("script");
      inline.textContent = "window.__inlineRan = true";
      document.body.append(inline);

      await Promise.race([
        allViolationsSeen,
        new Promise((resolve) => setTimeout(resolve, 10_000)),
      ]);
      return {
        blockedUris,
        allSeen: allSeen(),
        inlineRan: (window as unknown as Record<string, unknown>).__inlineRan === true,
      };
    });

    expect(violations.blockedUris).toContain("https://example.com/x.png");
    expect(violations.blockedUris).toContain("https://example.com/x.js");
    expect(violations.blockedUris).toContain("inline");
    expect(violations.allSeen).toBe(true);
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
    const targetUrlPrefix = "https://example.com";
    await page.evaluate((url) => {
      window.location.href = url;
    }, targetUrlPrefix);

    // Catches index.ts's `guardWindow` no longer wiring its `will-navigate` listener.
    await expect
      .poll(() => lastNavigationAttemptFor(app, targetUrlPrefix), {
        timeout: 5_000,
        message: "expected a recorded will-navigate attempt to the external site",
      })
      .toBeDefined();
    const attempt = await lastNavigationAttemptFor(app, targetUrlPrefix);

    expect(attempt?.prevented).toBe(true);
    expect(page.url()).toBe(before);
  });

  it("blocks navigation to another local file", async () => {
    const before = page.url();
    const targetUrl = "file:///not-the-app.html";
    await page.evaluate((url) => {
      window.location.href = url;
    }, targetUrl);

    await expect
      .poll(() => lastNavigationAttemptFor(app, targetUrl), {
        timeout: 5_000,
        message: "expected a recorded will-navigate attempt to the other local file",
      })
      .toBeDefined();
    const attempt = await lastNavigationAttemptFor(app, targetUrl);

    expect(attempt?.prevented).toBe(true);
    expect(page.url()).toBe(before);
  });
});
