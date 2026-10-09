import { randomUUID } from "node:crypto";
import { RECOVERY_TOKEN_LIFETIME_MS } from "@purosur/domain";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { WebAuthnEmulator } from "nid-webauthn-emulator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unreachableArcaEndpoints } from "../fiscal/test-support/unreachable-arca-endpoints.js";
import { auditLog, passkeys, recoveryTokens, users } from "../platform/db/schema.js";
import { EDGE_ORIGIN_SECRET_HEADER } from "../platform/edge-origin-guard.js";
import { startServer } from "../server.js";
import { VALID_ARCA_CERTIFICATE } from "../test-support/arca-certificate-fixtures.js";
import { TEST_EDGE_ORIGIN_SECRET } from "../test-support/build-test-app.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";
import { findFreePort } from "./test-support/find-free-port.js";

// PGlite serializes every query on one connection and can never race for real; this proves the
// same guarantee against a real Postgres pool, over two genuinely parallel HTTP requests.
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOW = new Date("2026-01-05T12:00:00.000Z");
const now = () => NOW;

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
  const app = await startServer(
    {
      PORT: String(port),
      DATABASE_URL: integrationDb.databaseUrl,
      RESEND_API_KEY: "unused-redeem-never-sends-email",
      RECOVERY_EMAIL_FROM: "Puro Sur <acceso@mail.staging.purosur.online>",
      RECOVERY_EMAIL_REPLY_TO: "purosur.comarca@gmail.com",
      BACKOFFICE_ORIGIN,
      EDGE_ORIGIN_SECRET: TEST_EDGE_ORIGIN_SECRET,
      ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE,
      ARCA_ENVIRONMENT: "homologation",
      DEVICE_TOKEN_ROTATION_KEY: TEST_DEVICE_TOKEN_ROTATION_KEY.toString("base64"),
      INSTALLATION_KEYS_ENCRYPTION_KEY: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY.toString("base64"),
    },
    { now, arcaEndpoints: unreachableArcaEndpoints },
  );
  return { origin: `http://127.0.0.1:${port}`, close: () => app.close() };
}

async function seedUserAndToken(): Promise<{ userId: string; rawToken: string }> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ada Lucero",
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
    issuedAt: now(),
    expiresAt: new Date(now().getTime() + RECOVERY_TOKEN_LIFETIME_MS),
  });
  return { userId: user.id, rawToken };
}

describe("redeeming the same recovery token over two concurrent HTTP requests against a real pool", () => {
  it("registers exactly one passkey and burns the token exactly once; the loser sees it as burned", async () => {
    const server = await startRealServer();
    try {
      const { userId, rawToken } = await seedUserAndToken();

      const optionsResponse = await fetch(`${server.origin}/api/account-recovery-challenges`, {
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
        fetch(`${server.origin}/api/account-recovery-redemptions`, {
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
