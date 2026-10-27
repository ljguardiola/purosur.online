import type { RestorationEvidence } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import {
  contingencyTicketRecoveryReportOf,
  recoverContingencyTicketsStep,
} from "./recover-contingency-tickets-step";

const CREDENTIALS = {
  device_id: "device-new",
  device_token: "prefix.secret",
  pepper: Buffer.alloc(32, 9).toString("base64url"),
};

const AT_THE_RECOVERY: RestorationEvidence = {
  enroll: "completed",
  restore: "completed",
  reset_sync_identity: "completed",
  replenish: "completed",
  recover_contingency_tickets: "pending",
  reconcile_fiscal_counters: "pending",
  regularize_orphan_authorizations: "pending",
  origin: "copy",
  cloud: "unknown",
};

let database: LocalDatabase;
let posts: { path: string; body: unknown }[];

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    "INSERT INTO awaiting_contingency_ticket_recovery (device_id, last_acknowledged_seq) VALUES ('device-old', 52)",
  );
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
  const { evidence = AT_THE_RECOVERY, withCloud = true } = overrides;
  return recoverContingencyTicketsStep({
    database: "database" in overrides ? overrides.database : database,
    evidence: () => ({ evidence: () => evidence }),
    readCredentials: async () => ("credentials" in overrides ? overrides.credentials : CREDENTIALS),
    post: withCloud
      ? async (path, _token, body) => {
          posts.push({ path, body });
          return answer;
        }
      : undefined,
  });
}

function table(name: string) {
  return database.prepare(`SELECT device_id, last_acknowledged_seq FROM ${name}`).all();
}

describe("recovering the contingency tickets of a restored register", () => {
  it("asks the cloud about the awaited predecessor and hands it back to the replenishment once finished", async () => {
    const attempt = await step({ kind: "ok", body: { status: "finished" } });

    expect(attempt).toEqual({ kind: "released" });
    expect(posts).toEqual([
      {
        path: "/api/devices/current/contingency-ticket-recovery",
        body: { predecessor_device_id: "device-old" },
      },
    ]);
    expect(table("register_predecessor")).toEqual([
      { device_id: "device-old", last_acknowledged_seq: 52 },
    ]);
    expect(table("awaiting_contingency_ticket_recovery")).toEqual([]);
  });

  it("keeps awaiting while the cloud's recovery is not finished", async () => {
    expect(await step({ kind: "ok", body: { status: "awaiting" } })).toEqual({ kind: "awaiting" });
    expect(table("register_predecessor")).toEqual([]);
    expect(table("awaiting_contingency_ticket_recovery")).toHaveLength(1);
  });

  it("keeps awaiting when the cloud is unreachable", async () => {
    expect(await step({ kind: "unreachable" })).toEqual({
      kind: "failed",
      failure: { kind: "unreachable" },
    });
    expect(table("awaiting_contingency_ticket_recovery")).toHaveLength(1);
  });

  it("asks nothing of the cloud while the restoration is at another step", async () => {
    const attempt = await step(
      { kind: "ok", body: { status: "finished" } },
      { evidence: { ...AT_THE_RECOVERY, replenish: "pending" } },
    );

    expect(attempt).toEqual({ kind: "not_this_step" });
    expect(posts).toEqual([]);
  });

  it.each([
    ["has no local database", { database: undefined }, "no_local_database"],
    ["has no cloud", { withCloud: false }, "no_cloud"],
    ["is not enrolled", { credentials: undefined }, "not_enrolled"],
  ])("does nothing when the register %s", async (_case, overrides, kind) => {
    expect(await step({ kind: "ok", body: { status: "finished" } }, overrides)).toEqual({ kind });
    expect(posts).toEqual([]);
  });
});

describe("what a contingency ticket recovery attempt reports", () => {
  it("reports a cloud that refused or answered unreadably as a warning", () => {
    for (const failure of [
      { kind: "unreadable" },
      { kind: "refused", code: "predecessor_not_revoked" },
    ] as const) {
      expect(contingencyTicketRecoveryReportOf({ kind: "failed", failure })?.level).toBe("warn");
    }
  });

  it.each([
    { kind: "failed", failure: { kind: "unreachable" } },
    { kind: "awaiting" },
    { kind: "released" },
    { kind: "not_this_step" },
    { kind: "no_cloud" },
  ] as const)("reports nothing for %j", (attempt) => {
    expect(contingencyTicketRecoveryReportOf(attempt)).toBeUndefined();
  });
});
