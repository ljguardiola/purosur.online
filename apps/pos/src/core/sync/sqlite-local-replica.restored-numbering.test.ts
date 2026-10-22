import type { SyncChange } from "@purosur/contracts";
import { restorationStanding } from "@purosur/domain";
import { resetRestoredSyncIdentity } from "@purosur/domain/sync/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { restorePendingIn } from "../backups/restore-pending";
import { decideSaleAuthorizationIn } from "../fiscal/sqlite-sale-authorization";
import {
  FACTURA_C,
  insertCompletedSale,
  insertFiscalDocument,
  insertHealthCheck,
  insertPointOfSale,
  openFiscalDatabase,
  POINT_OF_SALE,
  SALE_COMPLETED_AT,
} from "../fiscal/test-support/real-time-authorization-database";
import { scriptedShortCodes } from "../fiscal/test-support/scripted-short-codes";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteRestorationEvidence } from "../register/sqlite-restoration-evidence";
import { SqliteLocalReplica } from "./sqlite-local-replica";
import { appendOutboxEvent } from "./sqlite-outbox";
import { SqliteRestoredSyncIdentityStore } from "./sqlite-restored-sync-identity-store";
import { CHAIN_KEY } from "./test-support/sqlite-local-outbox";
import { savePulledChanges } from "./test-support/sqlite-local-replica";

let database: LocalDatabase;
let replica: SqliteLocalReplica;

function pulledPointOfSale(
  changeSeq: number,
  count: number | null,
  numberingFrozen: boolean,
  day: string | null,
) {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "register_point_of_sale",
    entity_id: "register-1",
    row: {
      point_of_sale_number: POINT_OF_SALE,
      fiscal_address_id: "address-1",
      tax_authority_last_authorized_number: count,
      tax_authority_last_authorized_issued_on: day,
      numbering_frozen: numberingFrozen,
      version: 1,
    },
  };
  return { changeSeq, change };
}

function reservedNumbers() {
  let issued = 0;
  decideSaleAuthorizationIn(
    database,
    {
      saleId: "sale-1",
      gate: { kind: "passed", document: FACTURA_C },
      decidedAt: new Date("2026-09-30T12:05:00.000Z"),
      occurredAt: SALE_COMPLETED_AT,
      total: 12_500,
      ids: {
        next: () => {
          issued += 1;
          return `id-${issued}`;
        },
      },
    },
    (event) => appendOutboxEvent(database, CHAIN_KEY, event),
    scriptedShortCodes(["7KQ4M2P9", "R3XW8H5N"]),
  );
  return database
    .prepare<[], { number: number }>(
      "SELECT number FROM fiscal_documents WHERE state = 'REQUESTING' ORDER BY number",
    )
    .all()
    .map((row) => row.number);
}

beforeEach(() => {
  database = openFiscalDatabase();
  replica = new SqliteLocalReplica(database);
  insertCompletedSale(database, "sale-1");
  insertHealthCheck(database);
});

afterEach(() => {
  database.close();
});

describe("a restored register's numbering", () => {
  it("reserves the tax authority's last authorized number plus one, even when its snapshot held a higher reserved number and count", async () => {
    insertCompletedSale(database, "sale-0");
    insertPointOfSale(database, 44);
    insertFiscalDocument(database, {
      id: "doc-lost",
      saleId: "sale-0",
      number: 45,
      state: "REJECTED",
    });
    await resetRestoredSyncIdentity(
      { store: new SqliteRestoredSyncIdentityStore(database) },
      { deviceId: "device-b" },
    );
    database.exec("DELETE FROM register_predecessor");
    const evidence = new SqliteRestorationEvidence(database, restorePendingIn(undefined));
    expect(restorationStanding(evidence.evidence())).toEqual({
      kind: "in_progress",
      step: "reconcile_fiscal_counters",
    });

    await savePulledChanges(replica, pulledPointOfSale(1, null, true, null));
    expect(restorationStanding(evidence.evidence()).kind).toBe("in_progress");

    await savePulledChanges(replica, pulledPointOfSale(2, 31, false, "2026-09-29"));

    expect(restorationStanding(evidence.evidence())).toEqual({ kind: "completed" });
    expect(reservedNumbers()).toEqual([32]);
  });
});
