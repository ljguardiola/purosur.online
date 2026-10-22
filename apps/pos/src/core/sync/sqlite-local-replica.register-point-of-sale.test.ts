import type { SyncChange } from "@purosur/contracts";
import { nextInvoiceNumber, restorationStanding } from "@purosur/domain";
import { resetRestoredSyncIdentity } from "@purosur/domain/sync/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { restorePendingIn } from "../backups/restore-pending";
import { readRealTimeSeries } from "../fiscal/sqlite-fiscal-series";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteRestorationEvidence } from "../register/sqlite-restoration-evidence";
import type { RegisterPulledChange } from "./pulled-change";
import type { SqliteLocalReplica } from "./sqlite-local-replica";
import { SqliteRestoredSyncIdentityStore } from "./sqlite-restored-sync-identity-store";
import {
  openAdoptedReplica,
  savePulledChanges,
  TEST_PEPPER,
} from "./test-support/sqlite-local-replica";

const REGISTER_ID = "4b0e6dc3-85f7-4a4b-8c9d-1e3f5a7b9c04";
const MAIN_STREET = "0b7c6f5e-2d4a-4e8b-9c1d-3a5f7e9b1d02";
const HARBOR = "5d8e7a6f-3c1b-4f9d-8a2e-4b6c8d0e2f13";

function pointOfSaleChange(
  changeSeq: number,
  pointOfSaleNumber: number,
  fiscalAddressId: string,
  version: number,
  taxAuthorityLastAuthorizedNumber: number | null = null,
  numberingFrozen = false,
  taxAuthorityLastAuthorizedIssuedOn: string | null = null,
): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "register_point_of_sale",
    entity_id: REGISTER_ID,
    row: {
      point_of_sale_number: pointOfSaleNumber,
      fiscal_address_id: fiscalAddressId,
      tax_authority_last_authorized_number: taxAuthorityLastAuthorizedNumber,
      tax_authority_last_authorized_issued_on: taxAuthorityLastAuthorizedIssuedOn,
      numbering_frozen: numberingFrozen,
      version,
    },
  };
  return { changeSeq, change };
}

function save(...changes: RegisterPulledChange[]) {
  return savePulledChanges(replica, ...changes);
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

function savedFreezeAndCount() {
  return database
    .prepare<[], { numbering_frozen: number; tax_authority_last_authorized_number: number | null }>(
      "SELECT numbering_frozen, tax_authority_last_authorized_number FROM register_point_of_sale",
    )
    .all();
}

function savedDay() {
  return database
    .prepare<[], { tax_authority_last_authorized_issued_on: string | null }>(
      "SELECT tax_authority_last_authorized_issued_on FROM register_point_of_sale",
    )
    .all()
    .map((row) => row.tax_authority_last_authorized_issued_on);
}

let database: LocalDatabase;
let replica: SqliteLocalReplica;

beforeEach(() => {
  ({ database, replica } = openAdoptedReplica());
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

    replica.adoptDevice({ deviceId: "device-b", pepper: TEST_PEPPER });
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

    replica.adoptDevice({ deviceId: "device-a", pepper: TEST_PEPPER });

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

  describe("the freeze of the point of sale's numbering", () => {
    it("is not frozen when the cloud delivers it not frozen", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, 40));

      expect(savedFreezeAndCount()).toEqual([
        { numbering_frozen: 0, tax_authority_last_authorized_number: 40 },
      ]);
    });

    it("saves a freeze with the point of sale", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, 40, true));

      expect(savedFreezeAndCount()).toEqual([
        { numbering_frozen: 1, tax_authority_last_authorized_number: 40 },
      ]);
    });

    it("saves an unfreeze together with the new count of a newer version", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, 40, true));

      await save(pointOfSaleChange(2, 12, MAIN_STREET, 2, 43, false));

      expect(savedFreezeAndCount()).toEqual([
        { numbering_frozen: 0, tax_authority_last_authorized_number: 43 },
      ]);
    });

    it("saves a freeze delivered with a newer version whose count is lower or unknown, keeping the greater count", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, 40));

      await save(pointOfSaleChange(2, 12, MAIN_STREET, 2, null, true));

      expect(savedFreezeAndCount()).toEqual([
        { numbering_frozen: 1, tax_authority_last_authorized_number: 40 },
      ]);
    });

    it("takes the freeze redelivered at the same version with a greater count", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, 40));

      await save(pointOfSaleChange(2, 12, MAIN_STREET, 1, 43, true));

      expect(savedFreezeAndCount()).toEqual([
        { numbering_frozen: 1, tax_authority_last_authorized_number: 43 },
      ]);
    });

    it("takes a freeze and then an unfreeze redelivered at the same version with the same count", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, 40));

      await save(pointOfSaleChange(2, 12, MAIN_STREET, 1, 40, true));
      expect(savedFreezeAndCount()).toEqual([
        { numbering_frozen: 1, tax_authority_last_authorized_number: 40 },
      ]);

      await save(pointOfSaleChange(3, 12, MAIN_STREET, 1, 40, false));
      expect(savedFreezeAndCount()).toEqual([
        { numbering_frozen: 0, tax_authority_last_authorized_number: 40 },
      ]);
    });

    it.each([
      ["a lower count", 39],
      ["no count", null],
    ])(
      "takes a freeze redelivered at the same version with %s, keeping the greater count",
      async (_case, count) => {
        await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, 40));

        await save(pointOfSaleChange(2, 12, MAIN_STREET, 1, count, true));

        expect(savedFreezeAndCount()).toEqual([
          { numbering_frozen: 1, tax_authority_last_authorized_number: 40 },
        ]);
      },
    );

    it("changes nothing else of the point of sale when the same version redelivers a freeze", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, 40));

      await save(pointOfSaleChange(2, 14, HARBOR, 1, 40, true));

      expect(savedPointsOfSale()).toEqual([
        {
          register_id: REGISTER_ID,
          point_of_sale_number: 12,
          fiscal_address_id: MAIN_STREET,
          version: 1,
        },
      ]);
    });

    it("keeps the freeze when an older version arrives late", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 2, 40, true));

      await save(pointOfSaleChange(2, 12, MAIN_STREET, 1, 90, false));

      expect(savedFreezeAndCount()).toEqual([
        { numbering_frozen: 1, tax_authority_last_authorized_number: 40 },
      ]);
    });
  });

  describe("the day of the tax authority's last authorized document", () => {
    const withDay = (
      changeSeq: number,
      version: number,
      count: number | null,
      day: string | null,
      pointOfSale = 12,
    ) => pointOfSaleChange(changeSeq, pointOfSale, MAIN_STREET, version, count, false, day);

    it("holds none until the cloud delivers it", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, 40));

      expect(savedDay()).toEqual([null]);
    });

    it("saves it with the point of sale", async () => {
      await save(withDay(1, 1, 40, "2026-10-14"));

      expect(savedDay()).toEqual(["2026-10-14"]);
    });

    it("takes it when the cloud redelivers the same version and count with the day now known", async () => {
      await save(withDay(1, 1, 40, null));

      await save(withDay(2, 1, 40, "2026-10-14"));

      expect(savedDay()).toEqual(["2026-10-14"]);
    });

    it("takes the day that travels with a greater count redelivered at the same version", async () => {
      await save(withDay(1, 1, 40, "2026-10-14"));

      await save(withDay(2, 1, 43, "2026-10-15"));

      expect(savedDay()).toEqual(["2026-10-15"]);
    });

    it.each([
      ["an earlier day with the same count", 40, "2026-10-13"],
      ["no day with the same count", 40, null],
      ["a later day with a lower count", 39, "2026-10-16"],
      ["a later day with no count", null, "2026-10-16"],
    ])("never regresses it with %s redelivered at the same version", async (_case, count, day) => {
      await save(withDay(1, 1, 40, "2026-10-14"));

      await save(withDay(2, 1, count, day));

      expect(savedDay()).toEqual(["2026-10-14"]);
    });

    it("takes a later day of the same count redelivered at the same version", async () => {
      await save(withDay(1, 1, 40, "2026-10-14"));

      await save(withDay(2, 1, 40, "2026-10-15"));

      expect(savedDay()).toEqual(["2026-10-15"]);
    });

    it("ignores the day of an older version", async () => {
      await save(withDay(1, 2, 40, "2026-10-14"));

      await save(withDay(2, 1, 90, "2026-10-20"));

      expect(savedDay()).toEqual(["2026-10-14"]);
    });

    it("takes the day of a newer version of another point of sale, even when it is earlier or unknown", async () => {
      await save(withDay(1, 1, 40, "2026-10-14"));

      await save(withDay(2, 2, 5, "2026-10-01", 14));
      expect(savedDay()).toEqual(["2026-10-01"]);

      await save(withDay(3, 3, 5, null, 15));
      expect(savedDay()).toEqual([null]);
    });

    it.each([
      ["an earlier day with a greater count", 41, "2026-10-13", "2026-10-14"],
      ["no day with a greater count", 41, null, "2026-10-14"],
      ["a later day with a lower count", 39, "2026-10-16", "2026-10-14"],
      ["a later day with no count", null, "2026-10-16", "2026-10-14"],
      ["a later day with a greater count", 41, "2026-10-16", "2026-10-16"],
    ])(
      "keeps the day that travels with the highest count of the same point of sale when a newer version carries %s",
      async (_case, count, day, expected) => {
        await save(withDay(1, 1, 40, "2026-10-14"));

        await save(withDay(2, 2, count, day));

        expect(savedDay()).toEqual([expected]);
      },
    );
  });

  describe("the numbering a restored register awaits from the cloud", () => {
    function awaiting() {
      return database
        .prepare<[], { awaiting_restored_numbering: number }>(
          "SELECT awaiting_restored_numbering FROM register_point_of_sale",
        )
        .all()
        .map((row) => row.awaiting_restored_numbering);
    }

    async function restoredWithCount(count: number, day: string) {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, count, false, day));
      database.exec("UPDATE register_point_of_sale SET awaiting_restored_numbering = 1");
    }

    it("holds no awaited numbering for a point of sale pulled on its own", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, 40));

      expect(awaiting()).toEqual([0]);
    });

    it("takes the pulled count and day over a higher local one at the same version", async () => {
      await restoredWithCount(40, "2026-10-14");

      await save(pointOfSaleChange(2, 12, MAIN_STREET, 1, 31, false, "2026-10-10"));

      expect(savedCount()).toEqual([31]);
      expect(savedDay()).toEqual(["2026-10-10"]);
    });

    it("takes the pulled count and day over a higher local one at a newer version", async () => {
      await restoredWithCount(40, "2026-10-14");

      await save(pointOfSaleChange(2, 12, MAIN_STREET, 2, 31, false, "2026-10-10"));

      expect(savedCount()).toEqual([31]);
      expect(savedDay()).toEqual(["2026-10-10"]);
    });

    it("takes a pulled count that is not known yet instead of keeping the local one", async () => {
      await restoredWithCount(40, "2026-10-14");

      await save(pointOfSaleChange(2, 12, MAIN_STREET, 1, null, true, null));

      expect(savedFreezeAndCount()).toEqual([
        { numbering_frozen: 1, tax_authority_last_authorized_number: null },
      ]);
      expect(savedDay()).toEqual([null]);
    });

    it("keeps awaiting while the pulled numbering is frozen", async () => {
      await restoredWithCount(40, "2026-10-14");

      await save(pointOfSaleChange(2, 12, MAIN_STREET, 1, 31, true, "2026-10-10"));

      expect(awaiting()).toEqual([1]);
    });

    it("keeps awaiting while the pulled numbering has no count", async () => {
      await restoredWithCount(40, "2026-10-14");

      await save(pointOfSaleChange(2, 12, MAIN_STREET, 1, null, false, null));

      expect(awaiting()).toEqual([1]);
    });

    it("stops awaiting once the pulled numbering is not frozen and carries a count", async () => {
      await restoredWithCount(40, "2026-10-14");
      await save(pointOfSaleChange(2, 12, MAIN_STREET, 1, 31, true, "2026-10-10"));

      await save(pointOfSaleChange(3, 12, MAIN_STREET, 1, 31, false, "2026-10-10"));

      expect(awaiting()).toEqual([0]);
      expect(savedCount()).toEqual([31]);
    });

    it("keeps the highest count again after it stopped awaiting", async () => {
      await restoredWithCount(40, "2026-10-14");
      await save(pointOfSaleChange(2, 12, MAIN_STREET, 1, 31, false, "2026-10-10"));

      await save(pointOfSaleChange(3, 12, MAIN_STREET, 1, 25, false, "2026-10-09"));

      expect(savedCount()).toEqual([31]);
    });

    it("ignores an older version while it awaits", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 2, 40, false, "2026-10-14"));
      database.exec("UPDATE register_point_of_sale SET awaiting_restored_numbering = 1");

      await save(pointOfSaleChange(2, 12, MAIN_STREET, 1, 31, false, "2026-10-10"));

      expect(savedCount()).toEqual([40]);
      expect(awaiting()).toEqual([1]);
    });
  });

  describe("a restored register's first reservation after its numbering is reconciled", () => {
    it("is the tax authority's last authorized number plus one, whatever higher count the snapshot held", async () => {
      await save(pointOfSaleChange(1, 12, MAIN_STREET, 1, 44, false, "2026-10-14"));
      await resetRestoredSyncIdentity(
        { store: new SqliteRestoredSyncIdentityStore(database) },
        { deviceId: "device-b" },
      );
      const evidence = new SqliteRestorationEvidence(database, restorePendingIn(undefined));
      expect(restorationStanding(evidence.evidence())).toEqual({
        kind: "in_progress",
        step: "reconcile_fiscal_counters",
      });

      await save(pointOfSaleChange(2, 12, MAIN_STREET, 1, null, true, null));
      expect(restorationStanding(evidence.evidence()).kind).toBe("in_progress");
      expect(nextInvoiceNumber(readRealTimeSeries(database))).toBeNull();

      await save(pointOfSaleChange(3, 12, MAIN_STREET, 1, 31, false, "2026-10-10"));

      expect(restorationStanding(evidence.evidence())).toEqual({ kind: "completed" });
      expect(nextInvoiceNumber(readRealTimeSeries(database))).toBe(32);
    });
  });
});
