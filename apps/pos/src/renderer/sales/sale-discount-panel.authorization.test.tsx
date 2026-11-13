import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  authorizationDialog,
  authorizeInModal,
} from "../shell/test-support/authorization-modal-steps";
import {
  fillValidPercentage,
  renderSaleDiscountPanel,
  submit,
  typeOtherReason,
  typeValue,
} from "./test-support/sale-discount-panel";

describe("SaleDiscountPanel when the sale asks for authorization", () => {
  it("asks in the authorization modal, with the action's subtitle, instead of acting", async () => {
    const { screen, requested, apply } = await renderSaleDiscountPanel({
      authorizationRequired: true,
    });
    await fillValidPercentage(screen);
    await submit(screen);

    await expect.element(authorizationDialog()).toBeVisible();
    await expect
      .element(authorizationDialog().getByText("Descuento al total", { exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).not.toBeInTheDocument();
    expect(requested).toEqual(["apply_total_discount"]);
    expect(apply).not.toHaveBeenCalled();
  });

  it("shows the form's own refusal and asks for no authorization while the form is not valid", async () => {
    const { screen, apply } = await renderSaleDiscountPanel({ authorizationRequired: true });
    await typeValue(screen, "DESCUENTO", "5");
    await typeOtherReason(screen, "   ");

    await submit(screen);

    await expect.element(screen.getByText("Escribí un motivo.")).toBeVisible();
    await expect.element(authorizationDialog()).not.toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();
  });

  it("takes the digits typed right after the authorization modal opens, without clicking its PIN field", async () => {
    const { screen, apply } = await renderSaleDiscountPanel({ authorizationRequired: true });
    await fillValidPercentage(screen);
    await submit(screen);
    await expect.element(authorizationDialog()).toBeVisible();

    await userEvent.keyboard("1234");

    await expect.element(authorizationDialog().getByLabelText("PIN")).toHaveValue("1234");
    expect(apply).not.toHaveBeenCalled();
  });

  it("sends who authorizes and their PIN on Enter", async () => {
    const { screen, apply } = await renderSaleDiscountPanel({ authorizationRequired: true });
    await fillValidPercentage(screen);
    await submit(screen);

    await authorizeInModal({ as: "Sofía", pin: "1234" });

    await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce());
    expect(apply.mock.lastCall).toContainEqual({ user_id: "u3", pin: "1234" });
    await expect.element(authorizationDialog()).not.toBeInTheDocument();
  });

  it("does not act when the authorization modal is closed with Esc", async () => {
    const { screen, apply, onApplied, onClose } = await renderSaleDiscountPanel({
      authorizationRequired: true,
    });
    await fillValidPercentage(screen);
    await submit(screen);
    await expect.element(authorizationDialog()).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(authorizationDialog()).not.toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("asks on Enter, at confirm time", async () => {
    const { screen, apply } = await renderSaleDiscountPanel({ authorizationRequired: true });
    await fillValidPercentage(screen);

    await userEvent.keyboard("{Enter}");

    await expect.element(authorizationDialog()).toBeVisible();
    expect(apply).not.toHaveBeenCalled();
  });

  it("shows a refused PIN inside the authorization modal and stays open", async () => {
    const { screen, onApplied } = await renderSaleDiscountPanel({
      authorizationRequired: true,
      applySaleDiscount: async () => ({
        kind: "wrong_pin",
        retry_after_seconds: 0,
        attempts_left: 6,
      }),
    });
    await fillValidPercentage(screen);
    await submit(screen);

    await authorizeInModal({ as: "Sofía", pin: "1234" });

    await expect.element(authorizationDialog().getByText("PIN incorrecto")).toBeVisible();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("says inside the modal that the chosen person cannot authorize it", async () => {
    const { screen, onApplied } = await renderSaleDiscountPanel({
      authorizationRequired: true,
      applySaleDiscount: async () => ({ kind: "lacks_permission" }),
    });
    await fillValidPercentage(screen);
    await submit(screen);

    await authorizeInModal({ as: "Sofía", pin: "1234" });

    await expect
      .element(authorizationDialog().getByText("Sofía no puede autorizar esto", { exact: true }))
      .toBeVisible();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("says inside the modal who was locked out", async () => {
    const { screen } = await renderSaleDiscountPanel({
      authorizationRequired: true,
      applySaleDiscount: async () => ({ kind: "locked", consecutive_failures: 8 }),
    });
    await fillValidPercentage(screen);
    await submit(screen);

    await authorizeInModal({ as: "Sofía", pin: "1234" });

    await expect
      .element(authorizationDialog().getByText("Sofía está bloqueado", { exact: true }))
      .toBeVisible();
  });
});
