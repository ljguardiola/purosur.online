import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  authorizationDialog,
  authorizeInModal,
} from "../shell/test-support/authorization-modal-steps";
import {
  OTHER_DISCOUNT_FIELD,
  renderCashChargePanel,
  typeDiscount,
  valueBeside,
} from "./test-support/cash-charge-panel";

const PIN_ARGS = { user_id: "u3", pin: "1234" };

it("shows the amount to charge and the change with the discount typed beside the amount received, and one confirmation charges both", async () => {
  const panel = await renderCashChargePanel();
  const { screen, field, complete, chargeSaleWithDiscount, callbacks, chargeSale } = panel;

  await userEvent.fill(field, "10000");
  await typeDiscount(panel, "100");

  await expect.poll(() => valueBeside(screen, "A COBRAR")).toBe("$ 9.500,00");
  await expect.element(screen.getByText("VUELTO")).toBeVisible();
  await expect.element(screen.getByText("$ 500,00", { exact: true })).toBeVisible();
  expect(valueBeside(screen, "Falta de cambio")).toBe("– $ 100,00");
  await expect.element(complete).toBeEnabled();

  await userEvent.click(complete);

  await expect.poll(() => callbacks.onCompleted.mock.calls.length).toBe(1);
  expect(chargeSaleWithDiscount).toHaveBeenCalledWith(1_000_000, 10_000, undefined);
  expect(chargeSale).not.toHaveBeenCalled();
});

it("returns to the sale's amounts and charges without the discount once the discount is emptied", async () => {
  const panel = await renderCashChargePanel();
  const { screen, field, discountField, complete, chargeSale, chargeSaleWithDiscount, callbacks } =
    panel;
  await userEvent.fill(field, "10000");
  await typeDiscount(panel, "100");
  await expect.poll(() => valueBeside(screen, "A COBRAR")).toBe("$ 9.500,00");

  await userEvent.clear(discountField);

  await expect.poll(() => valueBeside(screen, "A COBRAR")).toBe("$ 9.600,00");
  await expect.element(screen.getByText("$ 400,00", { exact: true })).toBeVisible();
  await userEvent.click(complete);
  await expect.poll(() => callbacks.onCompleted.mock.calls.length).toBe(1);
  expect(chargeSale).toHaveBeenCalledWith(1_000_000);
  expect(chargeSaleWithDiscount).not.toHaveBeenCalled();
});

it("does not offer the discount when the screen does not offer it", async () => {
  const { screen } = await renderCashChargePanel({ discountOffered: false });

  await expect.element(screen.getByText("Falta de cambio")).not.toBeInTheDocument();
  await userEvent.keyboard("{F3}");
  await expect
    .element(screen.getByRole("textbox", { name: OTHER_DISCOUNT_FIELD }))
    .not.toBeInTheDocument();
});

it("warns that the discount typed replaces the one already applied on the total", async () => {
  const panel = await renderCashChargePanel({ appliedDiscountAmount: 20_000 });
  const { screen } = panel;

  await expect
    .element(screen.getByText(/Reemplaza el descuento sobre el total ya aplicado/))
    .not.toBeInTheDocument();
  await typeDiscount(panel, "100");

  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Reemplaza el descuento sobre el total ya aplicado ($ 200,00)");
});

it("shows no replacement warning when the sale has no discount on its total", async () => {
  const panel = await renderCashChargePanel();

  await typeDiscount(panel, "100");

  await expect
    .element(panel.screen.getByText(/Reemplaza el descuento sobre el total ya aplicado/))
    .not.toBeInTheDocument();
});

it("shows the discount refusal on the field when the core has no amounts for a discount that exceeds the sale", async () => {
  const panel = await renderCashChargePanel({
    readAmounts: async (discount) => (discount === undefined ? amountsOf(960_000) : null),
  });
  await userEvent.fill(panel.field, "10000");

  await typeDiscount(panel, "99999");

  await expect
    .element(panel.screen.getByText("El descuento no puede ser mayor al total de la venta."))
    .toBeVisible();
  expect(panel.callbacks.onSaleUnavailable).not.toHaveBeenCalled();
});

it("shows the discount refusal on the field when charging says it exceeds the sale", async () => {
  const panel = await renderCashChargePanel({
    chargeWithDiscount: async () => ({ kind: "discount_exceeds_sale" }),
  });
  await userEvent.fill(panel.field, "10000");
  await typeDiscount(panel, "100");
  await expect.element(panel.complete).toBeEnabled();

  await userEvent.click(panel.complete);

  await expect
    .element(panel.screen.getByText("El descuento no puede ser mayor al total de la venta."))
    .toBeVisible();
  expect(panel.callbacks.onCompleted).not.toHaveBeenCalled();
});

it("leaves the panel for the sale when charging says the sale has payments", async () => {
  const panel = await renderCashChargePanel({
    chargeWithDiscount: async () => ({ kind: "sale_has_payments" }),
  });
  await userEvent.fill(panel.field, "10000");
  await typeDiscount(panel, "100");
  await expect.element(panel.complete).toBeEnabled();

  await userEvent.click(panel.complete);

  await expect.poll(() => panel.callbacks.onSaleUnavailable.mock.calls.length).toBeGreaterThan(0);
});

it("asks for no authorization until the charge with a discount is confirmed, and then asks for it in the modal", async () => {
  const panel = await renderCashChargePanel({ authorizationRequired: true });
  await userEvent.fill(panel.field, "10000");
  await expect.element(authorizationDialog()).not.toBeInTheDocument();
  await typeDiscount(panel, "100");
  await expect.element(authorizationDialog()).not.toBeInTheDocument();

  await userEvent.click(panel.complete);

  await expect.element(authorizationDialog()).toBeVisible();
  await expect
    .element(authorizationDialog().getByText("Falta de cambio", { exact: true }))
    .toBeVisible();
  expect(panel.requestedAuthorizers).toEqual(["apply_total_discount"]);
  expect(panel.chargeSaleWithDiscount).not.toHaveBeenCalled();
});

it("charges with the discount and sends who authorizes with the PIN on Enter", async () => {
  const panel = await renderCashChargePanel({ authorizationRequired: true });
  await userEvent.fill(panel.field, "10000");
  await typeDiscount(panel, "100");
  await userEvent.click(panel.complete);

  await authorizeInModal({ as: "Sofía", pin: "1234" });

  await expect.poll(() => panel.callbacks.onCompleted.mock.calls.length).toBe(1);
  expect(panel.chargeSaleWithDiscount).toHaveBeenCalledWith(1_000_000, 10_000, PIN_ARGS);
});

it("does not charge when the authorization modal is closed with Esc, and stays on the charge", async () => {
  const panel = await renderCashChargePanel({ authorizationRequired: true });
  await userEvent.fill(panel.field, "10000");
  await typeDiscount(panel, "100");
  await userEvent.click(panel.complete);
  await expect.element(authorizationDialog()).toBeVisible();

  await userEvent.keyboard("{Escape}");

  await expect.element(authorizationDialog()).not.toBeInTheDocument();
  expect(panel.chargeSaleWithDiscount).not.toHaveBeenCalled();
  expect(panel.callbacks.onCompleted).not.toHaveBeenCalled();
  expect(panel.callbacks.onBack).not.toHaveBeenCalled();
});

it("shows a refused PIN inside the authorization modal and stays open", async () => {
  const panel = await renderCashChargePanel({
    authorizationRequired: true,
    chargeWithDiscount: async () => ({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 4,
    }),
  });
  await userEvent.fill(panel.field, "10000");
  await typeDiscount(panel, "100");
  await userEvent.click(panel.complete);

  await authorizeInModal({ as: "Sofía", pin: "1234" });

  await expect.element(authorizationDialog().getByText("PIN incorrecto")).toBeVisible();
  expect(panel.callbacks.onCompleted).not.toHaveBeenCalled();
});

it("works out what stays pending from the core's answer for the discount typed", async () => {
  const panel = await renderCashChargePanel();

  await userEvent.fill(panel.field, "5000");
  await typeDiscount(panel, "100");

  await expect.element(panel.screen.getByText("QUEDA PENDIENTE")).toBeVisible();
  await expect.element(panel.screen.getByText("$ 4.500,00", { exact: true })).toBeVisible();
});

it("shows nothing pending until the amounts to charge with the discount typed are known", async () => {
  const panel = await renderCashChargePanel({
    readAmounts: async (discount) =>
      discount === undefined ? amountsOf(960_000) : new Promise(() => {}),
  });

  await userEvent.fill(panel.field, "5000");
  await typeDiscount(panel, "100");

  await expect.poll(() => panel.readCashCharge).toHaveBeenCalledWith(500_000, 10_000);
  await expect.element(panel.screen.getByText("QUEDA PENDIENTE")).not.toBeInTheDocument();
});

it("shows no change and keeps Cobrar disabled until the core works out the amounts with the discount typed", async () => {
  let answerAmounts: (amounts: ReturnType<typeof amountsOf>) => void = () => {};
  const panel = await renderCashChargePanel({
    readAmounts: (discount) =>
      discount === undefined
        ? Promise.resolve(amountsOf(960_000))
        : new Promise((resolve) => {
            answerAmounts = resolve;
          }),
  });

  await userEvent.fill(panel.field, "10000");
  await typeDiscount(panel, "100");

  await expect.element(panel.screen.getByText("VUELTO")).not.toBeInTheDocument();
  await expect.element(panel.complete).toBeDisabled();
  answerAmounts(amountsOf(950_000));
  await expect.element(panel.screen.getByText("VUELTO")).toBeVisible();
  await expect.element(panel.complete).toBeEnabled();
});
