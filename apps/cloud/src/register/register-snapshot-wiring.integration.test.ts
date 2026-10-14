import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../credentials/recovery-email-sender.js";
import { UNREACHABLE_WSFE_ENDPOINT } from "../fiscal/test-support/fake-wsfe-server.js";
import {
  registerInstallations,
  registerSnapshotGenerations,
  registerSnapshotKeys,
  registers,
} from "../platform/db/schema.js";
import { setUpRecovery } from "../server.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import {
  REGISTER_SNAPSHOT_RETENTION_TASK_IDENTIFIER,
  REGISTER_SNAPSHOT_VERIFICATION_TASK_IDENTIFIER,
} from "./register-snapshot-jobs.js";

const UNUSED_EMAIL_SENDER: AccessEmailSender = {
  async sendRecoveryLink() {},
  async sendFirstPinCode() {},
};

const NOW = new Date("2026-10-14T15:00:00.000Z");
const SHA = "ab".repeat(32);
const GENERATION_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const FAILED_ID = "6c1d3e84-0a52-4b0e-8a9f-1d2e3f4a5b6c";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("register_snapshot_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("the background worker the server sets up with a snapshots bucket on a real Postgres", () => {
  it("verifies uploaded generations and prunes failed ones through the bucket it is handed", async () => {
    const [register] = await db
      .insert(registers)
      .values({ locationId: await seededLocationId(db), name: "Caja 1" })
      .returning({ id: registers.id });
    if (!register) throw new Error("test setup: seeding the register returned no row");
    const [installation] = await db
      .insert(registerInstallations)
      .values({
        registerId: register.id,
        tokenLookupPrefix: "prefix",
        tokenHash: "hash",
        tokenIssuedAt: NOW,
        hostname: "CAJA-MOSTRADOR",
        windowsVersion: "Windows 11 Pro 10.0.26100",
        enrolledAt: NOW,
      })
      .returning({ id: registerInstallations.id });
    if (!installation) throw new Error("test setup: seeding the installation returned no row");
    await db.insert(registerSnapshotKeys).values({ registerId: register.id, version: 1, key: "k" });
    const common = {
      registerId: register.id,
      deviceId: installation.id,
      createdAt: NOW,
      size: 4,
      sha256: SHA,
      keyVersion: 1,
    };
    await db.insert(registerSnapshotGenerations).values([
      { ...common, id: GENERATION_ID, status: "uploaded" },
      { ...common, id: FAILED_ID, status: "failed", failureReason: "hash_mismatch" },
    ]);
    const removed: string[] = [];
    const recovery = await setUpRecovery(
      {
        databaseUrl: integrationDb.databaseUrl,
        emailSender: { transport: "log" },
        emailFrom: "Puro Sur <acceso@mail.staging.purosur.online>",
        emailReplyTo: "purosur.comarca@gmail.com",
        backofficeOrigin: "https://staging.purosur.online",
        arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
        arcaVitality: { endpoint: UNREACHABLE_WSFE_ENDPOINT },
        registerSnapshotObjects: {
          inspect: async () => ({ size: 4, sha256: SHA }),
          remove: async (_registerId, generationId) => {
            removed.push(generationId);
          },
        },
      },
      () => NOW,
      { emailSender: UNUSED_EMAIL_SENDER },
    );

    try {
      await sql`select graphile_worker.add_job(${REGISTER_SNAPSHOT_VERIFICATION_TASK_IDENTIFIER})`;
      await sql`select graphile_worker.add_job(${REGISTER_SNAPSHOT_RETENTION_TASK_IDENTIFIER})`;

      await vi.waitFor(
        async () => {
          const [verified] = await db
            .select()
            .from(registerSnapshotGenerations)
            .where(eq(registerSnapshotGenerations.id, GENERATION_ID));
          const [pruned] = await db
            .select()
            .from(registerSnapshotGenerations)
            .where(eq(registerSnapshotGenerations.id, FAILED_ID));
          expect(verified?.status).toBe("verified");
          expect(pruned).toMatchObject({ pruned: true, objectDeleted: true });
        },
        { timeout: 20_000, interval: 100 },
      );
      expect(removed).toEqual([FAILED_ID]);
    } finally {
      await recovery.close();
    }
  }, 60_000);
});
