import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import {
  createServices,
  register1,
  register2,
  renderScreen,
} from "./test-support/registers-list-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const codeField = { name: /^Código de la caja QR en Mercado Pago/ };

async function openQrModal(screen: Awaited<ReturnType<typeof renderScreen>>, name: string) {
  await userEvent.click(
    screen.getByRole("button", { name: `Asignar QR de Mercado Pago a ${name}` }),
  );
  return screen.getByRole("dialog", { name: "Asignar QR de Mercado Pago" });
}

test("shows each register's QR de Mercado Pago right after Terminal Point, or Sin asignar when it has none", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({
    kind: "ok",
    value: [register1, register2],
  });

  const screen = await renderScreen(services);

  const headers = screen.getByRole("columnheader").elements();
  const names = headers.map((header) => header.textContent);
  expect(names.indexOf("QR de Mercado Pago")).toBe(names.indexOf("Terminal Point") + 1);
  await expect.element(screen.getByText("CAJA2_STORE_POS")).toBeVisible();
  await expect
    .element(
      screen
        .getByRole("row", { name: /Caja 1/ })
        .getByText("Sin asignar")
        .last(),
    )
    .toBeVisible();
});

test("the row action opens the QR modal for that register with its current code", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({
    kind: "ok",
    value: [register1, register2],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 2")).toBeVisible();

  const dialog = await openQrModal(screen, "Caja 2");

  await expect.element(dialog.getByRole("textbox", codeField)).toHaveValue("CAJA2_STORE_POS");
});

test("assigning a QR point of sale closes the modal and reads the list again", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [register1] });
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({
    kind: "ok",
    value: [{ ...register1, qrExternalPosId: "CAJA1_STORE_POS", qrPointOfSaleVersion: 1 }],
  });
  vi.mocked(services.assignQrPointOfSale).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  const dialog = await openQrModal(screen, "Caja 1");

  await userEvent.fill(dialog.getByRole("textbox", codeField), "CAJA1_STORE_POS");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));

  expect(services.assignQrPointOfSale).toHaveBeenCalledWith("register-1", {
    external_pos_id: "CAJA1_STORE_POS",
    version: 0,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("CAJA1_STORE_POS")).toBeVisible();
});

test("offers the QR point of sale action only to who may assign it", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [register1] });

  const withoutIt = await renderScreen(
    services,
    () => {},
    accessWith("registers_area", "enroll_registers"),
  );
  await expect.element(withoutIt.getByText("Caja 1")).toBeVisible();
  expect(
    withoutIt.getByRole("button", { name: "Asignar QR de Mercado Pago a Caja 1" }).query(),
  ).toBeNull();
  await withoutIt.unmount();

  const withIt = await renderScreen(
    services,
    () => {},
    accessWith("registers_area", "enroll_registers", "cash_area"),
  );
  await expect
    .element(withIt.getByRole("button", { name: "Asignar QR de Mercado Pago a Caja 1" }))
    .toBeVisible();
});

test("keeps no room in the actions column for the QR point of sale action of who may not assign it", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(
    services,
    () => {},
    accessWith("registers_area", "enroll_registers"),
  );

  const table = screen.getByRole("table", { name: "Cajas registradoras" });
  await expect.element(table).toHaveAttribute("aria-busy", "true");
  const headers = table.getByRole("columnheader").elements();
  const actionsIndex = headers.findIndex((header) => header.textContent === "Acciones");
  const placeholderRow = table.element().querySelector("tbody tr");
  const actionsPlaceholder = placeholderRow?.children[actionsIndex]?.firstElementChild;
  expect(actionsPlaceholder?.childElementCount).toBe(2);
});

test("Recargar in the QR modal reads the registers once and shows what changed", async () => {
  const services = createServices();
  const changed = { ...register1, qrExternalPosId: "CAJA7_STORE_POS", qrPointOfSaleVersion: 5 };
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [register1] });
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [changed] });
  vi.mocked(services.assignQrPointOfSale).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  const dialog = await openQrModal(screen, "Caja 1");
  await userEvent.fill(dialog.getByRole("textbox", codeField), "CAJA1_STORE_POS");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));
  await expect.element(dialog.getByRole("button", { name: "Recargar" })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(dialog.getByRole("textbox", codeField)).toHaveValue("CAJA7_STORE_POS");
  await expect.element(screen.getByRole("cell", { name: "CAJA7_STORE_POS" })).toBeVisible();
  await expect.poll(() => vi.mocked(services.fetchRegisters).mock.calls.length).toBe(2);
});

test("a register that disappears while its QR point of sale is edited is reported in the modal and dropped from the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValueOnce({ kind: "ok", value: [register1] });
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.assignQrPointOfSale).mockResolvedValue({ kind: "not_found" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  const dialog = await openQrModal(screen, "Caja 1");
  await userEvent.fill(dialog.getByRole("textbox", codeField), "CAJA1_STORE_POS");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));

  await expect.element(dialog.getByText("La caja ya no existe")).toBeVisible();
  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();
});
