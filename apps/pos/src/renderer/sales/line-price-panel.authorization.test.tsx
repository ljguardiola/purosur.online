import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  authorizationDialog,
  authorizeInModal,
} from "../shell/test-support/authorization-modal-steps";
import {
  apply,
  renderLinePricePanel,
  typeOtherReason,
  typePrice,
} from "./test-support/line-price-panel";

describe("LinePricePanel when the sale asks for authorization", () => {
  it("asks in the authorization modal, with the action's subtitle, instead of acting", async () => {
    const { screen, requested, adjust } = await renderLinePricePanel({
      authorizationRequired: true,
    });
    await typePrice(screen, "1500");
    await apply(screen);

    await expect.element(authorizationDialog()).toBeVisible();
    await expect
      .element(authorizationDialog().getByText("Cambiar precio o descuento", { exact: true }))
      .toBeVisible();
    expect(requested).toEqual(["override_line_price_or_discount"]);
    expect(adjust).not.toHaveBeenCalled();
  });

  it("asks on Enter, at confirm time", async () => {
    const { screen, adjust } = await renderLinePricePanel({ authorizationRequired: true });
    await typePrice(screen, "1500");

    await userEvent.keyboard("{Enter}");

    await expect.element(authorizationDialog()).toBeVisible();
    expect(adjust).not.toHaveBeenCalled();
  });

  it("shows the form's own refusal and asks for no authorization while the form is not valid", async () => {
    const { screen, adjust } = await renderLinePricePanel({ authorizationRequired: true });
    await typePrice(screen, "1500");
    await typeOtherReason(screen, "   ");

    await apply(screen);

    await expect.element(screen.getByText("Escribí un motivo.")).toBeVisible();
    await expect.element(authorizationDialog()).not.toBeInTheDocument();
    expect(adjust).not.toHaveBeenCalled();
  });

  it("takes the digits typed right after the authorization modal opens", async () => {
    const { screen, adjust } = await renderLinePricePanel({ authorizationRequired: true });
    await typePrice(screen, "1500");
    await apply(screen);
    await expect.element(authorizationDialog()).toBeVisible();

    await userEvent.keyboard("1234");

    await expect.element(authorizationDialog().getByLabelText("PIN")).toHaveValue("1234");
    expect(adjust).not.toHaveBeenCalled();
  });

  it("sends who authorizes and their PIN on Enter", async () => {
    const { screen, adjust } = await renderLinePricePanel({ authorizationRequired: true });
    await typePrice(screen, "1500");
    await apply(screen);

    await authorizeInModal({ as: "Sofía", pin: "1234" });

    await vi.waitFor(() => expect(adjust).toHaveBeenCalledOnce());
    expect(adjust.mock.lastCall).toContainEqual({ user_id: "u3", pin: "1234" });
    await expect.element(authorizationDialog()).not.toBeInTheDocument();
  });

  it("does not act, nor close the panel, when the authorization modal is closed with Esc", async () => {
    const { screen, adjust, onAdjusted, onClose } = await renderLinePricePanel({
      authorizationRequired: true,
    });
    await typePrice(screen, "1500");
    await apply(screen);
    await expect.element(authorizationDialog()).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(authorizationDialog()).not.toBeInTheDocument();
    expect(adjust).not.toHaveBeenCalled();
    expect(onAdjusted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a refused PIN inside the authorization modal and stays open", async () => {
    const { screen, onAdjusted } = await renderLinePricePanel({
      authorizationRequired: true,
      adjustSaleLine: async () => ({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 6 }),
    });
    await typePrice(screen, "1500");
    await apply(screen);

    await authorizeInModal({ as: "Sofía", pin: "1234" });

    await expect.element(authorizationDialog().getByText("PIN incorrecto")).toBeVisible();
    expect(onAdjusted).not.toHaveBeenCalled();
  });

  it("says inside the modal that the chosen person cannot authorize it", async () => {
    const { screen, onAdjusted } = await renderLinePricePanel({
      authorizationRequired: true,
      adjustSaleLine: async () => ({ kind: "lacks_permission" }),
    });
    await typePrice(screen, "1500");
    await apply(screen);

    await authorizeInModal({ as: "Sofía", pin: "1234" });

    await expect
      .element(authorizationDialog().getByText("Sofía no puede autorizar esto", { exact: true }))
      .toBeVisible();
    expect(onAdjusted).not.toHaveBeenCalled();
  });

  it("says inside the modal who was locked out", async () => {
    const { screen } = await renderLinePricePanel({
      authorizationRequired: true,
      adjustSaleLine: async () => ({ kind: "locked", consecutive_failures: 8 }),
    });
    await typePrice(screen, "1500");
    await apply(screen);

    await authorizeInModal({ as: "Sofía", pin: "1234" });

    await expect
      .element(authorizationDialog().getByText("Sofía está bloqueado", { exact: true }))
      .toBeVisible();
  });
});
