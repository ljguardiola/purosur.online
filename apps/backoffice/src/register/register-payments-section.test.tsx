import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { RegisterPaymentsSection } from "./register-payments-section";
import type { RegisterSummary } from "./registers-api";
import { createActions } from "./test-support/register-panel";
import { register1, register2 } from "./test-support/registers-list-screen";

const fiscal = accessWith("registers_area", "fiscal_configuration_area");

function renderSection(
  register: RegisterSummary,
  { access = fiscal, pointOfSaleSlot }: { access?: typeof fiscal; pointOfSaleSlot?: string } = {},
) {
  const actions = createActions();
  return render(
    <RegisterPaymentsSection
      register={register}
      access={access}
      actions={actions}
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

  expect(actions.assignTerminal).toHaveBeenCalledWith(register2);
});

test("Asignar QR de Mercado Pago asks to edit the QR of that register", async () => {
  const { screen, actions } = await renderSection(register2);

  await userEvent.click(screen.getByRole("button", { name: "Asignar QR de Mercado Pago" }));

  expect(actions.assignQr).toHaveBeenCalledWith(register2);
});

test("offers the assignments only to who may make them", async () => {
  const { screen } = await renderSection(register2, { access: accessWith("registers_area") });

  await expect.element(screen.getByText("Terminal Point: TERM-0042")).toBeVisible();
  expect(screen.getByRole("button").query()).toBeNull();
});

test("shows what the point of sale slot is given above the terminal and the QR", async () => {
  const { screen } = await renderSection(register2, { pointOfSaleSlot: "Punto de venta 00003" });

  const slot = screen.getByText("Punto de venta 00003").element();
  const terminal = screen.getByText("Terminal Point: TERM-0042").element();
  expect(slot.compareDocumentPosition(terminal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
