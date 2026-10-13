import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cloudError } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { pullFromCloud, pullResultOf, pullWarningOf } from "./pull-from-cloud";
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

const POINT_OF_SALE_ID = "4b0e6dc3-85f7-4a4b-8c9d-1e3f5a7b9c04";

function pointOfSalePage(
  changeSeqs: number[],
  taxAuthorityLastAuthorizedNumber: number | null,
  hasMore = false,
): CloudResponse {
  return {
    kind: "ok",
    body: {
      changes: changeSeqs.map((changeSeq) => ({
        change_seq: changeSeq,
        entity: "register_point_of_sale",
        entity_id: POINT_OF_SALE_ID,
        row: {
          point_of_sale_number: 12,
          fiscal_address_id: "0b7c6f5e-2d4a-4e8b-9c1d-3a5f7e9b1d02",
          tax_authority_last_authorized_number: taxAuthorityLastAuthorizedNumber,
          version: 1,
        },
      })),
      cursor: changeSeqs.at(-1) ?? 0,
      has_more: hasMore,
    },
  };
}

function offlinePointOfSalePage(
  changeSeqs: number[],
  taxAuthorityLastAuthorizedNumber: number | null,
): CloudResponse {
  return {
    kind: "ok",
    body: {
      changes: changeSeqs.map((changeSeq) => ({
        change_seq: changeSeq,
        entity: "register_offline_point_of_sale",
        entity_id: POINT_OF_SALE_ID,
        row: {
          point_of_sale_number: 31,
          tax_authority_last_authorized_number: taxAuthorityLastAuthorizedNumber,
          version: 1,
        },
      })),
      cursor: changeSeqs.at(-1) ?? 0,
      has_more: false,
    },
  };
}

function replicaWaitingForPointOfSaleRedelivery() {
  const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  const replica = new SqliteLocalReplica(database);
  replica.adoptDevice({ deviceId: CREDENTIALS.device_id, pepper: CREDENTIALS.pepper });
  database.exec(
    `INSERT INTO pulled_table_redeliveries (table_name) VALUES ('register_point_of_sale');
     INSERT INTO register_point_of_sale (register_id, point_of_sale_number, fiscal_address_id, version)
     VALUES ('${POINT_OF_SALE_ID}', 12, '0b7c6f5e-2d4a-4e8b-9c1d-3a5f7e9b1d02', 1);`,
  );
  return { database, replica };
}

function heldCount(database: ReturnType<typeof openLocalDatabase>) {
  return database
    .prepare("SELECT tax_authority_last_authorized_number AS count FROM register_point_of_sale")
    .get();
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

describe("a pull of a register waiting for a redelivery", () => {
  it("redelivers the entity from its cursor once it has caught up, then forgets the wait", async () => {
    const { database, replica } = replicaWaitingForPointOfSaleRedelivery();
    const { getFromCloud, requests } = cloudAnswering(page([], false), pointOfSalePage([5], 12));

    const attempt = await pullFromCloud({
      readCredentials: async () => CREDENTIALS,
      replica,
      getFromCloud,
    });

    expect(attempt).toEqual({ kind: "caught_up", cursor: 0 });
    expect(requests.map((request) => request.path)).toEqual([
      "/api/changes?since=0",
      "/api/changes?since=0&entity=register_point_of_sale",
    ]);
    expect(requests[1]?.headers).toEqual({ authorization: "Bearer prefix.secret" });
    expect(heldCount(database)).toEqual({ count: 12 });
    expect(database.prepare("SELECT * FROM pulled_table_redeliveries").all()).toEqual([]);
    expect(await replica.savedCursor()).toBe(0);
  });

  it("asks for nothing of an entity when it was not caught up", async () => {
    const { database, replica } = replicaWaitingForPointOfSaleRedelivery();
    const { getFromCloud, requests } = cloudAnswering({ kind: "unreachable" });

    const attempt = await pullFromCloud({
      readCredentials: async () => CREDENTIALS,
      replica,
      getFromCloud,
    });

    expect(attempt).toMatchObject({ kind: "failed" });
    expect(requests).toHaveLength(1);
    expect(database.prepare("SELECT cursor FROM pulled_table_redeliveries").all()).toEqual([
      { cursor: 0 },
    ]);
  });

  it("keeps the wait, from the page it saved, when the cloud fails halfway", async () => {
    const { database, replica } = replicaWaitingForPointOfSaleRedelivery();
    const { getFromCloud } = cloudAnswering(page([], false), pointOfSalePage([5], 12, true), {
      kind: "unreachable",
    });

    const attempt = await pullFromCloud({
      readCredentials: async () => CREDENTIALS,
      replica,
      getFromCloud,
    });

    expect(attempt).toEqual({
      kind: "redelivery_failed",
      entity: "register_point_of_sale",
      failure: { kind: "unreachable" },
      cursor: 5,
    });
    expect(database.prepare("SELECT cursor FROM pulled_table_redeliveries").all()).toEqual([
      { cursor: 5 },
    ]);
    expect(heldCount(database)).toEqual({ count: 12 });
  });

  it("keeps the wait when the cloud answers a page out of order", async () => {
    const { database, replica } = replicaWaitingForPointOfSaleRedelivery();
    const { getFromCloud } = cloudAnswering(page([], false), {
      kind: "ok",
      body: { changes: [], cursor: 3, has_more: true },
    });

    const attempt = await pullFromCloud({
      readCredentials: async () => CREDENTIALS,
      replica,
      getFromCloud,
    });

    expect(attempt).toEqual({
      kind: "redelivery_page_out_of_order",
      entity: "register_point_of_sale",
      cursor: 0,
    });
    expect(database.prepare("SELECT cursor FROM pulled_table_redeliveries").all()).toEqual([
      { cursor: 0 },
    ]);
  });
});

describe("a register migrated past a column its pulled rows lack", () => {
  it("fills the column from the cloud's current row at the version held, leaving the pull cursor and the declaration cleared", async () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-redelivery-"));
    try {
      const path = join(folder, "register.sqlite");
      const before = openLocalDatabase(
        path,
        LOCAL_MIGRATIONS.filter((migration) => migration.name < "0021_real_time_authorization"),
        migrationClock,
      );
      before.exec(
        `UPDATE sync_state SET pull_cursor = 9, device_id = '${CREDENTIALS.device_id}' WHERE id = 1;
         INSERT INTO register_point_of_sale (register_id, point_of_sale_number, fiscal_address_id, version)
         VALUES ('${POINT_OF_SALE_ID}', 12, '0b7c6f5e-2d4a-4e8b-9c1d-3a5f7e9b1d02', 1);`,
      );
      before.close();
      const database = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);
      const { getFromCloud, requests } = cloudAnswering(
        { kind: "ok", body: { changes: [], cursor: 9, has_more: false } },
        page([], false),
        offlinePointOfSalePage([], null),
        pointOfSalePage([6], 12),
        page([], false),
      );

      const attempt = await pullFromCloud({
        readCredentials: async () => CREDENTIALS,
        replica: new SqliteLocalReplica(database),
        getFromCloud,
      });

      expect(attempt).toEqual({ kind: "caught_up", cursor: 9 });
      expect(requests.map((request) => request.path)).toEqual([
        "/api/changes?since=9",
        "/api/changes?since=0&entity=branch_first_cash_session",
        "/api/changes?since=0&entity=register_offline_point_of_sale",
        "/api/changes?since=0&entity=register_point_of_sale",
        "/api/changes?since=0&entity=stock_movement",
      ]);
      expect(heldCount(database)).toEqual({ count: 12 });
      expect(database.prepare("SELECT * FROM pulled_table_redeliveries").all()).toEqual([]);
      expect(database.prepare("SELECT pull_cursor FROM sync_state").all()).toEqual([
        { pull_cursor: 9 },
      ]);
      database.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("a register migrated past the offline point of sale's tax authority count", () => {
  it("fills the count from the cloud's current row at the version held, leaving the pull cursor and the declaration cleared", async () => {
    const folder = mkdtempSync(join(tmpdir(), "purosur-pos-redelivery-"));
    try {
      const path = join(folder, "register.sqlite");
      const before = openLocalDatabase(
        path,
        LOCAL_MIGRATIONS.filter(
          (migration) => migration.name < "0037_offline_point_of_sale_tax_authority_count",
        ),
        migrationClock,
      );
      before.exec(
        `UPDATE sync_state SET pull_cursor = 9, device_id = '${CREDENTIALS.device_id}' WHERE id = 1;
         INSERT INTO register_offline_point_of_sale (register_id, point_of_sale_number, version)
         VALUES ('${POINT_OF_SALE_ID}', 31, 1);`,
      );
      before.close();
      const database = openLocalDatabase(path, LOCAL_MIGRATIONS, migrationClock);
      const { getFromCloud, requests } = cloudAnswering(
        { kind: "ok", body: { changes: [], cursor: 9, has_more: false } },
        page([], false),
        offlinePointOfSalePage([7], 40),
        pointOfSalePage([], null),
        page([], false),
      );

      const attempt = await pullFromCloud({
        readCredentials: async () => CREDENTIALS,
        replica: new SqliteLocalReplica(database),
        getFromCloud,
      });

      expect(attempt).toEqual({ kind: "caught_up", cursor: 9 });
      expect(requests.map((request) => request.path)).toEqual([
        "/api/changes?since=9",
        "/api/changes?since=0&entity=branch_first_cash_session",
        "/api/changes?since=0&entity=register_offline_point_of_sale",
        "/api/changes?since=0&entity=register_point_of_sale",
        "/api/changes?since=0&entity=stock_movement",
      ]);
      expect(
        database
          .prepare(
            "SELECT tax_authority_last_authorized_number AS count FROM register_offline_point_of_sale",
          )
          .all(),
      ).toEqual([{ count: 40 }]);
      expect(database.prepare("SELECT * FROM pulled_table_redeliveries").all()).toEqual([]);
      expect(database.prepare("SELECT pull_cursor FROM sync_state").all()).toEqual([
        { pull_cursor: 9 },
      ]);
      database.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
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
      {
        kind: "redelivery_failed",
        entity: "product",
        cursor: 3,
        failure: { kind: "unreachable" },
      },
      { kind: "redelivery_page_out_of_order", entity: "product", cursor: 3 },
    ] as const) {
      expect(pullResultOf(attempt)).toEqual({ kind: "failed" });
    }
  });

  it("carries the wait the cloud asked for while redelivering, in milliseconds", () => {
    expect(
      pullResultOf({
        kind: "redelivery_failed",
        entity: "product",
        cursor: 3,
        failure: { kind: "refused", code: "rate_limited", retryAfterSeconds: 45 },
      }),
    ).toEqual({ kind: "failed", retryAfterMs: 45_000 });
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

describe("the warning a pull attempt leaves", () => {
  it("warns when the pull stopped before catching up for a reason other than an unreachable cloud", () => {
    for (const attempt of [
      { kind: "page_out_of_order", cursor: 3 },
      { kind: "failed", cursor: 3, failure: { kind: "unreadable" } },
      { kind: "failed", cursor: 3, failure: { kind: "refused", code: "server_unavailable" } },
    ] as const) {
      expect(pullWarningOf(attempt)).toBe("core: the pull stopped before catching up");
    }
  });

  it("warns when the pull stopped redelivering for a reason other than an unreachable cloud", () => {
    for (const attempt of [
      { kind: "redelivery_page_out_of_order", entity: "product", cursor: 3 },
      { kind: "redelivery_failed", entity: "product", cursor: 3, failure: { kind: "unreadable" } },
      {
        kind: "redelivery_failed",
        entity: "product",
        cursor: 3,
        failure: { kind: "refused", code: "server_unavailable" },
      },
    ] as const) {
      expect(pullWarningOf(attempt)).toBe(
        "core: the pull stopped before redelivering the tables a migration declared",
      );
    }
  });

  it("stays quiet when the cloud was unreachable or there was nothing to stop", () => {
    for (const attempt of [
      { kind: "failed", cursor: 3, failure: { kind: "unreachable" } },
      {
        kind: "redelivery_failed",
        entity: "product",
        cursor: 3,
        failure: { kind: "unreachable" },
      },
      { kind: "caught_up", cursor: 3 },
      { kind: "not_enrolled" },
      { kind: "no_cloud" },
      { kind: "no_local_database" },
    ] as const) {
      expect(pullWarningOf(attempt)).toBeUndefined();
    }
  });
});

describe("a pull the cloud refuses for asking too often", () => {
  it("asks to wait as long as the cloud said, leaving the local database as it was", async () => {
    const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
    const replica = new SqliteLocalReplica(database);
    replica.adoptDevice({ deviceId: CREDENTIALS.device_id, pepper: CREDENTIALS.pepper });
    const syncStateBefore = database.prepare("SELECT * FROM sync_state").all();
    const { getFromCloud } = cloudAnswering({
      kind: "error",
      error: cloudError("rate_limited", "too many requests", [{ retry_after_seconds: 45 }]),
    });

    const attempt = await pullFromCloud({
      readCredentials: async () => CREDENTIALS,
      replica,
      getFromCloud,
    });

    expect(pullResultOf(attempt)).toEqual({ kind: "failed", retryAfterMs: 45_000 });
    expect(database.prepare("SELECT * FROM sync_state").all()).toEqual(syncStateBefore);
  });
});
