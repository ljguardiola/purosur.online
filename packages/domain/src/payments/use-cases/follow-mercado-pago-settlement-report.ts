import { argentinaCalendarDay } from "../../shared/index.js";
import { isChargeMovement, settlementReportWindow } from "../model/mercado-pago-settlement.js";
import type {
  FollowMercadoPagoSettlementReportPorts,
  MercadoPagoSettlementReports,
  SettlementReportRequest,
  SettlementReportStore,
} from "./mercado-pago-settlement-report-ports.js";

export type FollowMercadoPagoSettlementReportOutcome =
  | { kind: "already_recorded" }
  | { kind: "requested" }
  | { kind: "refused" }
  | { kind: "waiting" }
  | { kind: "recorded"; rows: number }
  | { kind: "unavailable" };

async function ensureConfiguration(
  reports: MercadoPagoSettlementReports,
): Promise<"ready" | "unavailable"> {
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
  reports: MercadoPagoSettlementReports,
  store: SettlementReportStore,
  day: string,
  now: Date,
): Promise<FollowMercadoPagoSettlementReportOutcome> {
  if ((await ensureConfiguration(reports)) === "unavailable") {
    return { kind: "unavailable" };
  }
  const { beginDate, endDate } = settlementReportWindow(now);
  await store.recordRequest({ day, beginDate, endDate, requestedAt: now });
  const requested = await reports.requestReport(beginDate, endDate);
  if (requested.kind === "refused") {
    await store.recordRefusal(day);
  }
  return { kind: requested.kind };
}

async function recordTodaysReport(
  reports: MercadoPagoSettlementReports,
  store: SettlementReportStore,
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
  return ports.lanes.inSettlementReportLane(async (store) => {
    const now = ports.clock.now();
    const day = argentinaCalendarDay(now, ports.zoneRules.zoneRules());
    const request = await store.requestOfDay(day);
    if (request === null) {
      return requestTodaysReport(ports.reports, store, day, now);
    }
    if (request.recordedAt !== null) {
      return { kind: "already_recorded" };
    }
    if (request.refused) {
      return { kind: "refused" };
    }
    return recordTodaysReport(ports.reports, store, request, now);
  });
}
