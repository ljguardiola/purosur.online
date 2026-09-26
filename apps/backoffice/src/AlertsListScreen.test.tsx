import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { AlertsListScreen, type AlertsListScreenServices } from "./AlertsListScreen";
import type { BackofficeAccess } from "./access";
import type { AlertDetail, AlertListPage, AlertSummary, FetchAlertsOutcome } from "./alertsApi";

const ADMINISTRATOR_ACCESS: BackofficeAccess = { isAdministrator: true, permissions: [] };

function createServices(
  overrides: Partial<AlertsListScreenServices> = {},
): AlertsListScreenServices {
  return {
    fetchAlerts: vi.fn(),
    alertDetailModal: {
      fetchAlert: vi.fn().mockReturnValue(new Promise<never>(() => {})),
      closeAlert: vi.fn(),
    },
    ...overrides,
  };
}

const passkeyAlert: AlertSummary = {
  id: "alert-1",
  kind: "backoffice_passkey_changed",
  scope: "user-1",
  scopeDisplay: "Lucía Pérez",
  level: "warning",
  audience: "all",
  openedAt: "2026-01-05T12:00:00.000Z",
  escalatedAt: null,
  resolvedAt: null,
};

const lockoutAlert: AlertSummary = {
  id: "alert-2",
  kind: "backoffice_sign_in_lockout",
  scope: "203.0.113.5",
  scopeDisplay: "203.0.113.5",
  level: "critical",
  audience: "all",
  openedAt: "2026-01-05T10:00:00.000Z",
  escalatedAt: "2026-01-06T10:00:00.000Z",
  resolvedAt: null,
};

function ok(
  alerts: AlertSummary[],
  page: Partial<Omit<AlertListPage, "alerts">> = {},
): FetchAlertsOutcome {
  return {
    kind: "ok",
    value: {
      alerts,
      total: alerts.length,
      pageSize: 25,
      openCount: alerts.filter((alert) => alert.resolvedAt === null).length,
      openCriticalCount: alerts.filter(
        (alert) => alert.resolvedAt === null && alert.level === "critical",
      ).length,
      ...page,
    },
  };
}

function renderScreen(
  services: AlertsListScreenServices,
  onSessionEnded: () => void = () => {},
  access: BackofficeAccess = ADMINISTRATOR_ACCESS,
) {
  return render(
    <main>
      <AlertsListScreen services={services} onSessionEnded={onSessionEnded} access={access} />
    </main>,
  );
}

test("shows the breadcrumb, heading, each alert's level/kind/scope/opened date, the pill, and the footer", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert, lockoutAlert]));

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Inicio")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Alertas", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("2 alertas abiertas").first()).toBeVisible();
  const passkeyRow = screen.getByRole("row", { name: /Lucía Pérez/ });
  const lockoutRow = screen.getByRole("row", { name: /203\.0\.113\.5/ });
  await expect.element(passkeyRow.getByText("Advertencia")).toBeVisible();
  await expect.element(lockoutRow.getByText("Crítica")).toBeVisible();
  await expect.element(passkeyRow.getByText("Passkey")).toBeVisible();
  await expect.element(passkeyRow.getByText("Lucía Pérez")).toBeVisible();
  await expect.element(lockoutRow.getByText("203.0.113.5")).toBeVisible();
  await expect.element(screen.getByText("2 alertas abiertas · 1 crítica")).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});

test("hides the header pill and shows the blank empty state when there are no open alerts", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([]));

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Sin alertas abiertas")).toBeVisible();
  expect(screen.getByText("alertas abiertas").query()).toBeNull();
});

test("makes one request per load, carrying the open-alert counts beyond the rows shown", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(
    ok([passkeyAlert], { total: 1, openCount: 4, openCriticalCount: 2 }),
  );

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("4 alertas abiertas · 2 críticas")).toBeVisible();
  await expect.element(screen.getByText("4 alertas abiertas", { exact: true })).toBeVisible();
  expect(services.fetchAlerts).toHaveBeenCalledTimes(1);
  expect(services.fetchAlerts).toHaveBeenCalledWith({ open: true, page: 1 });
});

test("searches server-side by the typed text, sending the kinds whose title matches it", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert, lockoutAlert]));
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();

  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert]));
  await userEvent.fill(screen.getByPlaceholder("Buscar una alerta"), " passkey ");

  await expect
    .poll(() => vi.mocked(services.fetchAlerts).mock.calls)
    .toContainEqual([
      { open: true, page: 1, search: { text: "passkey", kinds: ["backoffice_passkey_changed"] } },
    ]);
  await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();
  expect(screen.getByText("203.0.113.5").query()).toBeNull();
});

test("pages through the alerts, going back to the first page when a filter changes", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert], { total: 30 }));
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Página 2" }));

  await expect
    .poll(() => vi.mocked(services.fetchAlerts).mock.calls)
    .toContainEqual([{ open: true, page: 2 }]);
  await expect
    .element(screen.getByRole("button", { name: "Página 2" }))
    .toHaveAttribute("aria-current", "page");

  await screen.getByRole("button", { name: /Nivel/ }).click();
  await screen.getByRole("option", { name: "Crítica" }).click();

  await expect
    .poll(() => vi.mocked(services.fetchAlerts).mock.calls)
    .toContainEqual([{ level: "critical", open: true, page: 1 }]);
});

test("drops a late response once the filters have changed since it was sent", async () => {
  const services = createServices();
  let resolveFirst: (outcome: FetchAlertsOutcome) => void = () => {};
  vi.mocked(services.fetchAlerts)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    )
    .mockResolvedValue(ok([lockoutAlert]));
  const screen = await renderScreen(services);

  await screen.getByRole("button", { name: /Nivel/ }).click();
  await screen.getByRole("option", { name: "Crítica" }).click();
  await expect.element(screen.getByText("203.0.113.5")).toBeVisible();
  resolveFirst(ok([passkeyAlert]));

  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.getByText("Lucía Pérez").query()).toBeNull();
  await expect.element(screen.getByText("203.0.113.5")).toBeVisible();
});

test("re-fetches with the chosen level when the Nivel filter changes", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert]));
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Passkey")).toBeVisible();

  await screen.getByRole("button", { name: /Nivel/ }).click();
  await screen.getByRole("option", { name: "Crítica" }).click();

  await expect
    .poll(() => vi.mocked(services.fetchAlerts).mock.calls)
    .toContainEqual([{ level: "critical", open: true, page: 1 }]);
});

test("re-fetches closed alerts when the Estado filter changes", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert]));
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Passkey")).toBeVisible();

  await screen.getByRole("button", { name: /Estado/ }).click();
  await screen.getByRole("option", { name: "Cerradas" }).click();

  await expect
    .poll(() => vi.mocked(services.fetchAlerts).mock.calls)
    .toContainEqual([{ open: false, page: 1 }]);
});

const passkeyDetail: AlertDetail = {
  id: "alert-1",
  kind: "backoffice_passkey_changed",
  scope: "user-1",
  scopeDisplay: "Lucía Pérez",
  level: "warning",
  audience: "all",
  detail: { action: "registered", passkeyName: "Teléfono de Lucía", via: "self" },
  openedAt: "2026-01-05T12:00:00.000Z",
  escalatedAt: null,
  resolvedAt: null,
  deliveries: [],
};

test("the eye action opens the detail modal for that alert", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert]));
  const fetchAlert = vi.fn().mockResolvedValue({ kind: "ok", value: passkeyDetail });
  services.alertDetailModal = { fetchAlert, closeAlert: vi.fn() };
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Passkey")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Ver la alerta/ }));

  await expect.element(screen.getByText("Se registró una passkey")).toBeVisible();
  expect(fetchAlert).toHaveBeenCalledWith("alert-1");
});

test("ends the session when the alerts request comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded).toHaveBeenCalled();
});

test("navigates to Mi cuenta when the alerts request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});
