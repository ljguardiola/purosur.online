import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type { DiscountModal } from "./test-support/cash-charge-modal";
import { DISCOUNT_FIELD, renderDiscountModal, valueBeside } from "./test-support/cash-charge-modal";

const PIN_ARGS = { user_id: "u3", pin: "1234" };

async function authorizeAs(screen: DiscountModal["screen"], firstName: string, pin: string) {
  await userEvent.click(screen.getByRole("button", { name: /Persona que autoriza/ }));
  await userEvent.click(screen.getByRole("option", { name: firstName }));
  await userEvent.type(screen.getByLabelText("PIN"), pin);
}

it("shows the amount to charge and the change with the discount typed beside the amount received, and one confirmation charges both", async () => {
  const { screen, field, discountField, complete, chargeSaleWithDiscount, callbacks, chargeSale } =
    await renderDiscountModal();

  await userEvent.fill(field, "10000");
  await userEvent.fill(discountField, "100");

  await expect.poll(() => valueBeside(screen, "A cobrar ahora")).toBe("$ 9.500,00");
  await expect.element(screen.getByText("VUELTO A ENTREGAR")).toBeVisible();
  await expect.element(screen.getByText("$ 500,00", { exact: true })).toBeVisible();
  expect(valueBeside(screen, "Descuento sobre el total")).toBe("− $ 100,00");
  await expect.element(complete).toBeEnabled();

  await userEvent.click(complete);

  await expect.poll(() => callbacks.onCompleted.mock.calls.length).toBe(1);
  expect(chargeSaleWithDiscount).toHaveBeenCalledWith(1_000_000, 10_000, undefined);
  expect(chargeSale).not.toHaveBeenCalled();
});

it("returns to the sale's amounts and charges without the discount once the discount is emptied", async () => {
  const { screen, field, discountField, complete, chargeSale, chargeSaleWithDiscount, callbacks } =
    await renderDiscountModal();
  await userEvent.fill(field, "10000");
  await userEvent.fill(discountField, "100");
  await expect.poll(() => valueBeside(screen, "A cobrar ahora")).toBe("$ 9.500,00");

  await userEvent.clear(discountField);

  await expect.poll(() => valueBeside(screen, "A cobrar ahora")).toBe("$ 9.600,00");
  await expect.element(screen.getByText("$ 400,00", { exact: true })).toBeVisible();
  await userEvent.click(complete);
  await expect.poll(() => callbacks.onCompleted.mock.calls.length).toBe(1);
  expect(chargeSale).toHaveBeenCalledWith(1_000_000);
  expect(chargeSaleWithDiscount).not.toHaveBeenCalled();
});

it("does not offer the discount when the screen does not offer it", async () => {
  const { screen } = await renderDiscountModal({ discountOffered: false });

  await expect
    .element(screen.getByRole("textbox", { name: DISCOUNT_FIELD }))
    .not.toBeInTheDocument();
});

it("warns that the discount typed replaces the one already applied on the total", async () => {
  const { screen, discountField } = await renderDiscountModal({ appliedDiscountAmount: 20_000 });

  await expect
    .element(screen.getByText(/Reemplaza el descuento sobre el total ya aplicado/))
    .not.toBeInTheDocument();
  await userEvent.fill(discountField, "100");

  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Reemplaza el descuento sobre el total ya aplicado ($ 200,00)");
});

it("shows no replacement warning when the sale has no discount on its total", async () => {
  const { screen, discountField } = await renderDiscountModal();

  await userEvent.fill(discountField, "100");

  await expect
    .element(screen.getByText(/Reemplaza el descuento sobre el total ya aplicado/))
    .not.toBeInTheDocument();
});

it("shows the discount refusal on the field when the core says it exceeds the sale", async () => {
  const { screen, field, discountField } = await renderDiscountModal({
    readCharge: async (tendered, discount) =>
      discount === undefined
        ? { kind: "covered", applied: 960_000, change: tendered - 960_000 }
        : { kind: "discount_exceeds_sale" },
    previewSaleDiscount: async () => ({ kind: "discount_exceeds_sale" }),
  });
  await userEvent.fill(field, "10000");

  await userEvent.fill(discountField, "99999");

  await expect
    .element(screen.getByText("El descuento no puede ser mayor al total de la venta."))
    .toBeVisible();
});

it("shows the discount refusal on the field when charging says it exceeds the sale", async () => {
  const { screen, field, discountField, complete, callbacks } = await renderDiscountModal({
    chargeWithDiscount: async () => ({ kind: "discount_exceeds_sale" }),
  });
  await userEvent.fill(field, "10000");
  await userEvent.fill(discountField, "100");
  await expect.element(complete).toBeEnabled();

  await userEvent.click(complete);

  await expect
    .element(screen.getByText("El descuento no puede ser mayor al total de la venta."))
    .toBeVisible();
  expect(callbacks.onCompleted).not.toHaveBeenCalled();
});

it("leaves the modal for the sale when charging says the sale has payments", async () => {
  const { field, discountField, complete, callbacks } = await renderDiscountModal({
    chargeWithDiscount: async () => ({ kind: "sale_has_payments" }),
  });
  await userEvent.fill(field, "10000");
  await userEvent.fill(discountField, "100");
  await expect.element(complete).toBeEnabled();

  await userEvent.click(complete);

  await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBeGreaterThan(0);
});

it("asks for no authorization until a discount is typed, and then asks for it in the same modal", async () => {
  const { screen, discountField, requestedAuthorizers } = await renderDiscountModal({
    authorizationRequired: true,
  });

  await expect.element(screen.getByLabelText("PIN")).not.toBeInTheDocument();
  await userEvent.fill(discountField, "100");

  await expect.element(screen.getByLabelText("PIN")).toBeVisible();
  expect(requestedAuthorizers).toEqual(["apply_total_discount"]);
});

it("waits for the authorizer and sends who authorizes with the PIN", async () => {
  const { screen, field, discountField, complete, chargeSaleWithDiscount, callbacks } =
    await renderDiscountModal({ authorizationRequired: true });
  await userEvent.fill(field, "10000");
  await userEvent.fill(discountField, "100");
  await expect.element(complete).toBeDisabled();

  await authorizeAs(screen, "Sofía", "1234");
  await expect.element(complete).toBeEnabled();
  await userEvent.click(complete);

  await expect.poll(() => callbacks.onCompleted.mock.calls.length).toBe(1);
  expect(chargeSaleWithDiscount).toHaveBeenCalledWith(1_000_000, 10_000, PIN_ARGS);
});

it("shows a refused PIN and stays open", async () => {
  const { screen, field, discountField, complete, callbacks } = await renderDiscountModal({
    authorizationRequired: true,
    chargeWithDiscount: async () => ({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 4,
    }),
  });
  await userEvent.fill(field, "10000");
  await userEvent.fill(discountField, "100");
  await authorizeAs(screen, "Sofía", "1234");

  await userEvent.click(complete);

  await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
  expect(callbacks.onCompleted).not.toHaveBeenCalled();
});
