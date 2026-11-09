import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { RegisterPaymentsTarget } from "../platform/register-payments-target";
import { render } from "../shell/test-support/render-with-router";
import { RegisterPaymentsSection } from "./register-payments-section";
import { register1, register2 } from "./test-support/register-payments-targets";

function renderSection(
  register: RegisterPaymentsTarget,
  { mayAssign = true, pointOfSaleSlot }: { mayAssign?: boolean; pointOfSaleSlot?: ReactNode } = {},
) {
  const actions = { assignPointTerminal: vi.fn(), assignQrPointOfSale: vi.fn() };
  return render(
    <RegisterPaymentsSection
      register={register}
      mayAssignPointTerminal={mayAssign}
      mayAssignQrPointOfSale={mayAssign}
      onAssignPointTerminal={actions.assignPointTerminal}
      onAssignQrPointOfSale={actions.assignQrPointOfSale}
      pointOfSaleSlot={pointOfSaleSlot}
    />,
  ).then((screen) => ({ screen, actions }));
}

test("shows the Point terminal and the Mercado Pago QR a register has", async () => {
  const { screen } = await renderSection(register2);

  await expect.element(screen.getByText("Terminal Point: TERM-0042")).toBeVisible();
  await expect.element(screen.getByText("QR de Mercado Pago: CAJA2_STORE_POS")).toBeVisible();
});

test("says Sin asignar for a Point terminal and a QR a register does not have", async () => {
  const { screen } = await renderSection(register1);

  await expect.element(screen.getByText("Terminal Point: sin asignar")).toBeVisible();
  await expect.element(screen.getByText("QR de Mercado Pago: sin asignar")).toBeVisible();
});

test("Asignar terminal Point asks to edit the terminal of that register", async () => {
  const { screen, actions } = await renderSection(register2);

  await userEvent.click(screen.getByRole("button", { name: "Asignar terminal Point" }));

  expect(actions.assignPointTerminal).toHaveBeenCalledTimes(1);
});

test("Asignar QR de Mercado Pago asks to edit the QR of that register", async () => {
  const { screen, actions } = await renderSection(register2);

  await userEvent.click(screen.getByRole("button", { name: "Asignar QR de Mercado Pago" }));

  expect(actions.assignQrPointOfSale).toHaveBeenCalledTimes(1);
});

test("offers the assignments only to who may make them", async () => {
  const { screen } = await renderSection(register2, { mayAssign: false });

  await expect.element(screen.getByText("Terminal Point: TERM-0042")).toBeVisible();
  expect(screen.getByRole("button").query()).toBeNull();
});

test("shows what the point of sale slot is given above the terminal and the QR", async () => {
  const { screen } = await renderSection(register2, {
    pointOfSaleSlot: <p>Punto de venta 00003</p>,
  });

  await expect.element(screen.getByText("Punto de venta 00003")).toBeVisible();
  const slot = screen.getByText("Punto de venta 00003").element();
  const terminal = screen.getByText("Terminal Point: TERM-0042").element();
  expect(slot.compareDocumentPosition(terminal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
