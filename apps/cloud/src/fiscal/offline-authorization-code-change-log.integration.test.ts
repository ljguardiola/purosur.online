import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("offline_authorization_code_change_log");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function keepCode(connection: postgres.Sql | postgres.TransactionSql) {
  return connection<{ id: string }[]>`
    insert into caea_codes
      (fortnight_start, fortnight_end, code, report_deadline, obtained_at, obtained_through)
    values ('2026-10-01', '2026-10-15', '21403471111111', '2026-10-30',
            '2026-09-28T12:00:00Z', 'requested')
    returning id`;
}

describe("the offline authorization codes on a real Postgres", () => {
  it("refuses a code kept without its change in the same transaction, leaving no code behind", async () => {
    await expect(sql.begin((tx) => keepCode(tx))).rejects.toThrow();

    expect(await sql`select id from caea_codes`).toHaveLength(0);
  });

  it("keeps a code whose insert change is logged in the same transaction", async () => {
    const kept = await sql.begin(async (tx) => {
      const [code] = await keepCode(tx);
      await tx`
        insert into changes (entity, entity_id, version, op)
        values ('offline_authorization_code', ${code?.id as string}, 1, 'insert')`;
      return code;
    });

    const stored = await sql`select id from caea_codes`;
    expect(stored.map(({ id }) => id)).toEqual([kept?.id]);
  });
});
