import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../credentials/recovery-email-sender.js";
import { setUpRecovery } from "../server.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { FICTIONAL_RECOVERY_REPLY_TO } from "../test-support/recovery-reply-to.js";
import { MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER } from "./mercado-pago-refund-follow-task.js";
import { FakeMercadoPagoOrders } from "./test-support/fake-mercado-pago-orders.js";

const UNUSED_EMAIL_SENDER: AccessEmailSender = {
  async sendRecoveryLink() {},
  async sendFirstPinCode() {},
};

const WATCHDOG_TASK_IDENTIFIER = "mercado-pago-refund-follow-watchdog";
const FOLLOWED_AT = new Date("2126-01-01T00:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("mercado_pago_refund_follow_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function scheduledFollows() {
  return sql`
    select 1
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER}
      and j.key = ${MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER}
  `;
}

describe("the Mercado Pago refund follow the server sets up on a real Postgres", () => {
  it("has the watchdog start the chain when none is scheduled", async () => {
    await sql`delete from graphile_worker._private_jobs`;
    const recovery = await setUpRecovery(
      {
        databaseUrl: integrationDb.databaseUrl,
        emailSender: { transport: "log" },
        emailFrom: "Puro Sur <acceso@mail.staging.purosur.online>",
        emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
        backofficeOrigin: "https://staging.purosur.online",
        arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
        arcaVitality: { endpoint: "http://127.0.0.1:1/unused" },
        mercadoPago: new FakeMercadoPagoOrders(),
      },
      () => FOLLOWED_AT,
      { emailSender: UNUSED_EMAIL_SENDER },
    );
    try {
      await recovery.workerUtils.addJob(WATCHDOG_TASK_IDENTIFIER, {});

      await vi.waitFor(async () => expect(await scheduledFollows()).toHaveLength(1), {
        timeout: 20_000,
        interval: 100,
      });
    } finally {
      await recovery.close();
    }
  }, 90_000);
});
