import type {
  SettlementReportRequest,
  SettlementReportRow,
  SettlementReportStore,
} from "../mercado-pago-settlement-report-ports.js";

export class FakeSettlementReportStore implements SettlementReportStore {
  readonly requests = new Map<string, SettlementReportRequest>();
  readonly rows = new Map<string, SettlementReportRow>();
  readonly writes: string[] = [];
  failOn: "recordRequest" | undefined;

  async requestOfDay(day: string): Promise<SettlementReportRequest | null> {
    return this.requests.get(day) ?? null;
  }

  async recordRequest(
    request: Omit<SettlementReportRequest, "refused" | "recordedAt">,
  ): Promise<void> {
    if (this.failOn === "recordRequest") {
      throw new Error("recordRequest failed");
    }
    this.writes.push("recordRequest");
    this.requests.set(request.day, { ...request, refused: false, recordedAt: null });
  }

  async recordRefusal(day: string): Promise<void> {
    this.writes.push("recordRefusal");
    const request = this.requests.get(day);
    if (request !== undefined) {
      this.requests.set(day, { ...request, refused: true });
    }
  }

  async recordRows(day: string, rows: SettlementReportRow[], recordedAt: Date): Promise<void> {
    this.writes.push("recordRows");
    for (const row of rows) {
      this.rows.set(row.sourceId, row);
    }
    const request = this.requests.get(day);
    if (request !== undefined) {
      this.requests.set(day, { ...request, recordedAt });
    }
  }
}
