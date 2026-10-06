import type { SyncChange } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import type { RegisterPulledChange } from "./pulled-change";
import { SqliteLocalReplica } from "./sqlite-local-replica";

const SET_ID = "ac6e2d38-ebfd-4bb0-9cf3-7e9f1b3d5a6a";
const LATER_SET_ID = "bd7f3e49-fc0e-4cc1-8d04-8fa02c4e6b7b";
const PEPPER = Buffer.alloc(32, 7).toString("base64url");

const FIRST_OPTIONS = [
  { code: 901, description: "Condicion de prueba A", invoice_class: "B" },
  { code: 902, description: "Condicion de prueba B", invoice_class: "C" },
];
const SECOND_OPTIONS = [{ code: 901, description: "Condicion de prueba A", invoice_class: "B" }];

function setChange(
  changeSeq: number,
  entityId: string,
  paramsVersion: number,
  options: typeof FIRST_OPTIONS,
): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "buyer_tax_status_set",
    entity_id: entityId,
    row: { params_version: paramsVersion, options },
  };
  return { changeSeq, change };
}

async function save(...changes: RegisterPulledChange[]) {
  const cursor = changes.at(-1)?.changeSeq ?? 0;
  await replica.savePage({ changes, cursor, hasMore: false });
}

function savedSets() {
  return database
    .prepare<[], { params_version: number; set_id: string; options: string }>(
      "SELECT params_version, set_id, options FROM buyer_tax_status_sets ORDER BY params_version",
    )
    .all()
    .map(({ options, ...set }) => ({ ...set, options: JSON.parse(options) as unknown }));
}

let database: LocalDatabase;
let replica: SqliteLocalReplica;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  replica = new SqliteLocalReplica(database);
  replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });
});

afterEach(() => {
  database.close();
});

describe("the register's local copy of the buyer tax-status sets", () => {
  it("saves a set with its id, its version and every option in order", async () => {
    await save(setChange(1, SET_ID, 2, FIRST_OPTIONS));

    expect(savedSets()).toEqual([{ params_version: 2, set_id: SET_ID, options: FIRST_OPTIONS }]);
  });

  it("keeps every set it receives", async () => {
    await save(setChange(1, SET_ID, 1, FIRST_OPTIONS));

    await save(setChange(2, LATER_SET_ID, 2, SECOND_OPTIONS));

    expect(savedSets()).toEqual([
      { params_version: 1, set_id: SET_ID, options: FIRST_OPTIONS },
      { params_version: 2, set_id: LATER_SET_ID, options: SECOND_OPTIONS },
    ]);
  });

  it("changes nothing when a set is delivered again", async () => {
    await save(setChange(1, SET_ID, 1, FIRST_OPTIONS));

    await save(setChange(2, SET_ID, 1, SECOND_OPTIONS));

    expect(savedSets()).toEqual([{ params_version: 1, set_id: SET_ID, options: FIRST_OPTIONS }]);
  });

  it("keeps an older set that arrives late next to the newer one", async () => {
    await save(setChange(1, LATER_SET_ID, 2, SECOND_OPTIONS));

    await save(setChange(2, SET_ID, 1, FIRST_OPTIONS));

    expect(savedSets()).toEqual([
      { params_version: 1, set_id: SET_ID, options: FIRST_OPTIONS },
      { params_version: 2, set_id: LATER_SET_ID, options: SECOND_OPTIONS },
    ]);
  });

  it("saves the cursor together with the set", async () => {
    await save(setChange(6, SET_ID, 1, FIRST_OPTIONS));

    expect(await replica.savedCursor()).toBe(6);
  });

  it("saves neither the set nor the cursor when the page fails", async () => {
    database.exec("DROP TABLE buyer_tax_status_sets");
    database.exec(
      `CREATE TABLE buyer_tax_status_sets (
         params_version INTEGER PRIMARY KEY, set_id TEXT NOT NULL, options TEXT NOT NULL,
         CHECK (params_version < 2)
       )`,
    );

    await expect(
      save(setChange(1, SET_ID, 1, FIRST_OPTIONS), setChange(2, LATER_SET_ID, 2, SECOND_OPTIONS)),
    ).rejects.toThrow(/CHECK/);

    expect(savedSets()).toEqual([]);
    expect(await replica.savedCursor()).toBe(0);
  });
});
