import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ElectronApplication, Page } from "playwright";
import { expect, vi } from "vitest";
import { launchApp, writeChannelFile } from "../launch-app";
import type { StandInCloud } from "./stand-in-cloud";

export interface EnrolledRegister {
  readonly app: ElectronApplication;
  readonly page: Page;
  readonly logs: readonly string[];
  launch(): Promise<void>;
  restart(): Promise<void>;
  restartAfter(change: (localDataFolder: string) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}

interface RunningRegister {
  readonly app: ElectronApplication;
  readonly page: Page;
  readonly logs: string[];
}

function localDataFolderOf(userData: string, dataFolder: string): string {
  const localAppData = process.env["LOCALAPPDATA"];
  return process.platform === "win32" && localAppData ? join(localAppData, dataFolder) : userData;
}

function isRunning(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function closeEveryProcessOf(app: ElectronApplication): Promise<void> {
  const processIds = await app.evaluate(({ app: electronApp }) =>
    electronApp.getAppMetrics().map((metric) => metric.pid),
  );
  await app.close();
  await vi.waitFor(
    () => {
      expect(processIds.filter(isRunning)).toEqual([]);
    },
    { timeout: 10_000, interval: 100 },
  );
}

async function enroll(page: Page, cloud: StandInCloud): Promise<void> {
  await page.getByLabel("Código de alta").fill(cloud.enrollmentCode);
  await page.getByRole("button", { name: "Dar de alta" }).click();
  await Promise.all([
    page.getByRole("heading", { name: "Dar de alta esta caja" }).waitFor({ state: "detached" }),
    cloud.feedStored,
  ]);
}

export function enrolledRegister(cloud: StandInCloud): EnrolledRegister {
  const dataFolder = `purosur-pos-e2e-${randomUUID()}`;
  const channelFile = writeChannelFile({ channel: "staging", dataFolder, cloudUrl: cloud.url });
  const folders = new Set([dirname(channelFile)]);
  let openApp: ElectronApplication | undefined;
  let localDataFolder: string | undefined;
  let running: RunningRegister | undefined;
  let closed = false;

  // Playwright starts Electron with Chromium's basic password store, under which safeStorage on
  // Linux refuses to encrypt unless told to accept plain text; Windows encrypts regardless. The
  // reload asks the register again whether it is enrolled, which it answered before this point.
  async function start(): Promise<RunningRegister> {
    const { app, logs } = await launchApp(channelFile);
    if (closed) {
      await app.close();
      throw new Error("the register was closed while it was launching");
    }
    openApp = app;
    const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath("userData"));
    localDataFolder = localDataFolderOf(userData, dataFolder);
    folders.add(userData);
    folders.add(localDataFolder);
    const page = await app.firstWindow();
    if (process.platform === "linux") {
      await app.evaluate(({ safeStorage }) => safeStorage.setUsePlainTextEncryption(true));
      await page.reload();
    }
    running = { app, page, logs };
    return running;
  }

  async function stop(): Promise<void> {
    running = undefined;
    if (openApp !== undefined) {
      await closeEveryProcessOf(openApp);
    }
    openApp = undefined;
  }

  function current(): RunningRegister {
    if (running === undefined) {
      throw new Error("the register has not been launched");
    }
    return running;
  }

  return {
    get app() {
      return current().app;
    },
    get page() {
      return current().page;
    },
    get logs() {
      return current().logs;
    },
    launch: async () => {
      await enroll((await start()).page, cloud);
      await stop();
      await start();
    },
    restart: async () => {
      await stop();
      await start();
    },
    restartAfter: async (change) => {
      await stop();
      if (localDataFolder === undefined) {
        throw new Error("the register has not been launched");
      }
      await change(localDataFolder);
      await start();
    },
    // Windows keeps a file busy for a moment after the process that held it exits.
    close: async () => {
      closed = true;
      try {
        await stop();
      } finally {
        await Promise.all(
          [...folders].map((folder) =>
            rm(folder, { recursive: true, force: true, maxRetries: 10 }),
          ),
        );
      }
    },
  };
}
