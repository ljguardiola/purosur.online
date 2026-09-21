import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ElectronApplication, _electron as electron } from "playwright";

// This file lives in apps/pos/e2e; the built, unpacked app (package.json + out/) is its parent.
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

// The Windows CI runner has a real display and needs no extra flags. The only place this repo can
// run the packaged app locally is the live Wayland session, where Electron's headless Ozone
// backend segfaults, so it needs `--ozone-platform=wayland` plus WAYLAND_DISPLAY/XDG_RUNTIME_DIR
// (already read from the inherited environment below). CI leaves POS_E2E_ELECTRON_ARGS unset.
function platformArgs(): string[] {
  const extra = process.env.POS_E2E_ELECTRON_ARGS;
  return extra ? extra.split(" ").filter((arg) => arg.length > 0) : [];
}

export interface LaunchedApp {
  readonly app: ElectronApplication;
  // Main process stdout/stderr, captured from launch so no output is missed.
  readonly logs: string[];
}

function definedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

export async function launchApp(): Promise<LaunchedApp> {
  const app = await electron.launch({ args: [APP_DIR, ...platformArgs()], env: definedEnv() });
  const logs: string[] = [];
  app.process().stdout?.on("data", (chunk: Buffer) => logs.push(chunk.toString()));
  app.process().stderr?.on("data", (chunk: Buffer) => logs.push(chunk.toString()));
  return { app, logs };
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
