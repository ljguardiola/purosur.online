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

export type AlertListFilters = {
  level?: AlertLevel;
  open?: boolean;
};

export type FetchAlertsOutcome =
  | { kind: "ok"; value: AlertSummary[] }
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

function queryString(filters: AlertListFilters): string {
  const params = new URLSearchParams();
  if (filters.level) {
    params.set("level", filters.level);
  }
  if (filters.open !== undefined) {
    params.set("open", filters.open ? "true" : "false");
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Lists every alert the session can see, filtered by level and open/closed status (`GET /alerts`). */
export async function fetchAlerts(filters: AlertListFilters = {}): Promise<FetchAlertsOutcome> {
  let response: Response;
  try {
    response = await fetch(`/alerts${queryString(filters)}`);
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
  const body = (await response.json().catch(() => undefined)) as
    | Array<Parameters<typeof alertSummaryFromWire>[0]>
    | undefined;
  if (!Array.isArray(body)) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: body.map(alertSummaryFromWire) };
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
