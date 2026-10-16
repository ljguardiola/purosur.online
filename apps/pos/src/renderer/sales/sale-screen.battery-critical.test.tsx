import type { RegisterStatus } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import type { CoreData } from "../platform/use-core-query";
import { renderScreen } from "./test-support/sale-screen";

const BATTERY_CRITICAL_TITLE = "No se pueden abrir ventas nuevas: queda poca batería";
const BATTERY_CRITICAL_MEANING =
  "La venta en curso se puede completar y cobrar. Después la caja envía lo pendiente y se cierra sola.";

function statusHolding(conditions: RegisterStatus["conditions"]): CoreData<RegisterStatus> {
  return {
    status: "loaded",
    value: {
      conditions,
      cloud: "reachable",
      serial_devices: { scale: "not_registered", reader: "not_registered" },
      serial_devices_setup_offered: false,
    },
    refreshing: false,
  };
}

describe("SaleScreen while the battery is critical", () => {
  it("tells that new sales can't be opened and that the sale underway can be charged", async () => {
    const { screen } = await renderScreen({
      registerStatus: statusHolding([
        { kind: "sales_denied", reason: "battery_critical", level: "critical" },
      ]),
    });

    await expect.element(screen.getByText(BATTERY_CRITICAL_TITLE)).toBeVisible();
    await expect.element(screen.getByText(BATTERY_CRITICAL_MEANING)).toBeVisible();
  });

  it("shows nothing of the battery while the register holds no condition", async () => {
    const { screen } = await renderScreen({ registerStatus: statusHolding([]) });

    await expect.element(screen.getByRole("heading", { name: "Venta en curso" })).toBeVisible();
    expect(screen.container.textContent).not.toContain(BATTERY_CRITICAL_MEANING);
  });

  it.each<RegisterStatus["conditions"][number]>([
    { kind: "sales_denied", reason: "event_history_broken", level: "critical" },
    { kind: "sales_denied", reason: "local_database_damaged", level: "critical" },
  ])("shows no battery notice for the condition %j", async (condition) => {
    const { screen } = await renderScreen({ registerStatus: statusHolding([condition]) });

    await expect.element(screen.getByRole("heading", { name: "Venta en curso" })).toBeVisible();
    expect(screen.container.textContent).not.toContain(BATTERY_CRITICAL_MEANING);
  });

  it("shows nothing of the battery while the status can't be read", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByRole("heading", { name: "Venta en curso" })).toBeVisible();
    expect(screen.container.textContent).not.toContain(BATTERY_CRITICAL_MEANING);
  });
});
