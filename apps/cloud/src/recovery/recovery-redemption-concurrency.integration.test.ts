import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import WebAuthnEmulator from "nid-webauthn-emulator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, passkeys, recoveryTokens, users } from "../db/schema.js";
import { EDGE_ORIGIN_SECRET_HEADER } from "../edge-origin-guard.js";
import { startServer } from "../server.js";
import { TEST_EDGE_ORIGIN_SECRET } from "../test-support/build-test-app.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { findFreePort } from "./find-free-port.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "./recovery-integration-database.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";

// `recovery-redemption-route.test.ts`'s "registers at most one passkey when the same token is
// redeemed concurrently" test only proved this on PGlite's single connection, which serializes
// every query and can never race for real. This proves the same guarantee (the atomic
// `UPDATE ... WHERE used_at IS NULL ... RETURNING` in recovery-redemption-route.ts) against a real
// Postgres with a real postgres-js pool of more than one connection, over two genuinely parallel
// HTTP requests.
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("recovery_redemption_concurrency");
  sql = postgres(integrationDb.databaseUrl);
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

interface StartedFixture {
  origin: string;
  close(): Promise<void>;
}

async function startRealServer(): Promise<StartedFixture> {
  const port = await findFreePort();
  const app = await startServer({
    PORT: String(port),
    DATABASE_URL: integrationDb.databaseUrl,
    RESEND_API_KEY: "unused-redeem-never-sends-email",
    RECOVERY_EMAIL_FROM: "Puro Sur <acceso@mail.staging.purosur.online>",
    RECOVERY_EMAIL_REPLY_TO: "purosur.comarca@gmail.com",
    BACKOFFICE_ORIGIN,
    EDGE_ORIGIN_SECRET: TEST_EDGE_ORIGIN_SECRET,
  });
  return { origin: `http://127.0.0.1:${port}`, close: () => app.close() };
}

async function seedUserAndToken(): Promise<{ userId: string; rawToken: string }> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ada Lovelace",
      email: `ada-${randomUUID()}@example.com`,
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  const rawToken = `raw-token-${randomUUID()}`;
  await db.insert(recoveryTokens).values({
    userId: user.id,
    tokenHash: hashRecoveryToken(rawToken),
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + FIFTEEN_MINUTES_MS),
  });
  return { userId: user.id, rawToken };
}

describe("redeeming the same recovery token over two concurrent HTTP requests against a real pool", () => {
  it("registers exactly one passkey and burns the token exactly once; the loser sees it as burned", async () => {
    const server = await startRealServer();
    try {
      const { userId, rawToken } = await seedUserAndToken();

      const optionsResponse = await fetch(`${server.origin}/users/recovery/registration-options`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: BACKOFFICE_ORIGIN,
          [EDGE_ORIGIN_SECRET_HEADER]: TEST_EDGE_ORIGIN_SECRET,
        },
        body: JSON.stringify({ recovery_token: rawToken }),
      });
      expect(optionsResponse.status).toBe(200);
      const { passkey_registration_options: registrationOptions } = await optionsResponse.json();

      const emulator = new WebAuthnEmulator();
      const credential = emulator.createJSON(BACKOFFICE_ORIGIN, registrationOptions);

      const redeem = () =>
        fetch(`${server.origin}/users/recovery/redeem`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: BACKOFFICE_ORIGIN,
            [EDGE_ORIGIN_SECRET_HEADER]: TEST_EDGE_ORIGIN_SECRET,
          },
          body: JSON.stringify({
            recovery_token: rawToken,
            passkey_registration: credential,
            passkey_name: "Notebook del local",
          }),
        });

      const [first, second] = await Promise.all([redeem(), redeem()]);

      expect([first.status, second.status].sort()).toEqual([200, 410]);
      const loser = first.status === 410 ? first : second;
      expect(await loser.json()).toMatchObject({ code: "recovery_token_burned" });

      const insertedPasskeys = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
      expect(insertedPasskeys).toHaveLength(1);

      const tokenRows = await db
        .select({ usedAt: recoveryTokens.usedAt })
        .from(recoveryTokens)
        .where(eq(recoveryTokens.tokenHash, hashRecoveryToken(rawToken)));
      expect(tokenRows).toHaveLength(1);
      expect(tokenRows[0]?.usedAt).not.toBeNull();

      // The winner audits the burn and the new passkey; the loser audits its own rejected attempt.
      const auditRows = await db.select().from(auditLog).where(eq(auditLog.actorId, userId));
      expect(auditRows.map((row) => row.entity).sort()).toEqual([
        "passkey",
        "recovery_token",
        "recovery_token",
      ]);
      expect(auditRows.map((row) => row.newValue)).toContainEqual({
        attempt: "redeem",
        rejectedWith: "recovery_token_burned",
      });
    } finally {
      await server.close();
    }
  });
});
