import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

async function aRegister(client: SqlOnlyDatabase) {
  const { rows } = await client.query<{ id: string }>(
    `insert into registers (location_id, name)
     select id, 'Caja 1' from locations limit 1 returning id`,
  );
  return rows[0]?.id as string;
}

function insertRequest(client: SqlOnlyDatabase, registerId: string, number: number) {
  return client.query(
    `insert into fiscal_requests
             (fiscal_document_id, register_id, sale_id, point_of_sale, number, issued_on, total,
              buyer_tax_status_code, sale_event, received_at, not_after, answer_kind, unclear_codes,
              answered_at)
           values (gen_random_uuid(), $1, gen_random_uuid(), 7, $2, '2026-10-06', 1500, 5, '{}',
                   '2026-10-06T15:00:00Z', '2026-10-06T15:00:04Z', 'unclear', '{10016}',
                   '2026-10-06T15:00:02Z')`,
    [registerId, number],
  );
}

describe("the numbering conflict freeze migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the requests it finds, undiagnosed", async () => {
    const before = await databaseBeforeMigration("_numbering_conflict_freeze");
    await insertRequest(before, await aRegister(before), 40);

    const client = await before.applyMigration();

    const { rows } = await client.query(
      "select number, diagnosis, diagnosed_at from fiscal_requests",
    );
    expect(rows).toEqual([{ number: 40, diagnosis: null, diagnosed_at: null }]);
  });

  it("accepts each diagnosis with the time it was made", async () => {
    const client = await (await databaseBeforeMigration("_numbering_conflict_freeze")).applyMigration();
    const registerId = await aRegister(client);
    await insertRequest(client, registerId, 1);
    await insertRequest(client, registerId, 2);

    await client.query(
      `update fiscal_requests set diagnosis = 'collision', diagnosed_at = now() where number = 1`,
    );
    await client.query(
      `update fiscal_requests set diagnosis = 'date_behind', diagnosed_at = now() where number = 2`,
    );

    const { rows } = await client.query("select diagnosis from fiscal_requests order by number");
    expect(rows).toEqual([{ diagnosis: "collision" }, { diagnosis: "date_behind" }]);
  });

  it("refuses a diagnosis other than the known ones", async () => {
    const client = await (await databaseBeforeMigration("_numbering_conflict_freeze")).applyMigration();
    await insertRequest(client, await aRegister(client), 1);

    await expect(
      client.query(`update fiscal_requests set diagnosis = 'boredom', diagnosed_at = now()`),
    ).rejects.toThrow();
  });

  it("refuses a diagnosis without the time it was made, and the time without the diagnosis", async () => {
    const client = await (await databaseBeforeMigration("_numbering_conflict_freeze")).applyMigration();
    await insertRequest(client, await aRegister(client), 1);

    await expect(
      client.query(`update fiscal_requests set diagnosis = 'collision'`),
    ).rejects.toThrow();
    await expect(client.query(`update fiscal_requests set diagnosed_at = now()`)).rejects.toThrow();
  });

  it("holds one freeze per point of sale", async () => {
    const client = await (await databaseBeforeMigration("_numbering_conflict_freeze")).applyMigration();
    await client.query(
      `insert into numbering_freezes (point_of_sale_number, count_before_freeze, frozen_at)
       values (7, 12, '2026-10-06T15:00:00Z')`,
    );

    await expect(
      client.query(
        `insert into numbering_freezes (point_of_sale_number, count_before_freeze, frozen_at)
         values (7, 13, '2026-10-06T15:01:00Z')`,
      ),
    ).rejects.toThrow();
  });

  it("refuses a count before the freeze below zero", async () => {
    const client = await (await databaseBeforeMigration("_numbering_conflict_freeze")).applyMigration();

    await expect(
      client.query(
        `insert into numbering_freezes (point_of_sale_number, count_before_freeze, frozen_at)
         values (7, -1, '2026-10-06T15:00:00Z')`,
      ),
    ).rejects.toThrow();
  });
});
