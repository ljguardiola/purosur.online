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

function insertRequest(
  client: SqlOnlyDatabase,
  registerId: string,
  { number, saleEvent }: { number: number; saleEvent: string | null },
) {
  return client.query(
    `insert into fiscal_requests
             (fiscal_document_id, register_id, sale_id, point_of_sale, number, issued_on, total,
              buyer_tax_status_code, sale_event, received_at, not_after)
           values (gen_random_uuid(), $1, gen_random_uuid(), 7, $2, '2026-10-06', 1500, 5, $3,
                   '2026-10-06T15:00:00Z', '2026-10-06T15:00:04Z')`,
    [registerId, number, saleEvent],
  );
}

describe("the fiscal request without sale event migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the sale event of each request it finds", async () => {
    const before = await databaseBeforeMigration("_fiscal_request_without_sale_event");
    await insertRequest(before, await aRegister(before), {
      number: 40,
      saleEvent: '{"event_id":"e-40"}',
    });

    const migrated = await before.applyMigration();

    const { rows } = await migrated.query("select number, sale_event from fiscal_requests");
    expect(rows).toEqual([{ number: 40, sale_event: { event_id: "e-40" } }]);
  });

  it("accepts a request that carries no sale event", async () => {
    const migrated = await (
      await databaseBeforeMigration("_fiscal_request_without_sale_event")
    ).applyMigration();

    await insertRequest(migrated, await aRegister(migrated), { number: 1, saleEvent: null });

    const { rows } = await migrated.query("select number, sale_event from fiscal_requests");
    expect(rows).toEqual([{ number: 1, sale_event: null }]);
  });
});
