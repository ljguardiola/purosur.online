import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

const KIND_BEFORE = "exception_share_second_month_at_risk";
const KIND_AFTER = "second_non_compliant_month_at_risk";

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

function withTheExceptionShareNamed({
  shareTenthsOfPercent,
  nonCompliancePercent,
  ...detail
}: Record<string, unknown>) {
  return {
    ...detail,
    exceptionShareTenthsOfPercent: shareTenthsOfPercent,
    exceptionShareNonCompliancePercent: nonCompliancePercent,
  };
}

async function anAlert(
  client: SqlOnlyDatabase,
  {
    kind,
    scope,
    detail,
    resolvedAt = null,
  }: { kind: string; scope: string; detail: object; resolvedAt?: string | null },
) {
  await client.query(
    `insert into alerts (kind, scope, level, audience, detail, opened_at, resolved_at)
     values ($1, $2, 'warning', 'all', $3, '2026-11-03T11:20:00Z', $4)`,
    [kind, scope, JSON.stringify(detail), resolvedAt],
  );
}

describe("the second month risk measurements migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("gives a warning raised before it the exception share as the measurement the previous month failed", async () => {
    const database = await databaseBeforeMigration("_second_month_risk_measurements");
    await anAlert(database, {
      kind: KIND_BEFORE,
      scope: "fa-1:2026-11",
      detail: detailBeforeTheMeasurements,
    });

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select detail from alerts");
    expect(rows).toEqual([
      {
        detail: {
          ...withTheExceptionShareNamed(detailBeforeTheMeasurements),
          previousMonthNonCompliantOn: ["exception_share"],
          contingencyShareTenthsOfPercent: null,
          contingencyNonCompliancePercent: 5,
        },
      },
    ]);
  });

  it("names every warning raised before it, open or resolved, a second non-compliant month at risk", async () => {
    const database = await databaseBeforeMigration("_second_month_risk_measurements");
    await anAlert(database, {
      kind: KIND_BEFORE,
      scope: "fa-1:2026-11",
      detail: detailBeforeTheMeasurements,
    });
    await anAlert(database, {
      kind: KIND_BEFORE,
      scope: "fa-1:2026-10",
      detail: { ...detailBeforeTheMeasurements, month: "2026-10", previousMonth: "2026-09" },
      resolvedAt: "2026-11-01T03:00:00Z",
    });

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select kind, scope, resolved_at is null as open from alerts order by scope",
    );
    expect(rows).toEqual([
      { kind: KIND_AFTER, scope: "fa-1:2026-10", open: false },
      { kind: KIND_AFTER, scope: "fa-1:2026-11", open: true },
    ]);
  });

  it("names the running exception share and its threshold for their measurement in every warning raised before it, open or resolved", async () => {
    const database = await databaseBeforeMigration("_second_month_risk_measurements");
    const openDetail = { ...detailBeforeTheMeasurements, shareTenthsOfPercent: 41 };
    const resolvedDetail = {
      ...detailBeforeTheMeasurements,
      month: "2026-10",
      previousMonth: "2026-09",
      shareTenthsOfPercent: null,
      nonCompliancePercent: 7,
    };
    await anAlert(database, { kind: KIND_BEFORE, scope: "fa-1:2026-11", detail: openDetail });
    await anAlert(database, {
      kind: KIND_BEFORE,
      scope: "fa-1:2026-10",
      detail: resolvedDetail,
      resolvedAt: "2026-11-01T03:00:00Z",
    });

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select scope, detail - 'previousMonthNonCompliantOn' - 'contingencyShareTenthsOfPercent' - 'contingencyNonCompliancePercent' as detail from alerts order by scope",
    );
    expect(rows).toEqual([
      { scope: "fa-1:2026-10", detail: withTheExceptionShareNamed(resolvedDetail) },
      { scope: "fa-1:2026-11", detail: withTheExceptionShareNamed(openDetail) },
    ]);
  });

  it("keeps the measurements of a warning that already names them", async () => {
    const database = await databaseBeforeMigration("_second_month_risk_measurements");
    const detail = {
      ...detailBeforeTheMeasurements,
      previousMonthNonCompliantOn: ["contingency_time"],
      contingencyShareTenthsOfPercent: 80,
      contingencyNonCompliancePercent: 5,
    };
    await anAlert(database, { kind: KIND_BEFORE, scope: "fa-1:2026-11", detail });

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select detail from alerts");
    expect(rows).toEqual([{ detail: withTheExceptionShareNamed(detail) }]);
  });

  it("leaves alerts of other kinds as they were", async () => {
    const database = await databaseBeforeMigration("_second_month_risk_measurements");
    const breachDetail = {
      fiscalAddressId: "fa-1",
      fiscalAddressName: "Depósito Central",
      month: "2026-10",
      exceptionCount: 6,
      totalCount: 100,
      nonCompliantMonths: ["2026-10"],
      nonCompliancePercent: 5,
    };
    await anAlert(database, {
      kind: "user_email_changed",
      scope: "user-1",
      detail: { previousEmail: "ada@example.com" },
    });
    await anAlert(database, {
      kind: "exception_share_breach",
      scope: "fa-1:2026-10",
      detail: breachDetail,
    });

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select kind, detail from alerts order by kind");
    expect(rows).toEqual([
      { kind: "exception_share_breach", detail: breachDetail },
      { kind: "user_email_changed", detail: { previousEmail: "ada@example.com" } },
    ]);
  });
});
