import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileSnapshotCorruptionReports } from "./file-snapshot-corruption-reports";

let folder: string;
let path: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "purosur-pos-corruption-reports-"));
  path = join(folder, "snapshot-corruption-unreported");
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe("fileSnapshotCorruptionReports", () => {
  it("has no report waiting before one is recorded", async () => {
    expect(await fileSnapshotCorruptionReports(path).pending()).toBeUndefined();
  });

  it("keeps a recorded stage across restarts until it is settled", async () => {
    await fileSnapshotCorruptionReports(path).record("foreign_key_check");

    expect(await fileSnapshotCorruptionReports(path).pending()).toBe("foreign_key_check");
  });

  it("keeps the stage of the latest record", async () => {
    const reports = fileSnapshotCorruptionReports(path);
    await reports.record("copy");
    await reports.record("integrity_check");

    expect(await reports.pending()).toBe("integrity_check");
  });

  it("has nothing waiting once the report is settled, and settling twice is harmless", async () => {
    const reports = fileSnapshotCorruptionReports(path);
    await reports.record("copy");

    await reports.settle();
    await reports.settle();

    expect(await reports.pending()).toBeUndefined();
  });

  it("creates the folder the report goes in", async () => {
    const nested = join(folder, "data", "snapshot-corruption-unreported");

    await fileSnapshotCorruptionReports(nested).record("copy");

    expect(await fileSnapshotCorruptionReports(nested).pending()).toBe("copy");
  });

  it("takes a file holding anything but a stage as a copy failure still to report", async () => {
    writeFileSync(path, "garbled");

    expect(await fileSnapshotCorruptionReports(path).pending()).toBe("copy");
  });
});
