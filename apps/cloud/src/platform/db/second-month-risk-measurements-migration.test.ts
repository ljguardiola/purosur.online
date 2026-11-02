import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

const KIND = "exception_share_second_month_at_risk";

const detailBeforeTheMeasurements = {
  fiscalAddressId: "fa-1",
  fiscalAddressName: "Depósito Central",
  month: "2026-11",
  previousMonth: "2026-10",
  exceptionCount: 3,
  totalCount: 80,
  shareTenthsOfPercent: 37,
  nonCompliancePercent: 5,
};

async function anAlert(
  client: SqlOnlyDatabase,
  { kind, scope, detail }: { kind: string; scope: string; detail: object },
) {
  await client.query(
    `insert into alerts (kind, scope, level, audience, detail, opened_at)
     values ($1, $2, 'warning', 'all', $3, '2026-11-03T11:20:00Z')`,
    [kind, scope, JSON.stringify(detail)],
  );
}

describe("the second month risk measurements migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("gives a warning raised before it the exception share as the measurement the previous month failed", async () => {
    const database = await databaseBeforeMigration("_second_month_risk_measurements");
    await anAlert(database, {
      kind: KIND,
      scope: "fa-1:2026-11",
      detail: detailBeforeTheMeasurements,
    });

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select detail from alerts");
    expect(rows).toEqual([
      {
        detail: {
          ...detailBeforeTheMeasurements,
          previousMonthNonCompliantOn: ["exception_share"],
          contingencyShareTenthsOfPercent: null,
          contingencyNonCompliancePercent: 5,
        },
      },
    ]);
  });

  it("leaves a warning that already names its measurements as it was", async () => {
    const database = await databaseBeforeMigration("_second_month_risk_measurements");
    const detail = {
      ...detailBeforeTheMeasurements,
      previousMonthNonCompliantOn: ["contingency_time"],
      contingencyShareTenthsOfPercent: 80,
      contingencyNonCompliancePercent: 5,
    };
    await anAlert(database, { kind: KIND, scope: "fa-1:2026-11", detail });

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select detail from alerts");
    expect(rows).toEqual([{ detail }]);
  });

  it("leaves the detail of an alert of another kind as it was", async () => {
    const database = await databaseBeforeMigration("_second_month_risk_measurements");
    await anAlert(database, {
      kind: "user_email_changed",
      scope: "user-1",
      detail: { previousEmail: "ada@example.com" },
    });

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select detail from alerts");
    expect(rows).toEqual([{ detail: { previousEmail: "ada@example.com" } }]);
  });
});
