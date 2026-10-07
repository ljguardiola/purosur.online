import type { ElectronApplication, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchApp } from "./launch-app";
import { until } from "./test-support/until";

interface NavigationAttempt {
  url: string;
  prevented: boolean;
}

// Registered after `guardWindow`'s own will-navigate listener runs at startup, so by the time
// this one runs, `event.defaultPrevented` already reflects what `guardWindow` decided.
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
    const isVisible = (): Promise<boolean> =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false);
    await until(isVisible);
    expect(await isVisible()).toBe(true);
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
      require: typeof (window as unknown as Record<string, unknown>)["require"],
      process: typeof (window as unknown as Record<string, unknown>)["process"],
      sentryIpc: typeof (window as unknown as Record<string, unknown>)["__SENTRY_IPC__"],
      electron: typeof (window as unknown as Record<string, unknown>)["electron"],
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
    const remoteImage = "https://example.com/x.png";
    const remoteScript = "https://example.com/x.js";
    // A resource the policy lets through leaves the renderer as a request, which main records and
    // cancels; a blocked one only raises its violation. Either ends the wait for it.
    await app.evaluate(
      ({ session }, urls) => {
        const probe = globalThis as unknown as { __requestedUrls: string[] };
        probe.__requestedUrls = [];
        session.defaultSession.webRequest.onBeforeRequest({ urls }, (details, callback) => {
          probe.__requestedUrls.push(details.url);
          callback({ cancel: true });
        });
      },
      [remoteImage, remoteScript],
    );
    const requestedUrls = (): Promise<string[]> =>
      app.evaluate(() => (globalThis as unknown as { __requestedUrls: string[] }).__requestedUrls);
    const pageState = (): Promise<{ blockedUris: string[]; inlineRan: boolean }> =>
      page.evaluate(() => ({
        blockedUris: (window as unknown as { __blockedUris: string[] }).__blockedUris,
        inlineRan: (window as unknown as Record<string, unknown>)["__inlineRan"] === true,
      }));

    try {
      await page.evaluate(
        ({ image: imageUrl, script: scriptUrl }) => {
          const blockedUris: string[] = [];
          Object.assign(window, { __blockedUris: blockedUris });
          document.addEventListener("securitypolicyviolation", (event) => {
            blockedUris.push(event.blockedURI);
          });

          const image = document.createElement("img");
          image.src = imageUrl;
          document.body.append(image);

          const script = document.createElement("script");
          script.src = scriptUrl;
          document.body.append(script);

          const inline = document.createElement("script");
          inline.textContent = "window.__inlineRan = true";
          document.body.append(inline);
        },
        { image: remoteImage, script: remoteScript },
      );
      await until(async () => {
        const [{ blockedUris, inlineRan }, requested] = await Promise.all([
          pageState(),
          requestedUrls(),
        ]);
        const settled = (url: string) => blockedUris.includes(url) || requested.includes(url);
        return (
          settled(remoteImage) &&
          settled(remoteScript) &&
          (blockedUris.includes("inline") || inlineRan)
        );
      });
    } finally {
      await app.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest(null));
    }

    const { blockedUris, inlineRan } = await pageState();
    expect(await requestedUrls()).toEqual([]);
    expect(blockedUris).toContain(remoteImage);
    expect(blockedUris).toContain(remoteScript);
    expect(blockedUris).toContain("inline");
    expect(inlineRan).toBe(false);
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

    await until(async () => (await lastNavigationAttemptFor(app, targetUrlPrefix)) !== undefined);
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

    await until(async () => (await lastNavigationAttemptFor(app, targetUrl)) !== undefined);
    const attempt = await lastNavigationAttemptFor(app, targetUrl);

    expect(attempt?.prevented).toBe(true);
    expect(page.url()).toBe(before);
  });
});
