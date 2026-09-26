import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ElectronApplication, _electron as electron } from "playwright";

// This file lives in apps/pos/e2e; the built, unpacked app (package.json + out/) is its parent.
export const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

// A staging channel with a data folder of its own and no DSN: nothing an end-to-end run does
// reaches either installed channel's data or Sentry.
export const E2E_CHANNEL_FILE = { channel: "staging", dataFolder: "purosur-pos-e2e" };

// The Windows CI runner has a real display and needs no extra flags. The only place this repo can
// run the packaged app locally is the live Wayland session, where Electron's headless Ozone
// backend segfaults, so it needs `--ozone-platform=wayland` plus WAYLAND_DISPLAY/XDG_RUNTIME_DIR
// (already read from the inherited environment below). CI leaves POS_E2E_ELECTRON_ARGS unset.
export function platformArgs(): string[] {
  const extra = process.env.POS_E2E_ELECTRON_ARGS;
  return extra ? extra.split(" ").filter((arg) => arg.length > 0) : [];
}

export interface LaunchedApp {
  readonly app: ElectronApplication;
  // Main process stdout/stderr, captured from launch so no output is missed.
  readonly logs: string[];
}

export function writeChannelFile(contents: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), "purosur-pos-e2e-")), "channel.json");
  writeFileSync(path, typeof contents === "string" ? contents : JSON.stringify(contents));
  return path;
}

// The unpacked app reads its channel, and the data folder it may name, from POS_CHANNEL_FILE; a
// packaged one ignores it.
export function appEnv(channelFile: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  env.POS_CHANNEL_FILE = channelFile;
  return env;
}

export async function launchApp(
  channelFile: string = writeChannelFile(E2E_CHANNEL_FILE),
): Promise<LaunchedApp> {
  const app = await electron.launch({
    args: [APP_DIR, ...platformArgs()],
    env: appEnv(channelFile),
  });
  const logs: string[] = [];
  app.process().stdout?.on("data", (chunk: Buffer) => logs.push(chunk.toString()));
  app.process().stderr?.on("data", (chunk: Buffer) => logs.push(chunk.toString()));
  return { app, logs };
}
