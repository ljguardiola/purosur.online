import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../credentials/recovery-email-sender.js";
import { setUpBackgroundJobs } from "../server.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  FICTIONAL_RECOVERY_REPLY_TO,
  FICTIONAL_RECOVERY_SENDER,
} from "../test-support/recovery-email.js";
import { MERCADO_PAGO_SETTLEMENT_REPORT_TASK_IDENTIFIER } from "./mercado-pago-settlement-report-task.js";
import { FakeMercadoPagoSettlementReports } from "./test-support/fake-mercado-pago-settlement-reports.js";

const UNUSED_EMAIL_SENDER: AccessEmailSender = {
  async sendRecoveryLink() {},
  async sendFirstPinCode() {},
};

const CHECKED_AT = new Date("2126-01-01T00:00:00.000Z");

let integrationDb: IntegrationDatabase;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("mercado_pago_settlement_report_wiring");
}, 60_000);

afterAll(async () => {
  await integrationDb.close();
});

function setUp(mercadoPagoSettlementReports: FakeMercadoPagoSettlementReports) {
  return setUpBackgroundJobs(
    {
      databaseUrl: integrationDb.databaseUrl,
      emailSender: { transport: "log" },
      emailFrom: FICTIONAL_RECOVERY_SENDER,
      emailReplyTo: FICTIONAL_RECOVERY_REPLY_TO,
      backofficeOrigin: "https://staging.purosur.online",
      arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
      arcaVitality: { endpoint: "http://127.0.0.1:1/unused" },
      mercadoPagoSettlementReports,
    },
    () => CHECKED_AT,
    fixedZoneRulesSource(),
    { emailSender: UNUSED_EMAIL_SENDER, schedules: false },
  );
}

describe("the Mercado Pago settlement report task the server sets up on a real Postgres", () => {
  it("requests the day's report from Mercado Pago when the task runs", async () => {
    const reports = new FakeMercadoPagoSettlementReports();
    const backgroundJobs = await setUp(reports);
    try {
      await backgroundJobs.workerUtils.addJob(MERCADO_PAGO_SETTLEMENT_REPORT_TASK_IDENTIFIER, {});

      await vi.waitFor(() => expect(reports.requests).toHaveLength(1), {
        timeout: 20_000,
        interval: 100,
      });
      expect(reports.requests[0]?.endDate).toEqual(CHECKED_AT);
    } finally {
      await backgroundJobs.close();
    }
  }, 90_000);
});
