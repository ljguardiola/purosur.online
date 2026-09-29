import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createIntegrationDatabase, type IntegrationDatabase } from "./integration-database.js";
import { runQueuedBehindHeldLock } from "./queued-behind-held-lock.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("queued_behind_held_lock");
  sql = postgres(integrationDb.adminDatabaseUrl, { max: 6 });
  await sql`create table queue_probe (id int primary key, arrivals text[] not null default '{}')`;
  await sql`insert into queue_probe (id) values (1)`;
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function arriveAtProbe(name: string): () => Promise<string[]> {
  return async () => {
    const [row] = await sql<{ arrivals: string[] }[]>`
      update queue_probe set arrivals = arrivals || ${name}::text where id = 1
      returning arrivals`;
    return row?.arrivals ?? [];
  };
}

function holdProbeRowLock(holder: postgres.ReservedSql) {
  return holder`select id from queue_probe where id = 1 for update`;
}

describe("running two writes queued behind a held row lock on a real Postgres", () => {
  it("lets the first write through before the second once the held lock is released", async () => {
    await sql`update queue_probe set arrivals = '{}' where id = 1`;

    const [first, second] = await runQueuedBehindHeldLock(
      sql,
      holdProbeRowLock,
      arriveAtProbe("first"),
      arriveAtProbe("second"),
    );

    expect(first).toEqual(["first"]);
    expect(second).toEqual(["first", "second"]);
  });

  it("rejects when the second write never queues, leaving the row unlocked and the first write settled", async () => {
    await sql`update queue_probe set arrivals = '{}' where id = 1`;

    await expect(
      runQueuedBehindHeldLock(sql, holdProbeRowLock, arriveAtProbe("first"), async () => []),
    ).rejects.toThrow("2 queries never queued behind the held lock");

    const unlocked = await sql<{ arrivals: string[] }[]>`
      select arrivals from queue_probe where id = 1 for update nowait`;
    expect(unlocked).toEqual([{ arrivals: ["first"] }]);
  });
});
