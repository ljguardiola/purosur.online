import pg from "pg";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { createIntegrationDatabase } from "./integration-database.js";

async function databaseExists(adminDatabaseUrl: string): Promise<boolean> {
  const url = new URL(adminDatabaseUrl);
  const databaseName = url.pathname.slice(1);
  url.pathname = "/postgres";
  const admin = postgres(url.toString(), { max: 1 });
  try {
    const rows = await admin`select 1 from pg_database where datname = ${databaseName}`;
    return rows.length > 0;
  } finally {
    await admin.end({ timeout: 1 });
  }
}

describe("closing an integration database on a real Postgres", () => {
  it("drops the database once every connection to it has ended", async () => {
    const integrationDb = await createIntegrationDatabase("integration_database_closed");
    const pool = new pg.Pool({ connectionString: integrationDb.databaseUrl, max: 3 });
    const poolErrors: Error[] = [];
    pool.on("error", (error) => poolErrors.push(error));
    await Promise.all([pool.query("select 1"), pool.query("select 1"), pool.query("select 1")]);

    await pool.end();
    await integrationDb.close();

    expect(poolErrors).toEqual([]);
    expect(await databaseExists(integrationDb.adminDatabaseUrl)).toBe(false);
  }, 30_000);

  it("refuses to drop the database while a connection to it is still open, instead of terminating it", async () => {
    const integrationDb = await createIntegrationDatabase("integration_database_leaked");
    const client = new pg.Client({ connectionString: integrationDb.databaseUrl });
    const clientErrors: Error[] = [];
    client.on("error", (error) => clientErrors.push(error));
    await client.connect();

    try {
      await expect(integrationDb.close()).rejects.toMatchObject({ code: "55006" });
      expect(clientErrors).toEqual([]);
      expect(await client.query("select 1 as alive")).toMatchObject({ rows: [{ alive: 1 }] });
    } finally {
      await client.end();
      await integrationDb.close();
    }
  }, 30_000);
});
