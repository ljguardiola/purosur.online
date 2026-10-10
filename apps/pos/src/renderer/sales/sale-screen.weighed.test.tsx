import type {
  AddProductOutcome,
  AddWeighedProductOutcome,
  ChangeLineWeightOutcome,
} from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { Overrides } from "./test-support/sale-screen";
import {
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
        sale: { ...SALE_OF_QUESO, lines: [...SALE_OF_YERBA.lines, QUESO] },
      }),
    );
    const { screen, field } = await scanning({ currentSale, addWeighedProduct });

    await scan(field, "7790001");
    await typeWeight(screen, "1,25");

    expect(addWeighedProduct).toHaveBeenCalledExactlyOnceWith("p-queso", 1250);
    await expect.element(screen.getByText("1,250 kg")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Peso de Queso cremoso" }))
      .not.toBeInTheDocument();
    await expect.element(field).toHaveValue("");
  });

  it("adds nothing and leaves the screen as it was when the weight is cancelled", async () => {
    const addWeighedProduct = vi.fn(
      async (): Promise<AddWeighedProductOutcome> => ({ kind: "unavailable" }),
    );
    const { screen, field } = await scanning({ addWeighedProduct });

    await scan(field, "7790001");
    await screen.getByRole("button", { name: "Cancelar" }).click();

    await expect
      .element(screen.getByRole("heading", { name: "Peso de Queso cremoso" }))
      .not.toBeInTheDocument();
    expect(addWeighedProduct).not.toHaveBeenCalled();
    await expect.element(field).toHaveValue("7790001");
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
    [{ kind: "not_sold_by_weight" }, "Ese producto ya no se vende"],
    [{ kind: "not_permitted" }, "No tenés el permiso de vender y cobrar"],
    [{ kind: "installation_revoked" }, "Esta caja ya no puede empezar ventas"],
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

describe("SaleScreen changing the weight of a line", () => {
  async function renderWithQueso(changeLineWeight: Overrides["changeLineWeight"]) {
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

    await expect.element(screen.getByText("No se pudo cambiar la cantidad")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Cambiar el peso de Queso cremoso" }))
      .not.toBeInTheDocument();
  });

  it("changes nothing when the new weight is cancelled", async () => {
    const changeLineWeight = vi.fn(
      async (): Promise<ChangeLineWeightOutcome> => ({ kind: "unavailable" }),
    );
    const { screen } = await renderWithQueso(changeLineWeight);

    await screen.getByRole("button", { name: "Cancelar" }).click();

    expect(changeLineWeight).not.toHaveBeenCalled();
    await expect.element(screen.getByText("1,250 kg")).toBeVisible();
  });
});
