import type { ConsultProductOutcome, SearchProductsOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { ALMENDRAS, LECHE, renderScreen } from "./test-support/product-consultation-screen";

const CARD = { name: "Almendras peladas" };

function consulting(outcome: ConsultProductOutcome) {
  return vi.fn(async (): Promise<ConsultProductOutcome> => outcome);
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
    await expect
      .element(screen.getByRole("button", { name: /Cobrar en efectivo/ }))
      .not.toBeInTheDocument();
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

  it("asks the core again while it shows a weighed product, so the weight follows the scale", async () => {
    const consultProduct = vi
      .fn<() => Promise<ConsultProductOutcome>>()
      .mockResolvedValueOnce({ ...ALMENDRAS, weight_thousandths: null, amount: null })
      .mockResolvedValue(ALMENDRAS);
    const { screen } = await renderScreen({ consultProduct });

    await expect.element(screen.getByText("$ 6.974,10")).toBeVisible();
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
    await expect.element(screen.getByText("Consultar")).toBeVisible();
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(consultProduct).toHaveBeenCalledWith({ product_id: "almendras" }),
    );
  });

  it("says no product has a code the core does not know", async () => {
    const { screen } = await renderScreen({ consultProduct: consulting({ kind: "not_found" }) });

    await expect.element(screen.getByText("No hay ningún producto con ese código")).toBeVisible();
  });

  it("says the product could not be looked up when the core cannot answer", async () => {
    const { screen } = await renderScreen({ consultProduct: consulting({ kind: "unavailable" }) });

    await expect.element(screen.getByText("No se pudo buscar el producto")).toBeVisible();
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
