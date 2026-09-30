import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { ElectronApplication, Page } from "playwright";
import { type LaunchedApp, launchApp, writeChannelFile } from "../launch-app";
import type { StandInCloud } from "./stand-in-cloud";

export interface EnrolledRegister {
  readonly app: ElectronApplication;
  readonly page: Page;
  readonly logs: string[];
  close(): Promise<void>;
}

async function dataFoldersOf(app: ElectronApplication, dataFolder: string): Promise<string[]> {
  const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath("userData"));
  const localAppData = process.env["LOCALAPPDATA"];
  return process.platform === "win32" && localAppData
    ? [userData, join(localAppData, dataFolder)]
    : [userData];
}

// Playwright starts Electron with Chromium's basic password store, under which safeStorage on
// Linux refuses to encrypt unless told to accept plain text; Windows encrypts regardless. The
// reload asks the register again whether it is enrolled, which it answered before this point.
async function launchStoringCredentials(
  channelFile: string,
): Promise<LaunchedApp & { page: Page }> {
  const { app, logs } = await launchApp(channelFile);
  const page = await app.firstWindow();
  if (process.platform === "linux") {
    await app.evaluate(({ safeStorage }) => safeStorage.setUsePlainTextEncryption(true));
    await page.reload();
  }
  return { app, logs, page };
}

async function enroll(page: Page, cloud: StandInCloud): Promise<void> {
  await page.getByLabel("Código de alta").fill(cloud.enrollmentCode);
  await page.getByRole("button", { name: "Dar de alta" }).click();
  await page.getByRole("heading", { name: "Dar de alta esta caja" }).waitFor({ state: "detached" });
  await cloud.feedStored;
}

export async function launchEnrolledRegister(cloud: StandInCloud): Promise<EnrolledRegister> {
  const dataFolder = `purosur-pos-e2e-${randomUUID()}`;
  const channelFile = writeChannelFile({ channel: "staging", dataFolder, cloudUrl: cloud.url });
  const enrolling = await launchStoringCredentials(channelFile);
  const folders = await dataFoldersOf(enrolling.app, dataFolder);
  const removeData = () =>
    Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true })));
  try {
    await enroll(enrolling.page, cloud);
  } catch (error) {
    await enrolling.app.close();
    await removeData();
    throw error;
  }
  await enrolling.app.close();

  const { app, logs, page } = await launchStoringCredentials(channelFile);
  return {
    app,
    page,
    logs,
    close: async () => {
      await app.close();
      await removeData();
    },
  };
}
