import type { ElectronApplication, JSHandle, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchApp } from "./launch-app";
import { until } from "./test-support/until";

interface NavigationAttempt {
  url: string;
  prevented: boolean;
}

// Registered after `guardWindow`'s own will-navigate listener runs at startup, so by the time
// this one runs, `event.defaultPrevented` already reflects what `guardWindow` decided.
function recordNavigationAttempts(
  app: ElectronApplication,
): Promise<JSHandle<NavigationAttempt[]>> {
  return app.evaluateHandle(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const attempts: NavigationAttempt[] = [];
    window?.webContents.on("will-navigate", (event, url) => {
      attempts.push({ url, prevented: event.defaultPrevented });
    });
    return attempts;
  });
}

async function lastNavigationAttemptFor(
  navigationAttempts: JSHandle<NavigationAttempt[]>,
  urlPrefix: string,
): Promise<NavigationAttempt | undefined> {
  const attempts = await navigationAttempts.evaluate(
    (recorded, prefix) => recorded.filter((attempt) => attempt.url.startsWith(prefix)),
    urlPrefix,
  );
  return attempts.at(-1);
}

describe("the register's hardened window", () => {
  let app: ElectronApplication;
  let page: Page;
  let navigationAttempts: JSHandle<NavigationAttempt[]>;

  beforeAll(async () => {
    const launched = await launchApp();
    app = launched.app;
    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    navigationAttempts = await recordNavigationAttempts(app);
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
      const hasLastPreferences = (
        candidate: object | undefined,
      ): candidate is WebContentsWithLastPreferences =>
        candidate !== undefined &&
        "getLastWebPreferences" in candidate &&
        typeof candidate.getLastWebPreferences === "function";
      const webContents = BrowserWindow.getAllWindows()[0]?.webContents;
      const webPreferences = hasLastPreferences(webContents)
        ? webContents.getLastWebPreferences()
        : undefined;
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
      require: "require" in window ? typeof window.require : "undefined",
      process: "process" in window ? typeof window.process : "undefined",
      sentryIpc: "__SENTRY_IPC__" in window ? typeof window.__SENTRY_IPC__ : "undefined",
      electron: "electron" in window ? typeof window.electron : "undefined",
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
    const requestedHandle = await app.evaluateHandle(
      ({ session }, urls) => {
        const requestedUrlList: string[] = [];
        session.defaultSession.webRequest.onBeforeRequest({ urls }, (details, callback) => {
          requestedUrlList.push(details.url);
          callback({ cancel: true });
        });
        return requestedUrlList;
      },
      [remoteImage, remoteScript],
    );
    const requestedUrls = (): Promise<string[]> => requestedHandle.jsonValue();

    const blocked = await page.evaluateHandle(
      ({ image: imageUrl, script: scriptUrl }) => {
        const blockedUris: string[] = [];
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
        return blockedUris;
      },
      { image: remoteImage, script: remoteScript },
    );
    const pageState = async (): Promise<{ blockedUris: string[]; inlineRan: boolean }> => ({
      blockedUris: await blocked.jsonValue(),
      inlineRan: await page.evaluate(() => "__inlineRan" in window && window.__inlineRan === true),
    });

    try {
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

    await until(
      async () =>
        (await lastNavigationAttemptFor(navigationAttempts, targetUrlPrefix)) !== undefined,
    );
    const attempt = await lastNavigationAttemptFor(navigationAttempts, targetUrlPrefix);

    expect(attempt?.prevented).toBe(true);
    expect(page.url()).toBe(before);
  });

  it("blocks navigation to another local file", async () => {
    const before = page.url();
    const targetUrl = "file:///not-the-app.html";
    await page.evaluate((url) => {
      window.location.href = url;
    }, targetUrl);

    await until(
      async () => (await lastNavigationAttemptFor(navigationAttempts, targetUrl)) !== undefined,
    );
    const attempt = await lastNavigationAttemptFor(navigationAttempts, targetUrl);

    expect(attempt?.prevented).toBe(true);
    expect(page.url()).toBe(before);
  });
});
