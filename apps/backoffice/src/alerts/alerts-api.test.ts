import type { AlertDetail, AlertSummary } from "@purosur/contracts";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { closeAlert, fetchAlert, fetchAlerts, fetchAlertsOverview } from "./alerts-api";

function jsonResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  return new Response(
    body === undefined ? null : JSON.stringify(body),
    headers ? { status, headers } : { status },
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const alert: AlertSummary = {
  id: "alert-1",
  kind: "user_email_changed",
  scope: "user-1",
  scopeDisplay: "Lucía Pérez",
  level: "warning",
  audience: "all",
  openedAt: "2026-01-05T12:00:00.000Z",
  escalatedAt: null,
  resolvedAt: null,
};

const emptyListBody = {
  alerts: [],
  total: 0,
  pageSize: 25,
  openCount: 0,
  openCriticalCount: 0,
};

test("fetchAlerts answers one page of visible alerts and the open-alert counts on 200", async () => {
  const body = { alerts: [alert], total: 26, pageSize: 25, openCount: 3, openCriticalCount: 1 };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  const outcome = await fetchAlerts();

  expect(outcome).toEqual({ kind: "ok", value: body });
  expect(fetch).toHaveBeenCalledWith("/api/alerts");
});

test("fetchAlerts sends the level, open, page and search as query params", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, emptyListBody));

  await fetchAlerts({
    level: "critical",
    open: true,
    page: 2,
    search: { text: "recu", kinds: ["backoffice_recovery_requested", "user_email_changed"] },
  });

  expect(fetch).toHaveBeenCalledWith(
    "/api/alerts?level=critical&open=true&page=2&q=recu&kinds=backoffice_recovery_requested%2Cuser_email_changed",
  );
});

test.each([
  ["a list instead of a page", [alert]],
  ["a page without its page size", { ...emptyListBody, pageSize: undefined }],
  ["a page with a fractional total", { ...emptyListBody, total: 1.5 }],
  ["an alert with an unknown level", { ...emptyListBody, alerts: [{ ...alert, level: "info" }] }],
])("fetchAlerts reports failed when a 200 body is %s", async (_description, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  await expect(fetchAlerts()).resolves.toEqual({ kind: "failed" });
});

test("fetchAlerts reports failed when a 200 body is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }));

  await expect(fetchAlerts()).resolves.toEqual({ kind: "failed" });
});

test("fetchAlerts reports failed on any other error status", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500, { code: "internal" }));

  await expect(fetchAlerts()).resolves.toEqual({ kind: "failed" });
});

test("fetchAlerts reports forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "forbidden" }));

  await expect(fetchAlerts()).resolves.toEqual({ kind: "forbidden" });
});

test("fetchAlerts reports unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));

  await expect(fetchAlerts()).resolves.toEqual({ kind: "unauthenticated" });
});

test("fetchAlerts reports rate_limited with the retry time the response names", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "90" }));

  await expect(fetchAlerts()).resolves.toEqual({ kind: "rate_limited", retryAfterSeconds: 90 });
});

test("fetchAlerts reports failed when the request itself throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  await expect(fetchAlerts()).resolves.toEqual({ kind: "failed" });
});

const alertDetail: AlertDetail = {
  ...alert,
  detail: {
    previousEmail: "old@example.com",
    newEmail: "new@example.com",
    actorId: "admin-1",
    actorName: "Ada",
  },
  deliveries: [
    {
      channel: "backoffice",
      status: "sent",
      error: null,
      createdAt: "2026-01-05T12:00:00.000Z",
      recipient: {
        id: "user-2",
        firstName: "Grace",
        role: { id: "role-1", name: "Cajera", isAdministrator: false },
      },
    },
  ],
};

test("fetchAlert shows one alert's detail on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, alertDetail));

  const outcome = await fetchAlert("alert-1");

  expect(outcome).toEqual({ kind: "ok", value: alertDetail });
  expect(fetch).toHaveBeenCalledWith("/api/alerts/alert-1");
});

test.each([
  ["without its deliveries", { ...alertDetail, deliveries: undefined }],
  ["with an unknown audience", { ...alertDetail, audience: "everyone" }],
  ["that is a list", [alertDetail]],
])("fetchAlert reports failed when a 200 body is an alert %s", async (_description, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  await expect(fetchAlert("alert-1")).resolves.toEqual({ kind: "failed" });
});

test("fetchAlert reports not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  await expect(fetchAlert("alert-1")).resolves.toEqual({ kind: "not_found" });
});

test("fetchAlert reports rate_limited with the retry time the response names", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

  await expect(fetchAlert("alert-1")).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
});

test("fetchAlert reports forbidden on 403 and unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "forbidden" }));
  await expect(fetchAlert("alert-1")).resolves.toEqual({ kind: "forbidden" });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));
  await expect(fetchAlert("alert-1")).resolves.toEqual({ kind: "unauthenticated" });
});

test("fetchAlert reports failed when the request itself throws or the status is unexpected", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));
  await expect(fetchAlert("alert-1")).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(fetchAlert("alert-1")).resolves.toEqual({ kind: "failed" });
});

test("closeAlert is ok on 200 whatever the body says", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { unexpected: true }));

  await expect(closeAlert("alert-1")).resolves.toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/alerts/alert-1/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
});

test("closeAlert is ok on a 2xx answer without a body", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(204));

  await expect(closeAlert("alert-1")).resolves.toEqual({ kind: "ok" });
});

test("closeAlert reports already_closed on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "already_closed" }));

  await expect(closeAlert("alert-1")).resolves.toEqual({ kind: "already_closed" });
});

test("closeAlert reports forbidden on 403, for a viewer without dismiss_alerts_manually", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "forbidden" }));

  await expect(closeAlert("alert-1")).resolves.toEqual({ kind: "forbidden" });
});

test("closeAlert reports unauthenticated on 401 and not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));
  await expect(closeAlert("alert-1")).resolves.toEqual({ kind: "unauthenticated" });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));
  await expect(closeAlert("alert-1")).resolves.toEqual({ kind: "not_found" });
});

test("closeAlert reports rate_limited with the retry time the response names", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

  await expect(closeAlert("alert-1")).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 45,
  });
});

test("closeAlert reports failed on an unexpected status or when the request throws", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(closeAlert("alert-1")).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new Error("network down"));
  await expect(closeAlert("alert-1")).resolves.toEqual({ kind: "failed" });
});

const overview = {
  critical: { openCount: 1, kinds: ["user_access_increased"] },
  warning: { openCount: 2, kinds: ["backoffice_passkey_changed", "user_email_changed"] },
  informational: { openCount: 0, kinds: [] },
};

test("fetchAlertsOverview answers the open visible alerts of each level on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, overview));

  await expect(fetchAlertsOverview()).resolves.toEqual({ kind: "ok", value: overview });
  expect(fetch).toHaveBeenCalledWith("/api/alerts/overview");
});

test.each([
  ["a body without a level", { critical: overview.critical, warning: overview.warning }],
  ["a negative count", { ...overview, informational: { openCount: -1, kinds: [] } }],
])("fetchAlertsOverview reports failed when a 200 body is %s", async (_description, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  await expect(fetchAlertsOverview()).resolves.toEqual({ kind: "failed" });
});

test("fetchAlertsOverview reports failed when a 200 body is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }));

  await expect(fetchAlertsOverview()).resolves.toEqual({ kind: "failed" });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("fetchAlertsOverview answers a %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status, { code: "any" }));

  await expect(fetchAlertsOverview()).resolves.toEqual(outcome);
});

test("fetchAlertsOverview reports rate_limited with the retry time the response names", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "90" }));

  await expect(fetchAlertsOverview()).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 90,
  });
});

test("fetchAlertsOverview reports failed when the request itself throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  await expect(fetchAlertsOverview()).resolves.toEqual({ kind: "failed" });
});
