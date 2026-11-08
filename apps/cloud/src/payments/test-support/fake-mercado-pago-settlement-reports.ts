import type {
  ListedSettlementReport,
  MercadoPagoSettlementReports,
  SettlementReportConfigurationReading,
  SettlementReportRow,
} from "@purosur/domain/payments/use-cases";

export class FakeMercadoPagoSettlementReports implements MercadoPagoSettlementReports {
  readonly configurationReadings: number[] = [];
  readonly configurationCreations: number[] = [];
  readonly configurationUpdates: number[] = [];
  readonly requests: { beginDate: Date; endDate: Date }[] = [];
  readonly listings: number[] = [];
  readonly downloads: string[] = [];
  configuration: SettlementReportConfigurationReading = { kind: "found" };
  creation: { kind: "saved" } | { kind: "unavailable" } = { kind: "saved" };
  update: { kind: "saved" } | { kind: "unavailable" } = { kind: "saved" };
  request: { kind: "requested" } | { kind: "refused" } | { kind: "unavailable" } = {
    kind: "requested",
  };
  listing: { kind: "listed"; reports: ListedSettlementReport[] } | { kind: "unavailable" } = {
    kind: "listed",
    reports: [],
  };
  download: { kind: "downloaded"; rows: SettlementReportRow[] } | { kind: "unavailable" } = {
    kind: "downloaded",
    rows: [],
  };

  async readConfiguration(): Promise<SettlementReportConfigurationReading> {
    this.configurationReadings.push(this.configurationReadings.length);
    return this.configuration;
  }

  async createConfiguration(): Promise<{ kind: "saved" } | { kind: "unavailable" }> {
    this.configurationCreations.push(this.configurationCreations.length);
    return this.creation;
  }

  async updateConfiguration(): Promise<{ kind: "saved" } | { kind: "unavailable" }> {
    this.configurationUpdates.push(this.configurationUpdates.length);
    return this.update;
  }

  async requestReport(
    beginDate: Date,
    endDate: Date,
  ): Promise<{ kind: "requested" } | { kind: "refused" } | { kind: "unavailable" }> {
    this.requests.push({ beginDate, endDate });
    return this.request;
  }

  async listReports(): Promise<
    { kind: "listed"; reports: ListedSettlementReport[] } | { kind: "unavailable" }
  > {
    this.listings.push(this.listings.length);
    return this.listing;
  }

  async downloadReport(
    fileName: string,
  ): Promise<{ kind: "downloaded"; rows: SettlementReportRow[] } | { kind: "unavailable" }> {
    this.downloads.push(fileName);
    return this.download;
  }
}
