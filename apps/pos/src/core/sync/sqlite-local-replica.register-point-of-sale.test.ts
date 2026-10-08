import type { SyncChange } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import type { RegisterPulledChange } from "./pulled-change";
import { SqliteLocalReplica } from "./sqlite-local-replica";

const REGISTER_ID = "4b0e6dc3-85f7-4a4b-8c9d-1e3f5a7b9c04";
const MAIN_STREET = "0b7c6f5e-2d4a-4e8b-9c1d-3a5f7e9b1d02";
const HARBOR = "5d8e7a6f-3c1b-4f9d-8a2e-4b6c8d0e2f13";
const PEPPER = Buffer.alloc(32, 7).toString("base64url");

function pointOfSaleChange(
  changeSeq: number,
  pointOfSaleNumber: number,
  fiscalAddressId: string,
  version: number,
  taxAuthorityLastAuthorizedNumber: number | null = null,
): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "register_point_of_sale",
    entity_id: REGISTER_ID,
    row: {
      point_of_sale_number: pointOfSaleNumber,
      fiscal_address_id: fiscalAddressId,
      tax_authority_last_authorized_number: taxAuthorityLastAuthorizedNumber,
      version,
    },
  };
  return { changeSeq, change };
}

async function save(...changes: RegisterPulledChange[]) {
  const cursor = changes.at(-1)?.changeSeq ?? 0;
  await replica.savePage({ changes, cursor, hasMore: false });
}

function savedPointsOfSale() {
  return database
    .prepare(
      "SELECT register_id, point_of_sale_number, fiscal_address_id, version FROM register_point_of_sale",
    )
    .all();
}

function savedCount() {
  return database
    .prepare<[], { tax_authority_last_authorized_number: number | null }>(
      "SELECT tax_authority_last_authorized_number FROM register_point_of_sale",
    )
    .all()
    .map((row) => row.tax_authority_last_authorized_number);
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

describe("the register's local copy of its own point of sale", () => {
  it("holds none before it is pulled", () => {
    expect(savedPointsOfSale()).toEqual([]);
  });

  it("saves the point of sale number and the fiscal address", async () => {
    await save(pointOfSaleChange(1, 12, MAIN_STREET, 1));

    expect(savedPointsOfSale()).toEqual([
      {
        register_id: REGISTER_ID,
        point_of_sale_number: 12,
        fiscal_address_id: MAIN_STREET,
        version: 1,
      },
    ]);
  });

  it("replaces them with a newer version", async () => {
    await save(pointOfSaleChange(1, 12, MAIN_STREET, 1));

    await save(pointOfSaleChange(2, 14, HARBOR, 2));

    expect(savedPointsOfSale()).toEqual([
      {
        register_id: REGISTER_ID,
        point_of_sale_number: 14,
        fiscal_address_id: HARBOR,
        version: 2,
      },
    ]);
  });

  it("keeps them when the same or an older version arrives late", async () => {
    await save(pointOfSaleChange(1, 14, HARBOR, 3));

    await save(pointOfSaleChange(2, 12, MAIN_STREET, 2), pointOfSaleChange(3, 15, MAIN_STREET, 3));

    expect(savedPointsOfSale()).toEqual([
      {
        register_id: REGISTER_ID,
        point_of_sale_number: 14,
        fiscal_address_id: HARBOR,
        version: 3,
      },
    ]);
  });

  it("holds none once another installation takes over, until that one pulls its own", async () => {
    await save(pointOfSaleChange(1, 12, MAIN_STREET, 4));

    replica.adoptDevice({ deviceId: "device-b", pepper: PEPPER });
    expect(savedPointsOfSale()).toEqual([]);
    await save(pointOfSaleChange(1, 20, HARBOR, 1));

    expect(savedPointsOfSale()).toEqual([
      {
        register_id: REGISTER_ID,
        point_of_sale_number: 20,
        fiscal_address_id: HARBOR,
        version: 1,
      },
    ]);
  });

  it("keeps them for the installation that pulled them", async () => {
    await save(pointOfSaleChange(1, 12, MAIN_STREET, 1));

    replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });

    expect(savedPointsOfSale()).toHaveLength(1);
  });

  describe("the tax authority's last authorized number of the point of sale", () => {
    it("holds none until the cloud delivers it", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1));

      expect(savedCount()).toEqual([null]);
    });

    it("saves it with the point of sale", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, 40));

      expect(savedCount()).toEqual([40]);
    });

    it("takes it when the cloud redelivers the same version with the count now known", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1));

      await save(pointOfSaleChange(2, 12, MAIN_STREET, 1, 40));

      expect(savedCount()).toEqual([40]);
      expect(savedPointsOfSale()).toEqual([
        {
          register_id: REGISTER_ID,
          point_of_sale_number: 12,
          fiscal_address_id: MAIN_STREET,
          version: 1,
        },
      ]);
    });

    it("takes a greater count redelivered at the same version", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, 40));

      await save(pointOfSaleChange(2, 12, MAIN_STREET, 1, 43));

      expect(savedCount()).toEqual([43]);
    });

    it.each([
      ["a lower count", 39],
      ["the same count", 40],
      ["no count", null],
    ])("never lowers it with %s redelivered at the same version", async (_case, count) => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, 40));

      await save(pointOfSaleChange(2, 12, MAIN_STREET, 1, count));

      expect(savedCount()).toEqual([40]);
    });

    it("changes nothing else of the point of sale when the same version redelivers another", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, 40));

      await save(pointOfSaleChange(2, 14, HARBOR, 1, 43));

      expect(savedPointsOfSale()).toEqual([
        {
          register_id: REGISTER_ID,
          point_of_sale_number: 12,
          fiscal_address_id: MAIN_STREET,
          version: 1,
        },
      ]);
    });

    it("ignores the count of an older version", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 2, 40));

      await save(pointOfSaleChange(2, 12, MAIN_STREET, 1, 90));

      expect(savedCount()).toEqual([40]);
    });

    it("takes the count of a newer version of another point of sale, even when it is lower or unknown", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, 40));

      await save(pointOfSaleChange(2, 14, HARBOR, 2, 5));
      expect(savedCount()).toEqual([5]);

      await save(pointOfSaleChange(3, 15, HARBOR, 3));
      expect(savedCount()).toEqual([null]);
    });

    it("never lowers the count of the same point of sale when a newer version carries a lower or unknown one", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, 40));

      await save(pointOfSaleChange(2, 12, HARBOR, 2, 30));
      expect(savedCount()).toEqual([40]);

      await save(pointOfSaleChange(3, 12, MAIN_STREET, 3));
      expect(savedCount()).toEqual([40]);

      await save(pointOfSaleChange(4, 12, MAIN_STREET, 4, 44));
      expect(savedCount()).toEqual([44]);
    });
  });
});
