import type { ChangeLineQuantityOutcome, RemoveSaleLineOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  legendOf,
  pressKeypad,
  renderScreen,
  SALE_OF_FOUR_LINES,
  SALE_OF_YERBA,
  SALE_OF_YERBA_AND_ALFAJOR,
} from "./test-support/sale-screen";

describe("SaleScreen moving through the lines by keyboard", () => {
  it("shows the lines as the board does, the last one selected", async () => {
    const { screen } = await renderScreen({ currentSale: async () => SALE_OF_FOUR_LINES });

    const rows = screen.getByRole("row");
    await expect.element(rows).toHaveLength(5);
    await expect
      .element(rows.nth(1))
      .toHaveTextContent("Almendras peladas$ 18.900,00 / kg0,325 kg$ 6.142,50");
    await expect
      .element(rows.nth(3))
      .toHaveTextContent("Yerba mate orgánica 1 kg$ 6.950,00 / u2 u$ 13.900,00");
    await expect.element(rows.last()).toHaveAttribute("aria-current", "true");
    await expectNoAccessibilityViolations(screen.container);
  });

  it("moves the selection with the arrows, and stays on the last line going down from it", async () => {
    const { screen } = await renderScreen({ currentSale: async () => SALE_OF_FOUR_LINES });
    const rows = screen.getByRole("row");
    await expect.element(rows.last()).toHaveAttribute("aria-current", "true");

    await userEvent.keyboard("{ArrowDown}");
    await expect.element(rows.last()).toHaveAttribute("aria-current", "true");
    await userEvent.keyboard("{ArrowUp}");
    await expect.element(rows.nth(3)).toHaveAttribute("aria-current", "true");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}");

    await expect.element(rows.nth(1)).toHaveAttribute("aria-current", "true");
    await expect.element(rows.last()).not.toHaveAttribute("aria-current");
  });

  it("keeps the focus in the search field while the selection moves", async () => {
    const { field } = await renderScreen({ currentSale: async () => SALE_OF_FOUR_LINES });

    await userEvent.keyboard("{ArrowUp}");

    await expect.element(field).toHaveFocus();
  });

  it("lets the arrows move the results instead of the lines while the results are open", async () => {
    const { screen, field } = await renderScreen({
      currentSale: async () => SALE_OF_FOUR_LINES,
      searchProducts: async () => ({
        kind: "results",
        products: [
          { product_id: "p1", name: "Almendras", sale_unit: "KG", unit_price: 1, matches: [] },
          {
            product_id: "p2",
            name: "Almendras tostadas",
            sale_unit: "KG",
            unit_price: 1,
            matches: [],
          },
        ],
        more: false,
      }),
    });
    const rows = screen.getByRole("row");
    await expect.element(rows.last()).toHaveAttribute("aria-current", "true");
    await field.fill("alm");
    await expect.element(screen.getByRole("listbox")).toBeVisible();

    await userEvent.keyboard("{ArrowUp}");

    await expect.element(rows.last()).toHaveAttribute("aria-current", "true");
  });
});

describe("SaleScreen removing the selected line", () => {
  it("removes the selected line on Supr", async () => {
    const removeSaleLine = vi.fn(
      async (): Promise<RemoveSaleLineOutcome> => ({
        kind: "removed",
        sale: SALE_OF_YERBA,
        removed_sale_discount: false,
      }),
    );
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA_AND_ALFAJOR,
      removeSaleLine,
    });
    await expect.element(screen.getByText("Alfajor triple")).toBeVisible();
    await userEvent.keyboard("{ArrowUp}");

    await userEvent.keyboard("{Delete}");

    expect(removeSaleLine).toHaveBeenCalledExactlyOnceWith("line-1");
    await expect.element(screen.getByText("Alfajor triple")).not.toBeInTheDocument();
  });

  it("removes the selected line on Supr while the search field holds text, leaving the text", async () => {
    const removeSaleLine = vi.fn(
      async (): Promise<RemoveSaleLineOutcome> => ({
        kind: "removed",
        sale: SALE_OF_YERBA,
        removed_sale_discount: false,
      }),
    );
    const { screen, field } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA_AND_ALFAJOR,
      removeSaleLine,
    });
    await expect.element(screen.getByText("Alfajor triple")).toBeVisible();
    await field.fill("7790");
    await userEvent.keyboard("{Home}");

    await userEvent.keyboard("{Delete}");

    expect(removeSaleLine).toHaveBeenCalledExactlyOnceWith("line-2");
    await expect.element(field).toHaveValue("7790");
  });

  it("keeps the line's buttons disabled and offers neither Supr nor +/− while a removal is answering", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA_AND_ALFAJOR,
      removeSaleLine: () => new Promise<RemoveSaleLineOutcome>(() => {}),
    });
    await expect.element(screen.getByText("Alfajor triple")).toBeVisible();

    await userEvent.keyboard("{Delete}");

    for (const name of [
      "Quitar Yerba mate 1 kg",
      "Cambiar el precio de Yerba mate 1 kg",
      "Quitar Alfajor triple",
    ]) {
      await expect.element(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(legendOf()).toEqual(["↑↓Líneas", "F2Buscar", "F4Consulta"]);
  });
});

describe("SaleScreen with a sale that can no longer be changed", () => {
  it("offers neither Supr nor +/− and does nothing on them", async () => {
    const removeSaleLine = vi.fn();
    const changeLineQuantity = vi.fn();
    const { screen } = await renderScreen({
      currentSale: async () => ({ ...SALE_OF_YERBA, lines_lock: "approved_payment" }),
      removeSaleLine,
      changeLineQuantity,
    });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();

    expect(legendOf()).toEqual(["↑↓Líneas", "F2Buscar", "F4Consulta", "F8Cancelar venta"]);
    await userEvent.keyboard("{Delete}");
    pressKeypad("+");
    pressKeypad("-");

    expect(removeSaleLine).not.toHaveBeenCalled();
    expect(changeLineQuantity).not.toHaveBeenCalled();
  });
});

describe("SaleScreen changing a unit line's quantity with the keypad", () => {
  it("raises and lowers the selected unit line by one", async () => {
    const changeLineQuantity = vi.fn(
      async (): Promise<ChangeLineQuantityOutcome> => ({ kind: "unavailable" }),
    );
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      changeLineQuantity,
    });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();

    pressKeypad("+");
    await expect.poll(() => changeLineQuantity.mock.calls.length).toBe(1);
    await expect.poll(() => legendOf()).toContain("+/−Cantidad");
    pressKeypad("-");
    await expect.poll(() => changeLineQuantity.mock.calls.length).toBe(2);

    expect(changeLineQuantity.mock.calls).toEqual([
      ["line-1", 3, 2],
      ["line-1", 1, 2],
    ]);
  });

  it("types a hyphen from the main keyboard into the search field instead of lowering the quantity", async () => {
    const changeLineQuantity = vi.fn();
    const { screen, field } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      changeLineQuantity,
    });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();

    await userEvent.keyboard("coca-cola");

    await expect.element(field).toHaveValue("coca-cola");
    expect(changeLineQuantity).not.toHaveBeenCalled();
  });

  it("does nothing on a weighed line", async () => {
    const changeLineQuantity = vi.fn();
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_FOUR_LINES,
      changeLineQuantity,
    });
    await expect.element(screen.getByText("Pasas de uva")).toBeVisible();

    pressKeypad("+");

    expect(changeLineQuantity).not.toHaveBeenCalled();
  });
});

describe("SaleScreen's key legend under the lines", () => {
  it("shows ↑↓ Líneas, F2 Buscar, F3 Pesar, F6 Precio, F7 Descuento, F8 Vaciar and Supr Quitar on a weighed line", async () => {
    const { screen } = await renderScreen({ currentSale: async () => SALE_OF_FOUR_LINES });
    await expect.element(screen.getByText("Pasas de uva")).toBeVisible();

    expect(legendOf()).toEqual([
      "↑↓Líneas",
      "F2Buscar",
      "F3Pesar",
      "F4Consulta",
      "F6Precio",
      "F7Descuento",
      "F8Vaciar",
      "SuprQuitar",
    ]);
  });

  it("adds +/− Cantidad while a unit line is selected, and not on a weighed line", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => ({
        ...SALE_OF_FOUR_LINES,
        lines: [...SALE_OF_FOUR_LINES.lines].reverse(),
      }),
    });
    await expect.element(screen.getByText("Yerba mate orgánica 1 kg")).toBeVisible();

    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    await expect
      .poll(() => legendOf())
      .toEqual([
        "↑↓Líneas",
        "F2Buscar",
        "F4Consulta",
        "F6Precio",
        "F7Descuento",
        "F8Vaciar",
        "SuprQuitar",
        "+/−Cantidad",
      ]);
    await userEvent.keyboard("{ArrowUp}");

    await expect
      .poll(() => legendOf())
      .toEqual([
        "↑↓Líneas",
        "F2Buscar",
        "F3Pesar",
        "F4Consulta",
        "F6Precio",
        "F7Descuento",
        "F8Vaciar",
        "SuprQuitar",
      ]);
  });
});

describe("SaleScreen focusing the search with F2", () => {
  it("puts the focus back in the search field", async () => {
    const { screen, field } = await renderScreen({ currentSale: async () => SALE_OF_YERBA });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    screen.getByRole("button", { name: "Venta" }).element().focus();
    await expect.element(field).not.toHaveFocus();

    await userEvent.keyboard("{F2}");

    await expect.element(field).toHaveFocus();
  });
});
