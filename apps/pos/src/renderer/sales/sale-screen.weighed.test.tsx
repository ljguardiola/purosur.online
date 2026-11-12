import type {
  AddProductOutcome,
  AddWeighedProductOutcome,
  ChangeLineWeightOutcome,
  WeighLineOutcome,
  WeighProductOutcome,
} from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { SaleScreenProps } from "./sale-screen";
import type { Overrides } from "./test-support/sale-screen";
import {
  deferred,
  QUESO,
  renderScreen,
  SALE_OF_QUESO,
  SALE_OF_YERBA,
  scan,
} from "./test-support/sale-screen";

const WEIGHT_NEEDED = {
  kind: "weight_needed" as const,
  product_id: "p-queso",
  product_name: "Queso cremoso",
};
const INVALID_WEIGHT_MESSAGE = "Ingresá un peso mayor a 0 kg, con hasta 3 decimales.";

function scanning(overrides: Overrides = {}) {
  return renderScreen({
    scanProduct: vi.fn(async () => WEIGHT_NEEDED),
    ...overrides,
  });
}

async function typeWeight(
  screen: Awaited<ReturnType<typeof renderScreen>>["screen"],
  weight: string,
) {
  await screen.getByRole("textbox", { name: "Peso en kg" }).fill(weight);
  await screen.getByRole("button", { name: "Agregar" }).click();
}

describe("SaleScreen adding a product sold by weight", () => {
  it("asks for the weight of a scanned product instead of refusing it", async () => {
    const { screen, field } = await scanning();

    await scan(field, "7790001");

    await expect
      .element(screen.getByRole("heading", { name: "Peso de Queso cremoso" }))
      .toBeVisible();
    await expect
      .element(screen.getByText("Queso cremoso se vende por kilo"))
      .not.toBeInTheDocument();
  });

  it("asks for the weight of a product chosen by name", async () => {
    const addProduct = vi.fn(async (): Promise<AddProductOutcome> => WEIGHT_NEEDED);
    const { screen, field } = await renderScreen({
      searchProducts: vi.fn(async () => ({
        kind: "results" as const,
        products: [
          {
            product_id: "p-queso",
            name: "Queso cremoso",
            sale_unit: "KG" as const,
            unit_price: 1_250_000,
            matches: [],
          },
        ],
        more: false,
      })),
      addProduct,
    });

    await field.fill("queso");
    await expect.element(screen.getByRole("option", { name: /Queso cremoso/ })).toBeVisible();
    await userEvent.keyboard("{Enter}");

    await expect
      .element(screen.getByRole("heading", { name: "Peso de Queso cremoso" }))
      .toBeVisible();
    expect(addProduct).toHaveBeenCalledExactlyOnceWith("p-queso");
  });

  it("adds the product with the typed weight and highlights its line", async () => {
    const currentSale = vi.fn().mockResolvedValueOnce(SALE_OF_YERBA);
    const addWeighedProduct = vi.fn(
      async (): Promise<AddWeighedProductOutcome> => ({
        kind: "added",
        removed_manual_discount: false,
        removed_sale_discount: false,
        sale: { ...SALE_OF_QUESO, lines: [...SALE_OF_YERBA.lines, QUESO] },
      }),
    );
    const { screen, field } = await scanning({ currentSale, addWeighedProduct });
    const lines = screen.getByRole("row");
    await expect.element(lines).toHaveLength(2);

    await scan(field, "7790001");
    await typeWeight(screen, "1,25");

    expect(addWeighedProduct).toHaveBeenCalledExactlyOnceWith("p-queso", 1250);
    await expect.element(screen.getByText("1,250 kg")).toBeVisible();
    await expect.element(lines).toHaveLength(3);
    await expect.element(lines.nth(1)).not.toHaveAttribute("aria-current");
    await expect.element(lines.last()).toHaveAttribute("aria-current", "true");
    await expect
      .element(screen.getByRole("heading", { name: "Peso de Queso cremoso" }))
      .not.toBeInTheDocument();
    await expect.element(field).toHaveValue("");
  });

  it("adds nothing when the weight is cancelled, leaving the search field empty", async () => {
    const addWeighedProduct = vi.fn(
      async (): Promise<AddWeighedProductOutcome> => ({ kind: "unavailable" }),
    );
    const { screen, field } = await scanning({ addWeighedProduct });

    await scan(field, "7790001");
    await screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();

    await expect
      .element(screen.getByRole("heading", { name: "Peso de Queso cremoso" }))
      .not.toBeInTheDocument();
    expect(addWeighedProduct).not.toHaveBeenCalled();
    await expect.element(field).toHaveValue("");
    await expect.element(screen.getByText("La venta está vacía")).toBeVisible();
  });

  it("keeps the modal and shows the field error when the core refuses the weight", async () => {
    const { screen, field } = await scanning({
      addWeighedProduct: vi.fn(
        async (): Promise<AddWeighedProductOutcome> => ({ kind: "invalid_weight" }),
      ),
    });

    await scan(field, "7790001");
    await typeWeight(screen, "1");

    await expect.element(screen.getByText(INVALID_WEIGHT_MESSAGE)).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Peso de Queso cremoso" }))
      .toBeVisible();
  });

  it.each([
    [{ kind: "no_price", product_name: "Queso cremoso" }, "Queso cremoso no tiene precio"],
    [{ kind: "product_unavailable" }, "Ese producto ya no se vende"],
    [{ kind: "not_sold_by_weight" }, "Queso cremoso ya no se vende por kilo"],
    [{ kind: "not_permitted" }, "No tenés el permiso de vender y cobrar"],
    [{ kind: "installation_revoked" }, "Esta caja ya no puede empezar ventas"],
    [{ kind: "paid_order_without_sale" }, "Hay un cobro pagado sin venta"],
    [{ kind: "paid_orders_not_checked" }, "La caja todavía está consultando los cobros pagados"],
    [{ kind: "unavailable" }, "No se pudo agregar el producto"],
  ] satisfies [AddWeighedProductOutcome, string][])(
    "closes the modal and shows why the product was not added: %j",
    async (outcome, title) => {
      const { screen, field } = await scanning({ addWeighedProduct: vi.fn(async () => outcome) });

      await scan(field, "7790001");
      await typeWeight(screen, "1");

      await expect.element(screen.getByText(title)).toBeVisible();
      await expect
        .element(screen.getByRole("heading", { name: "Peso de Queso cremoso" }))
        .not.toBeInTheDocument();
    },
  );

  it("reads the sale again when it already has payments", async () => {
    const currentSale = vi.fn(async () => SALE_OF_YERBA);
    const { screen, field } = await scanning({
      currentSale,
      addWeighedProduct: vi.fn(
        async (): Promise<AddWeighedProductOutcome> => ({ kind: "sale_has_payments" }),
      ),
    });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    const readsBefore = currentSale.mock.calls.length;

    await scan(field, "7790001");
    await typeWeight(screen, "1");

    await expect.poll(() => currentSale.mock.calls.length).toBeGreaterThan(readsBefore);
    await expect
      .element(screen.getByRole("heading", { name: "Peso de Queso cremoso" }))
      .not.toBeInTheDocument();
  });

  it.each(["not_signed_in", "no_open_session"] as const)(
    "reports the session as invalid on %s",
    async (kind) => {
      const onSessionInvalid = vi.fn();
      const { screen, field } = await scanning({
        onSessionInvalid,
        addWeighedProduct: vi.fn(async (): Promise<AddWeighedProductOutcome> => ({ kind })),
      });

      await scan(field, "7790001");
      await typeWeight(screen, "1");

      await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
    },
  );
});

describe("SaleScreen weighing a product on the scale", () => {
  const WEIGHING_OUTCOME: WeighProductOutcome = { kind: "weighing" };

  it("shows that it is weighing and adds nothing while the scale is not stable", async () => {
    const addWeighedProduct = vi.fn(
      async (): Promise<AddWeighedProductOutcome> => ({ kind: "unavailable" }),
    );
    const weighProduct = vi.fn(async () => WEIGHING_OUTCOME);
    const { screen, field } = await scanning({ weighProduct, addWeighedProduct });

    await scan(field, "7790001");

    const dialog = screen.getByRole("region", { name: "Queso cremoso" });
    await expect.element(dialog.getByText("Moviéndose")).toBeVisible();
    await expect.element(dialog.getByText("0,000 kg")).toBeVisible();
    await expect.element(dialog.getByText("$ 0,00")).toBeVisible();
    expect(weighProduct).toHaveBeenCalledWith("p-queso", null);
    expect(addWeighedProduct).not.toHaveBeenCalled();
    await expect.element(screen.getByText("La venta está vacía")).toBeVisible();
  });

  it("shows the unsteady weight and its amount as weighing and adds nothing", async () => {
    const addWeighedProduct = vi.fn(
      async (): Promise<AddWeighedProductOutcome> => ({ kind: "unavailable" }),
    );
    const weighProduct = vi.fn(
      async (): Promise<WeighProductOutcome> => ({
        kind: "unsteady",
        weight_thousandths: 140,
        amount: 175_000,
      }),
    );
    const { screen, field } = await scanning({ weighProduct, addWeighedProduct });

    await scan(field, "7790001");

    const dialog = screen.getByRole("region", { name: "Queso cremoso" });
    await expect.element(dialog.getByText("Moviéndose")).toBeVisible();
    await expect.element(dialog.getByText("0,140 kg")).toBeVisible();
    await expect.element(dialog.getByText("$ 1.750,00")).toBeVisible();
    await expect.element(dialog.getByText("Estable")).not.toBeInTheDocument();
    expect(addWeighedProduct).not.toHaveBeenCalled();
    await expect.element(screen.getByText("La venta está vacía")).toBeVisible();
  });

  it("shows that it is weighing with no weight for an unsteady reading out of range, adding nothing", async () => {
    const addWeighedProduct = vi.fn(
      async (): Promise<AddWeighedProductOutcome> => ({ kind: "unavailable" }),
    );
    const weighProduct = vi.fn(
      async (): Promise<WeighProductOutcome> => ({ kind: "unsteady_out_of_range" }),
    );
    const { screen, field } = await scanning({ weighProduct, addWeighedProduct });

    await scan(field, "7790001");

    const dialog = screen.getByRole("region", { name: "Queso cremoso" });
    await expect.element(dialog.getByText("Moviéndose")).toBeVisible();
    await expect.element(dialog.getByText("0,000 kg")).toBeVisible();
    await vi.waitFor(() => expect(weighProduct.mock.calls.length).toBeGreaterThan(1));
    await expect.element(dialog.getByText("Moviéndose")).toBeVisible();
    expect(addWeighedProduct).not.toHaveBeenCalled();
  });

  it("shows each stable reading without adding the line until the cashier confirms", async () => {
    const addedSale = {
      ...SALE_OF_QUESO,
      lines: [...SALE_OF_YERBA.lines, { ...QUESO, weight_source: "SCALE" as const }],
    };
    const currentSale = vi.fn().mockResolvedValueOnce(SALE_OF_YERBA);
    const weighProduct = vi.fn(
      async (_productId: string, confirmed: number | null): Promise<WeighProductOutcome> =>
        confirmed === 1250
          ? {
              kind: "added",
              removed_manual_discount: false,
              removed_sale_discount: false,
              sale: addedSale,
            }
          : { kind: "stable", weight_thousandths: 1250, amount: 1_562_500 },
    );
    const { screen, field } = await scanning({ currentSale, weighProduct });
    const lines = screen.getByRole("row");
    await expect.element(lines).toHaveLength(2);

    await scan(field, "7790001");

    const dialog = screen.getByRole("region", { name: "Queso cremoso" });
    await expect.element(dialog.getByText("Estable")).toBeVisible();
    await expect.element(dialog.getByText("1,250 kg")).toBeVisible();
    await expect.element(dialog.getByText("$ 15.625,00")).toBeVisible();
    await expect.element(lines).toHaveLength(2);

    await screen.getByRole("button", { name: "Confirmar" }).click();

    await expect.element(lines).toHaveLength(3);
    await expect.element(lines.last()).toHaveAttribute("aria-current", "true");
    await expect
      .element(screen.getByRole("heading", { name: "Queso cremoso" }))
      .not.toBeInTheDocument();
    await expect.element(field).toHaveValue("");
    expect(weighProduct).toHaveBeenCalledWith("p-queso", 1250);
  });

  it("asks for a weight when the confirmed weight is zero", async () => {
    const { screen, field } = await scanning({
      weighProduct: vi.fn(
        async (_productId: string, confirmed: number | null): Promise<WeighProductOutcome> =>
          confirmed === null
            ? { kind: "stable", weight_thousandths: 0, amount: 0 }
            : { kind: "zero_weight" },
      ),
    });

    await scan(field, "7790001");
    await screen.getByRole("button", { name: "Confirmar" }).click();

    await expect
      .element(screen.getByText("Poné el producto en la balanza o tipeá el peso.").first())
      .toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "Queso cremoso" })).toBeVisible();
  });

  it("adds the typed weight when the cashier types instead of weighing", async () => {
    const addWeighedProduct = vi.fn(
      async (): Promise<AddWeighedProductOutcome> => ({
        kind: "added",
        removed_manual_discount: false,
        removed_sale_discount: false,
        sale: SALE_OF_QUESO,
      }),
    );
    const { screen, field } = await scanning({
      weighProduct: vi.fn(async () => WEIGHING_OUTCOME),
      addWeighedProduct,
    });

    await scan(field, "7790001");
    await screen.getByRole("button", { name: "Escribir peso" }).click();
    await typeWeight(screen, "1,25");

    expect(addWeighedProduct).toHaveBeenCalledExactlyOnceWith("p-queso", 1250);
    await expect
      .element(screen.getByRole("heading", { name: "Queso cremoso" }))
      .not.toBeInTheDocument();
  });

  it("shows the typed weight form with a note when the scale is not available", async () => {
    const { screen, field } = await scanning({
      weighProduct: vi.fn(
        async (): Promise<WeighProductOutcome> => ({ kind: "scale_unavailable" }),
      ),
    });

    await scan(field, "7790001");

    await expect
      .element(screen.getByText("La balanza no está disponible. Tipeá el peso.").first())
      .toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Peso en kg" })).toBeVisible();
  });

  it.each([
    [{ kind: "no_price", product_name: "Queso cremoso" }, "Queso cremoso no tiene precio"],
    [{ kind: "product_unavailable" }, "Ese producto ya no se vende"],
    [{ kind: "not_sold_by_weight" }, "Queso cremoso ya no se vende por kilo"],
    [{ kind: "not_permitted" }, "No tenés el permiso de vender y cobrar"],
    [{ kind: "installation_revoked" }, "Esta caja ya no puede empezar ventas"],
    [{ kind: "paid_order_without_sale" }, "Hay un cobro pagado sin venta"],
    [{ kind: "paid_orders_not_checked" }, "La caja todavía está consultando los cobros pagados"],
    [{ kind: "unavailable" }, "No se pudo agregar el producto"],
  ] satisfies [WeighProductOutcome, string][])(
    "closes the modal and shows why the product was not weighed: %j",
    async (outcome, title) => {
      const { screen, field } = await scanning({ weighProduct: vi.fn(async () => outcome) });

      await scan(field, "7790001");

      await expect.element(screen.getByText(title)).toBeVisible();
      await expect
        .element(screen.getByRole("heading", { name: "Queso cremoso" }))
        .not.toBeInTheDocument();
    },
  );

  it("shows the failure when the core cannot be asked to weigh", async () => {
    const { screen, field } = await scanning({
      weighProduct: vi.fn(async () => {
        throw new Error("core is down");
      }),
    });

    await scan(field, "7790001");

    await expect.element(screen.getByText("No se pudo agregar el producto")).toBeVisible();
  });

  it("shows no refusal when the answer of a cancelled weighing arrives late", async () => {
    const answer = deferred<WeighProductOutcome>();
    const { screen, field } = await scanning({
      weighProduct: vi.fn(() => answer.promise),
    });

    await scan(field, "7790001");
    await screen.getByRole("button", { name: "Cancelar" }).click();
    answer.resolve({ kind: "not_sold_by_weight" });
    await field.click();

    await expect.element(field).toHaveValue("");
    await expect
      .element(screen.getByText("Queso cremoso ya no se vende por kilo"))
      .not.toBeInTheDocument();
  });

  it("keeps weighing another product when the answer of a cancelled weighing arrives late", async () => {
    const answer = deferred<WeighProductOutcome>();
    const weighProduct = vi
      .fn<SaleScreenProps["weighProduct"]>()
      .mockReturnValueOnce(answer.promise)
      .mockResolvedValue(WEIGHING_OUTCOME);
    const addWeighedProduct = vi.fn(
      async (): Promise<AddWeighedProductOutcome> => ({
        kind: "added",
        removed_manual_discount: false,
        removed_sale_discount: false,
        sale: SALE_OF_QUESO,
      }),
    );
    const { screen, field } = await scanning({
      addWeighedProduct,
      scanProduct: vi
        .fn<SaleScreenProps["scanProduct"]>()
        .mockResolvedValueOnce(WEIGHT_NEEDED)
        .mockResolvedValue({
          kind: "weight_needed",
          product_id: "p-salame",
          product_name: "Salame",
        }),
      weighProduct,
    });

    await scan(field, "7790001");
    await screen.getByRole("button", { name: "Cancelar" }).click();
    await scan(field, "7790002");
    await expect.element(screen.getByRole("heading", { name: "Salame" })).toBeVisible();
    answer.resolve({ kind: "not_sold_by_weight" });
    await screen.getByRole("button", { name: "Escribir peso" }).click();
    await typeWeight(screen, "0,3");

    expect(addWeighedProduct).toHaveBeenCalledExactlyOnceWith("p-salame", 300);
    await expect
      .element(screen.getByText("Queso cremoso ya no se vende por kilo"))
      .not.toBeInTheDocument();
  });

  it("highlights the line of a cancelled weighing whose stable reading arrives late", async () => {
    const answer = deferred<WeighProductOutcome>();
    const { screen, field } = await scanning({ weighProduct: vi.fn(() => answer.promise) });
    const lines = screen.getByRole("row");

    await scan(field, "7790001");
    await screen.getByRole("button", { name: "Cancelar" }).click();
    answer.resolve({
      kind: "added",
      removed_manual_discount: false,
      removed_sale_discount: false,
      sale: SALE_OF_QUESO,
    });

    await expect.element(lines).toHaveLength(2);
    await expect.element(lines.nth(1)).toHaveAttribute("aria-current", "true");
    await expect.element(field).toHaveValue("");
  });

  it.each(["not_signed_in", "no_open_session"] as const)(
    "reports the session as invalid when a cancelled weighing answers %s late",
    async (kind) => {
      const answer = deferred<WeighProductOutcome>();
      const onSessionInvalid = vi.fn();
      const { screen, field } = await scanning({
        onSessionInvalid,
        weighProduct: vi.fn(() => answer.promise),
      });

      await scan(field, "7790001");
      await screen.getByRole("button", { name: "Cancelar" }).click();
      answer.resolve({ kind });

      await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
    },
  );

  it("reads the sale again, keeping another product's weighing open, when a cancelled weighing answers late that the sale has payments", async () => {
    const answer = deferred<WeighProductOutcome>();
    const currentSale = vi.fn(async () => SALE_OF_YERBA);
    const { screen, field } = await scanning({
      currentSale,
      scanProduct: vi
        .fn<SaleScreenProps["scanProduct"]>()
        .mockResolvedValueOnce(WEIGHT_NEEDED)
        .mockResolvedValue({
          kind: "weight_needed",
          product_id: "p-salame",
          product_name: "Salame",
        }),
      weighProduct: vi
        .fn<SaleScreenProps["weighProduct"]>()
        .mockReturnValueOnce(answer.promise)
        .mockResolvedValue(WEIGHING_OUTCOME),
    });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();

    await scan(field, "7790001");
    await screen.getByRole("button", { name: "Cancelar" }).click();
    await scan(field, "7790002");
    await expect.element(screen.getByRole("heading", { name: "Salame" })).toBeVisible();
    const readsBefore = currentSale.mock.calls.length;
    answer.resolve({ kind: "sale_has_payments" });

    await expect.poll(() => currentSale.mock.calls.length).toBeGreaterThan(readsBefore);
    await expect.element(screen.getByRole("heading", { name: "Salame" })).toBeVisible();
  });

  it.each(["not_signed_in", "no_open_session"] as const)(
    "reports the session as invalid on %s",
    async (kind) => {
      const onSessionInvalid = vi.fn();
      const { field } = await scanning({
        onSessionInvalid,
        weighProduct: vi.fn(async (): Promise<WeighProductOutcome> => ({ kind })),
      });

      await scan(field, "7790001");

      await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
    },
  );
});

describe("SaleScreen changing the weight of a line", () => {
  async function renderWithQueso(changeLineWeight: SaleScreenProps["changeLineWeight"]) {
    const currentSale = vi.fn(async () => SALE_OF_QUESO);
    const rendered = await renderScreen({ currentSale, changeLineWeight });
    await rendered.screen.getByRole("button", { name: "Cambiar el peso de Queso cremoso" }).click();
    return { ...rendered, currentSale };
  }

  async function typeNewWeight(
    screen: Awaited<ReturnType<typeof renderScreen>>["screen"],
    weight: string,
  ) {
    const input = screen.getByRole("textbox", { name: "Peso en kg" });
    await expect.element(input).toHaveValue("1,250");
    await input.fill(weight);
    await screen.getByRole("button", { name: "Cambiar peso" }).click();
  }

  it("changes the weight, reporting the weight shown as the expected one", async () => {
    const changed = { ...QUESO, quantity: 800, line_total: 1_000_000 };
    const changeLineWeight = vi.fn(
      async (): Promise<ChangeLineWeightOutcome> => ({
        kind: "changed",
        removed_manual_discount: false,
        removed_sale_discount: false,
        sale: { ...SALE_OF_QUESO, lines: [changed], total: 1_000_000, pending: 1_000_000 },
      }),
    );
    const { screen } = await renderWithQueso(changeLineWeight);

    await typeNewWeight(screen, "0,8");

    expect(changeLineWeight).toHaveBeenCalledExactlyOnceWith("line-3", 800, 1250);
    await expect.element(screen.getByText("0,800 kg")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Cambiar el peso de Queso cremoso" }))
      .not.toBeInTheDocument();
  });

  it("keeps the modal and shows the field error when the core refuses the weight", async () => {
    const { screen } = await renderWithQueso(
      vi.fn(async () => ({ kind: "invalid_weight" as const })),
    );

    await typeNewWeight(screen, "1");

    await expect.element(screen.getByText(INVALID_WEIGHT_MESSAGE)).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Cambiar el peso de Queso cremoso" }))
      .toBeVisible();
  });

  it.each(["stale_weight", "unknown_line", "no_open_sale", "sale_has_payments"] as const)(
    "closes the modal and reads the sale again on %s",
    async (kind) => {
      const { screen, currentSale } = await renderWithQueso(vi.fn(async () => ({ kind })));
      const readsBefore = currentSale.mock.calls.length;

      await typeNewWeight(screen, "1");

      await expect.poll(() => currentSale.mock.calls.length).toBeGreaterThan(readsBefore);
      await expect
        .element(screen.getByRole("heading", { name: "Cambiar el peso de Queso cremoso" }))
        .not.toBeInTheDocument();
    },
  );

  it("closes the modal and shows that the change failed when the core is unavailable", async () => {
    const { screen } = await renderWithQueso(vi.fn(async () => ({ kind: "unavailable" as const })));

    await typeNewWeight(screen, "1");

    await expect.element(screen.getByText("No se pudo cambiar el peso")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Cambiar el peso de Queso cremoso" }))
      .not.toBeInTheDocument();
  });

  it("changes nothing when the new weight is cancelled", async () => {
    const changeLineWeight = vi.fn(
      async (): Promise<ChangeLineWeightOutcome> => ({ kind: "unavailable" }),
    );
    const { screen } = await renderWithQueso(changeLineWeight);

    await screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();

    expect(changeLineWeight).not.toHaveBeenCalled();
    await expect.element(screen.getByText("1,250 kg")).toBeVisible();
  });
});

describe("SaleScreen weighing the new weight of a line on the scale", () => {
  async function renderWithQueso(overrides: Overrides) {
    const currentSale = vi.fn(async () => SALE_OF_QUESO);
    const rendered = await renderScreen({ currentSale, ...overrides });
    await expect.element(rendered.screen.getByText("1,250 kg")).toBeVisible();
    const readsBefore = currentSale.mock.calls.length;
    await rendered.screen.getByRole("button", { name: "Cambiar el peso de Queso cremoso" }).click();
    return { ...rendered, currentSale, readsBefore };
  }

  const STABLE_800: WeighLineOutcome = {
    kind: "stable",
    weight_thousandths: 800,
    amount: 1_000_000,
  };

  it("shows the stable weight and takes it, replacing the line's weight, when confirmed", async () => {
    const changed = {
      ...QUESO,
      quantity: 800,
      line_total: 1_000_000,
      weight_source: "SCALE" as const,
    };
    const weighLine = vi.fn(
      async (
        _lineId: string,
        _expected: number,
        confirmed: number | null,
      ): Promise<WeighLineOutcome> =>
        confirmed === 800
          ? {
              kind: "changed",
              removed_manual_discount: false,
              removed_sale_discount: false,
              sale: { ...SALE_OF_QUESO, lines: [changed], total: 1_000_000, pending: 1_000_000 },
            }
          : STABLE_800,
    );
    const { screen } = await renderWithQueso({ weighLine });
    const dialog = screen.getByRole("region", { name: "Queso cremoso" });

    await expect.element(dialog.getByText("Estable")).toBeVisible();
    await expect.element(dialog.getByText("0,800 kg")).toBeVisible();
    await screen.getByRole("button", { name: "Confirmar" }).click();

    await expect
      .element(screen.getByRole("region", { name: "Queso cremoso" }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText("0,800 kg")).toBeVisible();
    expect(weighLine).toHaveBeenCalledWith("line-3", 1250, null);
    expect(weighLine).toHaveBeenCalledWith("line-3", 1250, 800);
  });

  it("shows the unsteady weight and its amount as weighing, changing nothing", async () => {
    const changeLineWeight = vi.fn(
      async (): Promise<ChangeLineWeightOutcome> => ({ kind: "unavailable" }),
    );
    const { screen } = await renderWithQueso({
      changeLineWeight,
      weighLine: vi.fn(
        async (): Promise<WeighLineOutcome> => ({
          kind: "unsteady",
          weight_thousandths: 800,
          amount: 1_000_000,
        }),
      ),
    });
    const dialog = screen.getByRole("region", { name: "Queso cremoso" });

    await expect.element(dialog.getByText("Moviéndose")).toBeVisible();
    await expect.element(dialog.getByText("0,800 kg")).toBeVisible();
    await expect.element(dialog.getByText("$ 10.000,00")).toBeVisible();
    await expect.element(dialog.getByText("Estable")).not.toBeInTheDocument();
    expect(changeLineWeight).not.toHaveBeenCalled();
  });

  it("shows that it is weighing with no weight for an unsteady reading out of range, changing nothing", async () => {
    const changeLineWeight = vi.fn(
      async (): Promise<ChangeLineWeightOutcome> => ({ kind: "unavailable" }),
    );
    const weighLine = vi.fn(
      async (): Promise<WeighLineOutcome> => ({ kind: "unsteady_out_of_range" }),
    );
    const { screen } = await renderWithQueso({ changeLineWeight, weighLine });
    const dialog = screen.getByRole("region", { name: "Queso cremoso" });

    await vi.waitFor(() => expect(weighLine.mock.calls.length).toBeGreaterThan(1));
    await expect.element(dialog.getByText("Moviéndose")).toBeVisible();
    await expect.element(dialog.getByText("0,000 kg")).toBeVisible();
    expect(changeLineWeight).not.toHaveBeenCalled();
  });

  it("leads to the typed weight form, keeping the weight typed as today", async () => {
    const changeLineWeight = vi.fn(
      async (): Promise<ChangeLineWeightOutcome> => ({ kind: "unavailable" }),
    );
    const { screen } = await renderWithQueso({
      changeLineWeight,
      weighLine: vi.fn(async (): Promise<WeighLineOutcome> => ({ kind: "weighing" })),
    });

    await screen.getByRole("button", { name: "Escribir peso" }).click();
    const input = screen.getByRole("textbox", { name: "Peso en kg" });
    await expect.element(input).toHaveValue("1,250");
    await input.fill("0,8");
    await screen.getByRole("button", { name: "Cambiar peso" }).click();

    expect(changeLineWeight).toHaveBeenCalledExactlyOnceWith("line-3", 800, 1250);
  });

  it("changes nothing when the weighing is cancelled", async () => {
    const weighLine = vi.fn<SaleScreenProps["weighLine"]>(async () => STABLE_800);
    const { screen } = await renderWithQueso({ weighLine });

    await screen.getByRole("button", { name: "Cancelar" }).click();

    expect(weighLine.mock.calls.every(([, , confirmed]) => confirmed === null)).toBe(true);
    await expect.element(screen.getByText("1,250 kg")).toBeVisible();
  });

  it.each(["stale_weight", "unknown_line", "no_open_sale", "sale_has_payments"] as const)(
    "closes the modal and reads the sale again on %s",
    async (kind) => {
      const { screen, currentSale, readsBefore } = await renderWithQueso({
        weighLine: vi.fn(async () => ({ kind })),
      });

      await expect.poll(() => currentSale.mock.calls.length).toBeGreaterThan(readsBefore);
      await expect
        .element(screen.getByRole("region", { name: "Queso cremoso" }))
        .not.toBeInTheDocument();
    },
  );

  it("keeps the weighing opened since and shows no failure when the answer of a cancelled weighing arrives late", async () => {
    const answer = deferred<WeighLineOutcome>();
    const { screen } = await renderWithQueso({
      weighLine: vi
        .fn<SaleScreenProps["weighLine"]>()
        .mockReturnValueOnce(answer.promise)
        .mockResolvedValue({ kind: "weighing" }),
    });

    await screen.getByRole("button", { name: "Cancelar" }).click();
    await screen.getByRole("button", { name: "Cambiar el peso de Queso cremoso" }).click();
    await expect.element(screen.getByRole("region", { name: "Queso cremoso" })).toBeVisible();
    answer.resolve({ kind: "unavailable" });
    await screen.getByRole("button", { name: "Escribir peso" }).click();

    await expect.element(screen.getByRole("textbox", { name: "Peso en kg" })).toBeVisible();
    await expect.element(screen.getByText("No se pudo cambiar el peso")).not.toBeInTheDocument();
  });

  it("shows that the change failed when the core cannot be asked", async () => {
    const { screen } = await renderWithQueso({
      weighLine: vi.fn(async () => {
        throw new Error("core is down");
      }),
    });

    await expect.element(screen.getByText("No se pudo cambiar el peso")).toBeVisible();
  });
});
