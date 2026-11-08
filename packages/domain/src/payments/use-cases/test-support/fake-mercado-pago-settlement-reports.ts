import type {
  ListedSettlementReport,
  MercadoPagoSettlementReports,
  SettlementReportConfigurationReading,
  SettlementReportRow,
} from "../mercado-pago-settlement-report-ports.js";

type Writing = { kind: "saved" } | { kind: "unavailable" };

export class FakeMercadoPagoSettlementReports implements MercadoPagoSettlementReports {
  configuration: SettlementReportConfigurationReading = { kind: "found" };
  creating: Writing = { kind: "saved" };
  updating: Writing = { kind: "saved" };
  requesting: { kind: "requested" } | { kind: "refused" } | { kind: "unavailable" } = {
    kind: "requested",
  };
  listing: { kind: "listed"; reports: ListedSettlementReport[] } | { kind: "unavailable" } = {
    kind: "listed",
    reports: [],
  };
  readonly downloads = new Map<string, SettlementReportRow[]>();
  downloadUnavailable = false;

  readonly calls: string[] = [];
  readonly requestedWindows: { beginDate: Date; endDate: Date }[] = [];
  readonly downloadedFiles: string[] = [];

  async readConfiguration(): Promise<SettlementReportConfigurationReading> {
    this.calls.push("readConfiguration");
    return this.configuration;
  }

  async createConfiguration(): Promise<Writing> {
    this.calls.push("createConfiguration");
    return this.creating;
  }

  async updateConfiguration(): Promise<Writing> {
    this.calls.push("updateConfiguration");
    return this.updating;
  }

  async requestReport(beginDate: Date, endDate: Date) {
    this.calls.push("requestReport");
    this.requestedWindows.push({ beginDate, endDate });
    return this.requesting;
  }

  async listReports() {
    this.calls.push("listReports");
    return this.listing;
  }

  async downloadReport(fileName: string) {
    this.calls.push("downloadReport");
    this.downloadedFiles.push(fileName);
    if (this.downloadUnavailable) {
      return { kind: "unavailable" as const };
    }
    return { kind: "downloaded" as const, rows: this.downloads.get(fileName) ?? [] };
  }
}
