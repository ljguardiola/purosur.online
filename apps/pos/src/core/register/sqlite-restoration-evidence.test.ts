import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type RestorePending, restorePendingIn } from "../backups/restore-pending";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteRestorationEvidence } from "./sqlite-restoration-evidence";

let database: LocalDatabase;
let folder: string;
let pending: RestorePending;
let evidence: SqliteRestorationEvidence;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  folder = mkdtempSync(join(tmpdir(), "purosur-pos-restoration-evidence-"));
  pending = restorePendingIn(folder);
  evidence = new SqliteRestorationEvidence(database, pending);
});

afterEach(() => {
  database.close();
  rmSync(folder, { recursive: true, force: true });
});

const markStale = () =>
  database
    .prepare("UPDATE sync_state SET stale_sequence_detected_at = '2026-10-01T09:30:00.000Z'")
    .run();

const holdPredecessor = () =>
  database
    .prepare("INSERT INTO register_predecessor (device_id, last_acknowledged_seq) VALUES ('d0', 4)")
    .run();

describe("the evidence of the restoration protocol", () => {
  it("holds every delivered step completed for a register that never went stale", () => {
    expect(evidence.evidence()).toEqual({
      enroll: "completed",
      restore: "completed",
      reset_sync_identity: "completed",
      replenish: "completed",
    });
  });

  it("holds the enrollment pending once the cloud refused the register's sequence as stale", () => {
    markStale();

    expect(evidence.evidence()).toEqual({
      enroll: "pending",
      restore: "completed",
      reset_sync_identity: "completed",
      replenish: "completed",
    });
  });

  it("holds the enrollment completed once the stale register enrolled again", () => {
    markStale();
    pending.begin("device-b");

    expect(evidence.evidence().enroll).toBe("completed");
  });

  it("holds the restoration and the reset of the sync identity pending while the restore is pending", () => {
    pending.begin("device-b");

    expect(evidence.evidence()).toEqual({
      enroll: "completed",
      restore: "pending",
      reset_sync_identity: "pending",
      replenish: "completed",
    });
  });

  it("holds the replenishment pending while the register holds its predecessor", () => {
    holdPredecessor();

    expect(evidence.evidence()).toEqual({
      enroll: "completed",
      restore: "completed",
      reset_sync_identity: "completed",
      replenish: "pending",
    });
  });

  it("follows the restore as it ends", () => {
    pending.begin("device-b");
    pending.clear();

    expect(evidence.evidence().restore).toBe("completed");
  });

  it("holds the restore completed for a register with no folder to hold a marker", () => {
    const withoutFolder = new SqliteRestorationEvidence(database, restorePendingIn(undefined));

    expect(withoutFolder.evidence().restore).toBe("completed");
  });
});
