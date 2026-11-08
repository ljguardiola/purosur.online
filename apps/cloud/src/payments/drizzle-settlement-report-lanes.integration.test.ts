import {
  type FollowMercadoPagoSettlementReportPorts,
  followMercadoPagoSettlementReport,
} from "@purosur/domain/payments/use-cases";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { DrizzleSettlementReportLanes } from "./drizzle-settlement-report-lanes.js";
import { FakeMercadoPagoSettlementReports } from "./test-support/fake-mercado-pago-settlement-reports.js";

const NOW = new Date("2026-10-09T15:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("settlement_report_lanes");
  sql = postgres(integrationDb.databaseUrl, { max: 8 });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

class HeldSettlementReports extends FakeMercadoPagoSettlementReports {
  private readonly releases: (() => void)[] = [];

  override async requestReport(beginDate: Date, endDate: Date) {
    const answer = super.requestReport(beginDate, endDate);
    await new Promise<void>((resolve) => this.releases.push(resolve));
    return answer;
  }

  releaseAll(): void {
    for (const release of this.releases.splice(0)) {
      release();
    }
  }
}

function portsOf(
  reports: FakeMercadoPagoSettlementReports,
): FollowMercadoPagoSettlementReportPorts {
  return {
    reports,
    lanes: new DrizzleSettlementReportLanes(postgresDedicatedConnections(sql)),
    clock: { now: () => NOW },
    zoneRules: fixedZoneRulesSource(),
  };
}

function storedRequests() {
  return sql<{ day: string; refused: boolean }[]>`
    select day, refused from mercado_pago_settlement_report_requests`;
}

describe("the settlement report lanes on a real Postgres", () => {
  it("keeps the day's request committed and visible while Mercado Pago is asked, and asks once for two runs at the same time", async () => {
    const reports = new HeldSettlementReports();
    const ports = portsOf(reports);

    const first = followMercadoPagoSettlementReport(ports);
    await vi.waitFor(() => expect(reports.requests).toHaveLength(1));
    expect(await storedRequests()).toEqual([{ day: "2026-10-09", refused: false }]);
    const second = followMercadoPagoSettlementReport(ports);
    await waitForLockWaiters(sql, 1);

    reports.releaseAll();

    expect(await first).toEqual({ kind: "requested" });
    expect(await second).toEqual({ kind: "waiting" });
    expect(reports.requests).toHaveLength(1);
  });
});
