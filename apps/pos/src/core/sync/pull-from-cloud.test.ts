import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { pullFromCloud, pullResultOf } from "./pull-from-cloud";
import { SqliteLocalReplica } from "./sqlite-local-replica";

const CREDENTIALS = { device_id: "a4b1", device_token: "prefix.secret", pepper: "cGVwcGVy" };
const LOCATION_ID = "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10";

const settingsRow = {
  address: "Av. Belgrano 1450, CABA",
  whatsapp_number: "",
  instagram_handle: "",
  monday_hours: [],
  tuesday_hours: [],
  wednesday_hours: [],
  thursday_hours: [],
  friday_hours: [],
  saturday_hours: [],
  sunday_hours: [],
  expiring_lot_alert_days: 30,
  unreviewed_price_alert_days: 30,
  good_condition_return_days: 15,
  version: 1,
};

function page(changeSeqs: number[], hasMore: boolean): CloudResponse {
  return {
    kind: "ok",
    body: {
      changes: changeSeqs.map((changeSeq) => ({
        change_seq: changeSeq,
        entity: "branch_settings",
        entity_id: LOCATION_ID,
        row: { ...settingsRow, version: changeSeq },
      })),
      cursor: changeSeqs.at(-1) ?? 0,
      has_more: hasMore,
    },
  };
}

const USER_ID = "1e7b3a90-52c4-4d18-9f6a-8b0c2d4e6f71";
const PIN_HASH = "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu";

function usersPage(): CloudResponse {
  return {
    kind: "ok",
    body: {
      changes: [
        {
          change_seq: 1,
          entity: "user",
          entity_id: USER_ID,
          row: {
            first_name: "Ada",
            role_id: "3a9d5cb2-74e6-4f3a-9b8c-0d2e4f6a8b93",
            salt: "c2FsdA",
            pin_hash: PIN_HASH,
            active: true,
            version: 1,
          },
        },
      ],
      cursor: 1,
      has_more: false,
    },
  };
}

function verifierWith(pepper: string): string {
  return createHmac("sha256", Buffer.from(pepper, "base64url"))
    .update(PIN_HASH)
    .digest("base64url");
}

function cloudAnswering(...answers: CloudResponse[]) {
  const requests: { path: string; headers: Record<string, string> }[] = [];
  const getFromCloud = async (path: string, headers: Record<string, string>) => {
    requests.push({ path, headers });
    const answer = answers.shift();
    if (answer === undefined) {
      throw new Error(`test setup: no answer left for ${path}`);
    }
    return answer;
  };
  return { getFromCloud, requests };
}

function freshReplica() {
  return new SqliteLocalReplica(openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock));
}

describe("a pull from the cloud", () => {
  it("catches the local database up page by page with the device token", async () => {
    const replica = freshReplica();
    const { getFromCloud, requests } = cloudAnswering(page([1, 2], true), page([3], false));

    const attempt = await pullFromCloud({
      readCredentials: async () => CREDENTIALS,
      replica,
      getFromCloud,
    });

    expect(attempt).toEqual({ kind: "caught_up", cursor: 3 });
    expect(requests).toEqual([
      { path: "/api/changes?since=0", headers: { authorization: "Bearer prefix.secret" } },
      { path: "/api/changes?since=2", headers: { authorization: "Bearer prefix.secret" } },
    ]);
    expect(replica.branchSettings(LOCATION_ID)).toMatchObject({ version: 3 });
  });

  it("stops where it got to when the cloud can't be reached, keeping what it already saved", async () => {
    const replica = freshReplica();
    const { getFromCloud } = cloudAnswering(page([1, 2], true), { kind: "unreachable" });

    const attempt = await pullFromCloud({
      readCredentials: async () => CREDENTIALS,
      replica,
      getFromCloud,
    });

    expect(attempt).toEqual({ kind: "failed", failure: { kind: "unreachable" }, cursor: 2 });
    expect(await replica.savedCursor()).toBe(2);
  });

  it("pulls from the very first cursor once another installation's credentials are stored", async () => {
    const replica = freshReplica();
    await pullFromCloud({
      readCredentials: async () => CREDENTIALS,
      replica,
      getFromCloud: cloudAnswering(page([1, 2, 3], false)).getFromCloud,
    });
    const { getFromCloud, requests } = cloudAnswering(page([1], false));

    await pullFromCloud({
      readCredentials: async () => ({
        ...CREDENTIALS,
        device_id: "c9d2",
        device_token: "new.token",
      }),
      replica,
      getFromCloud,
    });

    expect(requests).toEqual([
      { path: "/api/changes?since=0", headers: { authorization: "Bearer new.token" } },
    ]);
  });

  it("derives a pulled user's verifier with the pepper of the credentials it read", async () => {
    const replica = freshReplica();

    await pullFromCloud({
      readCredentials: async () => CREDENTIALS,
      replica,
      getFromCloud: cloudAnswering(usersPage()).getFromCloud,
    });

    expect(replica.pinVerifier(USER_ID)).toBe(verifierWith(CREDENTIALS.pepper));
  });

  it("derives the verifiers again with the new pepper once another installation's credentials are stored", async () => {
    const replica = freshReplica();
    await pullFromCloud({
      readCredentials: async () => CREDENTIALS,
      replica,
      getFromCloud: cloudAnswering(usersPage()).getFromCloud,
    });
    const reEnrolledPepper = Buffer.alloc(32, 5).toString("base64url");

    await pullFromCloud({
      readCredentials: async () => ({
        ...CREDENTIALS,
        device_id: "c9d2",
        pepper: reEnrolledPepper,
      }),
      replica,
      getFromCloud: cloudAnswering(usersPage()).getFromCloud,
    });

    expect(replica.pinVerifier(USER_ID)).toBe(verifierWith(reEnrolledPepper));
  });

  it("asks nothing of the cloud before the register is enrolled", async () => {
    const { getFromCloud, requests } = cloudAnswering();

    const attempt = await pullFromCloud({
      readCredentials: async () => undefined,
      replica: freshReplica(),
      getFromCloud,
    });

    expect(attempt).toEqual({ kind: "not_enrolled" });
    expect(requests).toEqual([]);
  });

  it("does nothing without a cloud for its channel", async () => {
    expect(
      await pullFromCloud({
        readCredentials: async () => CREDENTIALS,
        replica: freshReplica(),
        getFromCloud: undefined,
      }),
    ).toEqual({ kind: "no_cloud" });
  });

  it("does nothing without a local database to save into", async () => {
    const { getFromCloud, requests } = cloudAnswering();

    const attempt = await pullFromCloud({
      readCredentials: async () => CREDENTIALS,
      replica: undefined,
      getFromCloud,
    });

    expect(attempt).toEqual({ kind: "no_local_database" });
    expect(requests).toEqual([]);
  });
});

describe("what a pull attempt means for the schedule", () => {
  it("counts a register that has nothing to pull yet, or is caught up, as succeeded", () => {
    for (const attempt of [
      { kind: "caught_up", cursor: 3 },
      { kind: "not_enrolled" },
      { kind: "no_cloud" },
      { kind: "no_local_database" },
    ] as const) {
      expect(pullResultOf(attempt)).toEqual({ kind: "succeeded" });
    }
  });

  it("counts every way of stopping before catching up as failed", () => {
    for (const attempt of [
      { kind: "failed", cursor: 3, failure: { kind: "unreachable" } },
      { kind: "failed", cursor: 3, failure: { kind: "unreadable" } },
      { kind: "failed", cursor: 3, failure: { kind: "refused", code: "server_unavailable" } },
      { kind: "page_out_of_order", cursor: 3 },
    ] as const) {
      expect(pullResultOf(attempt)).toEqual({ kind: "failed" });
    }
  });

  it("carries the wait the cloud asked for, in milliseconds", () => {
    expect(
      pullResultOf({
        kind: "failed",
        cursor: 3,
        failure: { kind: "refused", code: "rate_limited", retryAfterSeconds: 45 },
      }),
    ).toEqual({ kind: "failed", retryAfterMs: 45_000 });
  });
});
