import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../access/recovery-email-sender.js";
import { setUpRecovery } from "../server.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { ARCA_VITALITY_CHECK_TASK_IDENTIFIER } from "./arca-vitality-task.js";
import { type FakeWsfeServer, startFakeWsfeServer } from "./test-support/fake-wsfe-server.js";

const UNUSED_EMAIL_SENDER: AccessEmailSender = {
  async sendRecoveryLink() {},
  async sendFirstPinCode() {},
};

const WATCHDOG_TASK_IDENTIFIER = "arca-vitality-watchdog";
const CHECKED_AT = new Date("2126-01-01T00:00:00.000Z");
const NEXT_CHECK_AT = new Date("2126-01-01T00:00:30.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let fakeWsfe: FakeWsfeServer;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("arca_vitality_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  fakeWsfe = await startFakeWsfeServer();
}, 60_000);

afterAll(async () => {
  await fakeWsfe.close();
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function scheduledChecks() {
  return sql<{ runAt: Date }[]>`
    select j.run_at as "runAt"
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${ARCA_VITALITY_CHECK_TASK_IDENTIFIER}
      and j.key = ${ARCA_VITALITY_CHECK_TASK_IDENTIFIER}
  `;
}

function pendingWatchdogs() {
  return sql`
    select 1
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${WATCHDOG_TASK_IDENTIFIER}
  `;
}

describe("the ARCA vitality check the server sets up on a real Postgres", () => {
  it("records a check and keeps exactly one next check scheduled 30 seconds on, which the watchdog does not duplicate", async () => {
    const recovery = await setUpRecovery(
      {
        databaseUrl: integrationDb.databaseUrl,
        emailSender: { transport: "log" },
        emailFrom: "Puro Sur <acceso@mail.staging.purosur.online>",
        emailReplyTo: "purosur.comarca@gmail.com",
        backofficeOrigin: "https://staging.purosur.online",
        arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
        arcaVitality: { endpoint: fakeWsfe.endpoint },
      },
      () => CHECKED_AT,
      { emailSender: UNUSED_EMAIL_SENDER },
    );
    try {
      await recovery.workerUtils.addJob(
        ARCA_VITALITY_CHECK_TASK_IDENTIFIER,
        {},
        { jobKey: ARCA_VITALITY_CHECK_TASK_IDENTIFIER },
      );

      await vi.waitFor(
        async () => {
          const checks = await sql<{ ok: boolean }[]>`select ok from arca_vitality_checks`;
          const scheduled = await scheduledChecks();
          expect(checks).toEqual([{ ok: true }]);
          expect(scheduled).toHaveLength(1);
          expect(scheduled[0]?.runAt).toEqual(NEXT_CHECK_AT);
        },
        { timeout: 20_000, interval: 100 },
      );

      await recovery.workerUtils.addJob(WATCHDOG_TASK_IDENTIFIER, {});
      await vi.waitFor(async () => expect(await pendingWatchdogs()).toHaveLength(0), {
        timeout: 20_000,
        interval: 100,
      });

      expect(await scheduledChecks()).toEqual([{ runAt: NEXT_CHECK_AT }]);
      expect(await sql`select 1 from arca_vitality_checks`).toHaveLength(1);
    } finally {
      await recovery.close();
    }
  }, 90_000);

  it("has the watchdog start the chain when none is scheduled", async () => {
    await sql`delete from graphile_worker._private_jobs`;
    await sql`delete from arca_vitality_checks`;
    const recovery = await setUpRecovery(
      {
        databaseUrl: integrationDb.databaseUrl,
        emailSender: { transport: "log" },
        emailFrom: "Puro Sur <acceso@mail.staging.purosur.online>",
        emailReplyTo: "purosur.comarca@gmail.com",
        backofficeOrigin: "https://staging.purosur.online",
        arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
        arcaVitality: { endpoint: fakeWsfe.endpoint },
      },
      () => CHECKED_AT,
      { emailSender: UNUSED_EMAIL_SENDER },
    );
    try {
      await recovery.workerUtils.addJob(WATCHDOG_TASK_IDENTIFIER, {});

      await vi.waitFor(
        async () => {
          expect(await sql`select 1 from arca_vitality_checks`).toHaveLength(1);
          expect(await scheduledChecks()).toHaveLength(1);
        },
        { timeout: 20_000, interval: 100 },
      );
    } finally {
      await recovery.close();
    }
  }, 90_000);
});
