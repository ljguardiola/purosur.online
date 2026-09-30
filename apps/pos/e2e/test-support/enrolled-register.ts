import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, writeChannelFile } from "../launch-app";
import type { StandInCloud } from "./stand-in-cloud";

export interface EnrolledRegister {
  readonly app: ElectronApplication;
  readonly page: Page;
  readonly logs: readonly string[];
  launch(): Promise<void>;
  close(): Promise<void>;
}

interface RunningRegister {
  readonly app: ElectronApplication;
  readonly page: Page;
  readonly logs: string[];
}

function dataFoldersOf(userData: string, dataFolder: string): string[] {
  const localAppData = process.env["LOCALAPPDATA"];
  return process.platform === "win32" && localAppData
    ? [userData, join(localAppData, dataFolder)]
    : [userData];
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
  let running: RunningRegister | undefined;

  // Playwright starts Electron with Chromium's basic password store, under which safeStorage on
  // Linux refuses to encrypt unless told to accept plain text; Windows encrypts regardless. The
  // reload asks the register again whether it is enrolled, which it answered before this point.
  async function start(): Promise<RunningRegister> {
    const { app, logs } = await launchApp(channelFile);
    openApp = app;
    const page = await app.firstWindow();
    const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath("userData"));
    for (const folder of dataFoldersOf(userData, dataFolder)) {
      folders.add(folder);
    }
    if (process.platform === "linux") {
      await app.evaluate(({ safeStorage }) => safeStorage.setUsePlainTextEncryption(true));
      await page.reload();
    }
    running = { app, page, logs };
    return running;
  }

  async function stop(): Promise<void> {
    running = undefined;
    await openApp?.close();
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
    // Windows keeps a file busy for a moment after the process that held it exits.
    close: async () => {
      await stop();
      await Promise.all(
        [...folders].map((folder) => rm(folder, { recursive: true, force: true, maxRetries: 10 })),
      );
    },
  };
}
