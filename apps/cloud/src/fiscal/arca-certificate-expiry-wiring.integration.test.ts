import { and, eq, isNull } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../credentials/recovery-email-sender.js";
import { alerts } from "../platform/db/schema.js";
import { setUpRecovery } from "../server.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  ARCA_CERTIFICATE_EXPIRY_CHECK_TASK_IDENTIFIER,
  enqueueArcaCertificateExpiryCheck,
} from "./arca-certificate-expiry-task.js";
import { ARCA_VITALITY_CHECK_TASK_IDENTIFIER } from "./arca-vitality-task.js";
import { UNREACHABLE_WSFE_ENDPOINT } from "./test-support/fake-wsfe-server.js";

const UNUSED_EMAIL_SENDER: AccessEmailSender = {
  async sendRecoveryLink() {},
  async sendFirstPinCode() {},
};

const NOW = new Date("2026-06-01T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING = new Date(NOW.getTime() + 20 * DAY_MS);
const RENEWED = new Date(NOW.getTime() + 400 * DAY_MS);
const NEXT_VITALITY_CHECK_AT = new Date("2126-01-01T00:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("arca_certificate_expiry_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function pendingCertificateExpiryChecks() {
  return sql`
    select 1
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${ARCA_CERTIFICATE_EXPIRY_CHECK_TASK_IDENTIFIER}
  `;
}

async function runCheckOfCertificateExpiringAt(notAfter: Date): Promise<void> {
  const recovery = await setUpRecovery(
    {
      databaseUrl: integrationDb.databaseUrl,
      emailSender: { transport: "log" },
      emailFrom: "Puro Sur <acceso@mail.staging.purosur.online>",
      emailReplyTo: "purosur.comarca@gmail.com",
      backofficeOrigin: "https://staging.purosur.online",
      arcaCertificate: { environment: "production", notAfter },
      arcaVitality: { endpoint: UNREACHABLE_WSFE_ENDPOINT },
    },
    () => NOW,
    { emailSender: UNUSED_EMAIL_SENDER },
  );
  try {
    await recovery.workerUtils.addJob(
      ARCA_VITALITY_CHECK_TASK_IDENTIFIER,
      {},
      { jobKey: ARCA_VITALITY_CHECK_TASK_IDENTIFIER, runAt: NEXT_VITALITY_CHECK_AT },
    );
    await enqueueArcaCertificateExpiryCheck(recovery.workerUtils);
    await vi.waitFor(
      async () => {
        expect(await pendingCertificateExpiryChecks()).toHaveLength(0);
      },
      { timeout: 20_000, interval: 100 },
    );
  } finally {
    await recovery.close();
  }
}

function openAlerts() {
  return db
    .select()
    .from(alerts)
    .where(
      and(
        eq(alerts.kind, "arca_certificate_expiring"),
        eq(alerts.scope, "production"),
        isNull(alerts.resolvedAt),
      ),
    );
}

describe("the certificate expiry check the server sets up on a real Postgres", () => {
  it("opens the alert for an expiring certificate and resolves it once a certificate with a later expiry is loaded, while the next vitality check waits in the queue", async () => {
    await runCheckOfCertificateExpiringAt(EXPIRING);

    const [opened] = await openAlerts();
    expect(opened?.detail).toEqual({ notAfter: EXPIRING.toISOString() });

    await runCheckOfCertificateExpiringAt(RENEWED);

    expect(await openAlerts()).toHaveLength(0);
    const [resolved] = await db
      .select()
      .from(alerts)
      .where(eq(alerts.id, opened?.id ?? ""));
    expect(resolved).toMatchObject({ resolvedAt: NOW, resolvedBy: null });
  }, 90_000);
});
