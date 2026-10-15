import type { SyncChange } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decideSaleAuthorizationIn } from "../fiscal/sqlite-sale-authorization";
import {
  FACTURA_C,
  insertCompletedSale,
  insertOfflineAuthorizationCode,
  insertSaleCompletedEvent,
  SALE_COMPLETED_AT,
} from "../fiscal/test-support/real-time-authorization-database";
import { scriptedShortCodes } from "../fiscal/test-support/scripted-short-codes";
import type { LocalDatabase } from "../platform/local-database";
import type { RegisterPulledChange } from "./pulled-change";
import type { SqliteLocalReplica } from "./sqlite-local-replica";
import { appendOutboxEvent } from "./sqlite-outbox";
import { CHAIN_KEY } from "./test-support/sqlite-local-outbox";
import {
  openAdoptedReplica,
  savePulledChanges,
  TEST_PEPPER,
} from "./test-support/sqlite-local-replica";

const REGISTER_ID = "4b0e6dc3-85f7-4a4b-8c9d-1e3f5a7b9c04";
const FIRST_BLOCK_ID = "9d1f0c52-3a5e-4f7b-8c61-2b7e4a9d0e13";
const SECOND_BLOCK_ID = "5e2a7c91-0b4d-4e68-9f13-7a6c8d2b1e40";
const OFFLINE_POINT_OF_SALE = 31;

function offlinePointOfSaleChange(
  changeSeq: number,
  version: number,
  taxAuthorityLastAuthorizedNumber: number | null,
  highestSyncedOfflineNumber: number | null,
): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "register_offline_point_of_sale",
    entity_id: REGISTER_ID,
    row: {
      point_of_sale_number: OFFLINE_POINT_OF_SALE,
      tax_authority_last_authorized_number: taxAuthorityLastAuthorizedNumber,
      highest_synced_offline_number: highestSyncedOfflineNumber,
      version,
    },
  };
  return { changeSeq, change };
}

function blockChange(
  changeSeq: number,
  id: string,
  firstNumber: number,
  lastNumber: number,
  status: "in_use" | "used_up",
): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "offline_number_block",
    entity_id: id,
    row: {
      point_of_sale_number: OFFLINE_POINT_OF_SALE,
      document_type: "factura_c",
      first_number: firstNumber,
      last_number: lastNumber,
      status,
      version: 1,
    },
  };
  return { changeSeq, change };
}

let database: LocalDatabase;
let replica: SqliteLocalReplica;
let salesNumbered = 0;

function save(...changes: RegisterPulledChange[]) {
  return savePulledChanges(replica, ...changes);
}

function numberOfNextOfflineDocument(): number | undefined {
  salesNumbered += 1;
  const saleId = `sale-${salesNumbered}`;
  insertCompletedSale(database, saleId);
  insertSaleCompletedEvent(database, saleId);
  decideSaleAuthorizationIn(
    database,
    {
      saleId,
      gate: { kind: "passed", document: FACTURA_C },
      decidedAt: new Date("2026-09-30T12:05:00.000Z"),
      occurredAt: SALE_COMPLETED_AT,
      total: FACTURA_C.total,
      ids: { next: () => `document-of-${saleId}` },
    },
    (event) => appendOutboxEvent(database, CHAIN_KEY, event),
    scriptedShortCodes(["7KQ4M2P9"]),
  );
  return database
    .prepare<[string], { number: number }>(
      "SELECT number FROM offline_fiscal_documents WHERE sale_id = ?",
    )
    .get(saleId)?.number;
}

beforeEach(() => {
  salesNumbered = 0;
  ({ database, replica } = openAdoptedReplica());
  database.exec(
    `INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1);
     INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('session-1', 'register-1', 'device-a', 'u1', '2026-09-30T08:00:00.000Z', 0, 'OPEN');`,
  );
  insertOfflineAuthorizationCode(database);
});

afterEach(() => {
  database.close();
});

describe("the offline numbering of a register installed again with an empty local database", () => {
  it("continues above the highest number any installation synced when the tax authority's count is lower", async () => {
    replica.adoptDevice({ deviceId: "device-b", pepper: TEST_PEPPER });

    await save(
      offlinePointOfSaleChange(1, 1, 1000, 1500),
      blockChange(2, FIRST_BLOCK_ID, 1001, 2000, "in_use"),
    );

    expect(numberOfNextOfflineDocument()).toBe(1501);
  });

  it("starts right after the tax authority's count when no installation synced any number", async () => {
    replica.adoptDevice({ deviceId: "device-b", pepper: TEST_PEPPER });

    await save(
      offlinePointOfSaleChange(1, 1, 1000, null),
      blockChange(2, FIRST_BLOCK_ID, 1001, 2000, "in_use"),
    );

    expect(numberOfNextOfflineDocument()).toBe(1001);
  });

  it("numbers nothing offline while the tax authority's count is unknown, even with a synced number", async () => {
    await save(
      offlinePointOfSaleChange(1, 1, null, 1500),
      blockChange(2, FIRST_BLOCK_ID, 1001, 2000, "in_use"),
    );

    expect(numberOfNextOfflineDocument()).toBeUndefined();
  });
});

describe("the offline numbering across blocks", () => {
  it("continues into the next contiguous block once the used up one is consumed", async () => {
    await save(
      offlinePointOfSaleChange(1, 1, 1000, 1997),
      blockChange(2, FIRST_BLOCK_ID, 1001, 2000, "used_up"),
      blockChange(3, SECOND_BLOCK_ID, 2001, 3000, "in_use"),
    );

    expect([
      numberOfNextOfflineDocument(),
      numberOfNextOfflineDocument(),
      numberOfNextOfflineDocument(),
      numberOfNextOfflineDocument(),
      numberOfNextOfflineDocument(),
    ]).toEqual([1998, 1999, 2000, 2001, 2002]);
  });

  it("holds the status of a pulled block", async () => {
    await save(blockChange(1, FIRST_BLOCK_ID, 1001, 2000, "used_up"));

    expect(database.prepare("SELECT status FROM offline_number_blocks").all()).toEqual([
      { status: "used_up" },
    ]);
  });
});

describe("the highest synced offline number a register holds", () => {
  function heldFloor() {
    return database
      .prepare<[], { highest_synced_offline_number: number | null }>(
        "SELECT highest_synced_offline_number FROM register_offline_point_of_sale",
      )
      .all()
      .map((row) => row.highest_synced_offline_number);
  }

  it("holds the number pulled", async () => {
    await save(offlinePointOfSaleChange(1, 1, 1000, 1500));

    expect(heldFloor()).toEqual([1500]);
  });

  it("is not lowered by a later pull of a lower or missing number", async () => {
    await save(offlinePointOfSaleChange(1, 1, 1000, 1500));

    await save(offlinePointOfSaleChange(2, 2, 1000, 1200));
    expect(heldFloor()).toEqual([1500]);

    await save(offlinePointOfSaleChange(3, 3, 1000, null));
    expect(heldFloor()).toEqual([1500]);
  });

  it("rises with a later pull of a higher number", async () => {
    await save(offlinePointOfSaleChange(1, 1, 1000, 1500));

    await save(offlinePointOfSaleChange(2, 2, 1000, 1800));

    expect(heldFloor()).toEqual([1800]);
  });

  it("rises when the same version arrives again with a higher number", async () => {
    await save(offlinePointOfSaleChange(1, 1, 1000, 1500));

    await save(offlinePointOfSaleChange(2, 1, 1000, 1800));

    expect(heldFloor()).toEqual([1800]);
  });
});
