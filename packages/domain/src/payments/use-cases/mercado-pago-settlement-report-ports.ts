import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import type { SettlementMovement } from "../model/mercado-pago-settlement.js";

export interface SettlementReportRow extends SettlementMovement {
  externalReference: string | null;
  paymentMethod: string | null;
  paymentMethodType: string | null;
}

export type SettlementReportConfigurationReading =
  | { kind: "found" }
  | { kind: "outdated" }
  | { kind: "missing" }
  | { kind: "unavailable" };

export interface ListedSettlementReport {
  fileName: string;
  beginDate: Date;
  endDate: Date;
  createdAt: Date;
}

export interface MercadoPagoSettlementReports {
  readConfiguration(): Promise<SettlementReportConfigurationReading>;
  createConfiguration(): Promise<{ kind: "saved" } | { kind: "unavailable" }>;
  updateConfiguration(): Promise<{ kind: "saved" } | { kind: "unavailable" }>;
  requestReport(
    beginDate: Date,
    endDate: Date,
  ): Promise<{ kind: "requested" } | { kind: "refused" } | { kind: "unavailable" }>;
  listReports(): Promise<
    { kind: "listed"; reports: ListedSettlementReport[] } | { kind: "unavailable" }
  >;
  downloadReport(
    fileName: string,
  ): Promise<{ kind: "downloaded"; rows: SettlementReportRow[] } | { kind: "unavailable" }>;
}

export interface SettlementReportRequest {
  day: string;
  beginDate: Date;
  endDate: Date;
  requestedAt: Date;
  refused: boolean;
  recordedAt: Date | null;
}

export interface SettlementReportStore {
  requestOfDay(day: string): Promise<SettlementReportRequest | null>;
  recordRequest(request: Omit<SettlementReportRequest, "refused" | "recordedAt">): Promise<void>;
  recordRefusal(day: string): Promise<void>;
  recordRows(day: string, rows: SettlementReportRow[], recordedAt: Date): Promise<void>;
}

export interface SettlementReportLanes {
  inSettlementReportLane<TOutcome>(
    work: (store: SettlementReportStore) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface FollowMercadoPagoSettlementReportPorts {
  reports: MercadoPagoSettlementReports;
  lanes: SettlementReportLanes;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}
