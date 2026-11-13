import type { AdjustSaleLineOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  apply,
  CHANGED,
  chooseOption,
  renderLinePricePanel,
  typeOtherReason,
  typePrice,
  typeValue,
} from "./test-support/line-price-panel";
import { deferred } from "./test-support/sale-screen";

describe("LinePricePanel", () => {
  it("marks its title as asking for authorization when changing the price needs it", async () => {
    const { screen } = await renderLinePricePanel({ authorizationRequired: true });

    await expect
      .element(screen.getByRole("heading", { level: 2 }))
      .toHaveTextContent("Precio de la línea Pide autorización");
  });

  it("shows no lock on its title when the person may change the price on their own", async () => {
    const { screen } = await renderLinePricePanel();

    await expect.element(screen.getByRole("heading", { name: "Precio de la línea" })).toBeVisible();
    expect(screen.container.textContent).not.toContain("Pide autorización");
  });

  it("names the line with its quantity and shows its list price and what it costs now", async () => {
    const { screen } = await renderLinePricePanel();

    await expect.element(screen.getByRole("heading", { name: "Precio de la línea" })).toBeVisible();
    await expect.element(screen.getByText("Yerba mate 1 kg", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("2 u", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 2.380,00 / u")).toBeVisible();
    await expect.element(screen.getByText("Antes", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00", { exact: true })).toBeVisible();
    await expectNoAccessibilityViolations(document.body);
  });

  it("names a line sold by weight with its weight and its price per kilo", async () => {
    const { screen } = await renderLinePricePanel({ saleUnit: "KG", quantity: 1250 });

    await expect.element(screen.getByText("1,250 kg", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 2.380,00 / kg")).toBeVisible();
    await expect
      .element(screen.getByRole("textbox", { name: "PRECIO NUEVO POR KG" }))
      .toBeVisible();
  });

  it("shows Esc at the top right and Enter on Aplicar, and no function key", async () => {
    const { screen } = await renderLinePricePanel();

    const keys = [...screen.container.querySelectorAll("kbd")].map((key) => key.textContent);
    expect(keys).toEqual(["Esc", "Enter"]);
  });

  it("starts on a new price, with the amount field focused", async () => {
    const { screen } = await renderLinePricePanel();

    await expect.element(screen.getByRole("radio", { name: "Precio nuevo" })).toBeChecked();
    await expect
      .element(screen.getByRole("textbox", { name: "PRECIO NUEVO POR UNIDAD" }))
      .toHaveFocus();
    await expect
      .element(screen.getByRole("textbox", { name: "PRECIO NUEVO POR UNIDAD" }))
      .toHaveAttribute("inputmode", "decimal");
  });

  it("offers a new price, a percentage discount and an amount discount", async () => {
    const { screen } = await renderLinePricePanel();

    await expect.element(screen.getByRole("radio", { name: "Precio nuevo" })).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Descuento %" })).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Descuento $" })).toBeVisible();
  });

  it("asks for the discount in the percentage mode, with a whole number", async () => {
    const { screen } = await renderLinePricePanel();

    await chooseOption(screen, "Descuento %");

    const field = screen.getByRole("textbox", { name: "DESCUENTO" });
    await expect.element(field).toBeVisible();
    await expect.element(field).toHaveAttribute("inputmode", "numeric");
    await expect.element(screen.getByText("%", { exact: true })).toBeVisible();
  });

  it("asks for the discount in the amount mode, in money", async () => {
    const { screen } = await renderLinePricePanel();

    await chooseOption(screen, "Descuento $");

    await expect
      .element(screen.getByRole("textbox", { name: "DESCUENTO" }))
      .toHaveAttribute("inputmode", "decimal");
  });

  it("empties the value when the mode changes", async () => {
    const { screen } = await renderLinePricePanel();
    await typePrice(screen, "1500");

    await chooseOption(screen, "Descuento %");

    await expect.element(screen.getByRole("textbox", { name: "DESCUENTO" })).toHaveValue("");
  });

  it("moves between the options of a focused group with the arrow keys", async () => {
    const { screen } = await renderLinePricePanel();
    screen.getByRole("radio", { name: "Precio nuevo" }).element().focus();

    await userEvent.keyboard("{ArrowRight}");

    await expect.element(screen.getByRole("radio", { name: "Descuento %" })).toBeChecked();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(screen.getByRole("radio", { name: "Descuento $" })).toBeChecked();
    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(screen.getByRole("radio", { name: "Descuento %" })).toBeChecked();
  });

  it("moves with Tab from the modes to the amount to the reasons", async () => {
    const { screen } = await renderLinePricePanel();
    screen.getByRole("radio", { name: "Precio nuevo" }).element().focus();

    await userEvent.tab();
    await expect
      .element(screen.getByRole("textbox", { name: "PRECIO NUEVO POR UNIDAD" }))
      .toHaveFocus();
    await userEvent.tab();
    await expect.element(screen.getByRole("radio", { name: "Precio de etiqueta" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(screen.getByRole("radio", { name: "Producto dañado" })).toBeChecked();
  });

  it("closes from Esc without asking the core", async () => {
    const { adjust, onClose } = await renderLinePricePanel();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(adjust).not.toHaveBeenCalled();
  });

  it("applies on Enter", async () => {
    const { screen, adjust } = await renderLinePricePanel();
    await typePrice(screen, "1500");

    await userEvent.keyboard("{Enter}");

    await expect.poll(() => adjust.mock.calls.length).toBe(1);
  });
});

describe("LinePricePanel reasons", () => {
  it("offers the label price, a damaged product and Otro, starting on the label price", async () => {
    const { screen } = await renderLinePricePanel();

    await expect.element(screen.getByRole("radio", { name: "Precio de etiqueta" })).toBeChecked();
    await expect.element(screen.getByRole("radio", { name: "Producto dañado" })).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Otro" })).toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Motivo" })).not.toBeInTheDocument();
  });

  it("sends the chosen chip's text as the reason", async () => {
    const { screen, adjust } = await renderLinePricePanel();
    await typePrice(screen, "1500");
    await chooseOption(screen, "Producto dañado");

    await apply(screen);

    expect(adjust).toHaveBeenCalledExactlyOnceWith(
      "line-1",
      { kind: "PRICE", value: 150_000 },
      "Producto dañado",
      undefined,
    );
  });

  it("sends the label price as the reason when nothing else is chosen", async () => {
    const { screen, adjust } = await renderLinePricePanel();
    await typePrice(screen, "1500");

    await apply(screen);

    expect(adjust.mock.lastCall?.[2]).toBe("Precio de etiqueta");
  });

  it("asks for a reason when Otro is chosen, and sends what is typed, trimmed", async () => {
    const { screen, adjust } = await renderLinePricePanel();
    await typePrice(screen, "1500");

    await typeOtherReason(screen, "  Vence pronto  ");
    await apply(screen);

    expect(adjust.mock.lastCall?.[2]).toBe("Vence pronto");
  });

  it("hides the reason field again when another chip is chosen", async () => {
    const { screen } = await renderLinePricePanel();
    await chooseOption(screen, "Otro");
    await expect.element(screen.getByRole("textbox", { name: "Motivo" })).toBeVisible();

    await chooseOption(screen, "Producto dañado");

    await expect.element(screen.getByRole("textbox", { name: "Motivo" })).not.toBeInTheDocument();
  });

  it("asks for the reason when Otro is chosen and nothing is typed", async () => {
    const { screen, adjust } = await renderLinePricePanel();
    await typePrice(screen, "1500");
    await typeOtherReason(screen, "   ");

    await apply(screen);

    await expect.element(screen.getByText("Escribí un motivo.")).toBeVisible();
    expect(adjust).not.toHaveBeenCalled();
  });
});

describe("LinePricePanel applying", () => {
  it("sends a typed price in cents and tells the screen the sale it returns", async () => {
    const { screen, adjust, onAdjusted } = await renderLinePricePanel();
    await typePrice(screen, "1500,50");

    await apply(screen);

    expect(adjust).toHaveBeenCalledExactlyOnceWith(
      "line-1",
      { kind: "PRICE", value: 150_050 },
      "Precio de etiqueta",
      undefined,
    );
    await expect.poll(() => onAdjusted.mock.calls.length).toBe(1);
    expect(onAdjusted.mock.calls[0]?.[1]).toBe(false);
  });

  it("tells the screen when adjusting the line removed the discount on the sale's total", async () => {
    const { screen, onAdjusted } = await renderLinePricePanel({
      adjustSaleLine: async () => ({ ...CHANGED, removed_sale_discount: true }),
    });
    await typePrice(screen, "1500");

    await apply(screen);

    await expect.poll(() => onAdjusted.mock.calls.map(([, removed]) => removed)).toEqual([true]);
  });

  it("sends a percentage discount", async () => {
    const { screen, adjust } = await renderLinePricePanel();
    await chooseOption(screen, "Descuento %");
    await typeValue(screen, "DESCUENTO", "10");

    await apply(screen);

    expect(adjust).toHaveBeenCalledExactlyOnceWith(
      "line-1",
      { kind: "PERCENT", value: 10 },
      "Precio de etiqueta",
      undefined,
    );
  });

  it("sends a fixed amount discount in cents", async () => {
    const { screen, adjust } = await renderLinePricePanel();
    await chooseOption(screen, "Descuento $");
    await typeValue(screen, "DESCUENTO", "500");

    await apply(screen);

    expect(adjust).toHaveBeenCalledExactlyOnceWith(
      "line-1",
      { kind: "AMOUNT", value: 50_000 },
      "Precio de etiqueta",
      undefined,
    );
  });

  describe("before asking the core", () => {
    it.each([
      [
        "Precio nuevo",
        "PRECIO NUEVO POR UNIDAD",
        "",
        "Ingresá un precio válido, por ejemplo 1.500,00.",
      ],
      ["Descuento $", "DESCUENTO", "0", "Ingresá un descuento mayor a 0, por ejemplo 500,00."],
      ["Descuento %", "DESCUENTO", "10,5", "Ingresá un porcentaje entero, por ejemplo 10."],
      ["Descuento %", "DESCUENTO", "101", "Ingresá un porcentaje entero, por ejemplo 10."],
    ])("refuses a value that is not valid for %s", async (mode, field, value, message) => {
      const { screen, adjust } = await renderLinePricePanel();
      await chooseOption(screen, mode);
      await typeValue(screen, field, value);

      await apply(screen);

      await expect.element(screen.getByText(message)).toBeVisible();
      expect(adjust).not.toHaveBeenCalled();
    });
  });

  it("keeps the button disabled while the core is answering, so it is asked once", async () => {
    const answer = deferred<AdjustSaleLineOutcome>();
    const { screen, adjust } = await renderLinePricePanel({ adjustSaleLine: () => answer.promise });
    await typePrice(screen, "1500");

    await apply(screen);

    await expect.element(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    expect(adjust).toHaveBeenCalledOnce();
  });
});

describe("LinePricePanel when the core refuses", () => {
  it("says the price is the list price, on the price field", async () => {
    const { screen, onAdjusted } = await renderLinePricePanel({
      adjustSaleLine: async () => ({ kind: "same_as_list_price" }),
    });
    await typePrice(screen, "2380");

    await apply(screen);

    await expect
      .element(screen.getByText("Ese es el precio de lista. Ingresá otro precio."))
      .toBeVisible();
    expect(onAdjusted).not.toHaveBeenCalled();
  });

  it("says the discount is larger than the line, on the amount field", async () => {
    const { screen } = await renderLinePricePanel({
      adjustSaleLine: async () => ({ kind: "discount_exceeds_line" }),
    });
    await chooseOption(screen, "Descuento $");
    await typeValue(screen, "DESCUENTO", "99999");

    await apply(screen);

    await expect
      .element(screen.getByText("El descuento no puede ser mayor al total de la línea."))
      .toBeVisible();
  });

  it.each([
    { kind: "unknown_line" },
    { kind: "no_open_sale" },
    { kind: "sale_has_payments" },
  ] as const)("tells the screen the line is gone: $kind", async (outcome) => {
    const { screen, onSaleGone } = await renderLinePricePanel({
      adjustSaleLine: async () => outcome,
    });
    await typePrice(screen, "1500");

    await apply(screen);

    await expect.poll(() => onSaleGone.mock.calls.length).toBe(1);
  });

  it.each([{ kind: "not_signed_in" }, { kind: "no_open_session" }] as const)(
    "tells the screen nobody is signed in: $kind",
    async (outcome) => {
      const { screen, onSessionInvalid } = await renderLinePricePanel({
        adjustSaleLine: async () => outcome,
      });
      await typePrice(screen, "1500");

      await apply(screen);

      await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
    },
  );

  it("says the person may not sell", async () => {
    const { screen } = await renderLinePricePanel({
      adjustSaleLine: async () => ({ kind: "not_permitted" }),
    });
    await typePrice(screen, "1500");

    await apply(screen);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No tenés el permiso de vender y cobrar");
  });

  it("says the person no longer may change prices, when nobody was asked to authorize", async () => {
    const { screen } = await renderLinePricePanel({
      adjustSaleLine: async () => ({ kind: "lacks_permission" }),
    });
    await typePrice(screen, "1500");

    await apply(screen);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Ya no tenés permiso para cambiar precios o descuentos.");
  });

  it("says the change failed and keeps the button enabled", async () => {
    const { screen } = await renderLinePricePanel({
      adjustSaleLine: async () => ({ kind: "unavailable" }),
    });
    await typePrice(screen, "1500");

    await apply(screen);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo aplicar el ajuste. Probá de nuevo.");
    await expect.element(screen.getByRole("button", { name: "Aplicar" })).toBeEnabled();
  });

  it("says the change failed when the core cannot be reached", async () => {
    const { screen } = await renderLinePricePanel({
      adjustSaleLine: () => Promise.reject(new Error("the connection was replaced")),
    });
    await typePrice(screen, "1500");

    await apply(screen);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo aplicar el ajuste. Probá de nuevo.");
  });
});
