import type {
  AddProductOutcome,
  AddWeighedProductOutcome,
  FindProductByCodeOutcome,
  OpenSale,
  WeighLineOutcome,
  WeighProductOutcome,
} from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { SaleScreenProps } from "./sale-screen";
import type { Overrides } from "./test-support/sale-screen";
import {
  QUESO,
  renderScreen,
  SALE_OF_FOUR_LINES,
  SALE_OF_QUESO,
  SALE_OF_YERBA,
  scan,
} from "./test-support/sale-screen";

const WEIGHT_NEEDED = {
  kind: "weight_needed" as const,
  product_id: "p-queso",
  product_name: "Queso cremoso",
};
const PRODUCTS: Record<string, FindProductByCodeOutcome> = {
  "7790001": {
    kind: "found",
    product: {
      product_id: "p-queso",
      name: "Queso cremoso",
      sale_unit: "KG",
      unit_price: 1_250_000,
    },
  },
  "7790002": {
    kind: "found",
    product: {
      product_id: "p-aceite",
      name: "Aceite de oliva extra virgen 500 ml",
      sale_unit: "UNIT",
      unit_price: 940_000,
    },
  },
  "7790003": {
    kind: "found",
    product: { product_id: "p-pasas", name: "Pasas de uva", sale_unit: "KG", unit_price: 780_000 },
  },
  "7790004": {
    kind: "found",
    product: {
      product_id: "p-azucar",
      name: "Azúcar 1 kg",
      sale_unit: "UNIT",
      unit_price: 120_000,
    },
  },
};
const STABLE_1250: WeighProductOutcome = {
  kind: "stable",
  weight_thousandths: 1250,
  amount: 1_562_500,
};
const UNSTEADY_238: WeighProductOutcome = {
  kind: "unsteady",
  weight_thousandths: 238,
  amount: 185_640,
};
type ProductFound = Extract<FindProductByCodeOutcome, { kind: "found" }>["product"];
function legendOf() {
  return Array.from(document.querySelectorAll("main ul li"), (item) => item.textContent);
}

const CARD_OF_QUESO = { name: "Queso cremoso" };

function salesWith(...lines: OpenSale["lines"]): OpenSale {
  return { ...SALE_OF_QUESO, lines, total: 0, pending: 0 };
}

function lineOf(found: ProductFound, id: string): OpenSale["lines"][number] {
  return {
    ...QUESO,
    id,
    product_id: found.product_id,
    product_name: found.name,
    sale_unit: found.sale_unit,
    quantity: found.sale_unit === "KG" ? 1000 : 1,
    list_unit_price: found.unit_price ?? 0,
    line_total: found.unit_price ?? 0,
    weight_source: found.sale_unit === "KG" ? "SCALE" : null,
  };
}

function productOf(code: string): ProductFound {
  const outcome = PRODUCTS[code];
  if (outcome?.kind !== "found") {
    throw new Error(`no product for ${code}`);
  }
  return outcome.product;
}

function weighingScale(weighProduct: SaleScreenProps["weighProduct"]): Overrides {
  return {
    scanProduct: vi.fn(async () => WEIGHT_NEEDED),
    findProductByCode: vi.fn(
      async (code: string) => PRODUCTS[code] ?? { kind: "unknown_code" as const },
    ),
    weighProduct,
  };
}

function stableScale() {
  return vi.fn(
    async (_productId: string, confirmed: number | null): Promise<WeighProductOutcome> =>
      confirmed === null
        ? STABLE_1250
        : {
            kind: "added",
            removed_manual_discount: false,
            removed_sale_discount: false,
            sale: SALE_OF_QUESO,
          },
  );
}

const added = (sale: OpenSale): AddProductOutcome => ({
  kind: "added",
  removed_manual_discount: false,
  removed_sale_discount: false,
  sale,
});

describe("SaleScreen weighing card", () => {
  it("shows the weighing as a card between the search field and the lines, not as a dialog", async () => {
    const { screen, field } = await renderScreen({
      ...weighingScale(stableScale()),
      currentSale: async () => SALE_OF_YERBA,
    });

    await scan(field, "7790001");

    const card = screen.getByRole("region", CARD_OF_QUESO);
    await expect.element(card).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    const fieldBox = field.element().getBoundingClientRect();
    const cardBox = card.element().getBoundingClientRect();
    const linesBox = screen.getByLabelText("Líneas de la venta").element().getBoundingClientRect();
    expect(cardBox.top).toBeGreaterThanOrEqual(fieldBox.bottom);
    expect(linesBox.top).toBeGreaterThanOrEqual(cardBox.bottom);
  });

  it("shows the price of a scanned product from the core's answer for its code", async () => {
    const overrides = weighingScale(stableScale());
    const { screen, field } = await renderScreen(overrides);

    await scan(field, "7790001");

    await expect
      .element(screen.getByRole("region", CARD_OF_QUESO).getByText("$ 12.500,00 / kg"))
      .toBeVisible();
    expect(overrides.findProductByCode).toHaveBeenCalledExactlyOnceWith("7790001");
  });

  it("shows no price when the core cannot answer for the code", async () => {
    const { screen, field } = await renderScreen({
      ...weighingScale(stableScale()),
      findProductByCode: vi.fn(async () => {
        throw new Error("core is down");
      }),
    });

    await scan(field, "7790001");

    const card = screen.getByRole("region", CARD_OF_QUESO);
    await expect.element(card).toBeVisible();
    await expect.element(card.getByText("/ kg", { exact: false })).not.toBeInTheDocument();
  });

  it("shows the price of a product chosen by name from the search result", async () => {
    const findProductByCode = vi.fn(
      async (): Promise<FindProductByCodeOutcome> => ({ kind: "unknown_code" }),
    );
    const { screen, field } = await renderScreen({
      ...weighingScale(stableScale()),
      findProductByCode,
      searchProducts: vi.fn(async () => ({
        kind: "results" as const,
        products: [{ ...productOf("7790001"), matches: [] }],
        more: false,
      })),
      addProduct: vi.fn(async (): Promise<AddProductOutcome> => WEIGHT_NEEDED),
    });

    await field.fill("queso");
    await expect.element(screen.getByRole("option", { name: /Queso cremoso/ })).toBeVisible();
    await userEvent.keyboard("{Enter}");

    await expect
      .element(screen.getByRole("region", CARD_OF_QUESO).getByText("$ 12.500,00 / kg"))
      .toBeVisible();
    expect(findProductByCode).not.toHaveBeenCalled();
  });

  it("shows the price of the line when the weight of a line is weighed again", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_QUESO,
      weighLine: vi.fn(async (): Promise<WeighLineOutcome> => ({ kind: "weighing" })),
    });

    await screen.getByRole("button", { name: "Cambiar el peso de Queso cremoso" }).click();

    await expect
      .element(screen.getByRole("region", CARD_OF_QUESO).getByText("$ 12.500,00 / kg"))
      .toBeVisible();
  });

  it("shows the stable weight and its amount with Estable, and the keys of its actions", async () => {
    const { screen, field } = await renderScreen(weighingScale(stableScale()));

    await scan(field, "7790001");

    const card = screen.getByRole("region", CARD_OF_QUESO);
    await expect.element(card.getByText("Estable")).toBeVisible();
    await expect.element(card.getByText("1,250 kg")).toBeVisible();
    await expect.element(card.getByText("$ 15.625,00")).toBeVisible();
    const keyOf = (name: string) =>
      card.getByRole("button", { name, exact: true }).element().querySelector("kbd")?.textContent;
    expect(keyOf("Confirmar")).toBe("Enter");
    expect(keyOf("Escribir peso")).toBe("F5");
    expect(keyOf("Cancelar")).toBe("Esc");
  });

  it("shows Moviéndose with Confirmar disabled while the reading is not stable", async () => {
    const { screen, field } = await renderScreen(weighingScale(vi.fn(async () => UNSTEADY_238)));

    await scan(field, "7790001");

    const card = screen.getByRole("region", CARD_OF_QUESO);
    await expect.element(card.getByText("Moviéndose")).toBeVisible();
    await expect.element(card.getByText("0,238 kg")).toBeVisible();
    await expect.element(card.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    await expect.element(card.getByRole("button", { name: "Escribir peso" })).toBeEnabled();
  });

  it("adds the line with the weight and amount shown when Enter is pressed", async () => {
    const weighProduct = stableScale();
    const { screen, field } = await renderScreen({
      ...weighingScale(weighProduct),
      currentSale: async () => SALE_OF_YERBA,
    });
    await scan(field, "7790001");
    await expect.element(screen.getByText("Estable")).toBeVisible();

    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByRole("region", CARD_OF_QUESO)).not.toBeInTheDocument();
    expect(weighProduct).toHaveBeenLastCalledWith("p-queso", 1250);
  });

  it("opens the typed weight form with F5", async () => {
    const { screen, field } = await renderScreen(weighingScale(stableScale()));
    await scan(field, "7790001");
    await expect.element(screen.getByText("Estable")).toBeVisible();

    await userEvent.keyboard("{F5}");

    await expect.element(screen.getByRole("textbox", { name: "Peso en kg" })).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Peso de Queso cremoso" }))
      .toBeVisible();
  });

  it("cancels only the weighing with Esc, adding nothing", async () => {
    const weighProduct = stableScale();
    const { screen, field } = await renderScreen({
      ...weighingScale(weighProduct),
      currentSale: async () => SALE_OF_YERBA,
    });
    await scan(field, "7790001");
    await expect.element(screen.getByText("Estable")).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("region", CARD_OF_QUESO)).not.toBeInTheDocument();
    expect(weighProduct.mock.calls.every(([, confirmed]) => confirmed === null)).toBe(true);
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
  });

  it("keeps the card when the weight typed is refused", async () => {
    const { screen, field } = await renderScreen({
      ...weighingScale(stableScale()),
      addWeighedProduct: vi.fn(
        async (): Promise<AddWeighedProductOutcome> => ({ kind: "invalid_weight" }),
      ),
    });
    await scan(field, "7790001");
    await userEvent.keyboard("{F5}");
    await screen.getByRole("textbox", { name: "Peso en kg" }).fill("1");
    await screen.getByRole("button", { name: "Agregar" }).click();

    await expect
      .element(screen.getByText("Ingresá un peso mayor a 0 kg, con hasta 3 decimales."))
      .toBeVisible();
    await expect.element(screen.getByRole("region", CARD_OF_QUESO)).toBeInTheDocument();
  });
});

describe("SaleScreen balanza card", () => {
  it("is beside the search field and shows no reading outside a weighing", async () => {
    const { screen, field } = await renderScreen({ currentSale: async () => SALE_OF_QUESO });

    const label = screen.getByText("Balanza", { exact: true });
    await expect.element(label).toBeVisible();
    expect(label.element().parentElement?.textContent).toBe("Balanza");
    const fieldBox = field.element().getBoundingClientRect();
    const cardBox = label.element().getBoundingClientRect();
    expect(cardBox.left).toBeGreaterThanOrEqual(fieldBox.right);
    expect(cardBox.top).toBeLessThan(fieldBox.bottom);
  });

  it("shows the reading of the weighing in progress", async () => {
    const { screen, field } = await renderScreen(weighingScale(stableScale()));

    await scan(field, "7790001");

    const label = screen.getByText("Balanza", { exact: true });
    await expect.poll(() => label.element().parentElement?.textContent).toBe("Balanza1,250 kg");
  });

  it("shows the reading of a line weighed again", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_QUESO,
      weighLine: vi.fn(
        async (): Promise<WeighLineOutcome> => ({
          kind: "stable",
          weight_thousandths: 800,
          amount: 1_000_000,
        }),
      ),
    });

    await screen.getByRole("button", { name: "Cambiar el peso de Queso cremoso" }).click();

    const label = screen.getByText("Balanza", { exact: true });
    await expect.poll(() => label.element().parentElement?.textContent).toBe("Balanza0,800 kg");
  });

  it("shows no reading again once the weighing ends", async () => {
    const { screen, field } = await renderScreen(weighingScale(stableScale()));
    await scan(field, "7790001");
    const label = screen.getByText("Balanza", { exact: true });
    await expect.poll(() => label.element().parentElement?.textContent).toBe("Balanza1,250 kg");

    await userEvent.keyboard("{Escape}");

    await expect.poll(() => label.element().parentElement?.textContent).toBe("Balanza");
  });
});

describe("SaleScreen while weighing", () => {
  async function weighingWithFourLines() {
    const rendered = await renderScreen({
      ...weighingScale(stableScale()),
      currentSale: async () => SALE_OF_FOUR_LINES,
    });
    await expect.element(rendered.screen.getByText("Pasas de uva")).toBeVisible();
    await scan(rendered.field, "7790001");
    await expect.element(rendered.screen.getByRole("region", CARD_OF_QUESO)).toBeVisible();
    return rendered;
  }

  it.each(["Cobrar en efectivo", "Point débito", "Point crédito", "QR", "Otros medios", "Vaciar"])(
    "greys out %s",
    async (name) => {
      const { screen } = await weighingWithFourLines();

      await expect.element(screen.getByRole("button", { name })).toBeDisabled();
    },
  );

  it.each(["F12", "F9", "F10", "F11", "F1"])("does nothing on %s", async (key) => {
    const { screen } = await weighingWithFourLines();

    await userEvent.keyboard(`{${key}}`);

    expect(screen.router.state.location.pathname).toBe("/");
  });

  it("keeps the total and the number of articles", async () => {
    const { screen } = await weighingWithFourLines();

    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    await expect.element(panel.getByText("$ 25.192,50").first()).toBeVisible();
    await expect.element(panel.getByText("Artículos")).toBeVisible();
  });

  it("leaves Esc to the weighing card alone", async () => {
    const { screen } = await weighingWithFourLines();

    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    const keys = Array.from(panel.element().querySelectorAll("kbd")).map((key) => key.textContent);
    expect(keys).not.toContain("Esc");
    expect(screen.getByText("Esc", { exact: true }).elements()).toHaveLength(1);
  });

  it("charges again once the weighing is cancelled", async () => {
    const { screen } = await weighingWithFourLines();

    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("button", { name: "Cobrar en efectivo" })).toBeEnabled();
    await expect.element(screen.getByRole("button", { name: "Vaciar" })).toBeEnabled();
    await userEvent.keyboard("{F12}");
    await expect.poll(() => screen.router.state.location.pathname).toBe("/charge");
  });

  it("offers no Quitar in the legend and removes no line with Supr", async () => {
    const removeSaleLine = vi.fn();
    const { screen, field } = await renderScreen({
      ...weighingScale(stableScale()),
      currentSale: async () => SALE_OF_FOUR_LINES,
      removeSaleLine,
    });
    await expect.element(screen.getByText("Pasas de uva")).toBeVisible();
    expect(legendOf()).toContain("SuprQuitar");
    await scan(field, "7790001");
    await expect.element(screen.getByRole("region", CARD_OF_QUESO)).toBeVisible();

    expect(legendOf()).not.toContain("SuprQuitar");
    await userEvent.keyboard("{Delete}");

    expect(removeSaleLine).not.toHaveBeenCalled();
  });
});

describe("SaleScreen weighing again with F3", () => {
  it("shows Pesar in the legend for a line sold by weight and weighs it again with F3", async () => {
    const weighLine = vi.fn(async (): Promise<WeighLineOutcome> => ({ kind: "weighing" }));
    const { screen } = await renderScreen({ currentSale: async () => SALE_OF_QUESO, weighLine });

    await expect.element(screen.getByRole("row").last()).toHaveAttribute("aria-current", "true");
    expect(legendOf()).toContain("F3Pesar");
    await userEvent.keyboard("{F3}");

    await expect.element(screen.getByRole("region", CARD_OF_QUESO)).toBeVisible();
    expect(weighLine).toHaveBeenCalledWith("line-3", 1250, null);
  });

  it("offers no Pesar for a line sold by unit", async () => {
    const weighLine = vi.fn(async (): Promise<WeighLineOutcome> => ({ kind: "weighing" }));
    const { screen } = await renderScreen({ currentSale: async () => SALE_OF_YERBA, weighLine });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();

    expect(legendOf()).not.toContain("F3Pesar");
    await userEvent.keyboard("{F3}");

    expect(weighLine).not.toHaveBeenCalled();
  });

  it("offers no Pesar while a weighing is in progress", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_QUESO,
      weighLine: vi.fn(async (): Promise<WeighLineOutcome> => ({ kind: "weighing" })),
    });
    await userEvent.keyboard("{F3}");
    await expect.element(screen.getByRole("region", CARD_OF_QUESO)).toBeVisible();

    expect(legendOf()).not.toContain("F3Pesar");
  });
});

describe("SaleScreen products waiting during a weighing", () => {
  async function weighingWith(overrides: Overrides = {}) {
    const addProduct =
      overrides.addProduct ?? vi.fn(async (): Promise<AddProductOutcome> => WEIGHT_NEEDED);
    const weighProduct = overrides.weighProduct ?? stableScale();
    const scale = weighingScale(weighProduct);
    const rendered = await renderScreen({
      ...scale,
      addProduct,
      currentSale: async () => SALE_OF_YERBA,
      ...overrides,
    });
    await scan(rendered.field, "7790001");
    await expect.element(rendered.screen.getByText("Estable")).toBeVisible();
    const lookups = vi.mocked(scale.findProductByCode as SaleScreenProps["findProductByCode"]);
    async function readAndWait(code: string) {
      const before = lookups.mock.calls.length;
      rendered.readBarcode(code);
      await vi.waitFor(() => expect(lookups.mock.calls.length).toBe(before + 1));
      await lookups.mock.results[before]?.value;
    }
    return { ...rendered, addProduct, weighProduct, readAndWait };
  }

  it("shows a scanned product under the card as waiting, with its unit price, and keeps weighing", async () => {
    const scanProduct = vi.fn(async () => WEIGHT_NEEDED);
    const { screen, readBarcode } = await weighingWith({ scanProduct });

    readBarcode("7790002");

    await expect.element(screen.getByText("En espera")).toBeVisible();
    await expect.element(screen.getByText("Aceite de oliva extra virgen 500 ml")).toBeVisible();
    await expect.element(screen.getByText("$ 9.400,00 / u", { exact: false })).toBeVisible();
    const discard = screen.getByRole("button", { name: "Descartar", exact: true });
    expect(discard.element().querySelector("kbd")?.textContent).toBe("Supr");
    await expect.element(screen.getByRole("region", CARD_OF_QUESO)).toBeVisible();
    expect(scanProduct).toHaveBeenCalledTimes(1);
  });

  it("does not add the waiting product to the sale while the weighing goes on", async () => {
    const { screen, readBarcode, addProduct } = await weighingWith();

    readBarcode("7790002");
    await expect.element(screen.getByText("En espera")).toBeVisible();

    expect(addProduct).not.toHaveBeenCalled();
  });

  it("shows the refusal for an unknown code and queues nothing, keeping the weighing", async () => {
    const { screen, readBarcode } = await weighingWith();

    readBarcode("0000");

    await expect.element(screen.getByText("No hay ningún producto con ese código")).toBeVisible();
    await expect.element(screen.getByText("En espera")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("region", CARD_OF_QUESO)).toBeVisible();
  });

  it("queues a code typed in the search field while the reading is moving instead of adding it", async () => {
    const scanProduct = vi.fn(async () => WEIGHT_NEEDED);
    const { screen, field } = await renderScreen({
      ...weighingScale(vi.fn(async () => UNSTEADY_238)),
      scanProduct,
      currentSale: async () => SALE_OF_YERBA,
    });
    await scan(field, "7790001");
    await expect.element(screen.getByText("Moviéndose")).toBeVisible();

    await field.fill("7790002");
    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText("En espera")).toBeVisible();
    expect(scanProduct).toHaveBeenCalledTimes(1);
  });

  it("queues a product read while the typed weight form is open", async () => {
    const { screen, readBarcode } = await weighingWith();
    await userEvent.keyboard("{F5}");
    await expect.element(screen.getByRole("textbox", { name: "Peso en kg" })).toBeVisible();

    readBarcode("7790002");

    await expect.element(screen.getByText("En espera")).toBeVisible();
    await expect
      .element(screen.getByText("No se agregó el producto escaneado"))
      .not.toBeInTheDocument();
  });

  it("removes the first waiting product with Supr, leaving the next one", async () => {
    const { screen, readAndWait } = await weighingWith();
    await readAndWait("7790002");
    await expect.element(screen.getByText("Aceite de oliva extra virgen 500 ml")).toBeVisible();
    await readAndWait("7790004");

    await userEvent.keyboard("{Delete}");

    await expect.element(screen.getByText("Azúcar 1 kg")).toBeVisible();
    await expect
      .element(screen.getByText("Aceite de oliva extra virgen 500 ml"))
      .not.toBeInTheDocument();
  });

  it("removes the first waiting product with the Descartar button", async () => {
    const { screen, readBarcode } = await weighingWith();
    readBarcode("7790002");
    await expect.element(screen.getByText("En espera")).toBeVisible();

    await screen.getByRole("button", { name: "Descartar" }).click();

    await expect.element(screen.getByText("En espera")).not.toBeInTheDocument();
  });

  it("adds a waiting product sold by unit once Enter ends the weighing", async () => {
    const lines = [lineOf(productOf("7790002"), "line-aceite")];
    const addProduct = vi.fn(async (): Promise<AddProductOutcome> => added(salesWith(...lines)));
    const { screen, readBarcode } = await weighingWith({ addProduct });
    readBarcode("7790002");
    await expect.element(screen.getByText("En espera")).toBeVisible();

    await userEvent.keyboard("{Enter}");

    await expect.poll(() => addProduct.mock.calls).toEqual([["p-aceite"]]);
    await expect.element(screen.getByText("En espera")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("region", CARD_OF_QUESO)).not.toBeInTheDocument();
  });

  it("opens the weighing of a waiting product sold by weight once Esc ends the weighing", async () => {
    const addProduct = vi.fn(
      async (): Promise<AddProductOutcome> => ({
        kind: "weight_needed",
        product_id: "p-pasas",
        product_name: "Pasas de uva",
      }),
    );
    const weighProduct = stableScale();
    const { screen, readBarcode } = await weighingWith({ addProduct, weighProduct });
    readBarcode("7790003");
    await expect.element(screen.getByText("En espera")).toBeVisible();

    await userEvent.keyboard("{Escape}");

    const card = screen.getByRole("region", { name: "Pasas de uva" });
    await expect.element(card).toBeVisible();
    await expect.element(card.getByText("$ 7.800,00 / kg")).toBeVisible();
    await expect.element(screen.getByText("En espera")).not.toBeInTheDocument();
    expect(addProduct).toHaveBeenCalledExactlyOnceWith("p-pasas");
    expect(weighProduct).toHaveBeenCalledWith("p-pasas", null);
    expect(weighProduct.mock.calls.every(([, confirmed]) => confirmed === null)).toBe(true);
  });

  it("processes the waiting products in the order they were scanned", async () => {
    const aceite = lineOf(productOf("7790002"), "line-aceite");
    const addProduct = vi
      .fn<SaleScreenProps["addProduct"]>()
      .mockResolvedValueOnce(added(salesWith(aceite)))
      .mockResolvedValueOnce({
        kind: "weight_needed",
        product_id: "p-pasas",
        product_name: "Pasas de uva",
      });
    const { screen, readAndWait } = await weighingWith({ addProduct });
    await readAndWait("7790002");
    await expect.element(screen.getByText("Aceite de oliva extra virgen 500 ml")).toBeVisible();
    await readAndWait("7790003");

    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("region", { name: "Pasas de uva" })).toBeVisible();
    expect(addProduct.mock.calls).toEqual([["p-aceite"], ["p-pasas"]]);
  });

  it("keeps the remaining waiting products when the next weighing is cancelled with Esc", async () => {
    const addProduct = vi
      .fn<SaleScreenProps["addProduct"]>()
      .mockResolvedValueOnce({
        kind: "weight_needed",
        product_id: "p-pasas",
        product_name: "Pasas de uva",
      })
      .mockResolvedValueOnce(added(salesWith(lineOf(productOf("7790004"), "line-azucar"))));
    const { screen, readAndWait } = await weighingWith({ addProduct });
    await readAndWait("7790003");
    await expect.element(screen.getByText("Pasas de uva")).toBeVisible();
    await readAndWait("7790004");

    await userEvent.keyboard("{Escape}");
    await expect.element(screen.getByRole("region", { name: "Pasas de uva" })).toBeVisible();
    await expect.element(screen.getByText("Azúcar 1 kg")).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.poll(() => addProduct.mock.calls).toEqual([["p-pasas"], ["p-azucar"]]);
    await expect.element(screen.getByText("En espera")).not.toBeInTheDocument();
  });

  it("processes the waiting product once the typed weight is accepted", async () => {
    const addWeighedProduct = vi.fn(
      async (): Promise<AddWeighedProductOutcome> => ({
        kind: "added",
        removed_manual_discount: false,
        removed_sale_discount: false,
        sale: SALE_OF_QUESO,
      }),
    );
    const addProduct = vi.fn(
      async (): Promise<AddProductOutcome> => added(salesWith(lineOf(productOf("7790002"), "l"))),
    );
    const { screen, readBarcode } = await weighingWith({ addWeighedProduct, addProduct });
    readBarcode("7790002");
    await expect.element(screen.getByText("En espera")).toBeVisible();
    await userEvent.keyboard("{F5}");
    await screen.getByRole("textbox", { name: "Peso en kg" }).fill("1,25");
    await screen.getByRole("button", { name: "Agregar" }).click();

    await expect.poll(() => addProduct.mock.calls).toEqual([["p-aceite"]]);
    expect(addWeighedProduct).toHaveBeenCalledExactlyOnceWith("p-queso", 1250);
  });

  it("does not process a discarded waiting product", async () => {
    const { screen, readBarcode, addProduct } = await weighingWith();
    readBarcode("7790002");
    await expect.element(screen.getByText("En espera")).toBeVisible();
    await userEvent.keyboard("{Delete}");
    await expect.element(screen.getByText("En espera")).not.toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("region", CARD_OF_QUESO)).not.toBeInTheDocument();
    expect(addProduct).not.toHaveBeenCalled();
  });

  it("shows the refusal of a waiting product the core refuses once the weighing ends", async () => {
    const addProduct = vi.fn(
      async (): Promise<AddProductOutcome> => ({ kind: "product_unavailable" }),
    );
    const { screen, readBarcode } = await weighingWith({ addProduct });
    readBarcode("7790002");
    await expect.element(screen.getByText("En espera")).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByText("Ese producto ya no se vende")).toBeVisible();
  });
});
