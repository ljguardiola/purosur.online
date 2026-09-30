import {
  type AlertDetail,
  type AlertListPage,
  type AlertsOverview,
  alertDetailSchema,
  alertListPageSchema,
  alertsOverviewSchema,
} from "@purosur/contracts";
import type { AlertLevel } from "@purosur/domain";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { retryAfterSeconds } from "../platform/retry-after-seconds";

export type AlertListQuery = {
  level?: AlertLevel;
  open?: boolean;
  // 1-based.
  page?: number;
  // `kinds` lists the kinds whose own title matched `text`: those titles exist only in this app, so the cloud cannot match them itself.
  search?: { text: string; kinds: readonly string[] };
};

export type FetchAlertsOutcome = CloudReadOutcome<AlertListPage>;

export type FetchAlertsOverviewOutcome = CloudReadOutcome<AlertsOverview>;

export type FetchAlertOutcome = CloudReadOutcome<AlertDetail> | { kind: "not_found" };

export type CloseAlertOutcome =
  | { kind: "ok" }
  | { kind: "already_closed" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

function queryString(listQuery: AlertListQuery): string {
  const params = new URLSearchParams();
  if (listQuery.level) {
    params.set("level", listQuery.level);
  }
  if (listQuery.open !== undefined) {
    params.set("open", listQuery.open ? "true" : "false");
  }
  if (listQuery.page !== undefined) {
    params.set("page", String(listQuery.page));
  }
  if (listQuery.search) {
    params.set("q", listQuery.search.text);
    params.set("kinds", listQuery.search.kinds.join(","));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function fetchAlerts(listQuery: AlertListQuery = {}): Promise<FetchAlertsOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/alerts${queryString(listQuery)}`);
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const parsed = alertListPageSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

export async function fetchAlertsOverview(): Promise<FetchAlertsOverviewOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/alerts/overview");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const parsed = alertsOverviewSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

export async function fetchAlert(id: string): Promise<FetchAlertOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/alerts/${id}`);
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 429) {
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const parsed = alertDetailSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

export async function closeAlert(id: string): Promise<CloseAlertOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/alerts/${id}/closure`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    return { kind: "already_closed" };
  }
  if (response.status === 429) {
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  return { kind: "failed" };
}
