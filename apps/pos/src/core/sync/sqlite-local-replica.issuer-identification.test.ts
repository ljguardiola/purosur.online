import type { SyncChange } from "@purosur/contracts";
import {
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import type { RegisterPulledChange } from "./pulled-change";
import { SqliteLocalReplica } from "./sqlite-local-replica";

const ISSUER_ID = "7f3b9a05-b8ca-4e7d-8fc0-4b6c8e0a2d37";
const PEPPER = Buffer.alloc(32, 7).toString("base64url");

type IssuerRow = Extract<SyncChange, { entity: "issuer_identification" }>["row"];

function issuerRow(overrides: Partial<IssuerRow> = {}): IssuerRow {
  return {
    legal_name: FICTIONAL_LEGAL_NAME,
    gross_income_registration: FICTIONAL_GROSS_INCOME_REGISTRATION,
    activity_start_date: "2020-03-01",
    authorized_cuit: "20000000001",
    tax_status: "Responsable Monotributo",
    version: 1,
    ...overrides,
  };
}

function issuerChange(changeSeq: number, row: IssuerRow): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "issuer_identification",
    entity_id: ISSUER_ID,
    row,
  };
  return { changeSeq, change };
}

async function save(...changes: RegisterPulledChange[]) {
  const cursor = changes.at(-1)?.changeSeq ?? 0;
  await replica.savePage({ changes, cursor, hasMore: false });
}

function savedVersions() {
  return database
    .prepare(
      `SELECT version, legal_name, gross_income_registration, activity_start_date,
              authorized_cuit, tax_status
       FROM issuer_identification_versions ORDER BY version`,
    )
    .all();
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

describe("the register's local copy of the issuer identification versions", () => {
  it("saves a version with every field it was saved with", async () => {
    await save(issuerChange(1, issuerRow({ version: 3 })));

    expect(savedVersions()).toEqual([
      {
        version: 3,
        legal_name: FICTIONAL_LEGAL_NAME,
        gross_income_registration: FICTIONAL_GROSS_INCOME_REGISTRATION,
        activity_start_date: "2020-03-01",
        authorized_cuit: "20000000001",
        tax_status: "Responsable Monotributo",
      },
    ]);
  });

  it("saves a version whose optional fields are not filled in yet", async () => {
    await save(
      issuerChange(
        1,
        issuerRow({ legal_name: null, gross_income_registration: null, activity_start_date: null }),
      ),
    );

    expect(savedVersions()).toEqual([
      expect.objectContaining({
        legal_name: null,
        gross_income_registration: null,
        activity_start_date: null,
      }),
    ]);
  });

  it("keeps each version it receives", async () => {
    await save(issuerChange(1, issuerRow()));

    await save(issuerChange(2, issuerRow({ legal_name: "Comercio Nuevo", version: 2 })));

    expect(savedVersions()).toEqual([
      expect.objectContaining({ version: 1, legal_name: FICTIONAL_LEGAL_NAME }),
      expect.objectContaining({ version: 2, legal_name: "Comercio Nuevo" }),
    ]);
  });

  it("changes nothing when a version is delivered again", async () => {
    await save(issuerChange(1, issuerRow()));

    await save(issuerChange(2, issuerRow({ legal_name: "Otro nombre" })));

    expect(savedVersions()).toEqual([
      expect.objectContaining({ version: 1, legal_name: FICTIONAL_LEGAL_NAME }),
    ]);
  });

  it("keeps an older version that arrives late next to the newer one", async () => {
    await save(issuerChange(1, issuerRow({ legal_name: "Comercio Nuevo", version: 2 })));

    await save(issuerChange(2, issuerRow()));

    expect(savedVersions()).toEqual([
      expect.objectContaining({ version: 1, legal_name: FICTIONAL_LEGAL_NAME }),
      expect.objectContaining({ version: 2, legal_name: "Comercio Nuevo" }),
    ]);
  });

  it("saves the cursor together with the version", async () => {
    await save(issuerChange(5, issuerRow()));

    expect(await replica.savedCursor()).toBe(5);
  });

  it("saves neither the version nor the cursor when the page fails", async () => {
    database.exec("DROP TABLE issuer_identification_versions");
    database.exec(
      `CREATE TABLE issuer_identification_versions (
         version INTEGER PRIMARY KEY, legal_name TEXT, gross_income_registration TEXT,
         activity_start_date TEXT, authorized_cuit TEXT NOT NULL, tax_status TEXT NOT NULL,
         CHECK (version < 2)
       )`,
    );

    await expect(
      save(issuerChange(1, issuerRow()), issuerChange(2, issuerRow({ version: 2 }))),
    ).rejects.toThrow(/CHECK/);

    expect(savedVersions()).toEqual([]);
    expect(await replica.savedCursor()).toBe(0);
  });
});
