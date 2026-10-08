import type { AlertsOverview } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { HomeScreen } from "./home-screen";
import type { HomeScreenServices } from "./home-screen-services";
import { accessWith, NO_CAPABILITIES_ACCESS } from "./test-support/backoffice-access";
import { render } from "./test-support/render-with-router";

const overview: AlertsOverview = {
  critical: { openCount: 1, kinds: ["user_access_increased"] },
  warning: { openCount: 2, kinds: ["user_email_changed"] },
  informational: { openCount: 0, kinds: [] },
};

function createServices(): HomeScreenServices {
  return {
    fetchAlertsOverview: vi.fn().mockResolvedValue({ kind: "ok", value: overview }),
    fetchRegisterSyncStatus: vi.fn().mockResolvedValue({
      kind: "ok",
      value: [{ id: "register-1", name: "Caja 1", lastSuccessfulSyncAt: null }],
    }),
  };
}

function renderScreen(services: HomeScreenServices, access = accessWith("alerts_area")) {
  return render(
    <main>
      <HomeScreen access={access} onSessionEnded={() => {}} services={services} />
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
  await expectNoAccessibilityViolations(document.body);
});

test("shows someone without either alert permission that they have no alerts to view beside each register's last sync, asking the cloud for no alerts", async () => {
  const services = createServices();

  const screen = await renderScreen(services, NO_CAPABILITIES_ACCESS);

  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("No tenés alertas para ver")).toBeVisible();
  await expect
    .element(screen.getByRole("row", { name: /^Caja 1 Nunca sincronizó$/ }))
    .toBeVisible();
  expect(screen.getByText(/alertas? abiertas?$/).query()).toBeNull();
  expect(services.fetchAlertsOverview).not.toHaveBeenCalled();
  await expectNoAccessibilityViolations(document.body);
});
