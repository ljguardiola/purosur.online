import type { AlertsOverview } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { FetchAlertsOverviewOutcome } from "../alerts/alerts-api";
import type { FetchRegisterSyncStatusOutcome, RegisterSyncStatus } from "../register/registers-api";
import type { BackofficeAccess } from "./backoffice-access";
import { HomeScreen } from "./home-screen";
import type { HomeScreenServices } from "./home-screen-services";
import { accessWith, NO_CAPABILITIES_ACCESS } from "./test-support/backoffice-access";
import { render } from "./test-support/render-with-router";

const overview: AlertsOverview = {
  critical: { openCount: 1, kinds: ["user_access_increased"] },
  warning: { openCount: 2, kinds: ["user_email_changed"] },
  informational: { openCount: 0, kinds: [] },
};

const NOTHING_OPEN: AlertsOverview = {
  critical: { openCount: 0, kinds: [] },
  warning: { openCount: 0, kinds: [] },
  informational: { openCount: 0, kinds: [] },
};

const neverSynced: RegisterSyncStatus = {
  id: "register-1",
  name: "Caja 1",
  lastSuccessfulSyncAt: null,
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
  };
}

function renderScreen(
  services: HomeScreenServices,
  {
    access = accessWith("alerts_area"),
    onSessionEnded = () => {},
  }: { access?: BackofficeAccess; onSessionEnded?: () => void } = {},
) {
  return render(
    <main>
      <HomeScreen access={access} onSessionEnded={onSessionEnded} services={services} />
    </main>,
  );
}

test("shows Inicio with the open alerts' total, the alerts by level and each register's last sync", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Puro Sur")).toBeVisible();
  await expect.element(screen.getByText("3 alertas abiertas", { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Alertas", level: 2 })).toBeVisible();
  await expect.element(screen.getByRole("link", { name: /^Advertencias 2/ })).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Cajas", level: 2 })).toBeVisible();
  await expect
    .element(screen.getByRole("row", { name: /^Caja 1 Nunca sincronizó$/ }))
    .toBeVisible();
  expect(services.fetchAlertsOverview).toHaveBeenCalledTimes(1);
  expect(services.fetchRegisterSyncStatus).toHaveBeenCalledTimes(1);
  await expectNoAccessibilityViolations(document.body);
});

test("shows someone without either alert permission that they have no alerts to view beside each register's last sync, asking the cloud for no alerts", async () => {
  const services = createServices();

  const screen = await renderScreen(services, { access: NO_CAPABILITIES_ACCESS });

  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("No tenés alertas para ver")).toBeVisible();
  await expect
    .element(screen.getByRole("row", { name: /^Caja 1 Nunca sincronizó$/ }))
    .toBeVisible();
  expect(screen.getByText(/alertas? abiertas?$/).query()).toBeNull();
  expect(services.fetchAlertsOverview).not.toHaveBeenCalled();
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

test("shows the alerts' empty state, and no pill, when no alert is open", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlertsOverview).mockResolvedValue({ kind: "ok", value: NOTHING_OPEN });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Sin alertas abiertas")).toBeVisible();
  expect(screen.getByText(/^\d+ alertas? abiertas?$/).query()).toBeNull();
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

test("navigates to Mi cuenta when the alerts request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlertsOverview).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});

test("shows the registers' loading state until the registers arrive", async () => {
  const services = createServices();
  const load = deferred<FetchRegisterSyncStatusOutcome>();
  vi.mocked(services.fetchRegisterSyncStatus).mockReturnValue(load.promise);

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Última sincronización de las cajas" }))
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
    .element(screen.getByRole("table", { name: "Última sincronización de las cajas" }))
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

test("navigates to Mi cuenta when the registers request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisterSyncStatus).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});
