import type { PreviewSaleDiscountOutcome } from "@purosur/contracts";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  authorizationDialog,
  authorizeInModal,
} from "../shell/test-support/authorization-modal-steps";
import {
  DISCOUNT_FIELD,
  renderCashChargeModal,
  valueBeside,
} from "./test-support/cash-charge-modal";

const PIN_ARGS = { user_id: "u3", pin: "1234" };

it("shows the amount to charge and the change with the discount typed beside the amount received, and one confirmation charges both", async () => {
  const { screen, field, discountField, complete, chargeSaleWithDiscount, callbacks, chargeSale } =
    await renderCashChargeModal();

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
    await renderCashChargeModal();
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
  const { screen } = await renderCashChargeModal({ discountOffered: false });

  await expect
    .element(screen.getByRole("textbox", { name: DISCOUNT_FIELD }))
    .not.toBeInTheDocument();
});

it("warns that the discount typed replaces the one already applied on the total", async () => {
  const { screen, discountField } = await renderCashChargeModal({ appliedDiscountAmount: 20_000 });

  await expect
    .element(screen.getByText(/Reemplaza el descuento sobre el total ya aplicado/))
    .not.toBeInTheDocument();
  await userEvent.fill(discountField, "100");

  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Reemplaza el descuento sobre el total ya aplicado ($ 200,00)");
});

it("shows no replacement warning when the sale has no discount on its total", async () => {
  const { screen, discountField } = await renderCashChargeModal();

  await userEvent.fill(discountField, "100");

  await expect
    .element(screen.getByText(/Reemplaza el descuento sobre el total ya aplicado/))
    .not.toBeInTheDocument();
});

it("shows the discount refusal on the field when the core says it exceeds the sale", async () => {
  const { screen, field, discountField } = await renderCashChargeModal({
    readCharge: async (tendered, discount) =>
      discount === undefined
        ? { kind: "covered", applied: 960_000, change: tendered - 960_000, cash_rounding: 0 }
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
  const { screen, field, discountField, complete, callbacks } = await renderCashChargeModal({
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
  const { field, discountField, complete, callbacks } = await renderCashChargeModal({
    chargeWithDiscount: async () => ({ kind: "sale_has_payments" }),
  });
  await userEvent.fill(field, "10000");
  await userEvent.fill(discountField, "100");
  await expect.element(complete).toBeEnabled();

  await userEvent.click(complete);

  await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBeGreaterThan(0);
});

it("asks for no authorization until the charge with a discount is confirmed, and then asks for it in the modal", async () => {
  const { field, discountField, complete, requestedAuthorizers, chargeSaleWithDiscount } =
    await renderCashChargeModal({ authorizationRequired: true });
  await userEvent.fill(field, "10000");
  await expect.element(authorizationDialog()).not.toBeInTheDocument();
  await userEvent.fill(discountField, "100");
  await expect.element(authorizationDialog()).not.toBeInTheDocument();

  await userEvent.click(complete);

  await expect.element(authorizationDialog()).toBeVisible();
  await expect
    .element(authorizationDialog().getByText("Falta de cambio", { exact: true }))
    .toBeVisible();
  expect(requestedAuthorizers).toEqual(["apply_total_discount"]);
  expect(chargeSaleWithDiscount).not.toHaveBeenCalled();
});

it("charges with the discount and sends who authorizes with the PIN on Enter", async () => {
  const { field, discountField, complete, chargeSaleWithDiscount, callbacks } =
    await renderCashChargeModal({ authorizationRequired: true });
  await userEvent.fill(field, "10000");
  await userEvent.fill(discountField, "100");
  await userEvent.click(complete);

  await authorizeInModal({ as: "Sofía", pin: "1234" });

  await expect.poll(() => callbacks.onCompleted.mock.calls.length).toBe(1);
  expect(chargeSaleWithDiscount).toHaveBeenCalledWith(1_000_000, 10_000, PIN_ARGS);
});

it("does not charge when the authorization modal is closed with Esc", async () => {
  const { field, discountField, complete, chargeSaleWithDiscount, callbacks } =
    await renderCashChargeModal({ authorizationRequired: true });
  await userEvent.fill(field, "10000");
  await userEvent.fill(discountField, "100");
  await userEvent.click(complete);
  await expect.element(authorizationDialog()).toBeVisible();

  await userEvent.keyboard("{Escape}");

  await expect.element(authorizationDialog()).not.toBeInTheDocument();
  expect(chargeSaleWithDiscount).not.toHaveBeenCalled();
  expect(callbacks.onCompleted).not.toHaveBeenCalled();
});

it("shows a refused PIN inside the authorization modal and stays open", async () => {
  const { field, discountField, complete, callbacks } = await renderCashChargeModal({
    authorizationRequired: true,
    chargeWithDiscount: async () => ({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 4,
    }),
  });
  await userEvent.fill(field, "10000");
  await userEvent.fill(discountField, "100");
  await userEvent.click(complete);

  await authorizeInModal({ as: "Sofía", pin: "1234" });

  await expect.element(authorizationDialog().getByText("PIN incorrecto")).toBeVisible();
  expect(callbacks.onCompleted).not.toHaveBeenCalled();
});

it("works out what stays pending from the amount to charge with the discount typed", async () => {
  const { screen, field, discountField } = await renderCashChargeModal();

  await userEvent.fill(field, "5000");
  await userEvent.fill(discountField, "100");

  await expect.element(screen.getByText("QUEDA PENDIENTE")).toBeVisible();
  await expect.element(screen.getByText("$ 9.500,00 − $ 5.000,00")).toBeVisible();
  await expect.element(screen.getByText("$ 4.500,00", { exact: true })).toBeVisible();
});

it("shows the amount before the discount on the total as the base of the discount typed when it replaces one already applied", async () => {
  const { screen, discountField } = await renderCashChargeModal({
    sale: { total: 864_000, paid: 0, pending: 864_000, subtotal: 960_000 },
    appliedDiscountAmount: 96_000,
  });
  expect(valueBeside(screen, "Total de la venta")).toBe("$ 8.640,00");

  await userEvent.fill(discountField, "100");

  await expect.poll(() => valueBeside(screen, "A cobrar ahora")).toBe("$ 9.500,00");
  expect(valueBeside(screen, "Después de promociones")).toBe("$ 9.600,00");
  expect(valueBeside(screen, "Descuento sobre el total")).toBe("− $ 100,00");
  await expect
    .element(screen.getByText("Total de la venta", { exact: true }))
    .not.toBeInTheDocument();
});

it("shows nothing pending until the amount to charge with the discount typed is known", async () => {
  const { screen, field, discountField, readCashCharge } = await renderCashChargeModal({
    previewSaleDiscount: () => new Promise(() => {}),
  });

  await userEvent.fill(field, "5000");
  await userEvent.fill(discountField, "100");

  await expect.poll(() => readCashCharge).toHaveBeenCalledWith(500_000, 10_000);
  await expect.element(screen.getByText("QUEDA PENDIENTE")).not.toBeInTheDocument();
});

it("shows the total with the discount typed loading, and no change, until the core works it out", async () => {
  let answerPreview: (outcome: PreviewSaleDiscountOutcome) => void = () => {};
  const { screen, field, discountField, complete } = await renderCashChargeModal({
    previewSaleDiscount: () =>
      new Promise((resolve) => {
        answerPreview = resolve;
      }),
  });

  await userEvent.fill(field, "10000");
  await userEvent.fill(discountField, "100");

  await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
  await expect.element(screen.getByText("VUELTO A ENTREGAR")).not.toBeInTheDocument();
  await expect.element(complete).toBeDisabled();
  answerPreview({ kind: "preview", subtotal: 960_000, discount_amount: 10_000, total: 950_000 });
  await expect.element(screen.getByText("VUELTO A ENTREGAR")).toBeVisible();
  await expect.element(screen.getByText("Cargando…")).not.toBeInTheDocument();
});

it("says the total with the discount typed could not be worked out, shows no change, and works it out again on Reintentar", async () => {
  const previews: (() => Promise<PreviewSaleDiscountOutcome>)[] = [
    () => Promise.reject(new Error("the core connection was replaced")),
    async () => ({ kind: "preview", subtotal: 960_000, discount_amount: 10_000, total: 950_000 }),
  ];
  const { screen, field, discountField, complete } = await renderCashChargeModal({
    previewSaleDiscount: () => {
      const next = previews.shift();
      if (next === undefined) {
        throw new Error("no preview left");
      }
      return next();
    },
  });
  await userEvent.fill(field, "10000");
  await userEvent.fill(discountField, "100");

  await expect
    .element(screen.getByText("No se pudo calcular el total con el descuento"))
    .toBeVisible();
  await expect.element(screen.getByText("VUELTO A ENTREGAR")).not.toBeInTheDocument();
  await expect.element(complete).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.poll(() => valueBeside(screen, "A cobrar ahora")).toBe("$ 9.500,00");
  await expect.element(screen.getByText("VUELTO A ENTREGAR")).toBeVisible();
  await expect
    .element(screen.getByText("No se pudo calcular el total con el descuento"))
    .not.toBeInTheDocument();
  await expect.element(complete).toBeEnabled();
});

it("says the total with the discount typed could not be worked out when the core cannot answer, and shows nothing pending", async () => {
  const { screen, field, discountField } = await renderCashChargeModal({
    previewSaleDiscount: async () => ({ kind: "unavailable" }),
  });

  await userEvent.fill(field, "5000");
  await userEvent.fill(discountField, "100");

  await expect
    .element(screen.getByText("No se pudo calcular el total con el descuento"))
    .toBeVisible();
  await expect.element(screen.getByText("QUEDA PENDIENTE")).not.toBeInTheDocument();
});
