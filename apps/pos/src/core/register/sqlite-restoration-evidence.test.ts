import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type RestorePending, restorePendingIn } from "../backups/restore-pending";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import type { CloudReachability } from "../sync/cloud-reachability";
import { SqliteRestorationEvidence } from "./sqlite-restoration-evidence";

let database: LocalDatabase;
let folder: string;
let pending: RestorePending;
let evidence: SqliteRestorationEvidence;
let cloud: CloudReachability;
let noUsableGeneration: boolean;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  folder = mkdtempSync(join(tmpdir(), "purosur-pos-restoration-evidence-"));
  pending = restorePendingIn(folder);
  cloud = "unknown";
  noUsableGeneration = false;
  evidence = new SqliteRestorationEvidence(
    database,
    pending,
    () => cloud,
    () => noUsableGeneration,
  );
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

const holdPointOfSale = (awaiting: boolean) =>
  database.exec(
    `INSERT INTO own_register (id, name, version, removed) VALUES ('r1', 'Caja 1', 1, 0);
     INSERT INTO register_point_of_sale (register_id, point_of_sale_number, fiscal_address_id, version)
       VALUES ('r1', 12, 'address-1', 1);
     ${awaiting ? "INSERT INTO awaiting_restored_numbering (register_id) VALUES ('r1');" : ""}`,
  );

describe("the evidence of the restoration protocol", () => {
  it("holds every delivered step completed for a register that never went stale", () => {
    expect(evidence.evidence()).toEqual({
      enroll: "completed",
      restore: "completed",
      reset_sync_identity: "completed",
      replenish: "completed",
      reconcile_fiscal_counters: "completed",
      cloud: "unknown",
    });
  });

  it("holds the enrollment pending once the cloud refused the register's sequence as stale", () => {
    markStale();

    expect(evidence.evidence()).toEqual({
      enroll: "pending",
      restore: "completed",
      reset_sync_identity: "completed",
      replenish: "completed",
      reconcile_fiscal_counters: "completed",
      cloud: "unknown",
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
      reconcile_fiscal_counters: "completed",
      cloud: "unknown",
    });
  });

  it("holds the replenishment pending while the register holds its predecessor", () => {
    holdPredecessor();

    expect(evidence.evidence()).toEqual({
      enroll: "completed",
      restore: "completed",
      reset_sync_identity: "completed",
      replenish: "pending",
      reconcile_fiscal_counters: "completed",
      cloud: "unknown",
    });
  });

  it("holds the reconciliation of the fiscal counters pending while a point of sale awaits its numbering", () => {
    holdPointOfSale(true);

    expect(evidence.evidence()).toEqual({
      enroll: "completed",
      restore: "completed",
      reset_sync_identity: "completed",
      replenish: "completed",
      reconcile_fiscal_counters: "pending",
      cloud: "unknown",
    });
  });

  it("holds the reconciliation of the fiscal counters completed once no point of sale awaits its numbering", () => {
    holdPointOfSale(false);

    expect(evidence.evidence().reconcile_fiscal_counters).toBe("completed");
  });

  it("follows the restore as it ends", () => {
    pending.begin("device-b");
    pending.clear();

    expect(evidence.evidence().restore).toBe("completed");
  });

  it("holds the restore completed for a register with no folder to hold a marker", () => {
    const withoutFolder = new SqliteRestorationEvidence(
      database,
      restorePendingIn(undefined),
      () => cloud,
      () => noUsableGeneration,
    );

    expect(withoutFolder.evidence().restore).toBe("completed");
  });

  it.each(["reachable", "unreachable", "unknown"] as const)(
    "follows the cloud reachability it is given: %s",
    (answer) => {
      cloud = answer;

      expect(evidence.evidence().cloud).toBe(answer);
    },
  );

  it("holds the restore failed while it is pending and no snapshot generation is usable", () => {
    pending.begin("device-b");
    noUsableGeneration = true;

    expect(evidence.evidence()).toMatchObject({
      enroll: "completed",
      restore: "failed",
      reset_sync_identity: "pending",
    });
  });

  it("holds the restore pending, not failed, while a usable generation may still exist", () => {
    pending.begin("device-b");

    expect(evidence.evidence().restore).toBe("pending");
  });

  it("holds the restore completed when no restore is pending, whatever was found before", () => {
    noUsableGeneration = true;

    expect(evidence.evidence().restore).toBe("completed");
  });
});
