import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

async function seedClaimAndCode(client: SqlOnlyDatabase) {
  await client.query(
    `insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1`,
  );
  await client.query(
    `insert into users (first_name, email, location_id)
     select 'Ada Lucero', 'ada@example.com', id from locations limit 1`,
  );
  await client.query(
    `insert into point_of_sale_claims (point_of_sale_number, register_id, mechanism, claimed_by)
     select 7, registers.id, 'offline', users.id from registers, users`,
  );
  await client.query(
    `with kept as (
       insert into caea_codes
         (fortnight_start, fortnight_end, code, report_deadline, obtained_at, obtained_through)
       values ('2026-10-01', '2026-10-15', '36123456789012', '2026-10-20',
               '2026-09-28T12:00:00Z', 'requested')
       returning id
     )
     insert into changes (entity, entity_id, version, op)
     select 'offline_authorization_code', id, 1, 'insert' from kept`,
  );
}

async function migratedDatabase() {
  const database = await databaseBeforeMigration("_fortnight_document_reports");
  await seedClaimAndCode(database);
  await database.query(
    `insert into fortnight_reports
       (point_of_sale_number, fortnight_start, fortnight_end, state, recorded_at)
     values (7, '2026-10-01', '2026-10-15', 'accepted', '2026-10-16T12:00:00Z')`,
  );
  return database.applyMigration();
}

const insertDocumentReport = ({
  pointOfSale = 7,
  start = "2026-10-01",
  end = "2026-10-15",
  documentType = "factura_c",
  state = "accepted",
} = {}) =>
  `insert into fortnight_document_reports
     (point_of_sale_number, fortnight_start, fortnight_end, document_type, state,
      reported_through, recorded_at)
   values (${pointOfSale}, '${start}', '${end}', '${documentType}', '${state}', 12,
           '2026-10-16T12:00:00Z')`;

describe("the fortnight document reports migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps an existing fortnight report and leaves its movement unknown", async () => {
    const client = await migratedDatabase();

    const { rows } = await client.query("select state, movement from fortnight_reports");
    expect(rows).toEqual([{ state: "accepted", movement: null }]);
  });

  it.each(["none", "documents"])(
    "accepts a fortnight report with the movement %s",
    async (movement) => {
      const client = await migratedDatabase();

      await client.query(`update fortnight_reports set movement = '${movement}'`);

      const { rows } = await client.query("select movement from fortnight_reports");
      expect(rows).toEqual([{ movement }]);
    },
  );

  it("refuses a fortnight report with a movement it has no name for", async () => {
    const client = await migratedDatabase();

    await expect(client.query("update fortnight_reports set movement = 'some'")).rejects.toThrow();
  });

  it("accepts a fortnight report that needs regularization", async () => {
    const client = await migratedDatabase();

    await client.query("update fortnight_reports set state = 'needs_regularization'");

    const { rows } = await client.query("select state from fortnight_reports");
    expect(rows).toEqual([{ state: "needs_regularization" }]);
  });

  it("accepts a document report of each state, with the rejected document", async () => {
    const client = await migratedDatabase();

    for (const state of ["blocked", "submitting", "refused", "accepted"]) {
      await client.query("delete from fortnight_document_reports");
      await client.query(insertDocumentReport({ state }));
    }
    await client.query(
      `update fortnight_document_reports
       set rejected_number = 13, rejections = '[{"code":1439,"message":"x"}]',
           last_attempt_at = '2026-10-16T12:00:00Z'`,
    );

    const { rows } = await client.query(
      "select document_type, state, reported_through, rejected_number from fortnight_document_reports",
    );
    expect(rows).toEqual([
      { document_type: "factura_c", state: "accepted", reported_through: 12, rejected_number: 13 },
    ]);
  });

  it("refuses a document report in a state a presentation never goes through", async () => {
    const client = await migratedDatabase();

    await expect(
      client.query(insertDocumentReport({ state: "needs_regularization" })),
    ).rejects.toThrow();
  });

  it("refuses a document report of a document type that is not known", async () => {
    const client = await migratedDatabase();

    await expect(
      client.query(insertDocumentReport({ documentType: "factura_z" })),
    ).rejects.toThrow();
  });

  it("refuses a fortnight that does not end after it starts", async () => {
    const client = await migratedDatabase();

    await expect(client.query(insertDocumentReport({ end: "2026-10-01" }))).rejects.toThrow();
  });

  it("refuses a second report for the same point of sale, fortnight and document type", async () => {
    const client = await migratedDatabase();
    await client.query(insertDocumentReport());

    await expect(client.query(insertDocumentReport({ state: "blocked" }))).rejects.toThrow();
  });

  it("refuses a document report of a point of sale nobody claimed", async () => {
    const client = await migratedDatabase();

    await expect(client.query(insertDocumentReport({ pointOfSale: 8 }))).rejects.toThrow();
  });

  it("refuses a document report of a fortnight with no kept code", async () => {
    const client = await migratedDatabase();

    await expect(
      client.query(insertDocumentReport({ start: "2026-09-16", end: "2026-09-30" })),
    ).rejects.toThrow();
  });
});
