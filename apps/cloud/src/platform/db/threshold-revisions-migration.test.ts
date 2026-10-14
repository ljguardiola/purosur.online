import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the threshold-revisions migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every recorded threshold as the first of its day", async () => {
    const database = await databaseBeforeMigration("_threshold_revisions");
    await database.query("delete from changes where entity = 'buyer_identification_threshold'");
    await database.query("delete from buyer_identification_thresholds");
    await database.query(
      `insert into buyer_identification_thresholds (amount, valid_from)
       values (1000000, '2026-01-01'), (2000000, '2026-06-01')`,
    );

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select amount, valid_from::text as valid_from, revision from buyer_identification_thresholds order by valid_from",
    );
    expect(rows).toEqual([
      { amount: 1_000_000, valid_from: "2026-01-01", revision: 0 },
      { amount: 2_000_000, valid_from: "2026-06-01", revision: 0 },
    ]);
  });

  it("allows another revision of a day and refuses a repeated one", async () => {
    const database = await databaseBeforeMigration("_threshold_revisions");
    await database.query("delete from changes where entity = 'buyer_identification_threshold'");
    await database.query("delete from buyer_identification_thresholds");
    await database.query(
      "insert into buyer_identification_thresholds (amount, valid_from) values (1000000, '2026-06-01')",
    );
    const migrated = await database.applyMigration();

    await migrated.query(
      `insert into buyer_identification_thresholds (amount, valid_from, revision)
       values (2000000, '2026-06-01', 1)`,
    );

    await expect(
      migrated.query(
        `insert into buyer_identification_thresholds (amount, valid_from, revision)
         values (3000000, '2026-06-01', 1)`,
      ),
    ).rejects.toThrow();
  });
});
