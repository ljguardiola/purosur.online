import { Suspense } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { ADMINISTRATOR_ACCESS } from "../shell/test-support/backoffice-access";
import { registerPartsOf } from "../shell/test-support/register-parts";
import { render } from "../shell/test-support/render-with-router";
import { RegistersListScreen } from "./registers-list-screen";
import { neverDownloaded } from "./test-support/never-downloaded";
import { RegisterPointOfSaleSectionStub } from "./test-support/register-point-of-sale-section-stub";
import { createServices, register1 } from "./test-support/registers-list-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

test("shows the registers while the payment and key modals download", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register1] });

  const screen = await render(
    <Suspense fallback={<p>Descargando la pantalla</p>}>
      <RegistersListScreen
        access={ADMINISTRATOR_ACCESS}
        services={services}
        registerPointOfSaleSection={RegisterPointOfSaleSectionStub}
        registerPanelSections={registerPartsOf(services).panelSections}
        registerPaymentModals={neverDownloaded()}
        registerKeyModals={neverDownloaded()}
        onSessionEnded={() => {}}
        sessionsPeriod={{ from: "", to: "" }}
        onSessionsPeriodChange={() => {}}
      />
    </Suspense>,
  );

  await expect.element(screen.getByRole("row").filter({ hasText: "Caja 1" })).toBeVisible();
  expect(screen.getByText("Descargando la pantalla").query()).toBeNull();
});
