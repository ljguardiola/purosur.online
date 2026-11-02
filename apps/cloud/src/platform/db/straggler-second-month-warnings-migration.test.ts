import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

const MIGRATION = "_straggler_second_month_warnings";
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

const detailWithTheMeasurements = {
  fiscalAddressId: "fa-1",
  fiscalAddressName: "Depósito Central",
  month: "2026-11",
  previousMonth: "2026-10",
  exceptionCount: 3,
  totalCount: 80,
  exceptionShareTenthsOfPercent: 37,
  exceptionShareNonCompliancePercent: 5,
  previousMonthNonCompliantOn: ["exception_share"],
  contingencyShareTenthsOfPercent: null,
  contingencyNonCompliancePercent: 5,
};

async function anAlert(
  client: SqlOnlyDatabase,
  {
    kind,
    scope,
    detail,
    resolvedAt = null,
  }: { kind: string; scope: string; detail: object; resolvedAt?: string | null },
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into alerts (kind, scope, level, audience, detail, opened_at, resolved_at)
     values ($1, $2, 'warning', 'all', $3, '2026-11-03T11:20:00Z', $4)
     returning id`,
    [kind, scope, JSON.stringify(detail), resolvedAt],
  );
  const [row] = rows;
  if (!row) throw new Error("test setup: the alert was not inserted");
  return row.id;
}

describe("the straggler second month warnings migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("moves every warning left with the old kind, open or resolved, to the current kind and detail shape", async () => {
    const database = await databaseBeforeMigration(MIGRATION);
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
      "select kind, scope, resolved_at is null as open, detail from alerts order by scope",
    );
    expect(rows).toEqual([
      {
        kind: KIND_AFTER,
        scope: "fa-1:2026-10",
        open: false,
        detail: { ...detailWithTheMeasurements, month: "2026-10", previousMonth: "2026-09" },
      },
      { kind: KIND_AFTER, scope: "fa-1:2026-11", open: true, detail: detailWithTheMeasurements },
    ]);
  });

  it("leaves one open warning when an old-kind warning is open beside a current one for the same fiscal address and month", async () => {
    const database = await databaseBeforeMigration(MIGRATION);
    const current = await anAlert(database, {
      kind: KIND_AFTER,
      scope: "fa-1:2026-11",
      detail: detailWithTheMeasurements,
    });
    const straggler = await anAlert(database, {
      kind: KIND_BEFORE,
      scope: "fa-1:2026-11",
      detail: detailBeforeTheMeasurements,
    });

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select id, kind, resolved_at is null as open, resolved_by, detail from alerts order by open desc",
    );
    expect(rows).toEqual([
      {
        id: current,
        kind: KIND_AFTER,
        open: true,
        resolved_by: null,
        detail: detailWithTheMeasurements,
      },
      {
        id: straggler,
        kind: KIND_AFTER,
        open: false,
        resolved_by: null,
        detail: detailWithTheMeasurements,
      },
    ]);
  });

  it("records the closing of the old-kind warning it closes as the system's", async () => {
    const database = await databaseBeforeMigration(MIGRATION);
    await anAlert(database, {
      kind: KIND_AFTER,
      scope: "fa-1:2026-11",
      detail: detailWithTheMeasurements,
    });
    const straggler = await anAlert(database, {
      kind: KIND_BEFORE,
      scope: "fa-1:2026-11",
      detail: detailBeforeTheMeasurements,
    });

    const migrated = await database.applyMigration();

    const { rows: closed } = await migrated.query<{ resolved_at: Date }>(
      "select resolved_at from alerts where id = $1",
      [straggler],
    );
    const resolvedAt = closed[0]?.resolved_at;
    const { rows } = await migrated.query(
      "select entity, entity_id, actor_id, at, previous_value, new_value from audit_log",
    );
    expect(rows).toEqual([
      {
        entity: "alert",
        entity_id: straggler,
        actor_id: null,
        at: resolvedAt,
        previous_value: { resolvedAt: null },
        new_value: { resolvedAt: resolvedAt?.toISOString() },
      },
    ]);
  });

  it("keeps a resolved old-kind warning beside an open current one resolved as it was", async () => {
    const database = await databaseBeforeMigration(MIGRATION);
    await anAlert(database, {
      kind: KIND_AFTER,
      scope: "fa-1:2026-11",
      detail: detailWithTheMeasurements,
    });
    await anAlert(database, {
      kind: KIND_BEFORE,
      scope: "fa-1:2026-11",
      detail: detailBeforeTheMeasurements,
      resolvedAt: "2026-11-01T03:00:00Z",
    });

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select kind, resolved_at from alerts order by resolved_at nulls first",
    );
    expect(rows).toEqual([
      { kind: KIND_AFTER, resolved_at: null },
      { kind: KIND_AFTER, resolved_at: new Date("2026-11-01T03:00:00Z") },
    ]);
    const { rows: audit } = await migrated.query("select id from audit_log");
    expect(audit).toEqual([]);
  });

  it("changes nothing when no warning is left with the old kind", async () => {
    const database = await databaseBeforeMigration(MIGRATION);
    await anAlert(database, {
      kind: KIND_AFTER,
      scope: "fa-1:2026-11",
      detail: detailWithTheMeasurements,
    });
    await anAlert(database, {
      kind: "user_email_changed",
      scope: "user-1",
      detail: { previousEmail: "ada@example.com" },
    });
    const before = await database.query("select * from alerts order by kind");

    const migrated = await database.applyMigration();

    const after = await migrated.query("select * from alerts order by kind");
    expect(after.rows).toEqual(before.rows);
    const { rows: audit } = await migrated.query("select id from audit_log");
    expect(audit).toEqual([]);
  });
});
