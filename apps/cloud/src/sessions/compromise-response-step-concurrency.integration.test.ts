import { runCompromiseResponseStep } from "@purosur/domain/sessions/use-cases";
import { eq, isNull } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  compromiseResponseCompletions,
  compromiseResponses,
  passkeys,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { openBackofficeSession, SESSION_NOON } from "../test-support/backoffice-session.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleCompromiseResponseStore } from "./drizzle-compromise-response-store.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let locationId: string;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("compromise_response_step_race");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
  locationId = await seededLocationId(db);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function store() {
  return new DrizzleCompromiseResponseStore(db, {
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => SESSION_NOON,
  });
}

async function administrator(email: string, permissionKeys: string[]): Promise<string> {
  const session = await openBackofficeSession(db, {
    now: SESSION_NOON,
    locationId,
    permissionKeys,
    email,
  });
  return session.userId;
}

async function accountWithPasskey(firstName: string): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName, email: `${firstName.toLowerCase()}@example.test`, locationId })
    .returning({ id: users.id });
  const [role] = await db
    .insert(roles)
    .values({ name: `Cajera ${firstName}`, isAdministrator: false })
    .returning({ id: roles.id });
  const userId = user?.id as string;
  await db.insert(userRoles).values({ userId, roleId: role?.id as string });
  await db.insert(passkeys).values({
    userId,
    credentialId: `credential-${userId}`,
    publicKey: "key",
    counter: 0,
    deviceType: "singleDevice",
    backedUp: false,
    name: "Llave",
  });
  return userId;
}

async function passkeyOwners(): Promise<string[]> {
  const rows = await db.select({ userId: passkeys.userId }).from(passkeys);
  return rows.map(({ userId }) => userId).sort();
}

function runStepTwoAs(actorId: string, accountId: string) {
  return () =>
    runCompromiseResponseStep(
      { store: store() },
      {
        step: "end_sessions_and_remove_passkeys",
        accountId,
        actorId,
        locationId,
        passkeyAuthorizedAt: SESSION_NOON,
        at: SESSION_NOON,
      },
    );
}

describe("a compromise-response step on a real Postgres", () => {
  it("runs step 2 once when two Administrators run it at once, the other's account keeping its passkeys", async () => {
    const first = await administrator("ada@example.com", ["manage_users"]);
    const second = await administrator("grace@example.com", ["manage_users", "deactivate_users"]);
    const firstSuspect = await accountWithPasskey("Bea");
    const secondSuspect = await accountWithPasskey("Caro");
    const [response] = await db
      .insert(compromiseResponses)
      .values({ startedAt: SESSION_NOON, startedBy: first })
      .returning({ id: compromiseResponses.id });
    const responseId = response?.id as string;
    await db.insert(compromiseResponseCompletions).values({
      responseId,
      key: "revoke_every_installation",
      doneBy: first,
      doneAt: SESSION_NOON,
    });

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      (reserved) =>
        reserved`select pg_advisory_xact_lock(hashtextextended('compromise_responses', 0))`,
      runStepTwoAs(first, firstSuspect),
      runStepTwoAs(second, secondSuspect),
    );

    expect(outcomes).toEqual([{ kind: "done", doneAt: SESSION_NOON }, { kind: "already_done" }]);
    expect(await passkeyOwners()).toEqual([secondSuspect]);
    const completions = await db
      .select({
        key: compromiseResponseCompletions.key,
        doneBy: compromiseResponseCompletions.doneBy,
      })
      .from(compromiseResponseCompletions)
      .where(eq(compromiseResponseCompletions.key, "end_sessions_and_remove_passkeys"));
    expect(completions).toEqual([{ key: "end_sessions_and_remove_passkeys", doneBy: first }]);
  });

  it("keeps every passkey and session when the step's transaction fails after removing them", async () => {
    const actorId = await administrator("hedy@example.com", ["manage_users", "manage_roles"]);
    const suspect = await accountWithPasskey("Dora");
    const ownersBefore = await passkeyOwners();
    const openBefore = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(isNull(sessions.revokedAt));

    await expect(
      store().transaction(async (tx) => {
        await tx.removeEveryPasskeyOf({
          accountId: suspect,
          administratorId: actorId,
          locationId,
          passkeyAuthorizedAt: SESSION_NOON,
          at: SESSION_NOON,
        });
        await tx.endEveryBackofficeSession(actorId, SESSION_NOON);
        throw new Error("the step failed");
      }),
    ).rejects.toThrow("the step failed");

    expect(ownersBefore).toContain(suspect);
    expect(await passkeyOwners()).toEqual(ownersBefore);
    expect(
      await db.select({ id: sessions.id }).from(sessions).where(isNull(sessions.revokedAt)),
    ).toEqual(openBefore);
  });
});
