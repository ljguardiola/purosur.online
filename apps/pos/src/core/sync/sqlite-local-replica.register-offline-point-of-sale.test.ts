import type { SyncChange } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import type { RegisterPulledChange } from "./pulled-change";
import type { SqliteLocalReplica } from "./sqlite-local-replica";
import {
  openAdoptedReplica,
  savePulledChanges,
  TEST_PEPPER,
} from "./test-support/sqlite-local-replica";

const REGISTER_ID = "4b0e6dc3-85f7-4a4b-8c9d-1e3f5a7b9c04";

function offlinePointOfSaleChange(
  changeSeq: number,
  pointOfSaleNumber: number,
  version: number,
  taxAuthorityLastAuthorizedNumber: number | null = null,
): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "register_offline_point_of_sale",
    entity_id: REGISTER_ID,
    row: {
      point_of_sale_number: pointOfSaleNumber,
      tax_authority_last_authorized_number: taxAuthorityLastAuthorizedNumber,
      version,
    },
  };
  return { changeSeq, change };
}

function save(...changes: RegisterPulledChange[]) {
  return savePulledChanges(replica, ...changes);
}

function savedOfflinePointsOfSale() {
  return database
    .prepare(
      "SELECT register_id, point_of_sale_number, version FROM register_offline_point_of_sale",
    )
    .all();
}

function savedCount() {
  return database
    .prepare<[], { tax_authority_last_authorized_number: number | null }>(
      "SELECT tax_authority_last_authorized_number FROM register_offline_point_of_sale",
    )
    .all()
    .map((row) => row.tax_authority_last_authorized_number);
}

let database: LocalDatabase;
let replica: SqliteLocalReplica;

beforeEach(() => {
  ({ database, replica } = openAdoptedReplica());
});

afterEach(() => {
  database.close();
});

describe("the register's local copy of its own offline point of sale", () => {
  it("holds none before it is pulled", () => {
    expect(savedOfflinePointsOfSale()).toEqual([]);
  });

  it("saves the point of sale number", async () => {
    await save(offlinePointOfSaleChange(1, 31, 1));

    expect(savedOfflinePointsOfSale()).toEqual([
      { register_id: REGISTER_ID, point_of_sale_number: 31, version: 1 },
    ]);
  });

  it("replaces it with a newer version", async () => {
    await save(offlinePointOfSaleChange(1, 31, 1));

    await save(offlinePointOfSaleChange(2, 32, 2));

    expect(savedOfflinePointsOfSale()).toEqual([
      { register_id: REGISTER_ID, point_of_sale_number: 32, version: 2 },
    ]);
  });

  it("keeps it when the same or an older version arrives late", async () => {
    await save(offlinePointOfSaleChange(1, 32, 3));

    await save(offlinePointOfSaleChange(2, 31, 2), offlinePointOfSaleChange(3, 33, 3));

    expect(savedOfflinePointsOfSale()).toEqual([
      { register_id: REGISTER_ID, point_of_sale_number: 32, version: 3 },
    ]);
  });

  it("keeps the newest of versions delivered out of order in one page", async () => {
    await save(
      offlinePointOfSaleChange(1, 33, 3),
      offlinePointOfSaleChange(2, 31, 1),
      offlinePointOfSaleChange(3, 32, 2),
    );

    expect(savedOfflinePointsOfSale()).toEqual([
      { register_id: REGISTER_ID, point_of_sale_number: 33, version: 3 },
    ]);
  });

  it("holds none once another installation takes over, until that one pulls its own", async () => {
    await save(offlinePointOfSaleChange(1, 31, 4));

    replica.adoptDevice({ deviceId: "device-b", pepper: TEST_PEPPER });
    expect(savedOfflinePointsOfSale()).toEqual([]);
    await save(offlinePointOfSaleChange(1, 40, 1));

    expect(savedOfflinePointsOfSale()).toEqual([
      { register_id: REGISTER_ID, point_of_sale_number: 40, version: 1 },
    ]);
  });

  it("keeps it for the installation that pulled it", async () => {
    await save(offlinePointOfSaleChange(1, 31, 1));

    replica.adoptDevice({ deviceId: "device-a", pepper: TEST_PEPPER });

    expect(savedOfflinePointsOfSale()).toHaveLength(1);
  });

  describe("the tax authority's last authorized number of the offline point of sale", () => {
    it("holds none until the cloud delivers it", async () => {
      await save(offlinePointOfSaleChange(1, 31, 1));

      expect(savedCount()).toEqual([null]);
    });

    it("saves it with the point of sale", async () => {
      await save(offlinePointOfSaleChange(1, 31, 1, 40));

      expect(savedCount()).toEqual([40]);
    });

    it("takes it when the cloud redelivers the same version with the count now known", async () => {
      await save(offlinePointOfSaleChange(1, 31, 1));

      await save(offlinePointOfSaleChange(2, 31, 1, 40));

      expect(savedCount()).toEqual([40]);
      expect(savedOfflinePointsOfSale()).toEqual([
        { register_id: REGISTER_ID, point_of_sale_number: 31, version: 1 },
      ]);
    });

    it("takes a greater count redelivered at the same version", async () => {
      await save(offlinePointOfSaleChange(1, 31, 1, 40));

      await save(offlinePointOfSaleChange(2, 31, 1, 43));

      expect(savedCount()).toEqual([43]);
    });

    it.each([
      ["a lower count", 39],
      ["the same count", 40],
      ["no count", null],
    ])("never lowers it with %s redelivered at the same version", async (_case, count) => {
      await save(offlinePointOfSaleChange(1, 31, 1, 40));

      await save(offlinePointOfSaleChange(2, 31, 1, count));

      expect(savedCount()).toEqual([40]);
    });

    it("changes nothing else of the point of sale when the same version redelivers another", async () => {
      await save(offlinePointOfSaleChange(1, 31, 1, 40));

      await save(offlinePointOfSaleChange(2, 33, 1, 43));

      expect(savedOfflinePointsOfSale()).toEqual([
        { register_id: REGISTER_ID, point_of_sale_number: 31, version: 1 },
      ]);
    });

    it("ignores the count of an older version", async () => {
      await save(offlinePointOfSaleChange(1, 31, 2, 40));

      await save(offlinePointOfSaleChange(2, 31, 1, 90));

      expect(savedCount()).toEqual([40]);
    });

    it("takes the count of a newer version of another point of sale, even when it is lower or unknown", async () => {
      await save(offlinePointOfSaleChange(1, 31, 1, 40));

      await save(offlinePointOfSaleChange(2, 33, 2, 5));
      expect(savedCount()).toEqual([5]);

      await save(offlinePointOfSaleChange(3, 34, 3));
      expect(savedCount()).toEqual([null]);
    });

    it("never lowers the count of the same point of sale when a newer version carries a lower or unknown one", async () => {
      await save(offlinePointOfSaleChange(1, 31, 1, 40));

      await save(offlinePointOfSaleChange(2, 31, 2, 30));
      expect(savedCount()).toEqual([40]);

      await save(offlinePointOfSaleChange(3, 31, 3));
      expect(savedCount()).toEqual([40]);

      await save(offlinePointOfSaleChange(4, 31, 4, 44));
      expect(savedCount()).toEqual([44]);
    });
  });
});
