import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import { registerPartsOf } from "../shell/test-support/register-parts";
import { render } from "../shell/test-support/render-with-router";
import { RegistersListScreen } from "./registers-list-screen";
import { RegisterPointOfSaleSectionStub } from "./test-support/register-point-of-sale-section-stub";
import { createServices, register1 } from "./test-support/registers-list-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const NAMES = [{ id: "register-2", name: "Caja 2" }];

async function renderList(capabilities: Capability[]) {
  await page.viewport(1280, 900);
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register1] });
  vi.mocked(services.fetchSnapshotBackupRegisters).mockResolvedValue({ kind: "ok", value: NAMES });
  vi.mocked(services.fetchFiscalRegisterNames).mockResolvedValue({ kind: "ok", value: NAMES });
  const screen = await render(
    <main className="flex">
      <RegistersListScreen
        access={accessWith(...capabilities)}
        services={services}
        registerPointOfSaleSection={RegisterPointOfSaleSectionStub}
        registerPanelSections={registerPartsOf(services).panelSections}
        registerPaymentModals={registerPartsOf(services).paymentModals}
        registerKeyModals={registerPartsOf(services).keyModals}
        onSessionEnded={() => {}}
        sessionsPeriod={{ from: "", to: "" }}
        onSessionsPeriodChange={() => {}}
      />
    </main>,
  );
  return { screen, services };
}

test("a person with registers_area gets the full register list, whatever else they may see", async () => {
  const { screen, services } = await renderList([
    "registers_area",
    "fiscal_configuration_area",
    "backups_area",
  ]);

  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  await expect.element(screen.getByRole("columnheader", { name: "Instalación" })).toBeVisible();
  expect(services.fetchFiscalRegisterNames).not.toHaveBeenCalled();
  expect(services.fetchSnapshotBackupRegisters).not.toHaveBeenCalled();
});

test("a person without registers_area gets the list of names", async () => {
  const { screen, services } = await renderList(["fiscal_configuration_area", "backups_area"]);

  await expect.element(screen.getByText("Caja 2")).toBeVisible();
  expect(screen.getByRole("columnheader").elements()).toHaveLength(1);
  expect(services.fetchRegisters).not.toHaveBeenCalled();
});
