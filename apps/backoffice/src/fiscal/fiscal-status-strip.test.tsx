import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { FiscalStatusStrip } from "./fiscal-status-strip";
import type { FiscalStatusStripServices } from "./fiscal-status-strip-services";
import {
  createFiscalStatusStripServices,
  owedPresentation,
  presentedPresentation,
} from "./test-support/fiscal-status-strip";
import {
  fiscalTasks,
  noFiscalTasks,
  unbilledDeferredSales,
} from "./test-support/fiscal-task-fixtures";

type Access = Parameters<typeof accessWith>;

function renderStrip(
  services: FiscalStatusStripServices,
  capabilities: Access,
  onSessionEnded = () => {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <FiscalStatusStrip
          access={accessWith(...capabilities)}
          onSessionEnded={onSessionEnded}
          services={services}
        />
      </main>
    </FieldSizeProvider>,
  );
}

function everything(): FiscalStatusStripServices {
  const services = createFiscalStatusStripServices();
  vi.mocked(services.fetchFiscalTasks).mockResolvedValue({ kind: "ok", value: fiscalTasks });
  vi.mocked(services.fetchUnbilledDeferredSales).mockResolvedValue({
    kind: "ok",
    value: { ...unbilledDeferredSales, count: 5 },
  });
  vi.mocked(services.fetchCurrentOfflineAuthorizationCode).mockResolvedValue({
    kind: "ok",
    value: {
      offline_authorization_code: {
        code: "36251478963214",
        fortnight_start: "2026-10-16",
        fortnight_end: "2026-10-31",
        report_deadline: "2026-11-08",
      },
    },
  });
  vi.mocked(services.fetchFortnightPresentations).mockResolvedValue({
    kind: "ok",
    value: [owedPresentation, presentedPresentation, { ...owedPresentation, pointOfSaleNumber: 6 }],
  });
  return services;
}

test("shows the four figures to a person with fiscal information and fiscal configuration", async () => {
  const screen = await renderStrip(everything(), [
    "fiscal_information",
    "fiscal_configuration_area",
  ]);

  await expect.element(screen.getByText("Tareas fiscales pendientes")).toBeVisible();
  await expect
    .element(screen.getByText(String(fiscalTasks.tasks.length), { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("Ventas diferidas sin facturar")).toBeVisible();
  await expect.element(screen.getByText("5", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("CAEA vigente")).toBeVisible();
  await expect.element(screen.getByText("36251478963214")).toBeVisible();
  await expect.element(screen.getByText("Quincena del 16 al 31 de octubre")).toBeVisible();
  await expect.element(screen.getByText("Informes quincenales pendientes")).toBeVisible();
  await expect.element(screen.getByText("2", { exact: true })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("says there is no CAEA when the cloud has none stored for the current fortnight", async () => {
  const services = everything();
  vi.mocked(services.fetchCurrentOfflineAuthorizationCode).mockResolvedValue({
    kind: "ok",
    value: { offline_authorization_code: null },
  });

  const screen = await renderStrip(services, ["fiscal_information"]);

  await expect.element(screen.getByText("Sin CAEA")).toBeVisible();
});

test("counts zero pending tasks when none is open", async () => {
  const services = everything();
  vi.mocked(services.fetchFiscalTasks).mockResolvedValue({ kind: "ok", value: noFiscalTasks });

  const screen = await renderStrip(services, ["fiscal_information"]);

  await expect.element(screen.getByText("Tareas fiscales pendientes")).toBeVisible();
  await expect.element(screen.getByText("0", { exact: true })).toBeVisible();
});

test("shows only the figures of fiscal information to who has only that capability, without reading the reports", async () => {
  const services = everything();

  const screen = await renderStrip(services, ["fiscal_information"]);

  await expect.element(screen.getByText("CAEA vigente")).toBeVisible();
  expect(screen.getByText("Informes quincenales pendientes").query()).toBeNull();
  expect(services.fetchFortnightPresentations).not.toHaveBeenCalled();
});

test("shows only the pending reports to who has only fiscal configuration, without reading the fiscal information", async () => {
  const services = everything();

  const screen = await renderStrip(services, ["fiscal_configuration_area"]);

  await expect.element(screen.getByText("Informes quincenales pendientes")).toBeVisible();
  expect(screen.getByText("Tareas fiscales pendientes").query()).toBeNull();
  expect(services.fetchFiscalTasks).not.toHaveBeenCalled();
  expect(services.fetchUnbilledDeferredSales).not.toHaveBeenCalled();
  expect(services.fetchCurrentOfflineAuthorizationCode).not.toHaveBeenCalled();
});

test("shows nothing to who has only the contingency ticket rescue", async () => {
  const services = everything();

  const screen = await renderStrip(services, ["contingency_ticket_rescue"]);

  expect(screen.getByText("Tareas fiscales pendientes").query()).toBeNull();
  expect(services.fetchFiscalTasks).not.toHaveBeenCalled();
});

test("shows a failed figure with a retry that reads it again, leaving the others on screen", async () => {
  const services = everything();
  vi.mocked(services.fetchUnbilledDeferredSales)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValue({ kind: "ok", value: unbilledDeferredSales });

  const screen = await renderStrip(services, ["fiscal_information"]);
  await expect
    .element(screen.getByText("No pudimos abrir las ventas diferidas sin facturar"))
    .toBeVisible();
  await expect.element(screen.getByText("CAEA vigente")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Ventas diferidas sin facturar")).toBeVisible();
});

test("ends the session when a figure's read finds it closed", async () => {
  const services = everything();
  vi.mocked(services.fetchFiscalTasks).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderStrip(services, ["fiscal_information"], onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBeGreaterThan(0);
});
