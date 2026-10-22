import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

const detailBeforeTheSource = {
  pointOfSale: 7,
  documentType: "factura_c",
  previousReading: "2026-10-03T12:00:00.000Z",
  correctedReading: "2026-10-01T12:00:00.000Z",
};

async function aRegisterAndActor(client: SqlOnlyDatabase) {
  const { rows: locationRows } = await client.query<{ id: string }>(
    "select id from locations limit 1",
  );
  const locationId = locationRows[0]?.id;
  const { rows: registerRows } = await client.query<{ id: string }>(
    "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
    [locationId],
  );
  const { rows: userRows } = await client.query<{ id: string }>(
    "insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', $1) returning id",
    [locationId],
  );
  const registerId = registerRows[0]?.id;
  const actorId = userRows[0]?.id;
  if (!registerId || !actorId) throw new Error("test setup: inserting the register or user returned no row");
  return { registerId, actorId };
}

async function anAlert(
  client: SqlOnlyDatabase,
  { kind, scope, detail }: { kind: string; scope: string; detail: object },
) {
  const { rows } = await client.query<{ id: string }>(
    `insert into alerts (kind, scope, level, audience, detail, opened_at)
     values ($1, $2, 'critical', 'all', $3, '2026-10-06T11:20:00Z') returning id`,
    [kind, scope, JSON.stringify(detail)],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("test setup: inserting the alert returned no row");
  return id;
}

async function databaseWithAClockCorrection() {
  const database = await databaseBeforeMigration("_clock_correction_previous_reading_source");
  const { registerId, actorId } = await aRegisterAndActor(database);
  const alertId = await anAlert(database, {
    kind: "clock_corrected",
    scope: registerId,
    detail: { ...detailBeforeTheSource, actorId },
  });
  await database.query(
    `insert into clock_corrections
       (event_id, register_id, point_of_sale, document_type, previous_reading, corrected_reading,
        actor_id, corrected_at, alert_id, recorded_at)
     values (gen_random_uuid(), $1, 7, 'factura_c', '2026-10-03T12:00:00Z', '2026-10-01T12:00:00Z',
             $2, '2026-10-06T11:20:00Z', $3, '2026-10-06T11:21:00Z')`,
    [registerId, actorId, alertId],
  );
  return { database, actorId };
}

describe("the clock correction previous reading source migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("takes the previous reading of every earlier correction from a clock mark", async () => {
    const { database } = await databaseWithAClockCorrection();

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select previous_reading_source from clock_corrections");
    expect(rows).toEqual([{ previous_reading_source: "clock_mark" }]);
  });

  it("gives the alert of every earlier correction a previous reading taken from a clock mark", async () => {
    const { database, actorId } = await databaseWithAClockCorrection();

    const migrated = await database.applyMigration();

    const { rows } = await migrated.query("select detail from alerts");
    expect(rows).toEqual([
      { detail: { ...detailBeforeTheSource, actorId, previousReadingSource: "clock_mark" } },
    ]);
  });

  it("leaves the detail of an alert of another kind as it was", async () => {
    const database = await databaseBeforeMigration("_clock_correction_previous_reading_source");
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
