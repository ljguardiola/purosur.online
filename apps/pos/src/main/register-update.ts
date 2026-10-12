import type { CoreStatus } from "./core-status-broadcast";
import { readRegisterUpdateAnswer } from "./register-update-messages";

const FIRST_CHECK_DELAY_MS = 60_000;
const CHECK_INTERVAL_MS = 3_600_000;
const SAFE_MOMENT_RETRY_MS = 60_000;
const INSTALLER_ARGUMENTS = ["--updated", "/S", "--force-run"] as const;

export interface UpdateResponse {
  status: number;
  json(): Promise<unknown>;
  body: AsyncIterable<Uint8Array> | null;
}

interface PendingFile {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export interface UpdateFiles {
  clearPending(): Promise<void>;
  pathOf(name: string): string;
  open(name: string): Promise<PendingFile>;
  remove(name: string): Promise<void>;
}

export interface RegisterUpdaterDependencies {
  isPackaged: boolean;
  cloudUrl: string | undefined;
  installedVersion: string;
  readDeviceToken(): string | undefined;
  fetch(url: string, init?: { headers: Record<string, string> }): Promise<UpdateResponse>;
  files: UpdateFiles;
  createHash(): { update(chunk: Uint8Array): void; digestBase64(): string };
  wait(ms: number): Promise<void>;
  coreStatus(): CoreStatus;
  setCoreStatus(status: CoreStatus): void;
  askSafeMoment(): Promise<boolean>;
  releaseHold(): void;
  spawnInstaller(path: string, args: readonly string[]): Promise<void>;
  quit(): void;
  report(error: unknown): void;
}

export interface RegisterUpdater {
  start(): void;
  runPass(): Promise<void>;
}

class DownloadRejected extends Error {}

export function createRegisterUpdater(deps: RegisterUpdaterDependencies): RegisterUpdater {
  let passRunning = false;
  let installerLaunched = false;

  async function download(
    name: string,
    release: { size: number; sha512: string; download_url: string },
  ): Promise<void> {
    const response = await deps.fetch(release.download_url);
    if (response.status !== 200 || response.body === null) {
      throw new DownloadRejected(`The download answered ${response.status}`);
    }
    const hash = deps.createHash();
    const file = await deps.files.open(name);
    let received = 0;
    try {
      for await (const chunk of response.body) {
        received += chunk.length;
        if (received > release.size) {
          throw new DownloadRejected("The download is larger than declared");
        }
        hash.update(chunk);
        await file.write(chunk);
      }
    } finally {
      await file.close();
    }
    if (received !== release.size) {
      throw new DownloadRejected("The download is smaller than declared");
    }
    if (hash.digestBase64() !== release.sha512) {
      throw new DownloadRejected("The download does not match its declared digest");
    }
  }

  async function waitForSafeMoment(): Promise<void> {
    for (;;) {
      const status = deps.coreStatus();
      if (status !== "starting" && (status !== "up" || (await deps.askSafeMoment()))) {
        return;
      }
      await deps.wait(SAFE_MOMENT_RETRY_MS);
    }
  }

  async function install(name: string): Promise<void> {
    await waitForSafeMoment();
    const previousStatus = deps.coreStatus();
    deps.setCoreStatus("updating");
    try {
      await deps.spawnInstaller(deps.files.pathOf(name), INSTALLER_ARGUMENTS);
    } catch (error) {
      deps.report(error);
      deps.releaseHold();
      deps.setCoreStatus(previousStatus);
      await deps.files.remove(name);
      return;
    }
    installerLaunched = true;
    deps.quit();
  }

  async function check(): Promise<void> {
    const token = deps.readDeviceToken();
    if (token === undefined) {
      return;
    }
    const response = await deps.fetch(
      `${deps.cloudUrl}/api/register/update?installed_version=${encodeURIComponent(deps.installedVersion)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (response.status !== 200) {
      throw new Error(`The cloud answered ${response.status} to the update check`);
    }
    const answer = readRegisterUpdateAnswer(await response.json());
    if (answer === undefined) {
      throw new Error("The cloud's update answer could not be read");
    }
    if (answer.status === "up_to_date") {
      return;
    }
    const name = `update-${answer.version}.exe`;
    try {
      await download(name, answer);
    } catch (error) {
      await deps.files.remove(name);
      throw error;
    }
    await install(name);
  }

  function isOn(): boolean {
    return deps.isPackaged && deps.cloudUrl !== undefined && deps.readDeviceToken() !== undefined;
  }

  async function runPass(): Promise<void> {
    if (passRunning || installerLaunched || !isOn()) {
      return;
    }
    passRunning = true;
    try {
      await check();
    } catch (error) {
      deps.report(error);
    } finally {
      passRunning = false;
    }
  }

  async function loop(): Promise<void> {
    await deps.files.clearPending();
    await deps.wait(FIRST_CHECK_DELAY_MS);
    while (!installerLaunched) {
      await runPass();
      if (installerLaunched) {
        return;
      }
      await deps.wait(CHECK_INTERVAL_MS);
    }
  }

  return {
    start() {
      if (isOn()) {
        void loop();
      }
    },
    runPass,
  };
}
