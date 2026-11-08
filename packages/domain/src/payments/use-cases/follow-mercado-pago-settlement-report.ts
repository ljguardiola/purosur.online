import { argentinaCalendarDay } from "../../shared/index.js";
import {
  isChargeMovement,
  MERCADO_PAGO_SETTLEMENT_REPORT_DAYS,
} from "../model/mercado-pago-settlement.js";
import type {
  FollowMercadoPagoSettlementReportPorts,
  SettlementReportRequest,
} from "./mercado-pago-settlement-report-ports.js";

export type FollowMercadoPagoSettlementReportOutcome =
  | { kind: "already_recorded" }
  | { kind: "requested" }
  | { kind: "refused" }
  | { kind: "waiting" }
  | { kind: "recorded"; rows: number }
  | { kind: "unavailable" };

const DAY_MS = 24 * 60 * 60 * 1000;

async function ensureConfiguration({
  reports,
}: FollowMercadoPagoSettlementReportPorts): Promise<"ready" | "unavailable"> {
  const reading = await reports.readConfiguration();
  if (reading.kind === "unavailable") {
    return "unavailable";
  }
  if (reading.kind === "found") {
    return "ready";
  }
  const saved =
    reading.kind === "missing"
      ? await reports.createConfiguration()
      : await reports.updateConfiguration();
  return saved.kind === "saved" ? "ready" : "unavailable";
}

async function requestTodaysReport(
  ports: FollowMercadoPagoSettlementReportPorts,
  day: string,
  now: Date,
): Promise<FollowMercadoPagoSettlementReportOutcome> {
  if ((await ensureConfiguration(ports)) === "unavailable") {
    return { kind: "unavailable" };
  }
  const beginDate = new Date(now.getTime() - MERCADO_PAGO_SETTLEMENT_REPORT_DAYS * DAY_MS);
  const requested = await ports.reports.requestReport(beginDate, now);
  if (requested.kind === "unavailable") {
    return { kind: "unavailable" };
  }
  await ports.store.recordRequest({
    day,
    beginDate,
    endDate: now,
    requestedAt: now,
    refused: requested.kind === "refused",
  });
  return { kind: requested.kind };
}

async function recordTodaysReport(
  { reports, store }: FollowMercadoPagoSettlementReportPorts,
  request: SettlementReportRequest,
  now: Date,
): Promise<FollowMercadoPagoSettlementReportOutcome> {
  const listing = await reports.listReports();
  if (listing.kind === "unavailable") {
    return { kind: "unavailable" };
  }
  let report: (typeof listing.reports)[number] | null = null;
  for (const listed of listing.reports) {
    if (
      listed.beginDate.getTime() === request.beginDate.getTime() &&
      (report === null || listed.createdAt > report.createdAt)
    ) {
      report = listed;
    }
  }
  if (report === null) {
    return { kind: "waiting" };
  }
  const downloaded = await reports.downloadReport(report.fileName);
  if (downloaded.kind === "unavailable") {
    return { kind: "unavailable" };
  }
  const kept = downloaded.rows.filter((row) => isChargeMovement(row.transactionType));
  await store.recordRows(request.day, kept, now);
  return { kind: "recorded", rows: kept.length };
}

export async function followMercadoPagoSettlementReport(
  ports: FollowMercadoPagoSettlementReportPorts,
): Promise<FollowMercadoPagoSettlementReportOutcome> {
  const now = ports.clock.now();
  const day = argentinaCalendarDay(now, ports.zoneRules.zoneRules());
  const request = await ports.store.requestOfDay(day);
  if (request === null) {
    return requestTodaysReport(ports, day, now);
  }
  if (request.recordedAt !== null) {
    return { kind: "already_recorded" };
  }
  if (request.refused) {
    return { kind: "refused" };
  }
  return recordTodaysReport(ports, request, now);
}
