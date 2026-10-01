import type { SyncChange } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import type { RegisterPulledChange } from "./pulled-change";
import { SqliteLocalReplica } from "./sqlite-local-replica";

const THRESHOLD_ID = "8a4c0b16-c9db-4f8e-9ad1-5c7d9f1b3e48";
const LATER_THRESHOLD_ID = "9b5d1c27-daec-4a9f-8be2-6d8e0a2c4f59";
const PEPPER = Buffer.alloc(32, 7).toString("base64url");

function thresholdChange(
  changeSeq: number,
  entityId: string,
  amount: number,
  validFrom: string,
): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "buyer_identification_threshold",
    entity_id: entityId,
    row: { amount, valid_from: validFrom },
  };
  return { changeSeq, change };
}

async function save(...changes: RegisterPulledChange[]) {
  const cursor = changes.at(-1)?.changeSeq ?? 0;
  await replica.savePage({ changes, cursor, hasMore: false });
}

function savedThresholds() {
  return database
    .prepare(
      "SELECT id, amount, valid_from FROM buyer_identification_thresholds ORDER BY valid_from",
    )
    .all();
}

let database: LocalDatabase;
let replica: SqliteLocalReplica;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
  replica = new SqliteLocalReplica(database);
  replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });
});

afterEach(() => {
  database.close();
});

describe("the register's local copy of the buyer-identification thresholds", () => {
  it("saves a threshold with its amount in cents and the day it takes effect", async () => {
    await save(thresholdChange(1, THRESHOLD_ID, 10_000_000, "2026-10-01"));

    expect(savedThresholds()).toEqual([
      { id: THRESHOLD_ID, amount: 10_000_000, valid_from: "2026-10-01" },
    ]);
  });

  it("keeps every threshold it receives, so the one in effect can be told by its day", async () => {
    await save(thresholdChange(1, THRESHOLD_ID, 10_000_000, "2026-10-01"));

    await save(thresholdChange(2, LATER_THRESHOLD_ID, 12_000_000, "2027-02-01"));

    expect(savedThresholds()).toEqual([
      { id: THRESHOLD_ID, amount: 10_000_000, valid_from: "2026-10-01" },
      { id: LATER_THRESHOLD_ID, amount: 12_000_000, valid_from: "2027-02-01" },
    ]);
  });

  it("changes nothing when a threshold is delivered again", async () => {
    await save(thresholdChange(1, THRESHOLD_ID, 10_000_000, "2026-10-01"));

    await save(thresholdChange(2, THRESHOLD_ID, 99_000_000, "2030-01-01"));

    expect(savedThresholds()).toEqual([
      { id: THRESHOLD_ID, amount: 10_000_000, valid_from: "2026-10-01" },
    ]);
  });

  it("keeps an earlier threshold that arrives late next to the later one", async () => {
    await save(thresholdChange(1, LATER_THRESHOLD_ID, 12_000_000, "2027-02-01"));

    await save(thresholdChange(2, THRESHOLD_ID, 10_000_000, "2026-10-01"));

    expect(savedThresholds()).toEqual([
      { id: THRESHOLD_ID, amount: 10_000_000, valid_from: "2026-10-01" },
      { id: LATER_THRESHOLD_ID, amount: 12_000_000, valid_from: "2027-02-01" },
    ]);
  });

  it("saves the cursor together with the threshold", async () => {
    await save(thresholdChange(4, THRESHOLD_ID, 10_000_000, "2026-10-01"));

    expect(await replica.savedCursor()).toBe(4);
  });

  it("saves neither the threshold nor the cursor when the page fails", async () => {
    database.exec("DROP TABLE buyer_identification_thresholds");
    database.exec(
      `CREATE TABLE buyer_identification_thresholds (
         id TEXT PRIMARY KEY, amount INTEGER NOT NULL, valid_from TEXT NOT NULL,
         CHECK (amount < 12000000)
       )`,
    );

    await expect(
      save(
        thresholdChange(1, THRESHOLD_ID, 10_000_000, "2026-10-01"),
        thresholdChange(2, LATER_THRESHOLD_ID, 12_000_000, "2027-02-01"),
      ),
    ).rejects.toThrow(/CHECK/);

    expect(savedThresholds()).toEqual([]);
    expect(await replica.savedCursor()).toBe(0);
  });
});
