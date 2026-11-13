import type { AlertSummary, AlertsOverview, PriceList } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { FetchAlertsOverviewOutcome } from "../alerts/alerts-api";
import { type AlertsListFilters, alertsListFilters } from "../alerts/routes";
import { fiscalTasks, noFiscalTasks } from "../fiscal/test-support/fiscal-task-fixtures";
import type {
  FetchRegisterSyncStatusOutcome,
  RegisterSyncStatus,
} from "../installation/registers-api";
import {
  noPendingRefunds,
  pendingRefundsWithUnconfirmedCloudRefund,
} from "../payments/test-support/refund-fixtures";
import type { BackofficeAccess } from "./backoffice-access";
import { HomeScreen } from "./home-screen";
import type { HomeScreenServices } from "./home-screen-services";
import { accessWith, NO_CAPABILITIES_ACCESS } from "./test-support/backoffice-access";
import { shownEyebrow } from "./test-support/eyebrow";
import { render } from "./test-support/render-with-router";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const overview: AlertsOverview = {
  critical: { openCount: 1, kinds: ["user_access_increased"], localKinds: [] },
  warning: { openCount: 2, kinds: ["user_email_changed"], localKinds: [] },
  informational: { openCount: 0, kinds: [], localKinds: [] },
};

const NOTHING_OPEN: AlertsOverview = {
  critical: { openCount: 0, kinds: [], localKinds: [] },
  warning: { openCount: 0, kinds: [], localKinds: [] },
  informational: { openCount: 0, kinds: [], localKinds: [] },
};

const passkeyAlert: AlertSummary = {
  id: "alert-1",
  kind: "backoffice_passkey_changed",
  scope: "user-1",
  scopeDisplay: "Lucía Pérez",
  scopeKind: "user",
  level: "warning",
  audience: "all",
  openedAt: "2026-01-05T12:00:00.000Z",
  escalatedAt: null,
  resolvedAt: null,
  salesDeniedReason: null,
  refundAmount: null,
  refundMethod: null,
};

const priceList = (pendingCount: number): PriceList => ({
  products: [],
  categories: [],
  pendingCount,
  activeProductCount: 10,
  reviewWindowDays: 30,
});

const neverSynced: RegisterSyncStatus = {
  id: "register-1",
  name: "Caja 1",
  lastSuccessfulSyncAt: null,
  battery: null,
  disk: null,
};

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function createServices(): HomeScreenServices {
  return {
    fetchAlertsOverview: vi
      .fn<HomeScreenServices["fetchAlertsOverview"]>()
      .mockResolvedValue({ kind: "ok", value: overview }),
    fetchRegisterSyncStatus: vi
      .fn<HomeScreenServices["fetchRegisterSyncStatus"]>()
      .mockResolvedValue({ kind: "ok", value: [neverSynced] }),
    fetchAlerts: vi.fn<HomeScreenServices["fetchAlerts"]>().mockResolvedValue({
      kind: "ok",
      value: {
        alerts: [passkeyAlert],
        total: 1,
        pageSize: 25,
      },
    }),
    fetchFiscalTasks: vi
      .fn<HomeScreenServices["fetchFiscalTasks"]>()
      .mockResolvedValue({ kind: "ok", value: noFiscalTasks }),
    fetchPendingRefunds: vi
      .fn<HomeScreenServices["fetchPendingRefunds"]>()
      .mockResolvedValue({ kind: "ok", value: noPendingRefunds }),
    fetchPrices: vi
      .fn<HomeScreenServices["fetchPrices"]>()
      .mockResolvedValue({ kind: "ok", value: priceList(0) }),
  };
}

function renderScreen(
  services: HomeScreenServices,
  {
    access = accessWith("alerts_area"),
    onSessionEnded = () => {},
    filters = alertsListFilters.parse({}),
    onFiltersChange = () => {},
  }: {
    access?: BackofficeAccess;
    onSessionEnded?: () => void;
    filters?: AlertsListFilters;
    onFiltersChange?: (filters: AlertsListFilters) => void;
  } = {},
) {
  return render(
    <main>
      <HomeScreen
        access={access}
        onSessionEnded={onSessionEnded}
        services={services}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
    </main>,
  );
}

test("shows Inicio with the open alerts' total, the alerts by level, the alert list and each register's last sync", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
  expect(shownEyebrow()).toBeNull();
  await expect.element(screen.getByText("3 alertas abiertas", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Alertas abiertas", level: 2 }))
    .toBeVisible();
  await expect.element(screen.getByRole("link", { name: /^Advertencias 2/ })).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Lista de alertas", level: 2 }))
    .toBeVisible();
  await expect.element(screen.getByRole("row", { name: /Lucía Pérez/ })).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Estado de las cajas", level: 2 }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("row", { name: /^Caja 1 Nunca sincronizó Sin datos Sin datos$/ }))
    .toBeVisible();
  expect(services.fetchAlertsOverview).toHaveBeenCalledTimes(1);
  expect(services.fetchRegisterSyncStatus).toHaveBeenCalledTimes(1);
  await expectNoAccessibilityViolations(document.body);
});

test("orders the sections: open alerts, alert list, registers' state and pending tasks", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({ kind: "ok", value: priceList(2) });

  const screen = await renderScreen(services, {
    access: accessWith("alerts_area", "prices_area"),
  });

  await expect.element(screen.getByRole("link", { name: "Precios a revisar 2" })).toBeVisible();
  const headings = screen
    .getByRole("heading", { level: 2 })
    .elements()
    .map((heading) => heading.textContent);
  expect(headings).toEqual([
    "Alertas abiertas",
    "Lista de alertas",
    "Estado de las cajas",
    "Tareas pendientes",
  ]);
});

test("lists the alerts of the filters it is given, and reports the filters the person changes", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();

  const screen = await renderScreen(services, {
    filters: { ...alertsListFilters.parse({}), level: "critical" },
    onFiltersChange,
  });

  await expect.element(screen.getByRole("row", { name: /Lucía Pérez/ })).toBeVisible();
  expect(services.fetchAlerts).toHaveBeenCalledWith({ level: "critical", open: true, page: 1 });
  await userEvent.click(screen.getByRole("button", { name: /Estado/ }));
  await userEvent.click(screen.getByRole("option", { name: "Cerradas" }));
  await expect
    .poll(() => onFiltersChange)
    .toHaveBeenCalledWith({
      ...alertsListFilters.parse({}),
      level: "critical",
      status: "closed",
    });
});

test("shows each pending task the person may act on beside the rest of Inicio", async () => {
  const services = createServices();
  vi.mocked(services.fetchFiscalTasks).mockResolvedValue({ kind: "ok", value: fiscalTasks });
  vi.mocked(services.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefundsWithUnconfirmedCloudRefund,
  });

  const screen = await renderScreen(services, {
    access: accessWith("fiscal_information", "refunds_area"),
  });

  await expect
    .element(screen.getByRole("heading", { name: "Tareas pendientes", level: 2 }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: `Tareas fiscales ${fiscalTasks.tasks.length}` }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Reembolsos por Mercado Pago 1" }))
    .toBeVisible();
  expect(screen.getByRole("link", { name: /^Precios a revisar/ }).query()).toBeNull();
  expect(services.fetchPrices).not.toHaveBeenCalled();
});

test("shows someone without the alerts permission the registers' last sync and no alert section, asking the cloud for no alerts", async () => {
  const services = createServices();

  const screen = await renderScreen(services, { access: NO_CAPABILITIES_ACCESS });

  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
  await expect
    .element(screen.getByRole("row", { name: /^Caja 1 Nunca sincronizó Sin datos Sin datos$/ }))
    .toBeVisible();
  expect(screen.getByText("No tenés alertas para ver").query()).toBeNull();
  expect(screen.getByRole("heading", { name: "Alertas abiertas" }).query()).toBeNull();
  expect(screen.getByRole("heading", { name: "Lista de alertas" }).query()).toBeNull();
  expect(screen.getByRole("heading", { name: "Tareas pendientes" }).query()).toBeNull();
  expect(screen.getByText(/alertas? abiertas?$/).query()).toBeNull();
  expect(services.fetchAlertsOverview).not.toHaveBeenCalled();
  expect(services.fetchAlerts).not.toHaveBeenCalled();
  await expectNoAccessibilityViolations(document.body);
});

test("shows the alerts' loading placeholder, and no pill, until the alerts arrive", async () => {
  const services = createServices();
  const load = deferred<FetchAlertsOverviewOutcome>();
  vi.mocked(services.fetchAlertsOverview).mockReturnValue(load.promise);

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Cargando…").first()).toBeInTheDocument();
  expect(screen.getByText("Cargando…").elements()).toHaveLength(3);
  expect(screen.getByText(/^\d+ alertas? abiertas?$/).query()).toBeNull();
  load.resolve({ kind: "ok", value: overview });
  await expect.element(screen.getByRole("link", { name: /^Alertas críticas/ })).toBeVisible();
  expect(screen.getByText("Cargando…").query()).toBeNull();
});

test("says once, and with no pill, that no alert is open", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlertsOverview).mockResolvedValue({ kind: "ok", value: NOTHING_OPEN });
  vi.mocked(services.fetchAlerts).mockResolvedValue({
    kind: "ok",
    value: { alerts: [], total: 0, pageSize: 25 },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Sin alertas abiertas")).toBeVisible();
  expect(screen.getByText("Sin alertas abiertas").elements()).toHaveLength(1);
  expect(screen.getByText("Cuando algo necesite atención, aparece acá.").elements()).toHaveLength(
    1,
  );
  expect(screen.getByText(/^\d+ alertas? abiertas?$/).query()).toBeNull();
});

test("reads the open alerts by level and the list again once an alert is closed from the list", async () => {
  const services = createServices();
  services.alertDetailModal = {
    fetchAlert: vi.fn().mockResolvedValue({
      kind: "ok",
      value: {
        ...passkeyAlert,
        detail: {
          action: "registered",
          passkeyName: "Teléfono de Lucía",
          actorId: "user-1",
          via: "self",
        },
        open: true,
        closing: "by_hand",
        deliveries: [],
      },
    }),
    fetchPermissionCatalog: vi.fn(),
    closeAlert: vi.fn().mockResolvedValue({ kind: "ok" }),
  };
  const screen = await renderScreen(services, {
    access: accessWith("alerts_area", "close_alerts_manually"),
  });
  await expect.element(screen.getByRole("row", { name: /Lucía Pérez/ })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Ver la alerta/ }));
  await userEvent.click(screen.getByRole("button", { name: "Cerrar la alerta" }));

  await expect.poll(() => services.fetchAlertsOverview).toHaveBeenCalledTimes(2);
  await expect.poll(() => services.fetchAlerts).toHaveBeenCalledTimes(2);
});

test("shows the alerts' load error whose retry starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<FetchAlertsOverviewOutcome>();
  vi.mocked(services.fetchAlertsOverview)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir las alertas")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("No pudimos abrir las alertas")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Cargando…").first()).toBeInTheDocument();
  retry.resolve({ kind: "ok", value: overview });
  await expect.element(screen.getByRole("link", { name: /^Alertas críticas/ })).toBeVisible();
});

test("shows the alerts' rate-limited notice whose retry reads the alerts again", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlertsOverview).mockResolvedValueOnce({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();

  vi.mocked(services.fetchAlertsOverview).mockResolvedValueOnce({ kind: "ok", value: overview });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("link", { name: /^Alertas críticas/ })).toBeVisible();
});

test("ends the session once when the alerts request comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlertsOverview).mockResolvedValue({ kind: "unauthenticated" });
  vi.mocked(services.fetchRegisterSyncStatus).mockReturnValue(
    deferred<FetchRegisterSyncStatusOutcome>().promise,
  );
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded).toHaveBeenCalled();
  expect(onSessionEnded).toHaveBeenCalledTimes(1);
  expect(services.fetchAlertsOverview).toHaveBeenCalledTimes(1);
});

test("opens the own account panel when the alerts request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlertsOverview).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("shows the registers' loading state until the registers arrive", async () => {
  const services = createServices();
  const load = deferred<FetchRegisterSyncStatusOutcome>();
  vi.mocked(services.fetchRegisterSyncStatus).mockReturnValue(load.promise);

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Estado de las cajas" }))
    .toHaveAttribute("aria-busy", "true");
  load.resolve({ kind: "ok", value: [neverSynced] });
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
});

test("says there are no registers when the branch has none", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisterSyncStatus).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();
});

test("shows the registers' load error whose retry starts again from the loading state", async () => {
  const services = createServices();
  const retry = deferred<FetchRegisterSyncStatusOutcome>();
  vi.mocked(services.fetchRegisterSyncStatus)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir las cajas")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("No pudimos abrir las cajas")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("table", { name: "Estado de las cajas" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: [neverSynced] });
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
});

test("ends the session once when the registers request comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisterSyncStatus).mockResolvedValue({ kind: "unauthenticated" });
  vi.mocked(services.fetchAlertsOverview).mockReturnValue(
    deferred<FetchAlertsOverviewOutcome>().promise,
  );
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded).toHaveBeenCalled();
  expect(onSessionEnded).toHaveBeenCalledTimes(1);
});

test("opens the own account panel when the registers request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisterSyncStatus).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});
