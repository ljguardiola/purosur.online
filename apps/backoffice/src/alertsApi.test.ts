import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  type AlertDetail,
  type AlertSummary,
  closeAlert,
  fetchAlert,
  fetchAlerts,
} from "./alertsApi";

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

const alertRow = {
  id: "alert-1",
  kind: "user_email_changed",
  scope: "user-1",
  scope_display: "Lucía Pérez",
  level: "warning",
  audience: "all",
  opened_at: "2026-01-05T12:00:00.000Z",
  escalated_at: null,
  resolved_at: null,
};

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
  page_size: 25,
  open_count: 0,
  open_critical_count: 0,
};

test("fetchAlerts answers one page of visible alerts and the open-alert counts on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, {
      alerts: [alertRow],
      total: 26,
      page_size: 25,
      open_count: 3,
      open_critical_count: 1,
    }),
  );

  const outcome = await fetchAlerts();

  expect(outcome).toEqual({
    kind: "ok",
    value: { alerts: [alert], total: 26, pageSize: 25, openCount: 3, openCriticalCount: 1 },
  });
  expect(fetch).toHaveBeenCalledWith("/alerts");
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
    "/alerts?level=critical&open=true&page=2&q=recu&kinds=backoffice_recovery_requested%2Cuser_email_changed",
  );
});

test("fetchAlerts reports failed when the body isn't a list page", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [alertRow]));

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

test("fetchAlerts reports failed when the request itself throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  await expect(fetchAlerts()).resolves.toEqual({ kind: "failed" });
});

const deliveryRow = {
  channel: "backoffice",
  status: "sent",
  error: null,
  created_at: "2026-01-05T12:00:00.000Z",
  recipient: {
    id: "user-2",
    first_name: "Grace",
    role: { id: "role-1", name: "Cajera", is_administrator: false },
  },
};

const alertDetailRow = {
  ...alertRow,
  detail: {
    previousEmail: "old@example.com",
    newEmail: "new@example.com",
    actorId: "admin-1",
    actorName: "Ada",
  },
  deliveries: [deliveryRow],
};

const alertDetail: AlertDetail = {
  id: "alert-1",
  kind: "user_email_changed",
  scope: "user-1",
  scopeDisplay: "Lucía Pérez",
  level: "warning",
  audience: "all",
  openedAt: "2026-01-05T12:00:00.000Z",
  escalatedAt: null,
  resolvedAt: null,
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
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, alertDetailRow));

  const outcome = await fetchAlert("alert-1");

  expect(outcome).toEqual({ kind: "ok", value: alertDetail });
  expect(fetch).toHaveBeenCalledWith("/alerts/alert-1");
});

test("fetchAlert reports not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  await expect(fetchAlert("alert-1")).resolves.toEqual({ kind: "not_found" });
});

test("closeAlert shows the closed alert's detail on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, alertDetailRow));

  const outcome = await closeAlert("alert-1");

  expect(outcome).toEqual({ kind: "ok", value: alertDetail });
  expect(fetch).toHaveBeenCalledWith("/alerts/alert-1/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
});

test("closeAlert reports already_closed on 409", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "already_closed" }));

  await expect(closeAlert("alert-1")).resolves.toEqual({ kind: "already_closed" });
});

test("closeAlert reports forbidden on 403, for a viewer without dismiss_alerts_manually", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "forbidden" }));

  await expect(closeAlert("alert-1")).resolves.toEqual({ kind: "forbidden" });
});
