import { describe, expect, it } from "vitest";
import {
  CHANNEL_DATA_FOLDERS,
  coreArgumentsFor,
  parseChannelFile,
  sentryEnvironmentFromCoreArguments,
  serializeChannelFile,
} from "./channel";

const productionFile = { channel: "production", dataFolder: "purosur-pos" };
const stagingFile = {
  channel: "staging",
  dataFolder: "purosur-pos-staging",
  sentryDsn: "https://public@o1.ingest.sentry.io/2",
};

function parse(value: unknown) {
  return parseChannelFile(JSON.stringify(value));
}

describe("parseChannelFile", () => {
  it("reads a production file without a DSN", () => {
    expect(parse(productionFile)).toEqual({
      ok: true,
      settings: { channel: "production", dataFolder: "purosur-pos" },
    });
  });

  it("reads a staging file with its DSN", () => {
    expect(parse(stagingFile)).toEqual({ ok: true, settings: stagingFile });
  });

  it("rejects text that isn't JSON", () => {
    const result = parseChannelFile("channel=staging");

    expect(result.ok).toBe(false);
  });

  it("rejects JSON that isn't an object", () => {
    expect(parse(["staging"]).ok).toBe(false);
    expect(parse(null).ok).toBe(false);
  });

  it("rejects an unknown channel", () => {
    const result = parse({ ...productionFile, channel: "development" });

    expect(result).toEqual({ ok: false, reason: expect.stringContaining("channel") });
  });

  it("rejects a data folder that is a path rather than a single folder name", () => {
    for (const dataFolder of ["", "..", "../purosur-pos", "a/b", "a\\b", "C:purosur", " x"]) {
      const result = parse({ ...stagingFile, dataFolder });

      expect(result).toEqual({ ok: false, reason: expect.stringContaining("dataFolder") });
    }
  });

  it("never lets a staging register use the production data folder, whatever its case", () => {
    for (const dataFolder of ["purosur-pos", "PuroSur-POS"]) {
      const result = parse({ ...stagingFile, dataFolder });

      expect(result).toEqual({ ok: false, reason: expect.stringContaining("dataFolder") });
    }
  });

  it("never lets a production register use anything but the production data folder", () => {
    const result = parse({ ...productionFile, dataFolder: "purosur-pos-staging" });

    expect(result).toEqual({ ok: false, reason: expect.stringContaining("dataFolder") });
  });

  it("lets a staging register use a data folder of its own for local runs", () => {
    const result = parse({ channel: "staging", dataFolder: "purosur-pos-e2e" });

    expect(result).toEqual({
      ok: true,
      settings: { channel: "staging", dataFolder: "purosur-pos-e2e" },
    });
  });

  it("rejects a DSN that is empty or isn't an http(s) URL", () => {
    for (const sentryDsn of ["", "not a url", "file:///etc/passwd", 42]) {
      const result = parse({ ...stagingFile, sentryDsn });

      expect(result).toEqual({ ok: false, reason: expect.stringContaining("sentryDsn") });
    }
  });

  it("rejects a field it doesn't know, so a misspelled one can't be silently ignored", () => {
    const result = parse({ ...productionFile, sentryDSN: "https://public@o1.ingest.sentry.io/2" });

    expect(result).toEqual({ ok: false, reason: expect.stringContaining("sentryDSN") });
  });
});

describe("serializeChannelFile", () => {
  it("writes a file that parses back to the same settings", () => {
    for (const settings of [
      { channel: "production" as const, dataFolder: CHANNEL_DATA_FOLDERS.production },
      {
        channel: "staging" as const,
        dataFolder: CHANNEL_DATA_FOLDERS.staging,
        sentryDsn: "https://public@o1.ingest.sentry.io/2",
      },
    ]) {
      expect(parseChannelFile(serializeChannelFile(settings))).toEqual({ ok: true, settings });
    }
  });

  it("refuses to write a file the register would refuse to start with", () => {
    expect(() =>
      serializeChannelFile({ channel: "staging", dataFolder: CHANNEL_DATA_FOLDERS.production }),
    ).toThrow(/dataFolder/);
  });
});

describe("the core's Sentry environment argument", () => {
  it("round-trips each channel through the core's arguments", () => {
    for (const channel of ["production", "staging"] as const) {
      const argv = ["/path/to/electron", "/path/to/core.js", ...coreArgumentsFor(channel)];

      expect(sentryEnvironmentFromCoreArguments(argv)).toBe(channel);
    }
  });

  it("finds no environment when the argument is missing or names no channel", () => {
    expect(sentryEnvironmentFromCoreArguments(["/path/to/core.js"])).toBeUndefined();
    expect(
      sentryEnvironmentFromCoreArguments(["/path/to/core.js", "--sentry-environment=dev"]),
    ).toBeUndefined();
  });
});
