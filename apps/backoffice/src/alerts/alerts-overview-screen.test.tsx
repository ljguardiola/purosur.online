import type { AlertsOverview } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { accessWith, NO_CAPABILITIES_ACCESS } from "../access/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import type { FetchAlertsOverviewOutcome } from "./alerts-api";
import { AlertsOverviewScreen } from "./alerts-overview-screen";
import type { AlertsOverviewScreenServices } from "./alerts-overview-services";

const ALL_ALERTS_ACCESS = accessWith("alerts_area");

const overview: AlertsOverview = {
  critical: { openCount: 4, kinds: ["user_access_increased"] },
  warning: { openCount: 3, kinds: ["backoffice_passkey_changed", "user_email_changed"] },
  informational: { openCount: 1, kinds: ["backoffice_recovery_requested"] },
};

const NOTHING_OPEN: AlertsOverview = {
  critical: { openCount: 0, kinds: [] },
  warning: { openCount: 0, kinds: [] },
  informational: { openCount: 0, kinds: [] },
};

function ok(value: AlertsOverview): FetchAlertsOverviewOutcome {
  return { kind: "ok", value };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function createServices(): AlertsOverviewScreenServices {
  return { fetchAlertsOverview: vi.fn() };
}

function renderScreen(
  services: AlertsOverviewScreenServices,
  { access = ALL_ALERTS_ACCESS, onSessionEnded = () => {} } = {},
) {
  return render(
    <main>
      <AlertsOverviewScreen access={access} onSessionEnded={onSessionEnded} services={services} />
    </main>,
  );
}

test("shows the heading, the open alerts grouped by level and their total in the pill", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlertsOverview).mockResolvedValue(ok(overview));

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Puro Sur")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Alertas", level: 2 })).toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Alertas críticas 4 Acceso ampliado" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Advertencias 3 Correo · Passkey" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Informativas 1 Recuperación de acceso" }))
    .toBeVisible();
  await expect.element(screen.getByText("8 alertas abiertas", { exact: true })).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});

test("shows the loading placeholder, and no pill, until the alerts arrive", async () => {
  const services = createServices();
  const load = deferred<FetchAlertsOverviewOutcome>();
  vi.mocked(services.fetchAlertsOverview).mockReturnValue(load.promise);

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Cargando…").first()).toBeInTheDocument();
  expect(screen.getByText("Cargando…").elements()).toHaveLength(3);
  expect(screen.getByText(/^\d+ alertas? abiertas?$/).query()).toBeNull();
  load.resolve(ok(overview));
  await expect.element(screen.getByRole("link", { name: /^Alertas críticas/ })).toBeVisible();
  expect(screen.getByText("Cargando…").query()).toBeNull();
});

test("shows the blank empty state, and no cards or pill, when no alert is open", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlertsOverview).mockResolvedValue(ok(NOTHING_OPEN));

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Sin alertas abiertas")).toBeVisible();
  await expect
    .element(screen.getByText("Cuando algo necesite atención, aparece acá."))
    .toBeVisible();
  expect(screen.getByRole("link").query()).toBeNull();
  expect(screen.getByText(/^\d+ alertas? abiertas?$/).query()).toBeNull();
});

test("tells someone without either alert permission that they have no alerts to view, asking the cloud nothing", async () => {
  const services = createServices();

  const screen = await renderScreen(services, {
    access: NO_CAPABILITIES_ACCESS,
  });

  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("No tenés alertas para ver")).toBeVisible();
  await expect
    .element(screen.getByText("Tu rol no incluye permiso para ver alertas."))
    .toBeVisible();
  expect(services.fetchAlertsOverview).not.toHaveBeenCalled();
  await expectNoAccessibilityViolations(document.body);
});

test("asks the cloud for the overview for a view_branch_alerts holder too", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlertsOverview).mockResolvedValue(ok(overview));

  const screen = await renderScreen(services, {
    access: accessWith("alerts_area"),
  });

  await expect.element(screen.getByRole("link", { name: /^Alertas críticas 4/ })).toBeVisible();
  expect(services.fetchAlertsOverview).toHaveBeenCalledTimes(1);
});

test("shows a load error whose retry starts again from the loading placeholder", async () => {
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
  retry.resolve(ok(overview));
  await expect.element(screen.getByRole("link", { name: /^Alertas críticas/ })).toBeVisible();
});

test("shows a rate-limited notice with a retry action", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlertsOverview).mockResolvedValueOnce({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();

  vi.mocked(services.fetchAlertsOverview).mockResolvedValueOnce(ok(overview));
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("link", { name: /^Alertas críticas/ })).toBeVisible();
});

test("ends the session when the alerts request comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlertsOverview).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded).toHaveBeenCalled();
});

test("navigates to Mi cuenta when the alerts request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlertsOverview).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});
