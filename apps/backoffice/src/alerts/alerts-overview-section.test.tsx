import type { AlertsOverview } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { CloudData } from "../platform/use-cloud-query";
import { render } from "../shell/test-support/render-with-router";
import {
  AlertsNotPermittedSection,
  AlertsOverviewOpenCount,
  AlertsOverviewSection,
} from "./alerts-overview-section";

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

function loaded(value: AlertsOverview): CloudData<AlertsOverview> {
  return { status: "loaded", value, refreshing: false };
}

function renderParts(data: CloudData<AlertsOverview>) {
  return render(
    <main>
      <AlertsOverviewOpenCount data={data} />
      <AlertsOverviewSection data={data} />
    </main>,
  );
}

test("shows the open alerts grouped by level and their total in the pill", async () => {
  const screen = await renderParts(loaded(overview));

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

test("shows a card-shaped loading placeholder per level, and no pill, while the alerts load", async () => {
  const screen = await renderParts({ status: "loading" });

  await expect.element(screen.getByText("Cargando…").first()).toBeInTheDocument();
  expect(screen.getByText("Cargando…").elements()).toHaveLength(3);
  expect(screen.getByText(/^\d+ alertas? abiertas?$/).query()).toBeNull();
});

test("shows the blank empty state, and no cards or pill, when no alert is open", async () => {
  const screen = await renderParts(loaded(NOTHING_OPEN));

  await expect.element(screen.getByText("Sin alertas abiertas")).toBeVisible();
  await expect
    .element(screen.getByText("Cuando algo necesite atención, aparece acá."))
    .toBeVisible();
  expect(screen.getByRole("link").query()).toBeNull();
  expect(screen.getByText(/^\d+ alertas? abiertas?$/).query()).toBeNull();
});

test("shows the load error, and no pill, whose Reintentar retries the alerts", async () => {
  const retry = vi.fn();

  const screen = await renderParts({ status: "failed", retry });

  await expect.element(screen.getByText("No pudimos abrir las alertas")).toBeVisible();
  expect(screen.getByText(/^\d+ alertas? abiertas?$/).query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(retry).toHaveBeenCalledTimes(1);
});

test("shows the rate-limited notice when the alerts were refused for too many requests", async () => {
  const screen = await renderParts({ status: "failed", retryAfterSeconds: 120, retry: () => {} });

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("tells someone without either alert permission that they have no alerts to view", async () => {
  const screen = await render(
    <main>
      <AlertsNotPermittedSection />
    </main>,
  );

  await expect.element(screen.getByRole("heading", { name: "Alertas", level: 2 })).toBeVisible();
  await expect.element(screen.getByText("No tenés alertas para ver")).toBeVisible();
  await expect
    .element(screen.getByText("Tu rol no incluye permiso para ver alertas."))
    .toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});
