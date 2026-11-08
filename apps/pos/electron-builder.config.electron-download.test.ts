import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

type ElectronArtifactConfig = {
  cacheRoot?: string;
  checksums?: Record<string, string>;
};

const requireFromApp = createRequire(import.meta.url);
const { buildElectronArtifactConfig } = createRequire(requireFromApp.resolve("electron-builder"))(
  "app-builder-lib/out/util/electronGet",
) as {
  buildElectronArtifactConfig: (options: {
    electronDownload: object;
    artifactName: string;
    platformName: string;
    arch: string;
    version: string;
  }) => Promise<ElectronArtifactConfig>;
};

const electronVersion = String(requireFromApp("electron/package.json").version);
const electronChecksums: Record<string, string> = JSON.parse(
  readFileSync(requireFromApp.resolve("electron/checksums.json"), "utf8"),
);
const windowsZip = `electron-v${electronVersion}-win32-x64.zip`;

const originalEnv = {
  POS_CHANNEL: process.env["POS_CHANNEL"],
  ELECTRON_BUILDER_CACHE: process.env["ELECTRON_BUILDER_CACHE"],
};
const cacheDirectories: string[] = [];

afterEach(async () => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  await Promise.all(
    cacheDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function prepareWindowsElectronDownload(channel: string) {
  const cacheDirectory = await mkdtemp(join(tmpdir(), "electron-builder-cache-"));
  cacheDirectories.push(cacheDirectory);
  vi.resetModules();
  process.env["POS_CHANNEL"] = channel;
  process.env["ELECTRON_BUILDER_CACHE"] = cacheDirectory;
  const { default: config } = await import("./electron-builder.config.mjs");
  const { beforePack } = config;
  if (typeof beforePack !== "function") {
    throw new Error("the config has no beforePack hook");
  }
  await beforePack({
    packager: { info: { metadata: {} } },
  } as Parameters<typeof beforePack>[0]);
  const artifact = await buildElectronArtifactConfig({
    electronDownload: {
      platform: "win32",
      arch: "x64",
      version: electronVersion,
      ...config.electronDownload,
    },
    artifactName: "electron",
    platformName: "win32",
    arch: "x64",
    version: electronVersion,
  });
  return { cacheDirectory, artifact };
}

describe.each(["production", "staging"] as const)(
  "the %s register's Electron download",
  (channel) => {
    it("is kept under ELECTRON_BUILDER_CACHE, so a later run restores it with electron-builder's tools", async () => {
      const { cacheDirectory, artifact } = await prepareWindowsElectronDownload(channel);

      expect(artifact.cacheRoot?.startsWith(cacheDirectory)).toBe(true);
    });

    it("is checked against the checksums the installed electron package ships, without fetching them from GitHub", async () => {
      const { artifact } = await prepareWindowsElectronDownload(channel);

      expect(artifact.checksums?.[windowsZip]).toBe(electronChecksums[windowsZip]);
    });
  },
);
