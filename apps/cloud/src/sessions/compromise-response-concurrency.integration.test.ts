import { startCompromiseResponse } from "@purosur/domain/sessions/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compromiseResponses } from "../platform/db/schema.js";
import { openBackofficeSession, SESSION_NOON } from "../test-support/backoffice-session.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleCompromiseResponseStore } from "./drizzle-compromise-response-store.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("compromise_response_start_race");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function administrator(email: string): Promise<string> {
  const session = await openBackofficeSession(db, {
    now: SESSION_NOON,
    locationId: await seededLocationId(db),
    permissionKeys: ["manage_users"],
    email,
  });
  return session.userId;
}

describe("two Administrators starting the runbook at once on a real Postgres", () => {
  it("creates one runbook and hands the same one to both", async () => {
    const first = await administrator("ada@example.com");
    const second = await administrator("grace@example.com");

    const outcomes = await Promise.all(
      [first, second].map((actorId) =>
        startCompromiseResponse(
          { store: new DrizzleCompromiseResponseStore(db) },
          { actorId, at: SESSION_NOON },
        ),
      ),
    );

    expect(await db.select().from(compromiseResponses)).toHaveLength(1);
    expect(outcomes.map(({ kind }) => kind).sort()).toEqual(["already_running", "started"]);
    expect(outcomes[0]?.response.id).toBe(outcomes[1]?.response.id);
  });
});
