import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_DIR, appEnv, launchApp, platformArgs, writeChannelFile } from "./launch-app";
import { WAIT_BOUND_MS } from "./test-support/bounds";
import { closeRegister } from "./test-support/close-register";
import { coreStartEnded } from "./test-support/core-start-outcomes";
import { recordLaunchedRegister } from "./test-support/launched-registers";
import { within } from "./test-support/until";

// The electron package's main export is the path to its binary.
const ELECTRON_BINARY = createRequire(join(APP_DIR, "package.json"))("electron") as string;

interface Run {
  readonly status: number | null;
  readonly stderr: string;
}

// Outside Windows, a register that did start runs in a process group of its own, so ending the group
// ends Electron's helper processes with it instead of leaving them to notice it is gone.
async function runUntilItExitsOrStarts(channelFile: string): Promise<Run> {
  const child = spawn(ELECTRON_BINARY, [APP_DIR, ...platformArgs()], {
    env: appEnv(channelFile),
    detached: process.platform !== "win32",
  });
  const closed = once(child, "close") as Promise<[number | null, NodeJS.Signals | null]>;
  const logs: string[] = [];
  recordLaunchedRegister(logs);
  let stderr = "";
  const started = new Promise<void>((resolve) => {
    const collect = (chunk: Buffer): string => {
      const text = chunk.toString();
      logs.push(text);
      if (coreStartEnded(logs.join(""))) {
        resolve();
      }
      return text;
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += collect(chunk);
    });
  });
  try {
    await within(Promise.race([closed, started]), {
      withinMs: WAIT_BOUND_MS,
      waitingFor: "the register to exit or finish starting its core",
    });
  } finally {
    if (child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
      process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL");
    }
  }
  const [status] = await within(closed, {
    withinMs: WAIT_BOUND_MS,
    waitingFor: "the register's process to end",
  });
  return { status, stderr };
}

describe("the register's channel file", () => {
  it("keeps an unpackaged run's data in the folder its channel file names", async () => {
    const { app } = await launchApp(
      writeChannelFile({ channel: "staging", dataFolder: "purosur-pos-e2e-channel" }),
    );
    try {
      await app.firstWindow();
      const paths = await app.evaluate(({ app: electronApp }) => ({
        appData: electronApp.getPath("appData"),
        userData: electronApp.getPath("userData"),
        sessionData: electronApp.getPath("sessionData"),
      }));

      expect(paths.userData).toBe(join(paths.appData, "purosur-pos-e2e-channel"));
      expect(paths.sessionData).toBe(paths.userData);
    } finally {
      await closeRegister(app);
    }
  });

  it("refuses to start, saying why, when its channel file is malformed", async () => {
    const channelFile = writeChannelFile({ channel: "staging", dataFolder: "purosur-pos." });

    const run = await runUntilItExitsOrStarts(channelFile);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("register not started");
    expect(run.stderr).toContain(channelFile);
  });
});
