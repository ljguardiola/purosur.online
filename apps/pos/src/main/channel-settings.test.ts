import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANNEL_DATA_FOLDERS } from "../shared/channel";
import { DEVELOPMENT_SETTINGS, loadChannelSettings } from "./channel-settings";

const stagingText = JSON.stringify({ channel: "staging", dataFolder: "purosur-pos-staging" });

function readerOf(files: Record<string, string>) {
  const reads: string[] = [];
  const readFile = (path: string): string => {
    reads.push(path);
    const text = files[path];
    if (text === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return text;
  };
  return { readFile, reads };
}

describe("loadChannelSettings", () => {
  it("reads a packaged register's channel file from its resources folder", () => {
    const channelFile = join("/opt/register/resources", "channel.json");
    const { readFile } = readerOf({ [channelFile]: stagingText });

    const result = loadChannelSettings({
      isPackaged: true,
      resourcesPath: "/opt/register/resources",
      overridePath: undefined,
      readFile,
    });

    expect(result).toEqual({
      ok: true,
      settings: { channel: "staging", dataFolder: "purosur-pos-staging" },
    });
  });

  it("ignores the override in a packaged register, so nothing outside the install can redirect it", () => {
    const channelFile = join("/opt/register/resources", "channel.json");
    const { readFile, reads } = readerOf({
      [channelFile]: JSON.stringify({ channel: "production", dataFolder: "purosur-pos" }),
      "/tmp/other.json": stagingText,
    });

    const result = loadChannelSettings({
      isPackaged: true,
      resourcesPath: "/opt/register/resources",
      overridePath: "/tmp/other.json",
      readFile,
    });

    expect(reads).toEqual([channelFile]);
    expect(result).toEqual({
      ok: true,
      settings: { channel: "production", dataFolder: "purosur-pos" },
    });
  });

  it("fails with the file's path when a packaged register has no channel file", () => {
    const { readFile } = readerOf({});

    const result = loadChannelSettings({
      isPackaged: true,
      resourcesPath: "/opt/register/resources",
      overridePath: undefined,
      readFile,
    });

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining(join("/opt/register/resources", "channel.json")),
    });
  });

  it("fails with the file's path when the channel file is malformed", () => {
    const channelFile = join("/opt/register/resources", "channel.json");
    const { readFile } = readerOf({ [channelFile]: "{" });

    const result = loadChannelSettings({
      isPackaged: true,
      resourcesPath: "/opt/register/resources",
      overridePath: undefined,
      readFile,
    });

    expect(result).toEqual({ ok: false, reason: expect.stringContaining(channelFile) });
  });

  it("reads the override file in an unpackaged run", () => {
    const { readFile } = readerOf({ "/tmp/e2e/channel.json": stagingText });

    const result = loadChannelSettings({
      isPackaged: false,
      resourcesPath: "/electron/resources",
      overridePath: "/tmp/e2e/channel.json",
      readFile,
    });

    expect(result).toEqual({
      ok: true,
      settings: { channel: "staging", dataFolder: "purosur-pos-staging" },
    });
  });

  it("falls back to development settings in an unpackaged run with no override", () => {
    const { readFile, reads } = readerOf({});

    const result = loadChannelSettings({
      isPackaged: false,
      resourcesPath: "/electron/resources",
      overridePath: undefined,
      readFile,
    });

    expect(reads).toEqual([]);
    expect(result).toEqual({ ok: true, settings: DEVELOPMENT_SETTINGS });
  });

  it("keeps development runs out of both installed channels' data and away from Sentry", () => {
    expect(DEVELOPMENT_SETTINGS.channel).toBe("staging");
    expect(Object.values(CHANNEL_DATA_FOLDERS)).not.toContain(DEVELOPMENT_SETTINGS.dataFolder);
    expect(DEVELOPMENT_SETTINGS.sentryDsn).toBeUndefined();
  });
});
