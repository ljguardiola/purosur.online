import type { RestorationEvidence } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import {
  orphanSweepReportOf,
  regularizeOrphanAuthorizationsStep,
} from "./regularize-orphan-authorizations-step";

const CREDENTIALS = {
  device_id: "device-new",
  device_token: "prefix.secret",
  pepper: Buffer.alloc(32, 9).toString("base64url"),
};

const AT_THE_SWEEP: RestorationEvidence = {
  enroll: "completed",
  restore: "completed",
  reset_sync_identity: "completed",
  replenish: "completed",
  recover_contingency_tickets: "completed",
  reconcile_fiscal_counters: "completed",
  regularize_orphan_authorizations: "pending",
  origin: "copy",
  cloud: "unknown",
};

const SWEPT: CloudResponse = {
  kind: "ok",
  body: { state: "SWEPT", credit_noted_numbers: [], alerted_numbers: [] },
};

let database: LocalDatabase;
let posts: string[];

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec("INSERT INTO awaiting_orphan_sweep (register_id) VALUES ('r1')");
  posts = [];
});

afterEach(() => {
  database.close();
});

function step(
  answer: CloudResponse,
  overrides: {
    evidence?: RestorationEvidence;
    credentials?: typeof CREDENTIALS | undefined;
    database?: LocalDatabase | undefined;
    withCloud?: boolean;
  } = {},
) {
  const { evidence = AT_THE_SWEEP, withCloud = true } = overrides;
  return regularizeOrphanAuthorizationsStep({
    database: "database" in overrides ? overrides.database : database,
    evidence: () => ({ evidence: () => evidence }),
    readCredentials: async () => ("credentials" in overrides ? overrides.credentials : CREDENTIALS),
    post: withCloud
      ? async (path) => {
          posts.push(path);
          return answer;
        }
      : undefined,
  });
}

function awaitedRegisters() {
  return database.prepare("SELECT register_id FROM awaiting_orphan_sweep").all();
}

describe("regularizing the orphan authorizations of a restored register", () => {
  it("asks the cloud for the sweep and stops awaiting it once the cloud swept", async () => {
    expect(await step(SWEPT)).toEqual({ kind: "regularized" });
    expect(posts).toEqual(["/api/devices/current/orphan-sweep"]);
    expect(awaitedRegisters()).toEqual([]);
  });

  it("keeps awaiting the sweep while the cloud has not reconciled the numbering", async () => {
    const attempt = await step({ kind: "ok", body: { state: "NUMBERING_NOT_RECONCILED" } });

    expect(attempt).toEqual({ kind: "numbering_not_reconciled" });
    expect(awaitedRegisters()).toEqual([{ register_id: "r1" }]);
  });

  it("keeps awaiting the sweep when the cloud is unreachable", async () => {
    expect(await step({ kind: "unreachable" })).toEqual({
      kind: "failed",
      failure: { kind: "unreachable" },
    });
    expect(awaitedRegisters()).toEqual([{ register_id: "r1" }]);
  });

  it("asks nothing of the cloud while the restoration is at another step", async () => {
    const attempt = await step(SWEPT, {
      evidence: { ...AT_THE_SWEEP, reconcile_fiscal_counters: "pending" },
    });

    expect(attempt).toEqual({ kind: "not_this_step" });
    expect(posts).toEqual([]);
    expect(awaitedRegisters()).toEqual([{ register_id: "r1" }]);
  });

  it.each([
    ["has no local database", { database: undefined }, "no_local_database"],
    ["has no cloud", { withCloud: false }, "no_cloud"],
    ["is not enrolled", { credentials: undefined }, "not_enrolled"],
  ])("does nothing when the register %s", async (_case, overrides, kind) => {
    expect(await step(SWEPT, overrides)).toEqual({ kind });
    expect(posts).toEqual([]);
  });
});

describe("what a sweep attempt reports", () => {
  it("reports a cloud that refused or answered unreadably as a warning", () => {
    for (const failure of [
      { kind: "refused" as const, code: "device_token_rejected" as const },
      { kind: "unreadable" as const },
    ]) {
      expect(orphanSweepReportOf({ kind: "failed", failure })).toEqual({
        level: "warn",
        message:
          "core: the cloud's sweep of the restored register's orphan authorizations was refused or unreadable, so it will be asked again later",
      });
    }
  });

  it.each([
    { kind: "failed" as const, failure: { kind: "unreachable" as const } },
    { kind: "regularized" as const },
    { kind: "numbering_not_reconciled" as const },
    { kind: "not_this_step" as const },
    { kind: "no_local_database" as const },
    { kind: "no_cloud" as const },
    { kind: "not_enrolled" as const },
  ])("reports nothing for $kind", (attempt) => {
    expect(orphanSweepReportOf(attempt)).toBeUndefined();
  });
});
