import type {
  AddProductOutcome,
  FoundProduct,
  ScanProductOutcome,
  SearchProductsOutcome,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { SaleScreenProps } from "./sale-screen";
import {
  deferred,
  NOT_PERMITTED_HELP,
  NOT_PERMITTED_TITLE,
  renderScreen,
  SALE_OF_YERBA,
  SALE_OF_YERBA_AND_ALFAJOR,
} from "./test-support/sale-screen";

const YERBA_FOUND: FoundProduct = {
  product_id: "p1",
  name: "Yerba mate 1 kg",
  sale_unit: "UNIT",
  unit_price: 238_000,
  matches: [{ start: 0, length: 3 }],
};
const QUESO_FOUND: FoundProduct = {
  product_id: "p2",
  name: "Queso cremoso",
  sale_unit: "KG",
  unit_price: 1_250_000,
  matches: [],
};
const ALFAJOR_FOUND: FoundProduct = {
  product_id: "p3",
  name: "Alfajor triple",
  sale_unit: "UNIT",
  unit_price: null,
  matches: [],
};

function results(products: FoundProduct[], more = false): SearchProductsOutcome {
  return { kind: "results", products, more };
}

function answering(outcome: SearchProductsOutcome) {
  return vi.fn<SaleScreenProps["searchProducts"]>(async () => outcome);
}

describe("SaleScreen searching by name", () => {
  describe("asking for the search", () => {
    it("asks the core for the text typed, without the blanks around it, once it has a letter", async () => {
      const searchProducts = answering(results([]));
      const { field } = await renderScreen({ searchProducts });

      await field.fill("  té ver ");

      await expect.poll(() => searchProducts.mock.calls).toEqual([["té ver"]]);
    });

    it("asks again each time the text changes", async () => {
      const searchProducts = answering(results([]));
      const { field } = await renderScreen({ searchProducts });

      await field.fill("ye");
      await field.fill("yer");

      await expect.poll(() => searchProducts.mock.calls).toEqual([["ye"], ["yer"]]);
    });

    it("treats text of only digits as a code, without searching or opening anything", async () => {
      const searchProducts = answering(results([YERBA_FOUND]));
      const { screen, field } = await renderScreen({ searchProducts });

      await field.fill(" 7790001 ");

      await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
      expect(searchProducts).not.toHaveBeenCalled();
    });

    it("does not search while the field is blank", async () => {
      const searchProducts = answering(results([]));
      const { field } = await renderScreen({ searchProducts });

      await field.fill("yer");
      await field.fill("   ");

      await expect.poll(() => searchProducts.mock.calls).toEqual([["yer"]]);
    });

    it("tells that nothing matches a text too long to be any product's name, without searching", async () => {
      const searchProducts = answering(results([YERBA_FOUND]));
      const { screen, field } = await renderScreen({ searchProducts });

      await field.fill("a".repeat(101));

      await expect.element(screen.getByText("Sin resultados")).toBeVisible();
      expect(searchProducts).not.toHaveBeenCalled();
    });

    it("closes the results when the text becomes a code", async () => {
      const { screen, field } = await renderScreen({
        searchProducts: answering(results([YERBA_FOUND])),
      });
      await field.fill("yer");
      await expect.element(screen.getByRole("listbox")).toBeVisible();

      await field.fill("7790001");

      await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
    });
  });

  describe("showing the results", () => {
    it("lists the products found right under the field, with the first one active", async () => {
      const { screen, field } = await renderScreen({
        searchProducts: answering(results([YERBA_FOUND, QUESO_FOUND, ALFAJOR_FOUND])),
      });

      await field.fill("a");

      const options = screen.getByRole("option");
      await expect.element(options).toHaveLength(3);
      await expect.element(options.nth(0)).toHaveAttribute("aria-selected", "true");
      await expect.element(options.nth(1)).toHaveAttribute("aria-selected", "false");
      await expectNoAccessibilityViolations(screen.container);
    });

    it("is a combobox that points at the list and at the active option", async () => {
      const { screen, field } = await renderScreen({
        searchProducts: answering(results([YERBA_FOUND, QUESO_FOUND])),
      });
      await expect.element(field).toHaveAttribute("aria-expanded", "false");

      await field.fill("a");

      const list = screen.getByRole("listbox");
      await expect.element(field).toHaveAttribute("aria-expanded", "true");
      await expect.element(field).toHaveAttribute("aria-controls", list.element().id);
      await expect
        .element(field)
        .toHaveAttribute("aria-activedescendant", screen.getByRole("option").first().element().id);
    });

    it("overlays the sale lines with a box as wide as the field, leaving the lines where they are", async () => {
      const { screen, field } = await renderScreen({
        currentSale: async () => SALE_OF_YERBA,
        searchProducts: answering(results([YERBA_FOUND])),
      });
      const line = screen.getByRole("listitem").first();
      await expect.element(line).toBeVisible();
      const before = line.element().getBoundingClientRect().top;
      const fieldBox = (field.element() as HTMLElement).closest("form")?.getBoundingClientRect();

      await field.fill("yer");

      const panel = screen.getByRole("listbox").element().parentElement as HTMLElement;
      await expect.element(screen.getByRole("listbox")).toBeVisible();
      const panelBox = panel.getBoundingClientRect();
      expect(panelBox.width).toBe(fieldBox?.width);
      expect(panelBox.top).toBeGreaterThanOrEqual(fieldBox?.bottom ?? 0);
      expect(line.element().getBoundingClientRect().top).toBe(before);
    });

    it("warns when there are more results than it shows", async () => {
      const { screen, field } = await renderScreen({
        searchProducts: answering(results([YERBA_FOUND], true)),
      });

      await field.fill("yer");

      await expect.element(screen.getByText(/y hay más/).first()).toBeVisible();
    });

    it("tells that nothing matches, keeping what was typed", async () => {
      const { screen, field } = await renderScreen({ searchProducts: answering(results([])) });

      await field.fill("  zzz ");

      await expect.element(screen.getByText("Sin resultados")).toBeVisible();
      await expect.element(field).toHaveValue("  zzz ");
      await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("shows what matches the text in the field and nothing of an earlier text while its answer is pending", async () => {
      const second = deferred<SearchProductsOutcome>();
      const searchProducts = vi
        .fn<SaleScreenProps["searchProducts"]>()
        .mockResolvedValueOnce(results([YERBA_FOUND]))
        .mockReturnValueOnce(second.promise);
      const { screen, field } = await renderScreen({ searchProducts });
      await field.fill("ye");
      await expect.element(screen.getByRole("listbox")).toBeVisible();

      await field.fill("yer");

      await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
      second.resolve(results([QUESO_FOUND]));
      await expect.element(screen.getByText("Queso cremoso")).toBeVisible();
    });

    it("drops the answer of a text that is no longer the one in the field", async () => {
      const slow = deferred<SearchProductsOutcome>();
      const searchProducts = vi
        .fn<SaleScreenProps["searchProducts"]>()
        .mockReturnValueOnce(slow.promise)
        .mockResolvedValueOnce(results([QUESO_FOUND]));
      const { screen, field } = await renderScreen({ searchProducts });

      await field.fill("ye");
      await field.fill("yer");
      await expect.element(screen.getByText("Queso cremoso")).toBeVisible();
      slow.resolve(results([YERBA_FOUND]));
      await slow.promise;

      await expect.element(screen.getByText("Queso cremoso")).toBeVisible();
      await expect.element(screen.getByText("Yerba mate 1 kg")).not.toBeInTheDocument();
    });
  });

  describe("choosing with the keyboard", () => {
    async function openedList() {
      const rendered = await renderScreen({
        searchProducts: answering(results([YERBA_FOUND, QUESO_FOUND, ALFAJOR_FOUND])),
      });
      await rendered.field.fill("a");
      await expect.element(rendered.screen.getByRole("option")).toHaveLength(3);
      return rendered;
    }

    it("moves the active option down and up with the arrow keys", async () => {
      const { screen, field } = await openedList();
      const options = screen.getByRole("option");

      await userEvent.keyboard("{ArrowDown}");
      await expect.element(options.nth(1)).toHaveAttribute("aria-selected", "true");
      await expect.element(options.nth(0)).toHaveAttribute("aria-selected", "false");
      await expect
        .element(field)
        .toHaveAttribute("aria-activedescendant", options.nth(1).element().id);

      await userEvent.keyboard("{ArrowUp}");
      await expect.element(options.nth(0)).toHaveAttribute("aria-selected", "true");
    });

    it("stays on the last option when going down from it, and on the first when going up from it", async () => {
      const { screen } = await openedList();
      const options = screen.getByRole("option");

      await userEvent.keyboard("{ArrowUp}");
      await expect.element(options.nth(0)).toHaveAttribute("aria-selected", "true");

      await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
      await expect.element(options.nth(2)).toHaveAttribute("aria-selected", "true");
    });

    it("starts again from the first option when the results change", async () => {
      const searchProducts = vi
        .fn<SaleScreenProps["searchProducts"]>()
        .mockResolvedValueOnce(results([YERBA_FOUND, QUESO_FOUND]))
        .mockResolvedValueOnce(results([QUESO_FOUND, YERBA_FOUND]));
      const { screen, field } = await renderScreen({ searchProducts });
      await field.fill("a");
      await expect.element(screen.getByRole("option")).toHaveLength(2);
      await userEvent.keyboard("{ArrowDown}");

      await field.fill("ab");

      const options = screen.getByRole("option");
      await expect.element(options.nth(0)).toHaveTextContent("Queso cremoso$ 12.500,00 / kg");
      await expect.element(options.nth(0)).toHaveAttribute("aria-selected", "true");
    });

    it("adds the active product on Enter, without scanning the text", async () => {
      const addProduct = vi.fn<SaleScreenProps["addProduct"]>(async () => ({
        kind: "added",
        sale: SALE_OF_YERBA_AND_ALFAJOR,
      }));
      const scanProduct = vi.fn<SaleScreenProps["scanProduct"]>();
      const searchProducts = answering(results([YERBA_FOUND, QUESO_FOUND]));
      const { screen, field } = await renderScreen({ searchProducts, addProduct, scanProduct });
      await field.fill("a");
      await expect.element(screen.getByRole("option")).toHaveLength(2);

      await userEvent.keyboard("{ArrowDown}{Enter}");

      await expect.poll(() => addProduct.mock.calls).toEqual([["p2"]]);
      expect(scanProduct).not.toHaveBeenCalled();
    });

    it("closes the list keeping the text on Escape, and Enter then scans that text", async () => {
      const scanProduct = vi.fn<SaleScreenProps["scanProduct"]>(
        async (): Promise<ScanProductOutcome> => ({ kind: "unknown_code" }),
      );
      const addProduct = vi.fn<SaleScreenProps["addProduct"]>();
      const { screen, field } = await renderScreen({
        searchProducts: answering(results([YERBA_FOUND])),
        scanProduct,
        addProduct,
      });
      await field.fill("yer");
      await expect.element(screen.getByRole("listbox")).toBeVisible();

      await userEvent.keyboard("{Escape}");

      await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
      await expect.element(field).toHaveValue("yer");
      await expect.element(field).toHaveAttribute("aria-expanded", "false");
      await userEvent.keyboard("{Enter}");
      await expect.poll(() => scanProduct.mock.calls).toEqual([["yer"]]);
      expect(addProduct).not.toHaveBeenCalled();
    });

    it("opens the list again when the text changes after closing it", async () => {
      const { screen, field } = await renderScreen({
        searchProducts: answering(results([YERBA_FOUND])),
      });
      await field.fill("yer");
      await userEvent.keyboard("{Escape}");
      await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();

      await userEvent.keyboard("b");

      await expect.element(screen.getByRole("listbox")).toBeVisible();
      await expect.element(field).toHaveValue("yerb");
    });

    it("clears the field on Escape once there is no list to close", async () => {
      const { screen, field } = await renderScreen({
        searchProducts: answering(results([YERBA_FOUND])),
      });
      await field.fill("yer");
      await userEvent.keyboard("{Escape}");
      await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();

      await userEvent.keyboard("{Escape}");

      await expect.element(field).toHaveValue("");
    });

    it("closes the message of no results on Escape, keeping the text", async () => {
      const { screen, field } = await renderScreen({ searchProducts: answering(results([])) });
      await field.fill("zzz");
      await expect.element(screen.getByText("Sin resultados")).toBeVisible();

      await userEvent.keyboard("{Escape}");

      await expect.element(screen.getByText("Sin resultados")).not.toBeInTheDocument();
      await expect.element(field).toHaveValue("zzz");
    });

    it("scans the text on Enter when nothing matches it, as a code with letters would need", async () => {
      const scanProduct = vi.fn<SaleScreenProps["scanProduct"]>(
        async (): Promise<ScanProductOutcome> => ({ kind: "added", sale: SALE_OF_YERBA }),
      );
      const { screen, field } = await renderScreen({
        searchProducts: answering(results([])),
        scanProduct,
      });
      await field.fill("AB-123");
      await expect.element(screen.getByText("Sin resultados")).toBeVisible();

      await userEvent.keyboard("{Enter}");

      await expect.poll(() => scanProduct.mock.calls).toEqual([["AB-123"]]);
    });
  });

  describe("adding the product chosen", () => {
    it("shows the sale it returns, marks the line that changed and clears the field, closing the list", async () => {
      const addProduct = vi.fn<SaleScreenProps["addProduct"]>(async () => ({
        kind: "added",
        sale: SALE_OF_YERBA_AND_ALFAJOR,
      }));
      const { screen, field } = await renderScreen({
        currentSale: async () => SALE_OF_YERBA,
        searchProducts: answering(results([YERBA_FOUND])),
        addProduct,
      });
      await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
      await field.fill("yer");

      await userEvent.keyboard("{Enter}");

      const lines = screen.getByRole("listitem");
      await expect.element(lines).toHaveLength(2);
      await expect.element(lines.last()).toHaveAttribute("aria-current", "true");
      await expect.element(field).toHaveValue("");
      await expect.element(field).toHaveFocus();
      await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
    });

    it("clears the field and closes the list even when the text had blanks around it", async () => {
      const { screen, field } = await renderScreen({
        searchProducts: answering(results([YERBA_FOUND])),
        addProduct: async () => ({ kind: "added", sale: SALE_OF_YERBA }),
      });
      await field.fill("yer ");
      await expect.element(screen.getByRole("listbox")).toBeVisible();

      await userEvent.keyboard("{Enter}");

      await expect.element(field).toHaveValue("");
      await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
    });

    it("adds the product of the option that is clicked, keeping the focus in the field", async () => {
      const addProduct = vi.fn<SaleScreenProps["addProduct"]>(async () => ({
        kind: "added",
        sale: SALE_OF_YERBA,
      }));
      const { screen, field } = await renderScreen({
        searchProducts: answering(results([YERBA_FOUND, QUESO_FOUND])),
        addProduct,
      });
      await field.fill("a");

      await screen.getByRole("option").nth(1).click();

      await expect.poll(() => addProduct.mock.calls).toEqual([["p2"]]);
      await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
      await expect.element(field).toHaveValue("");
      await expect.element(field).toHaveFocus();
    });

    it.each<{
      name: string;
      outcome: AddProductOutcome;
      title: string;
      help: string;
    }>([
      {
        name: "a product without a price",
        outcome: { kind: "no_price", product_name: "Alfajor triple" },
        title: "Alfajor triple no tiene precio",
        help: "No se puede vender hasta que alguien con el permiso de precios se lo ponga en el backoffice.",
      },
      {
        name: "a product sold by weight",
        outcome: { kind: "sold_by_weight", product_name: "Queso cremoso" },
        title: "Queso cremoso se vende por kilo",
        help: "Esta caja todavía no vende productos por kilo.",
      },
      {
        name: "a product that is no longer sold",
        outcome: { kind: "product_unavailable" },
        title: "Ese producto ya no se vende",
        help: "Buscalo de nuevo por nombre.",
      },
      {
        name: "a person who may not sell",
        outcome: { kind: "not_permitted" },
        title: NOT_PERMITTED_TITLE,
        help: NOT_PERMITTED_HELP,
      },
      {
        name: "a revoked installation",
        outcome: { kind: "installation_revoked" },
        title: "Esta caja ya no puede empezar ventas",
        help: "Su instalación fue reemplazada o retirada desde el backoffice.",
      },
      {
        name: "the core being unable to add it",
        outcome: { kind: "unavailable" },
        title: "No se pudo agregar el producto",
        help: "Probá elegirlo de nuevo.",
      },
    ])(
      "closes the list, tells what happened and selects the text on $name",
      async ({ outcome, title, help }) => {
        const { screen, field } = await renderScreen({
          currentSale: async () => SALE_OF_YERBA,
          searchProducts: answering(results([YERBA_FOUND])),
          addProduct: async () => outcome,
        });
        await expect.element(screen.getByText("Yerba mate 1 kg").first()).toBeVisible();
        await field.fill("yer");

        await userEvent.keyboard("{Enter}");

        await expect.element(screen.getByText(title, { exact: true })).toBeVisible();
        await expect.element(screen.getByText(help, { exact: true })).toBeVisible();
        await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
        await expect.element(field).toHaveValue("yer");
        const input = field.element() as HTMLInputElement;
        await expect.poll(() => [input.selectionStart, input.selectionEnd]).toEqual([0, 3]);
        await expect.element(screen.getByRole("listitem")).toHaveLength(1);
        await expectNoAccessibilityViolations(screen.container);
      },
    );

    it("takes the message away and searches again when the person types over the selected text", async () => {
      const searchProducts = answering(results([YERBA_FOUND]));
      const { screen, field } = await renderScreen({
        searchProducts,
        addProduct: async () => ({ kind: "product_unavailable" }),
      });
      await field.fill("yer");
      await userEvent.keyboard("{Enter}");
      await expect.element(screen.getByText("Ese producto ya no se vende")).toBeVisible();

      await userEvent.keyboard("que");

      await expect.element(screen.getByText("Ese producto ya no se vende")).not.toBeInTheDocument();
      await expect.poll(() => searchProducts.mock.calls.at(-1)).toEqual(["que"]);
      await expect.element(screen.getByRole("listbox")).toBeVisible();
    });

    it("tells that the product could not be added when the core doesn't answer", async () => {
      const { screen, field } = await renderScreen({
        searchProducts: answering(results([YERBA_FOUND])),
        addProduct: async () => {
          throw new Error("the core connection was replaced");
        },
      });
      await field.fill("yer");

      await userEvent.keyboard("{Enter}");

      await expect.element(screen.getByText("Probá elegirlo de nuevo.")).toBeVisible();
    });

    it.each<AddProductOutcome>([{ kind: "not_signed_in" }, { kind: "no_open_session" }])(
      "asks for the session to be read again when the core answers $kind, without any message",
      async (outcome) => {
        const onSessionInvalid = vi.fn();
        const { screen, field } = await renderScreen({
          searchProducts: answering(results([YERBA_FOUND])),
          addProduct: async () => outcome,
          onSessionInvalid,
        });
        await field.fill("yer");

        await userEvent.keyboard("{Enter}");

        await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
        await expect
          .element(screen.getByText("No se pudo agregar el producto"))
          .not.toBeInTheDocument();
      },
    );
  });

  describe("when the search itself fails", () => {
    it.each<{ name: string; outcome: SearchProductsOutcome; title: string }>([
      {
        name: "the person may not sell",
        outcome: { kind: "not_permitted" },
        title: NOT_PERMITTED_TITLE,
      },
      {
        name: "the core cannot search",
        outcome: { kind: "unavailable" },
        title: "No se pudo buscar el producto",
      },
    ])("tells what happened without opening a list when $name", async ({ outcome, title }) => {
      const { screen, field } = await renderScreen({ searchProducts: answering(outcome) });

      await field.fill("yer");

      await expect.element(screen.getByText(title, { exact: true })).toBeVisible();
      await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
      await expect.element(field).toHaveValue("yer");
    });

    it("tells the same when the core doesn't answer", async () => {
      const { screen, field } = await renderScreen({
        searchProducts: async () => {
          throw new Error("the core connection was replaced");
        },
      });

      await field.fill("yer");

      await expect.element(screen.getByText("No se pudo buscar el producto")).toBeVisible();
    });

    it.each<SearchProductsOutcome>([{ kind: "not_signed_in" }, { kind: "no_open_session" }])(
      "asks for the session to be read again when the core answers $kind",
      async (outcome) => {
        const onSessionInvalid = vi.fn();
        const { field } = await renderScreen({
          searchProducts: answering(outcome),
          onSessionInvalid,
        });

        await field.fill("yer");

        await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
      },
    );
  });
});
