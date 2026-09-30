import type { FoundProduct } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { ProductSearchResultsProps, SearchResults } from "./product-search-results";
import { ProductSearchResults, searchOptionId } from "./product-search-results";

const YERBA: FoundProduct = {
  product_id: "p1",
  name: "Yerba mate 1 kg",
  sale_unit: "UNIT",
  unit_price: 238_000,
  matches: [{ start: 0, length: 5 }],
};
const QUESO: FoundProduct = {
  product_id: "p2",
  name: "Queso cremoso",
  sale_unit: "KG",
  unit_price: 1_250_050,
  matches: [],
};
const ALFAJOR: FoundProduct = {
  product_id: "p3",
  name: "Alfajor triple",
  sale_unit: "UNIT",
  unit_price: null,
  matches: [],
};

function product(position: number): FoundProduct {
  return {
    product_id: ["p", position].join(""),
    name: ["Galletita", position].join(" "),
    sale_unit: "UNIT",
    unit_price: 10_000,
    matches: [],
  };
}

async function renderResults({
  query = "yer",
  products = [YERBA, QUESO, ALFAJOR],
  more = false,
  activeIndex = 0,
  onChoose = vi.fn(),
}: Partial<SearchResults & Pick<ProductSearchResultsProps, "activeIndex" | "onChoose">> = {}) {
  await page.viewport(1280, 720);
  const screen = await render(
    <ProductSearchResults
      listboxId="results"
      search={{ query, products, more }}
      activeIndex={activeIndex}
      onChoose={onChoose}
    />,
  );
  return { screen, onChoose };
}

describe("ProductSearchResults", () => {
  it("lists each product with its name and its price per unit or per kilo, or says it has none", async () => {
    const { screen } = await renderResults();

    const options = screen.getByRole("option");
    await expect.element(options).toHaveLength(3);
    await expect.element(options.nth(0)).toHaveTextContent("Yerba mate 1 kg$ 2.380,00 / u");
    await expect.element(options.nth(1)).toHaveTextContent("Queso cremoso$ 12.500,50 / kg");
    await expect.element(options.nth(2)).toHaveTextContent("Alfajor tripleSin precio");
    await expect.element(options.nth(2).getByText("Sin precio")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("highlights only the matched ranges of each name", async () => {
    const { screen } = await renderResults({
      products: [
        {
          ...YERBA,
          name: "Té verde en saquitos",
          matches: [
            { start: 0, length: 2 },
            { start: 3, length: 5 },
          ],
        },
      ],
    });

    const highlighted = screen.getByRole("option").first().element().querySelectorAll("mark");
    expect(Array.from(highlighted, (mark) => mark.textContent)).toEqual(["Té", "verde"]);
    await expect
      .element(screen.getByRole("option").first())
      .toHaveTextContent("Té verde en saquitos$ 2.380,00 / u");
  });

  it("highlights nothing in a name without matches", async () => {
    const { screen } = await renderResults({ products: [QUESO] });

    expect(screen.getByRole("option").first().element().querySelector("mark")).toBeNull();
  });

  it("names the list and marks only the active option as selected", async () => {
    const { screen } = await renderResults({ activeIndex: 1 });

    const list = screen.getByRole("listbox", { name: "Resultados de la búsqueda" });
    await expect.element(list).toHaveAttribute("id", "results");
    const options = screen.getByRole("option");
    await expect.element(options.nth(0)).toHaveAttribute("aria-selected", "false");
    await expect.element(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect.element(options.nth(2)).toHaveAttribute("aria-selected", "false");
    await expect.element(options.nth(1)).toHaveAttribute("id", searchOptionId("results", 1));
  });

  it("chooses the product of the option that is pressed", async () => {
    const { screen, onChoose } = await renderResults();

    await screen.getByRole("option").nth(1).click();

    expect(onChoose).toHaveBeenCalledExactlyOnceWith(QUESO);
  });

  it("counts the results and tells how they are ordered and which keys drive the list", async () => {
    const { screen } = await renderResults();

    await expect
      .element(screen.getByText("3 resultados · primero los más vendidos en esta caja"))
      .toBeVisible();
    await expect.element(screen.getByText("↑ ↓ elegir · Enter agregar · Esc cerrar")).toBeVisible();
  });

  it("writes 1 resultado in the singular", async () => {
    const { screen } = await renderResults({ products: [YERBA] });

    await expect
      .element(screen.getByText("1 resultado · primero los más vendidos en esta caja"))
      .toBeVisible();
  });

  it("warns that there are more results instead of the footer, and scrolls the twenty it shows", async () => {
    const { screen } = await renderResults({
      products: Array.from({ length: 20 }, (_, position) => product(position)),
      more: true,
    });

    await expect
      .element(
        screen
          .getByText(
            "Se muestran los primeros 20 resultados y hay más. Escribí más letras para afinar la búsqueda.",
          )
          .first(),
      )
      .toBeVisible();
    await expect.element(screen.getByText(/primero los más vendidos/)).not.toBeInTheDocument();
    await expect.element(screen.getByText(/↑ ↓ elegir/)).not.toBeInTheDocument();
    const list = screen.getByRole("listbox").element();
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("keeps the active option in view as it moves down the scrolled list", async () => {
    const products = Array.from({ length: 20 }, (_, position) => product(position));
    const { screen } = await renderResults({ products, more: true, activeIndex: 0 });
    const list = screen.getByRole("listbox").element();

    await screen.rerender(
      <ProductSearchResults
        listboxId="results"
        search={{ query: "gal", products, more: true }}
        activeIndex={19}
        onChoose={vi.fn()}
      />,
    );

    const last = screen.getByRole("option").nth(19).element();
    await expect
      .poll(() => last.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom + 1)
      .toBe(true);
  });

  it("tells that nothing matches the typed text, without a list", async () => {
    const { screen } = await renderResults({ products: [], query: "zzz" });

    await expect.element(screen.getByText("Sin resultados")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "No hay productos activos que coincidan con “zzz”. Corregí lo escrito en el campo.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("tells that nothing matches through a live region that is already there before the text arrives", async () => {
    const screen = await render(
      <ProductSearchResults
        listboxId="results"
        search={undefined}
        activeIndex={0}
        onChoose={vi.fn()}
      />,
    );
    const region = screen.getByRole("status");
    await expect.element(region).toBeInTheDocument();
    const mounted = region.element();
    expect(mounted.textContent).toBe("");

    await screen.rerender(
      <ProductSearchResults
        listboxId="results"
        search={{ query: "zzz", products: [YERBA], more: false }}
        activeIndex={0}
        onChoose={vi.fn()}
      />,
    );
    await expect.element(screen.getByRole("listbox")).toBeVisible();
    expect(mounted.textContent).toBe("");
    await screen.rerender(
      <ProductSearchResults
        listboxId="results"
        search={{ query: "zzz", products: [], more: false }}
        activeIndex={0}
        onChoose={vi.fn()}
      />,
    );

    await expect.poll(() => mounted.textContent).toMatch(/^Sin resultados/);
    expect(screen.getByRole("status").element()).toBe(mounted);
  });

  it("shows nothing while there is no search", async () => {
    const screen = await render(
      <ProductSearchResults
        listboxId="results"
        search={undefined}
        activeIndex={0}
        onChoose={vi.fn()}
      />,
    );

    await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Sin resultados")).not.toBeInTheDocument();
  });
});
