import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerRouteAccess } from "../access/route-access.js";
import {
  alerts,
  registerEnrollmentAttempts,
  registerEnrollmentCodes,
  registerInstallations,
  registers,
} from "../platform/db/schema.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerDeviceEnrollmentRoute } from "./device-enrollment-route.js";
import { hashRegisterEnrollmentCode } from "./register-enrollment-code.js";

// Runs as the limited `cloud_app` role the cloud connects with, which PGlite does not model.
const CODE = "P4NX7KWE2QRT6MZD";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let admin: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let app: FastifyInstance;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("register_enrollment_alert");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  admin = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
  db = drizzle(sql);
  await admin.unsafe(`
    create function refuse_register_enrolled_alert() returns trigger language plpgsql as $$
    begin
      raise exception 'alert refused by the test';
    end $$;
    create trigger refuse_register_enrolled_alert before insert on alerts
      for each row when (new.kind = 'register_enrolled')
      execute function refuse_register_enrolled_alert();
  `);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await admin.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(() => {
  app = Fastify();
  registerRouteAccess(app);
  registerDeviceEnrollmentRoute(app, {
    db,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
  });
});

afterEach(async () => {
  await app.close();
});

async function insertRegisterWithCode(): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId: await seededLocationId(db), name: `Caja ${randomUUID()}` })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  const issuedAt = new Date();
  await db.insert(registerEnrollmentCodes).values({
    registerId: register.id,
    codeLookup: CODE.slice(0, 4),
    codeHash: hashRegisterEnrollmentCode(CODE),
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + 15 * 60 * 1000),
  });
  return register.id;
}

describe("a register's enrollment alert that fails to open, on a real Postgres", () => {
  it("rolls the whole enrollment back: the previous installation keeps the register and the code still works", async () => {
    const registerId = await insertRegisterWithCode();
    const [previous] = await db
      .insert(registerInstallations)
      .values({
        registerId,
        tokenLookupPrefix: "previous",
        tokenHash: "previous-hash",
        hostname: "VIEJA",
        windowsVersion: "Windows 10 Pro 10.0.19045",
        enrolledAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        tokenIssuedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      })
      .returning();

    const response = await app.inject({
      method: "POST",
      url: "/devices/enroll",
      payload: {
        code: CODE,
        hostname: "CAJA-MOSTRADOR",
        windows_version: "Windows 11 Pro 10.0.26100",
      },
    });

    expect(response.statusCode).toBe(500);
    expect(
      await db
        .select()
        .from(registerInstallations)
        .where(eq(registerInstallations.registerId, registerId)),
    ).toEqual([previous]);
    const [code] = await db
      .select({ redeemedAt: registerEnrollmentCodes.redeemedAt })
      .from(registerEnrollmentCodes)
      .where(eq(registerEnrollmentCodes.registerId, registerId));
    expect(code?.redeemedAt).toBeNull();
    expect(await db.select().from(registerEnrollmentAttempts)).toEqual([]);
    expect(await db.select().from(alerts)).toEqual([]);
  });
});
