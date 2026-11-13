import type { ApplySaleDiscountOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  chooseOption,
  fillValidPercentage,
  renderSaleDiscountPanel,
  submit,
  typeOtherReason,
  typeValue,
} from "./test-support/sale-discount-panel";
import { deferred, SALE_OF_YERBA } from "./test-support/sale-screen";

describe("SaleDiscountPanel", () => {
  it("marks its title as asking for authorization when the discount needs it", async () => {
    const { screen } = await renderSaleDiscountPanel({ authorizationRequired: true });

    await expect
      .element(screen.getByRole("heading", { level: 2 }))
      .toHaveTextContent("Descuento al total Pide autorización");
  });

  it("shows no lock on its title when the person may discount on their own", async () => {
    const { screen } = await renderSaleDiscountPanel();

    await expect.element(screen.getByRole("heading", { name: "Descuento al total" })).toBeVisible();
    expect(screen.container.textContent).not.toContain("Pide autorización");
  });

  it("is titled Descuento al total, with Esc at its top right and Enter on Aplicar and no function key", async () => {
    const { screen } = await renderSaleDiscountPanel();

    await expect.element(screen.getByRole("heading", { name: "Descuento al total" })).toBeVisible();
    const keys = [...screen.container.querySelectorAll("kbd")].map((key) => key.textContent);
    expect(keys).toEqual(["Esc", "Enter"]);
    await expectNoAccessibilityViolations(document.body);
  });

  it("starts on a percentage, with the field focused and a % beside the value", async () => {
    const { screen } = await renderSaleDiscountPanel();

    await expect.element(screen.getByRole("radio", { name: "%" })).toBeChecked();
    const field = screen.getByRole("textbox", { name: "DESCUENTO" });
    await expect.element(field).toHaveFocus();
    await expect.element(field).toHaveAttribute("inputmode", "numeric");
    expect(field.element().parentElement?.textContent).toContain("%");
  });

  it("offers courtesy and Otro as reasons, starting on courtesy", async () => {
    const { screen } = await renderSaleDiscountPanel();

    await expect.element(screen.getByRole("radio", { name: "Cortesía" })).toBeChecked();
    await expect.element(screen.getByRole("radio", { name: "Otro" })).toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Motivo" })).not.toBeInTheDocument();
  });

  it("shows the reason field when Otro is chosen and hides it for courtesy", async () => {
    const { screen } = await renderSaleDiscountPanel();

    await chooseOption(screen, "Otro");
    await expect.element(screen.getByRole("textbox", { name: "Motivo" })).toBeVisible();
    await chooseOption(screen, "Cortesía");

    await expect.element(screen.getByRole("textbox", { name: "Motivo" })).not.toBeInTheDocument();
  });

  it("sends what is typed, trimmed, when the reason is Otro", async () => {
    const { screen, apply } = await renderSaleDiscountPanel();
    await fillValidPercentage(screen);
    await typeOtherReason(screen, "  Compra grande  ");

    await submit(screen);

    expect(apply.mock.lastCall?.[1]).toBe("Compra grande");
  });

  it("moves with Tab from the modes to the amount to the reasons, and with the arrows inside a group", async () => {
    const { screen } = await renderSaleDiscountPanel();
    screen.getByRole("radio", { name: "%" }).element().focus();

    await userEvent.tab();
    await expect.element(screen.getByRole("textbox", { name: "DESCUENTO" })).toHaveFocus();
    await userEvent.tab();
    await expect.element(screen.getByRole("radio", { name: "Cortesía" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(screen.getByRole("radio", { name: "Otro" })).toBeChecked();
  });

  it("changes the mode with the arrow keys", async () => {
    const { screen } = await renderSaleDiscountPanel();
    screen.getByRole("radio", { name: "%" }).element().focus();

    await userEvent.keyboard("{ArrowRight}");

    await expect.element(screen.getByRole("radio", { name: "$" })).toBeChecked();
  });

  it("closes from Esc without asking the core", async () => {
    const { apply, onClose } = await renderSaleDiscountPanel();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
  });

  it("applies on Enter", async () => {
    const { screen, apply } = await renderSaleDiscountPanel();
    await fillValidPercentage(screen);

    await userEvent.keyboard("{Enter}");

    await expect.poll(() => apply.mock.calls.length).toBe(1);
  });

  it("asks for an amount when the dollar sign is chosen, emptying what was typed", async () => {
    const { screen } = await renderSaleDiscountPanel();
    await typeValue(screen, "DESCUENTO", "5");

    await chooseOption(screen, "$");

    await expect.element(screen.getByRole("textbox", { name: "DESCUENTO" })).toHaveValue("");
    await expect
      .element(screen.getByRole("textbox", { name: "DESCUENTO" }))
      .toHaveAttribute("inputmode", "decimal");
  });

  it("sends a percentage with its reason and tells the screen the sale it returns", async () => {
    const { screen, apply, onApplied } = await renderSaleDiscountPanel();
    await fillValidPercentage(screen);

    await submit(screen);

    expect(apply).toHaveBeenCalledExactlyOnceWith(
      { kind: "PERCENT", value: 5 },
      "Cortesía",
      undefined,
    );
    await expect.poll(() => onApplied.mock.calls).toEqual([[SALE_OF_YERBA]]);
  });

  it("sends a fixed amount in cents", async () => {
    const { screen, apply } = await renderSaleDiscountPanel();
    await chooseOption(screen, "$");
    await typeValue(screen, "DESCUENTO", "2700,50");
    await typeOtherReason(screen, "Compra grande");

    await submit(screen);

    expect(apply).toHaveBeenCalledExactlyOnceWith(
      { kind: "AMOUNT", value: 270_050 },
      "Compra grande",
      undefined,
    );
  });

  describe("before asking the core", () => {
    it.each([
      ["$", "DESCUENTO", "0", "Ingresá un descuento mayor a 0, por ejemplo 500,00."],
      ["%", "DESCUENTO", "5,5", "Ingresá un porcentaje entero, por ejemplo 10."],
      ["%", "DESCUENTO", "101", "Ingresá un porcentaje entero, por ejemplo 10."],
    ])("refuses a value that is not valid for %s", async (kind, field, value, message) => {
      const { screen, apply } = await renderSaleDiscountPanel();
      await chooseOption(screen, kind);
      await typeValue(screen, field, value);
      await typeOtherReason(screen, "Motivo");

      await submit(screen);

      await expect.element(screen.getByText(message)).toBeVisible();
      expect(apply).not.toHaveBeenCalled();
    });

    it("asks for the reason", async () => {
      const { screen, apply } = await renderSaleDiscountPanel();
      await typeValue(screen, "DESCUENTO", "5");
      await typeOtherReason(screen, "   ");

      await submit(screen);

      await expect.element(screen.getByText("Escribí un motivo.")).toBeVisible();
      expect(apply).not.toHaveBeenCalled();
    });
  });

  it("keeps the button disabled while the core is answering, so it is asked once", async () => {
    const answer = deferred<ApplySaleDiscountOutcome>();
    const { screen, apply } = await renderSaleDiscountPanel({
      applySaleDiscount: () => answer.promise,
    });
    await fillValidPercentage(screen);

    await submit(screen);

    await expect.element(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    expect(apply).toHaveBeenCalledOnce();
  });

  describe("when the core refuses", () => {
    it("says the discount is larger than the sale, on the value field", async () => {
      const { screen, onApplied } = await renderSaleDiscountPanel({
        applySaleDiscount: async () => ({ kind: "discount_exceeds_sale" }),
      });
      await chooseOption(screen, "$");
      await typeValue(screen, "DESCUENTO", "99999");
      await typeOtherReason(screen, "Motivo");

      await submit(screen);

      await expect
        .element(screen.getByText("El descuento no puede ser mayor al total de la venta."))
        .toBeVisible();
      expect(onApplied).not.toHaveBeenCalled();
    });

    it("says the sale has no lines", async () => {
      const { screen } = await renderSaleDiscountPanel({
        applySaleDiscount: async () => ({ kind: "empty_sale" }),
      });
      await fillValidPercentage(screen);

      await submit(screen);

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("La venta no tiene líneas para descontar.");
    });

    it("says the sale already totals zero", async () => {
      const { screen } = await renderSaleDiscountPanel({
        applySaleDiscount: async () => ({ kind: "zero_total" }),
      });
      await fillValidPercentage(screen);

      await submit(screen);

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("El total de la venta ya es $ 0,00: no hay nada para descontar.");
    });

    it.each([{ kind: "no_open_sale" }, { kind: "sale_has_payments" }] as const)(
      "tells the screen the sale is gone: $kind",
      async (outcome) => {
        const { screen, onSaleGone } = await renderSaleDiscountPanel({
          applySaleDiscount: async () => outcome,
        });
        await fillValidPercentage(screen);

        await submit(screen);

        await expect.poll(() => onSaleGone.mock.calls.length).toBe(1);
      },
    );

    it.each([{ kind: "not_signed_in" }, { kind: "no_open_session" }] as const)(
      "tells the screen nobody is signed in: $kind",
      async (outcome) => {
        const { screen, onSessionInvalid } = await renderSaleDiscountPanel({
          applySaleDiscount: async () => outcome,
        });
        await fillValidPercentage(screen);

        await submit(screen);

        await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
      },
    );

    it("says the person may not sell", async () => {
      const { screen } = await renderSaleDiscountPanel({
        applySaleDiscount: async () => ({ kind: "not_permitted" }),
      });
      await fillValidPercentage(screen);

      await submit(screen);

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("No tenés el permiso de vender y cobrar");
    });

    it("says the person no longer may discount the total, when nobody was asked to authorize", async () => {
      const { screen } = await renderSaleDiscountPanel({
        applySaleDiscount: async () => ({ kind: "lacks_permission" }),
      });
      await fillValidPercentage(screen);

      await submit(screen);

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("Ya no tenés permiso para descontar sobre el total.");
    });

    it("says the discount failed and keeps the button enabled when the core cannot be reached", async () => {
      const { screen } = await renderSaleDiscountPanel({
        applySaleDiscount: () => Promise.reject(new Error("the connection was replaced")),
      });
      await fillValidPercentage(screen);

      await submit(screen);

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("No se pudo aplicar el descuento. Probá de nuevo.");
      await expect.element(screen.getByRole("button", { name: "Aplicar" })).toBeEnabled();
    });
  });
});
