import type {
  FindCountableProductOutcome,
  ReadInitialCountOutcome,
  SearchCountableProductsOutcome,
} from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  deferred,
  QUESO_LINE,
  QUESO_PRODUCT,
  readOf,
  renderScreen,
  scan,
  YERBA_LINE,
  YERBA_PRODUCT,
} from "./test-support/initial-count-screen";

const FOUND_YERBA: FindCountableProductOutcome = { kind: "found", product: YERBA_PRODUCT };

function results(
  ...products: (typeof YERBA_PRODUCT | typeof QUESO_PRODUCT)[]
): SearchCountableProductsOutcome {
  return {
    kind: "results",
    products: products.map((product) => ({ ...product, matches: [{ start: 0, length: 3 }] })),
    more: false,
  };
}

describe("InitialCountScreen scanning and searching the product to count", () => {
  it("opens the window to count the product of a code that is typed", async () => {
    const findCountableProduct = vi.fn(async () => FOUND_YERBA);
    const { screen, field } = await renderScreen({ findCountableProduct });

    await scan(field, " 7790001 ");

    await expect.element(screen.getByRole("dialog", { name: "Yerba mate 1 kg" })).toBeVisible();
    expect(findCountableProduct.mock.calls).toEqual([["7790001"]]);
  });

  it("opens the window to count the product of a code the reader reads", async () => {
    const findCountableProduct = vi.fn(async () => FOUND_YERBA);
    const { screen, readBarcode } = await renderScreen({ findCountableProduct });

    readBarcode("7790001");

    await expect.element(screen.getByRole("dialog", { name: "Yerba mate 1 kg" })).toBeVisible();
    expect(findCountableProduct.mock.calls).toEqual([["7790001"]]);
  });

  it("reads the count again and shows the new line once the window records it", async () => {
    const readInitialCount = vi
      .fn<() => Promise<ReadInitialCountOutcome>>()
      .mockResolvedValueOnce(readOf([]))
      .mockResolvedValue(readOf([YERBA_LINE]));
    const recordInitialCountLine = vi.fn(async () => ({
      kind: "recorded" as const,
      line: YERBA_LINE,
    }));
    const { screen, field } = await renderScreen({
      readInitialCount,
      recordInitialCountLine,
      findCountableProduct: vi.fn(async () => FOUND_YERBA),
    });
    await scan(field, "7790001");

    await userEvent.fill(screen.getByRole("textbox", { name: "Cantidad contada" }), "24");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar línea" }));

    await expect.element(screen.getByRole("cell", { name: "Yerba mate 1 kg" })).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(recordInitialCountLine).toHaveBeenCalledWith("p2", 24_000, null);
    await expect.element(field).toHaveValue("");
  });

  it("closes the window without recording when it is cancelled", async () => {
    const { screen, field, recordInitialCountLine } = await renderScreen({
      findCountableProduct: vi.fn(async () => FOUND_YERBA),
    });
    await scan(field, "7790001");

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(recordInitialCountLine).not.toHaveBeenCalled();
  });

  it("tells no product has that code and keeps the text selected", async () => {
    const { screen, field } = await renderScreen({
      findCountableProduct: vi.fn(async () => ({ kind: "unknown_code" as const })),
    });

    await scan(field, "7790001");

    await expect.element(screen.getByText("No hay ningún producto con ese código")).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("tells the person may not count when the core refuses the code", async () => {
    const { screen, field } = await renderScreen({
      findCountableProduct: vi.fn(async () => ({ kind: "not_permitted" as const })),
    });

    await scan(field, "7790001");

    await expect
      .element(screen.getByText("No tenés permiso para cargar el inventario inicial"))
      .toBeVisible();
  });

  it("tells the product could not be looked up when the core cannot answer", async () => {
    const { screen, field } = await renderScreen({
      findCountableProduct: vi.fn(async () => ({ kind: "unavailable" as const })),
    });

    await scan(field, "7790001");

    await expect
      .element(screen.getByText("No se pudo buscar el producto. Probá de nuevo."))
      .toBeVisible();
  });

  it("retires the screen when the core says the count is no longer offered", async () => {
    const { screen, field } = await renderScreen({
      findCountableProduct: vi.fn(async () => ({ kind: "not_offered" as const })),
    });

    await scan(field, "7790001");

    await expect
      .element(screen.getByText("La carga del inventario inicial ya no está disponible"))
      .toBeVisible();
  });

  it("reports the end of the session when the core does not know who is signed in", async () => {
    const { field, onSessionInvalid } = await renderScreen({
      findCountableProduct: vi.fn(async () => ({ kind: "not_signed_in" as const })),
    });

    await scan(field, "7790001");

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });

  it("searches by name when the text has letters, without asking for a code", async () => {
    const searchCountableProducts = vi.fn(async () => results(YERBA_PRODUCT));
    const { screen, field, findCountableProduct } = await renderScreen({
      searchCountableProducts,
    });

    await field.fill("yer");

    await expect.element(screen.getByRole("option", { name: /Yerba mate 1 kg/ })).toBeVisible();
    await expect.element(screen.getByRole("option")).toHaveTextContent("Yerba mate 1 kgPor unidad");
    expect(searchCountableProducts.mock.calls).toEqual([["yer"]]);
    expect(findCountableProduct).not.toHaveBeenCalled();
  });

  it("opens the window to count the product chosen from the results", async () => {
    const { screen, field } = await renderScreen({
      searchCountableProducts: vi.fn(async () => results(QUESO_PRODUCT, YERBA_PRODUCT)),
    });
    await field.fill("que");

    await userEvent.click(screen.getByRole("option", { name: /Yerba mate 1 kg/ }));

    await expect.element(screen.getByRole("dialog", { name: "Yerba mate 1 kg" })).toBeVisible();
  });

  it("opens the window to count the first result with Enter, after moving with the arrows", async () => {
    const { screen, field } = await renderScreen({
      searchCountableProducts: vi.fn(async () => results(QUESO_PRODUCT, YERBA_PRODUCT)),
    });
    await field.fill("que");
    await expect.element(screen.getByRole("listbox")).toBeVisible();

    await userEvent.keyboard("{ArrowDown}{Enter}");

    await expect.element(screen.getByRole("dialog", { name: "Yerba mate 1 kg" })).toBeVisible();
  });

  it("tells nothing matches the name that was typed", async () => {
    const { screen, field } = await renderScreen({
      searchCountableProducts: vi.fn(async () => results()),
    });

    await field.fill("zzz");

    await expect.element(screen.getByText("Sin resultados")).toBeVisible();
  });

  it("tells the search failed when the core cannot answer", async () => {
    const { screen, field } = await renderScreen({
      searchCountableProducts: vi.fn(async () => ({ kind: "unavailable" as const })),
    });

    await field.fill("yer");

    await expect
      .element(screen.getByText("No se pudo buscar el producto. Probá de nuevo."))
      .toBeVisible();
  });

  it("drops the answer of a search the text has already moved past", async () => {
    const slow = deferred<SearchCountableProductsOutcome>();
    const searchCountableProducts = vi
      .fn<(query: string) => Promise<SearchCountableProductsOutcome>>()
      .mockReturnValueOnce(slow.promise);
    const { screen, field } = await renderScreen({ searchCountableProducts });
    await field.fill("yer");
    await field.fill("7790001");

    slow.resolve(results(YERBA_PRODUCT));

    await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
  });

  it("keeps the lines already counted in view behind the window", async () => {
    const { screen, field } = await renderScreen({
      readInitialCount: vi.fn(async () => readOf([QUESO_LINE])),
      findCountableProduct: vi.fn(async () => FOUND_YERBA),
    });
    await scan(field, "7790001");

    await expect.element(screen.getByRole("dialog", { name: "Yerba mate 1 kg" })).toBeVisible();
  });
});
