// Same fallback the backoffice API rate limiter's other outcomes use (usersApi.ts, rolesApi.ts).
const RATE_LIMIT_FALLBACK_SECONDS = 60 * 60;

export type AlertLevel = "informational" | "warning" | "critical";
export type AlertAudience = "local" | "all";

export type AlertSummary = {
  id: string;
  kind: string;
  scope: string;
  /** `scope` as a person reads it: a user's first name for a user-scoped kind, the raw scope otherwise. */
  scopeDisplay: string;
  level: AlertLevel;
  audience: AlertAudience;
  openedAt: string;
  escalatedAt: string | null;
  resolvedAt: string | null;
};

export type AlertDeliveryRecipientRole = {
  id: string;
  name: string | null;
  isAdministrator: boolean;
};

export type AlertDelivery = {
  channel: string;
  status: string;
  error: string | null;
  createdAt: string;
  recipient: { id: string; firstName: string; role: AlertDeliveryRecipientRole };
};

export type AlertDetail = {
  id: string;
  kind: string;
  scope: string;
  scopeDisplay: string;
  level: AlertLevel;
  audience: AlertAudience;
  /** The kind's own fact payload, passed through as the cloud sends it (see alert-read-route.ts). */
  detail: Record<string, unknown>;
  openedAt: string;
  escalatedAt: string | null;
  resolvedAt: string | null;
  deliveries: AlertDelivery[];
};

export type AlertListQuery = {
  level?: AlertLevel;
  open?: boolean;
  /** 1-based. */
  page?: number;
  /** `kinds` lists the kinds whose own title matched `text`: those titles live only in this app's message catalog. */
  search?: { text: string; kinds: readonly string[] };
};

export type AlertListPage = {
  alerts: AlertSummary[];
  /** How many alerts matched the query, across every page. */
  total: number;
  pageSize: number;
  /** Every open alert the session can see, regardless of the query. */
  openCount: number;
  openCriticalCount: number;
};

export type FetchAlertsOutcome =
  | { kind: "ok"; value: AlertListPage }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type FetchAlertOutcome =
  | { kind: "ok"; value: AlertDetail }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type CloseAlertOutcome =
  | { kind: "ok"; value: AlertDetail }
  | { kind: "already_closed" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

function retryAfterSeconds(response: Response): number {
  const header = response.headers.get("Retry-After");
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : RATE_LIMIT_FALLBACK_SECONDS;
}

function alertSummaryFromWire(row: {
  id: string;
  kind: string;
  scope: string;
  scope_display: string;
  level: AlertLevel;
  audience: AlertAudience;
  opened_at: string;
  escalated_at: string | null;
  resolved_at: string | null;
}): AlertSummary {
  return {
    id: row.id,
    kind: row.kind,
    scope: row.scope,
    scopeDisplay: row.scope_display,
    level: row.level,
    audience: row.audience,
    openedAt: row.opened_at,
    escalatedAt: row.escalated_at,
    resolvedAt: row.resolved_at,
  };
}

function alertDeliveryFromWire(row: {
  channel: string;
  status: string;
  error: string | null;
  created_at: string;
  recipient: {
    id: string;
    first_name: string;
    role: { id: string; name: string | null; is_administrator: boolean };
  };
}): AlertDelivery {
  return {
    channel: row.channel,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    recipient: {
      id: row.recipient.id,
      firstName: row.recipient.first_name,
      role: {
        id: row.recipient.role.id,
        name: row.recipient.role.name,
        isAdministrator: row.recipient.role.is_administrator,
      },
    },
  };
}

function alertDetailFromWire(row: {
  id: string;
  kind: string;
  scope: string;
  scope_display: string;
  level: AlertLevel;
  audience: AlertAudience;
  detail: Record<string, unknown>;
  opened_at: string;
  escalated_at: string | null;
  resolved_at: string | null;
  deliveries: Array<Parameters<typeof alertDeliveryFromWire>[0]>;
}): AlertDetail {
  return {
    id: row.id,
    kind: row.kind,
    scope: row.scope,
    scopeDisplay: row.scope_display,
    level: row.level,
    audience: row.audience,
    detail: row.detail,
    openedAt: row.opened_at,
    escalatedAt: row.escalated_at,
    resolvedAt: row.resolved_at,
    deliveries: row.deliveries.map(alertDeliveryFromWire),
  };
}

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

type AlertListPageWire = {
  alerts: Array<Parameters<typeof alertSummaryFromWire>[0]>;
  total: number;
  page_size: number;
  open_count: number;
  open_critical_count: number;
};

function isAlertListPageWire(body: unknown): body is AlertListPageWire {
  return (
    typeof body === "object" &&
    body !== null &&
    "alerts" in body &&
    Array.isArray(body.alerts) &&
    "total" in body &&
    typeof body.total === "number" &&
    "page_size" in body &&
    typeof body.page_size === "number" &&
    "open_count" in body &&
    typeof body.open_count === "number" &&
    "open_critical_count" in body &&
    typeof body.open_critical_count === "number"
  );
}

/**
 * Lists one page of the alerts the session can see, filtered by level, open/closed status and
 * search text, plus the counts of every open one (`GET /alerts`).
 */
export async function fetchAlerts(listQuery: AlertListQuery = {}): Promise<FetchAlertsOutcome> {
  let response: Response;
  try {
    response = await fetch(`/alerts${queryString(listQuery)}`);
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
  const body: unknown = await response.json().catch(() => undefined);
  if (!isAlertListPageWire(body)) {
    return { kind: "failed" };
  }
  return {
    kind: "ok",
    value: {
      alerts: body.alerts.map(alertSummaryFromWire),
      total: body.total,
      pageSize: body.page_size,
      openCount: body.open_count,
      openCriticalCount: body.open_critical_count,
    },
  };
}

/** Reads one alert's detail, with its deliveries per recipient (`GET /alerts/:id`). */
export async function fetchAlert(id: string): Promise<FetchAlertOutcome> {
  let response: Response;
  try {
    response = await fetch(`/alerts/${id}`);
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
  const body = (await response.json().catch(() => undefined)) as
    | Parameters<typeof alertDetailFromWire>[0]
    | undefined;
  if (!body) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: alertDetailFromWire(body) };
}

/** Closes one alert by hand, gated by `dismiss_alerts_manually` (`POST /alerts/:id/close`). */
export async function closeAlert(id: string): Promise<CloseAlertOutcome> {
  let response: Response;
  try {
    response = await fetch(`/alerts/${id}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | Parameters<typeof alertDetailFromWire>[0]
      | undefined;
    if (!body) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: alertDetailFromWire(body) };
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
