import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import type { SqliteLocalReplica } from "./sqlite-local-replica";
import { openAdoptedReplica, TEST_PEPPER } from "./test-support/sqlite-local-replica";

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
});
