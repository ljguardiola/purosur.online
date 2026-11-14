import type { ConsultProductOutcome, OpenSale, SearchProductsOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import { ALMENDRAS, LECHE, renderScreen } from "./test-support/product-consultation-screen";
import { SALE_OF_YERBA_AND_ALFAJOR } from "./test-support/sale-screen";

const CARD = { name: "Almendras peladas" };

function consulting(outcome: ConsultProductOutcome) {
  return vi.fn(async (): Promise<ConsultProductOutcome> => outcome);
}

function found(...names: string[]) {
  return vi.fn(
    async (): Promise<SearchProductsOutcome> => ({
      kind: "results",
      products: names.map((name) => ({
        product_id: name.toLowerCase(),
        name,
        sale_unit: "KG",
        unit_price: 1_890_000,
        matches: [{ start: 0, length: 3 }],
      })),
      more: false,
    }),
  );
}

function selling(sale: Partial<OpenSale>) {
  return async () => ({ ...SALE_OF_YERBA_AND_ALFAJOR, ...sale });
}

describe("ProductConsultationScreen showing a consulted product", () => {
  it("shows the product's price, promotion, weighed amount and stock, without the sale's lines", async () => {
    const { screen } = await renderScreen();

    const card = screen.getByRole("region", CARD);
    await expect.element(card.getByText("$ 18.900,00 / kg")).toBeVisible();
    await expect.element(card.getByText("10 % los martes")).toBeVisible();
    await expect.element(card.getByText("Peso")).toBeVisible();
    await expect.element(card.getByText("0,410 kg")).toBeVisible();
    await expect.element(card.getByText("Importe")).toBeVisible();
    await expect.element(card.getByText("$ 6.974,10")).toBeVisible();
    await expect.element(card.getByText("Stock")).toBeVisible();
    await expect.element(card.getByText("12,4 kg")).toBeVisible();
    await expect.element(card.getByRole("button", { name: "Agregar a la venta" })).toBeVisible();
    await expect.element(screen.getByText("Yerba mate 1 kg")).not.toBeInTheDocument();
  });

  it("shows the scale's weight on the BALANZA card", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("Balanza")).toBeVisible();
    await expect.element(screen.getByText("0,410 kg").first()).toBeVisible();
  });

  it("offers the mode's pill with Esc at the top right", async () => {
    const { screen } = await renderScreen();

    const pill = screen.getByRole("button", { name: "Consulta" });
    await expect.element(pill).toBeVisible();
    await expect.element(pill.getByText("Esc")).toBeVisible();
  });

  it("keeps the sale's total and charge keys visible but out of reach", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("$ 6.260,00")).toBeVisible();
    await expect.element(screen.getByText("Artículos")).toBeVisible();
    expect(
      screen
        .getByRole("button", { name: /Cobrar en efectivo/ })
        .element()
        .closest("[inert]"),
    ).not.toBeNull();
  });

  it("asks the core about the product it opened with", async () => {
    const { consultProduct } = await renderScreen();

    await vi.waitFor(() =>
      expect(consultProduct).toHaveBeenCalledWith({ product_id: "almendras" }),
    );
  });

  it("shows no promotion tag when none is in force", async () => {
    const { screen } = await renderScreen({
      consultProduct: consulting({ ...ALMENDRAS, promotion: null, amount: 774_900 }),
    });

    await expect.element(screen.getByText("$ 7.749,00")).toBeVisible();
    await expect.element(screen.getByText("10 % los martes")).not.toBeInTheDocument();
  });

  it("shows sin dato for a stock the register does not know, with the rest of the card", async () => {
    const { screen } = await renderScreen({
      consultProduct: consulting({ ...ALMENDRAS, stock_thousandths: null }),
    });

    const card = screen.getByRole("region", CARD);
    await expect.element(card.getByText("sin dato")).toBeVisible();
    await expect.element(card.getByText("$ 6.974,10")).toBeVisible();
    await expect.element(card.getByText("10 % los martes")).toBeVisible();
  });

  it("shows a dash for the weight and the amount while the scale gives no weight", async () => {
    const { screen } = await renderScreen({
      consultProduct: consulting({ ...ALMENDRAS, weight_thousandths: null, amount: null }),
    });

    const card = screen.getByRole("region", CARD);
    await expect.element(card.getByText("—").nth(1)).toBeVisible();
    await expect.element(card.getByText("12,4 kg")).toBeVisible();
  });

  it("shows a product sold by unit without its weight", async () => {
    const { screen } = await renderScreen({ consultProduct: consulting(LECHE) });

    const card = screen.getByRole("region", { name: LECHE.name });
    await expect.element(card.getByText("$ 4.300,00 / u")).toBeVisible();
    await expect.element(card.getByText("Peso")).not.toBeInTheDocument();
    await expect.element(card.getByText("$ 4.300,00").first()).toBeVisible();
    await expect.element(card.getByText("14 u")).toBeVisible();
  });

  it("asks the core again right after each answer while it shows a weighed product", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    onTestFinished(() => void vi.useRealTimers());
    const consultProduct = vi
      .fn<() => Promise<ConsultProductOutcome>>()
      .mockResolvedValueOnce({ ...ALMENDRAS, weight_thousandths: null, amount: null })
      .mockResolvedValue(ALMENDRAS);
    const { screen } = await renderScreen({ consultProduct });

    await expect.element(screen.getByText("$ 6.974,10")).toBeVisible();
    await expect.poll(() => consultProduct.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ["fails", () => Promise.reject(new Error("core gone"))],
    ["cannot answer", async (): Promise<ConsultProductOutcome> => ({ kind: "unavailable" })],
  ])(
    "stops showing a weighed product's figures when the core %s on asking again, and follows the scale again on Reintentar",
    async (_, failing) => {
      const consultProduct = vi
        .fn<() => Promise<ConsultProductOutcome>>()
        .mockResolvedValueOnce(ALMENDRAS)
        .mockImplementationOnce(failing)
        .mockResolvedValue({ ...ALMENDRAS, weight_thousandths: 500 });
      const { screen } = await renderScreen({ consultProduct });

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("No se pudo consultar el producto");
      await expect.element(screen.getByRole("region", CARD)).not.toBeInTheDocument();
      await expect.element(screen.getByText("0,410 kg")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

      await expect.element(screen.getByRole("region", CARD).getByText("0,500 kg")).toBeVisible();
      await expect.poll(() => consultProduct.mock.calls.length).toBeGreaterThanOrEqual(5);
    },
  );

  it("does not ask the core again while it shows a product sold by unit", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    onTestFinished(() => void vi.useRealTimers());
    const consultProduct = consulting(LECHE);
    const { screen, readBarcode } = await renderScreen({ consultProduct, productId: "leche" });
    await expect.element(screen.getByRole("region", { name: LECHE.name })).toBeVisible();
    await vi.advanceTimersByTimeAsync(60_000);

    readBarcode("7790001000017");

    await vi.waitFor(() => expect(consultProduct).toHaveBeenCalledTimes(2));
    expect(consultProduct.mock.calls).toEqual([
      [{ product_id: "leche" }],
      [{ barcode: "7790001000017" }],
    ]);
  });

  it("shows a placeholder in the card's place while the core answers", async () => {
    const answer = deferred<ConsultProductOutcome>();
    const { screen } = await renderScreen({ consultProduct: () => answer.promise });
    await expect.element(screen.getByText("Artículos")).toBeVisible();

    await expect.element(screen.getByRole("main").getByText("Cargando…")).toBeInTheDocument();
    await expect.element(screen.getByRole("region", CARD)).not.toBeInTheDocument();
  });

  it("says the product could not be consulted when the core fails, and asks again from the placeholder on Reintentar", async () => {
    const again = deferred<ConsultProductOutcome>();
    const consultProduct = vi
      .fn<() => Promise<ConsultProductOutcome>>()
      .mockRejectedValueOnce(new Error("core gone"))
      .mockReturnValueOnce(again.promise)
      .mockResolvedValue(ALMENDRAS);
    const { screen } = await renderScreen({ consultProduct });

    await expect.element(screen.getByText("No se pudo consultar el producto")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(screen.getByRole("main").getByText("Cargando…")).toBeInTheDocument();
    again.resolve(ALMENDRAS);
    await expect.element(screen.getByRole("region", CARD)).toBeVisible();
  });

  it("says the product could not be consulted when the core cannot answer", async () => {
    const { screen } = await renderScreen({ consultProduct: consulting({ kind: "unavailable" }) });

    await expect.element(screen.getByText("No se pudo consultar el producto")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
  });

  it("draws the charge keys as the sale does, ready to charge", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("button", { name: /Cobrar en efectivo/ }))
      .not.toBeDisabled();
  });

  it("draws the sale's charge refusal as the sale does", async () => {
    const { screen } = await renderScreen({
      currentSale: selling({
        charge_refusal: { kind: "reaches_buyer_identification_threshold", threshold: 500_000 },
      }),
    });

    await expect.element(screen.getByText("Llegaste al tope de venta")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: /Cobro no habilitado/ })).toBeVisible();
  });

  it("draws the paid order the sale has to apply as the sale does", async () => {
    const { screen } = await renderScreen({
      currentSale: selling({
        rebuilt_paid_order: {
          payment_transaction_id: "payment-1",
          method: "QR",
          amount: 626_000,
          applied: false,
        },
      }),
    });

    await expect
      .element(screen.getByRole("button", { name: /Cobrar con el pago de Mercado Pago/ }))
      .toBeVisible();
  });

  it("draws Point out of reach below its minimum as the sale does", async () => {
    const { screen } = await renderScreen({
      paymentMethodAvailability: async () => ({
        qr: "available",
        point: "below_minimum",
        point_minimum: 1_000_000,
        qr_minimum: 1500,
      }),
    });

    await expect
      .element(screen.getByText("Point: no se ofrece para cobrar menos de $ 10.000,00"))
      .toBeVisible();
  });

  it("has no accessibility violations", async () => {
    const { screen } = await renderScreen();
    await expect.element(screen.getByRole("region", CARD)).toBeVisible();

    await expectNoAccessibilityViolations(document.body);
  });
});

describe("ProductConsultationScreen finding the product to consult", () => {
  it("waits for a product when it opens with none, asking the core nothing", async () => {
    const { screen, consultProduct } = await renderScreen({ productId: undefined });

    await expect.element(screen.getByPlaceholder("Escaneá o escribí el nombre")).toBeVisible();
    expect(consultProduct).not.toHaveBeenCalled();
  });

  it("consults the product the reader scans", async () => {
    const { consultProduct, readBarcode } = await renderScreen({ productId: undefined });

    readBarcode("7790001000017");

    await vi.waitFor(() =>
      expect(consultProduct).toHaveBeenCalledWith({ barcode: "7790001000017" }),
    );
  });

  it("consults the code typed in the field", async () => {
    const { field, consultProduct } = await renderScreen({ productId: undefined });

    await userEvent.fill(field, "7790001000017");
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(consultProduct).toHaveBeenCalledWith({ barcode: "7790001000017" }),
    );
  });

  it("consults the product chosen among those found by name", async () => {
    const searchProducts = vi.fn(
      async (): Promise<SearchProductsOutcome> => ({
        kind: "results",
        products: [
          {
            product_id: "almendras",
            name: "Almendras peladas",
            sale_unit: "KG",
            unit_price: 1_890_000,
            matches: [{ start: 0, length: 3 }],
          },
        ],
        more: false,
      }),
    );
    const { screen, field, consultProduct } = await renderScreen({
      productId: undefined,
      searchProducts,
    });

    await userEvent.fill(field, "alm");
    await expect.element(screen.getByRole("option", { name: /Almendras peladas/ })).toBeVisible();
    await expect
      .element(screen.getByRole("listitem").filter({ hasText: /^EnterConsultar$/ }))
      .toBeVisible();
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(consultProduct).toHaveBeenCalledWith({ product_id: "almendras" }),
    );
  });

  it("says no product has a code the core does not know", async () => {
    const { screen, readBarcode } = await renderScreen({
      productId: undefined,
      consultProduct: consulting({ kind: "not_found" }),
    });

    readBarcode("0000");

    await expect.element(screen.getByText("No hay ningún producto con ese código")).toBeVisible();
  });

  it("says the product chosen is no longer sold when the core no longer finds it", async () => {
    const { screen } = await renderScreen({ consultProduct: consulting({ kind: "not_found" }) });

    await expect.element(screen.getByText("Ese producto ya no se vende")).toBeVisible();
    await expect
      .element(screen.getByText("No hay ningún producto con ese código"))
      .not.toBeInTheDocument();
  });

  it("closes the results with Esc, staying in Consulta", async () => {
    const { screen, field } = await renderScreen({
      productId: undefined,
      searchProducts: found("Almendras peladas"),
    });
    await userEvent.fill(field, "alm");
    await expect.element(screen.getByRole("option", { name: /Almendras peladas/ })).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect
      .element(screen.getByRole("option", { name: /Almendras peladas/ }))
      .not.toBeInTheDocument();
    expect(screen.router.state.location.pathname).toBe("/");
  });

  it("moves the highlighted result with the arrows and consults the one highlighted", async () => {
    const { screen, field, consultProduct } = await renderScreen({
      productId: undefined,
      searchProducts: found("Almendras peladas", "Almendras tostadas"),
    });
    await userEvent.fill(field, "alm");
    await expect.element(screen.getByRole("option", { name: /Almendras tostadas/ })).toBeVisible();

    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}{ArrowDown}");
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(consultProduct).toHaveBeenCalledWith({ product_id: "almendras tostadas" }),
    );
  });

  it("keeps the field's keys after a click elsewhere, so Esc still closes the results", async () => {
    const { screen, field } = await renderScreen({
      productId: undefined,
      searchProducts: found("Almendras peladas"),
    });
    await userEvent.fill(field, "alm");
    await expect.element(screen.getByRole("option", { name: /Almendras peladas/ })).toBeVisible();

    await userEvent.click(screen.getByText("Balanza"));

    await expect.element(field).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect
      .element(screen.getByRole("option", { name: /Almendras peladas/ }))
      .not.toBeInTheDocument();
    expect(screen.router.state.location.pathname).toBe("/");
  });
});

describe("ProductConsultationScreen leaving the mode", () => {
  it("returns to the sale with the product to add when Enter is pressed", async () => {
    const { screen } = await renderScreen();
    await expect.element(screen.getByRole("region", CARD)).toBeVisible();

    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(screen.router.state.location).toMatchObject({
        pathname: "/session",
        search: {
          add: {
            product_id: "almendras",
            name: "Almendras peladas",
            sale_unit: "KG",
            unit_price: 1_890_000,
          },
        },
      }),
    );
  });

  it("returns to the sale with the product to add from its button", async () => {
    const { screen } = await renderScreen({ consultProduct: consulting(LECHE) });

    await userEvent.click(screen.getByRole("button", { name: "Agregar a la venta" }));

    await vi.waitFor(() =>
      expect(screen.router.state.location.search).toEqual({
        add: { product_id: "leche", name: LECHE.name, sale_unit: "UNIT", unit_price: 430_000 },
      }),
    );
  });

  it("returns to the sale unchanged when Esc is pressed", async () => {
    const { screen } = await renderScreen();
    await expect.element(screen.getByRole("region", CARD)).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await vi.waitFor(() =>
      expect(screen.router.state.location).toMatchObject({ pathname: "/session", search: {} }),
    );
  });

  it("returns to the sale unchanged from the mode's pill", async () => {
    const { screen } = await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Consulta" }));

    await vi.waitFor(() =>
      expect(screen.router.state.location).toMatchObject({ pathname: "/session", search: {} }),
    );
  });

  it("offers no add while no product is shown", async () => {
    const { screen } = await renderScreen({ productId: undefined });

    await userEvent.keyboard("{Enter}");

    await expect
      .element(screen.getByRole("button", { name: "Agregar a la venta" }))
      .not.toBeInTheDocument();
    expect(screen.router.state.location.pathname).toBe("/");
  });
});
