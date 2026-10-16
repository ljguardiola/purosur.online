import { endEveryBackofficeSession } from "@purosur/domain/sessions/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, sessions } from "../platform/db/schema.js";
import { openBackofficeSession, SESSION_NOON } from "../test-support/backoffice-session.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleBackofficeSessionEndingStore } from "./drizzle-backoffice-session-ending-store.js";

// PGlite serializes every transaction, so racing endings can only interleave on a real Postgres
// pool; the test pins the order by holding a row lock until both endings queue behind it.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("every_session_ending_race");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

const FIRST_ENDING = new Date(SESSION_NOON.getTime() + 60_000);
const SECOND_ENDING = new Date(SESSION_NOON.getTime() + 120_000);

async function openSessionOf(email: string, permissionKeys: string[]): Promise<string> {
  const session = await openBackofficeSession(db, {
    now: SESSION_NOON,
    locationId: await seededLocationId(db),
    permissionKeys,
    email,
  });
  return session.userId;
}

function endEverySessionAs(actorId: string, at: Date) {
  return () =>
    endEveryBackofficeSession(
      { store: new DrizzleBackofficeSessionEndingStore(db) },
      { actorId, at },
    );
}

describe("two Administrators ending every session at once on a real Postgres", () => {
  it("ends each open session once, at the first ending's time, with one audit row each", async () => {
    const firstAdministratorId = await openSessionOf("ada@example.com", ["manage_users"]);
    const secondAdministratorId = await openSessionOf("grace@example.com", [
      "manage_users",
      "deactivate_users",
    ]);
    const cashierId = await openSessionOf("lucia@example.com", []);

    await runQueuedBehindHeldLock(
      sql,
      (reserved) => reserved`select id from sessions where user_id = ${cashierId} for update`,
      endEverySessionAs(firstAdministratorId, FIRST_ENDING),
      endEverySessionAs(secondAdministratorId, SECOND_ENDING),
    );

    const endedSessions = await db
      .select({ id: sessions.id, revokedAt: sessions.revokedAt })
      .from(sessions);
    expect(endedSessions).toHaveLength(3);
    expect(endedSessions.map((session) => session.revokedAt)).toEqual([
      FIRST_ENDING,
      FIRST_ENDING,
      FIRST_ENDING,
    ]);
    const endingAudits = await db
      .select({ entityId: auditLog.entityId, actorId: auditLog.actorId })
      .from(auditLog)
      .where(eq(auditLog.entity, "session"));
    expect(endingAudits.map((audit) => audit.entityId).sort()).toEqual(
      endedSessions.map((session) => session.id).sort(),
    );
    expect(endingAudits.map((audit) => audit.actorId)).toEqual([
      firstAdministratorId,
      firstAdministratorId,
      firstAdministratorId,
    ]);
  });
});
