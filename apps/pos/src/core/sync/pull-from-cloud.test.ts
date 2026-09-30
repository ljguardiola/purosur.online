import { describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import { openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { pullFromCloud } from "./pull-from-cloud";
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
  return new SqliteLocalReplica(openLocalDatabase(":memory:", LOCAL_MIGRATIONS));
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
      { path: "/changes?since=0", headers: { authorization: "Bearer prefix.secret" } },
      { path: "/changes?since=2", headers: { authorization: "Bearer prefix.secret" } },
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
      { path: "/changes?since=0", headers: { authorization: "Bearer new.token" } },
    ]);
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
