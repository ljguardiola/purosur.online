import { describe, expect, it } from "vitest";
import {
  CHANNEL_DATA_FOLDERS,
  coreArgumentsFor,
  parseChannelFile,
  parseLocalChannelFile,
  sentryEnvironmentFromCoreArguments,
  serializeChannelFile,
} from "./channel";

const productionFile = { channel: "production" };
const stagingFile = { channel: "staging", sentryDsn: "https://public@o1.ingest.sentry.io/2" };

function parse(value: unknown) {
  return parseChannelFile(JSON.stringify(value));
}

function parseLocal(value: unknown) {
  return parseLocalChannelFile(JSON.stringify(value));
}

describe("parseChannelFile", () => {
  it("reads a production file without a DSN, with the production data folder", () => {
    expect(parse(productionFile)).toEqual({
      ok: true,
      settings: { channel: "production", dataFolder: "purosur-pos" },
    });
  });

  it("reads a staging file with its DSN, with the staging data folder", () => {
    expect(parse(stagingFile)).toEqual({
      ok: true,
      settings: { ...stagingFile, dataFolder: "purosur-pos-staging" },
    });
  });

  it("rejects a data folder, so an installed register only ever uses its channel's own", () => {
    for (const dataFolder of ["purosur-pos-staging", "purosur-pos.", "NUL"]) {
      const result = parse({ ...stagingFile, dataFolder });

      expect(result).toEqual({ ok: false, reason: expect.stringContaining("dataFolder") });
    }
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

describe("parseLocalChannelFile", () => {
  it("uses the channel's data folder when the file names none", () => {
    expect(parseLocal({ channel: "staging" })).toEqual({
      ok: true,
      settings: { channel: "staging", dataFolder: "purosur-pos-staging" },
    });
  });

  it("lets a staging run use a data folder of its own", () => {
    expect(parseLocal({ channel: "staging", dataFolder: "purosur-pos-e2e" })).toEqual({
      ok: true,
      settings: { channel: "staging", dataFolder: "purosur-pos-e2e" },
    });
  });

  it("rejects a data folder that is a path rather than a single folder name", () => {
    for (const dataFolder of ["", "..", "../purosur-pos", "a/b", "a\\b", "C:purosur", " x", 7]) {
      const result = parseLocal({ channel: "staging", dataFolder });

      expect(result).toEqual({ ok: false, reason: expect.stringContaining("dataFolder") });
    }
  });

  it("never lets a staging run use the production data folder, whatever its case", () => {
    for (const dataFolder of ["purosur-pos", "PuroSur-POS"]) {
      const result = parseLocal({ channel: "staging", dataFolder });

      expect(result).toEqual({ ok: false, reason: expect.stringContaining("dataFolder") });
    }
  });

  it("rejects a data folder Windows would open under a different name", () => {
    for (const dataFolder of [
      "purosur-pos.",
      "purosur-pos..",
      "purosur-pos ",
      "purosur-pos-e2e.",
      "PUROSU~1",
    ]) {
      const result = parseLocal({ channel: "staging", dataFolder });

      expect(result).toEqual({ ok: false, reason: expect.stringContaining("dataFolder") });
    }
  });

  it("rejects a data folder named after a Windows device, whatever its case or extension", () => {
    for (const dataFolder of [
      "CON",
      "con",
      "Prn",
      "aux",
      "NUL",
      "nul.txt",
      "COM1",
      "com9.log",
      "LPT1",
      "lpt9",
    ]) {
      const result = parseLocal({ channel: "staging", dataFolder });

      expect(result).toEqual({ ok: false, reason: expect.stringContaining("dataFolder") });
    }
  });

  it("keeps a data folder that only starts like a Windows device name", () => {
    for (const dataFolder of ["console", "nulls", "com10", "auxiliary"]) {
      expect(parseLocal({ channel: "staging", dataFolder }).ok).toBe(true);
    }
  });

  it("never lets a production run use anything but the production data folder", () => {
    const result = parseLocal({ channel: "production", dataFolder: "purosur-pos-staging" });

    expect(result).toEqual({ ok: false, reason: expect.stringContaining("dataFolder") });
  });

  it("applies the same channel and DSN rules as an installed register's file", () => {
    expect(parseLocal({ channel: "development" }).ok).toBe(false);
    expect(parseLocal({ channel: "staging", sentryDsn: "not a url" }).ok).toBe(false);
    expect(parseLocal({ channel: "staging", folder: "x" }).ok).toBe(false);
  });
});

describe("serializeChannelFile", () => {
  it("writes a file that parses back to the channel's settings", () => {
    expect(parseChannelFile(serializeChannelFile({ channel: "production" }))).toEqual({
      ok: true,
      settings: { channel: "production", dataFolder: CHANNEL_DATA_FOLDERS.production },
    });
    expect(
      parseChannelFile(
        serializeChannelFile({
          channel: "staging",
          sentryDsn: "https://public@o1.ingest.sentry.io/2",
        }),
      ),
    ).toEqual({
      ok: true,
      settings: {
        channel: "staging",
        dataFolder: CHANNEL_DATA_FOLDERS.staging,
        sentryDsn: "https://public@o1.ingest.sentry.io/2",
      },
    });
  });

  it("writes no data folder", () => {
    expect(JSON.parse(serializeChannelFile({ channel: "staging" }))).toEqual({
      channel: "staging",
    });
  });

  it("refuses to write a file the register would refuse to start with", () => {
    expect(() => serializeChannelFile({ channel: "staging", sentryDsn: "not a url" })).toThrow(
      /sentryDsn/,
    );
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
