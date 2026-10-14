import type { RegisterStatus } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { renderScreen } from "./test-support/sale-screen";

const DISK_FULL_TITLE = "No se pueden abrir ventas nuevas: queda 3 % de disco";
const DISK_FULL_MEANING =
  "La venta en curso se puede completar y cobrar. Para volver a vender hay que liberar espacio en la notebook.";

function statusHolding(conditions: RegisterStatus["conditions"]): () => Promise<RegisterStatus> {
  return async () => ({
    conditions,
    cloud: "reachable",
    serial_devices: { scale: "not_registered", reader: "not_registered" },
    serial_devices_setup_offered: false,
  });
}

describe("SaleScreen while the disk is full", () => {
  it("tells that new sales can't be opened and that the sale underway can be charged", async () => {
    const { screen } = await renderScreen({
      registerStatus: statusHolding([
        { kind: "sales_denied", reason: "disk_full", disk_free_ratio: 0.03, level: "critical" },
      ]),
    });

    await expect.element(screen.getByText(DISK_FULL_TITLE)).toBeVisible();
    await expect.element(screen.getByText(DISK_FULL_MEANING)).toBeVisible();
  });

  it("shows nothing of the disk while the register holds no condition", async () => {
    const { screen } = await renderScreen({ registerStatus: statusHolding([]) });

    await expect.element(screen.getByRole("heading", { name: "Venta en curso" })).toBeVisible();
    expect(screen.container.textContent).not.toContain("ventas nuevas");
  });

  it.each<RegisterStatus["conditions"][number]>([
    { kind: "disk_space_low", level: "warning" },
    { kind: "sales_denied", reason: "event_history_broken", level: "critical" },
    {
      kind: "sales_denied",
      reason: "disk_space_short_at_startup",
      required_free_bytes: 3_000_000_000,
      level: "critical",
    },
  ])("shows no disk-full notice for the condition %j", async (condition) => {
    const { screen } = await renderScreen({ registerStatus: statusHolding([condition]) });

    await expect.element(screen.getByRole("heading", { name: "Venta en curso" })).toBeVisible();
    expect(screen.container.textContent).not.toContain(DISK_FULL_MEANING);
  });

  it("shows nothing of the disk while the status can't be read", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByRole("heading", { name: "Venta en curso" })).toBeVisible();
    expect(screen.container.textContent).not.toContain("ventas nuevas");
  });
});
