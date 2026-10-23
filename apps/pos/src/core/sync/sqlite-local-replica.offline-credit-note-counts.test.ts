import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import type { SqliteLocalReplica } from "./sqlite-local-replica";
import type { RegisterPulledChange } from "./pulled-change";
import {
  openAdoptedReplica,
  savePulledChanges,
  TEST_PEPPER,
} from "./test-support/sqlite-local-replica";

let database: LocalDatabase;
let replica: SqliteLocalReplica;

beforeEach(() => {
  ({ database, replica } = openAdoptedReplica());
});

afterEach(() => {
  database.close();
});

describe("the credit note series counts of a register", () => {
  it("are forgotten when the register is adopted by another device", () => {
    database.exec(
      `INSERT INTO offline_series_counts (
         point_of_sale, document_type, tax_authority_last_authorized_number, highest_synced_offline_number
       ) VALUES (31, 'credit_note_c', 40, 42)`,
    );

    replica.adoptDevice({ deviceId: "device-b", pepper: TEST_PEPPER });

    expect(database.prepare("SELECT * FROM offline_series_counts").all()).toEqual([]);
  });

  it("are filled again by the pull that follows, both series at once", async () => {
    const change = (changeSeq: number, version: number) =>
      ({
        changeSeq,
        change: {
          change_seq: changeSeq,
          entity: "register_offline_point_of_sale",
          entity_id: "4b0e6dc3-85f7-4a4b-8c9d-1e3f5a7b9c04",
          row: {
            point_of_sale_number: 31,
            series_counts: [
              {
                document_type: "factura_c",
                tax_authority_last_authorized_number: 40,
                highest_synced_offline_number: 42,
              },
              {
                document_type: "credit_note_c",
                tax_authority_last_authorized_number: 4,
                highest_synced_offline_number: null,
              },
            ],
            version,
          },
        },
      }) satisfies RegisterPulledChange;
    await savePulledChanges(replica, change(1, 3));

    replica.adoptDevice({ deviceId: "device-b", pepper: TEST_PEPPER });
    expect(database.prepare("SELECT * FROM offline_series_counts").all()).toEqual([]);
    await savePulledChanges(replica, change(1, 1));

    expect(
      database
        .prepare(
          "SELECT point_of_sale, document_type, tax_authority_last_authorized_number, highest_synced_offline_number FROM offline_series_counts ORDER BY document_type",
        )
        .all(),
    ).toEqual([
      {
        point_of_sale: 31,
        document_type: "credit_note_c",
        tax_authority_last_authorized_number: 4,
        highest_synced_offline_number: null,
      },
      {
        point_of_sale: 31,
        document_type: "factura_c",
        tax_authority_last_authorized_number: 40,
        highest_synced_offline_number: 42,
      },
    ]);
  });
});
