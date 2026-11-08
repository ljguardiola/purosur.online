import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mercadoPagoSettlementMovements } from "../platform/db/schema.js";
import { scheduleOfCrontabLine } from "../platform/test-support/crontab-schedule.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import {
  MERCADO_PAGO_SETTLEMENT_REPORT_TASK_IDENTIFIER,
  mercadoPagoSettlementReportJobs,
} from "./mercado-pago-settlement-report-task.js";
import { FakeMercadoPagoSettlementReports } from "./test-support/fake-mercado-pago-settlement-reports.js";
import {
  insertSettlementMovements,
  settlementRow,
} from "./test-support/settlement-movement-fixtures.js";

const NOW = new Date("2026-10-09T15:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

function runner(reports: FakeMercadoPagoSettlementReports) {
  const jobs = mercadoPagoSettlementReportJobs({
    now: () => NOW,
    reports,
    connections: { withConnection: (work) => work(testDatabase.db) },
    zoneRules: fixedZoneRulesSource(),
  });
  const task = jobs.taskList[MERCADO_PAGO_SETTLEMENT_REPORT_TASK_IDENTIFIER];
  if (!task) {
    throw new Error("test setup: expected the registered settlement report task");
  }
  return async () => {
    const { helpers, logs } = buildJobHelpers();
    await task({}, helpers);
    return logs;
  };
}

describe("mercadoPagoSettlementReportJobs", () => {
  it("registers the settlement report task and runs it every hour", () => {
    const jobs = mercadoPagoSettlementReportJobs({
      now: () => NOW,
      reports: new FakeMercadoPagoSettlementReports(),
      connections: { withConnection: (work) => work(testDatabase.db) },
      zoneRules: fixedZoneRulesSource(),
    });

    expect(jobs.taskList[MERCADO_PAGO_SETTLEMENT_REPORT_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    const schedules = jobs.crontab.map(scheduleOfCrontabLine);
    expect(schedules.map((schedule) => schedule.task)).toEqual([
      MERCADO_PAGO_SETTLEMENT_REPORT_TASK_IDENTIFIER,
    ]);
    expect(new Set(schedules[0]?.gapsMs)).toEqual(new Set([HOUR_MS]));
  });

  it("requests the report of the day on its first run and logs only the outcome kind", async () => {
    const reports = new FakeMercadoPagoSettlementReports();

    const logs = await runner(reports)();

    expect(reports.requests).toHaveLength(1);
    expect(reports.requests[0]?.endDate).toEqual(NOW);
    expect(logs.map((line) => line.message).join("\n")).toContain("requested");
  });

  it("records the rows of the downloaded report into the settlement tables on a later run", async () => {
    const reports = new FakeMercadoPagoSettlementReports();
    const run = runner(reports);
    await run();
    const requested = reports.requests[0];
    if (!requested) {
      throw new Error("test setup: expected the first run to request the report");
    }
    reports.listing = {
      kind: "listed",
      reports: [
        {
          fileName: "report.csv",
          beginDate: requested.beginDate,
          endDate: requested.endDate,
          createdAt: NOW,
        },
      ],
    };
    reports.download = { kind: "downloaded", rows: [settlementRow({ sourceId: "PAY9" })] };

    await run();

    expect(reports.downloads).toEqual(["report.csv"]);
    const stored = await testDatabase.db.select().from(mercadoPagoSettlementMovements);
    expect(stored.map((row) => row.sourceId)).toEqual(["PAY9"]);
  });

  it("leaves the stored rows untouched when Mercado Pago is unavailable", async () => {
    await insertSettlementMovements(testDatabase.db, [settlementRow({ sourceId: "PAY1" })]);
    const reports = new FakeMercadoPagoSettlementReports();
    reports.configuration = { kind: "unavailable" };

    const logs = await runner(reports)();

    const stored = await testDatabase.db.select().from(mercadoPagoSettlementMovements);
    expect(stored.map((row) => row.sourceId)).toEqual(["PAY1"]);
    expect(reports.requests).toEqual([]);
    expect(logs.map((line) => line.message).join("\n")).toContain("unavailable");
  });
});
