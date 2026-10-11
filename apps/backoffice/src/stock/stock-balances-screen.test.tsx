import type { StockBalanceList } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { type StockBalancesFilters, stockBalancesFilters } from "./routes";
import { StockBalancesScreen } from "./stock-balances-screen";
import type { StockBalancesScreenServices } from "./stock-balances-services";
import {
  almonds,
  crackers,
  honey,
  oats,
  stockBalanceList,
  tea,
  yerba,
} from "./test-support/stock-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function createServices(): StockBalancesScreenServices {
  return { fetchStockBalances: vi.fn() };
}

function renderScreen(
  services: StockBalancesScreenServices,
  {
    filters = stockBalancesFilters.parse({}),
    onFiltersChange = () => {},
    onSessionEnded = () => {},
  }: {
    filters?: StockBalancesFilters;
    onFiltersChange?: (filters: StockBalancesFilters) => void;
    onSessionEnded?: () => void;
  } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <StockBalancesScreen
          services={services}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

function listed(products = [almonds, honey, crackers, tea], summary?: StockBalanceList["summary"]) {
  const services = createServices();
  vi.mocked(services.fetchStockBalances).mockResolvedValue({
    kind: "ok",
    value: stockBalanceList(products, summary),
  });
  return services;
}

test("shows each product with its category and its balance in its own unit, a negative one included", async () => {
  const screen = await renderScreen(listed());

  await expect.element(screen.getByRole("heading", { name: "Saldos", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Stock", { exact: true })).toBeVisible();
  const table = screen.getByRole("table", { name: "Saldos" });
  await expect.element(table.getByText("Almendras peladas")).toBeVisible();
  await expect.element(table.getByText("Frutos secos")).toBeVisible();
  await expect.element(table.getByText("12,150 kg")).toBeVisible();
  await expect.element(table.getByText("24 u")).toBeVisible();
  await expect.element(table.getByText("− 4 u")).toBeVisible();
  await expect.element(table.getByText("0 u")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test.each([
  ["positive", ["Almendras peladas", "Miel pura de abeja 1 kg"]],
  ["zero", ["Té verde en hebras 100 g"]],
  ["negative", ["Galletas de arroz integrales"]],
] as const)("opens on the %s balances the URL asks for", async (balance, names) => {
  const screen = await renderScreen(listed(), {
    filters: stockBalancesFilters.parse({ balance }),
  });

  const table = screen.getByRole("table", { name: "Saldos" });
  await expect.element(table.getByText(names[0])).toBeVisible();
  const shown = [almonds, honey, crackers, tea]
    .map((product) => product.name)
    .filter((name) => table.getByText(name).query() !== null);
  expect(shown).toEqual(names);
});

test("filters by the category and the name typed, and reports each change", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(listed(), { onFiltersChange });
  const table = screen.getByRole("table", { name: "Saldos" });
  await expect.element(table.getByText("Almendras peladas")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Categoría:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Almacén" }));

  await expect.element(table.getByText("Almendras peladas")).not.toBeInTheDocument();
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toMatchObject({
      category: "category-grocery",
    });

  await userEvent.fill(screen.getByRole("searchbox"), "miel");

  await expect.element(table.getByText("Galletas de arroz integrales")).not.toBeInTheDocument();
  await expect.element(table.getByText("Miel pura de abeja 1 kg")).toBeVisible();
});

test("offers the categories of the listed products, by name", async () => {
  const screen = await renderScreen(listed());
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Categoría:/ }));

  const options = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);
  expect(options).toEqual(["Todas", "Almacén", "Frutos secos"]);
});

test("says there are no active products when the list is empty", async () => {
  const screen = await renderScreen(listed([]));

  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();
});

test("says nothing matches when the filters hide every product", async () => {
  const screen = await renderScreen(listed([almonds]), {
    filters: stockBalancesFilters.parse({ balance: "negative" }),
  });

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("shows a failed load with a retry that loads the balances again", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockBalances)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: stockBalanceList([almonds]) });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(services.fetchStockBalances).toHaveBeenCalledTimes(2);
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockBalances).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("marks a deactivated product that still holds stock", async () => {
  const screen = await renderScreen(listed([almonds, oats]));

  const table = screen.getByRole("table", { name: "Saldos" });
  await expect.element(table.getByText("Avena arrollada")).toBeVisible();
  await expect.element(table.getByText("Desactivado")).toBeVisible();
  await expect.element(table.getByText("3 u")).toBeVisible();
});

test("marks no active product as deactivated", async () => {
  const screen = await renderScreen(listed([almonds]));

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(screen.getByText("Desactivado").query()).toBeNull();
});

function rowOf(element: Element): HTMLElement {
  return element.closest("tr") as HTMLElement;
}

function shownProductNames(
  screen: Awaited<ReturnType<typeof renderScreen>>,
  names: readonly string[],
) {
  const table = screen.getByRole("table", { name: "Saldos" });
  return table
    .getByRole("row")
    .elements()
    .map((row) => names.find((name) => row.textContent?.includes(name)))
    .filter((name) => name !== undefined);
}

test("shows each product's unit cost, value and lot count, with the unit a kilo is costed by", async () => {
  const screen = await renderScreen(listed());

  const almondsRow = rowOf(screen.getByText("Almendras peladas").element());
  const honeyRow = rowOf(screen.getByText("Miel pura de abeja 1 kg").element());
  expect(almondsRow.textContent).toContain("$ 10.205,84 / kg");
  expect(almondsRow.textContent).toContain("$ 124.001,00");
  expect(almondsRow.textContent).toContain("2");
  expect(honeyRow.textContent).toContain("$ 5.440,00");
  expect(honeyRow.textContent).not.toContain("/ kg");
  expect(honeyRow.textContent).toContain("$ 130.560,00");
});

test("says a product has no cost and no value when the cloud answers none", async () => {
  const screen = await renderScreen(listed([crackers]));

  const row = rowOf(screen.getByText("Galletas de arroz integrales").element());
  await expect.element(screen.getByText("Sin costo", { exact: true })).toBeVisible();
  expect(row.textContent).toContain("—");
});

test("says how a negative balance is corrected, writes its amounts negative and tints its row", async () => {
  const screen = await renderScreen(listed([yerba, honey]));

  const row = rowOf(screen.getByText("Yerba mate orgánica 500 g").element());
  const otherRow = rowOf(screen.getByText("Miel pura de abeja 1 kg").element());
  await expect
    .element(screen.getByText("Saldo negativo · se corrige con un recuento"))
    .toBeVisible();
  expect(row.textContent).toContain("− 3 u");
  expect(row.textContent).toContain("− $ 9.150,00");
  expect(row.textContent).not.toContain("Almacén");
  expect(getComputedStyle(row).backgroundColor).not.toBe(
    getComputedStyle(otherRow).backgroundColor,
  );
});

test("says a product without lots is corrected with a purchase or a count, and offers no lots to open", async () => {
  const screen = await renderScreen(listed([tea, honey]));

  await expect
    .element(screen.getByText("Sin lotes · se corrige con una compra o un recuento"))
    .toBeVisible();
  expect(screen.getByRole("button", { name: `Ver los lotes de ${tea.name}` }).query()).toBeNull();
  await expect
    .element(screen.getByRole("button", { name: `Ver los lotes de ${honey.name}` }))
    .toBeVisible();
});

test("opens a product's lots under it, naming the lot consumed first", async () => {
  const screen = await renderScreen(listed());

  await userEvent.click(screen.getByRole("button", { name: `Ver los lotes de ${almonds.name}` }));

  await expect
    .element(screen.getByText("Lotes · se consume primero el que vence antes"))
    .toBeVisible();
  await expect
    .element(screen.getByRole("table", { name: `Lotes de ${almonds.name}` }))
    .toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("closes a product's lots when its button is pressed again", async () => {
  const screen = await renderScreen(listed());
  await userEvent.click(screen.getByRole("button", { name: `Ver los lotes de ${almonds.name}` }));
  await expect.element(screen.getByText("L-2409")).toBeVisible();

  await userEvent.click(
    screen.getByRole("button", { name: `Ocultar los lotes de ${almonds.name}` }),
  );

  await expect.element(screen.getByText("L-2409")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: `Ver los lotes de ${almonds.name}` }))
    .toBeVisible();
});

test("keeps the lots of every product opened open at once", async () => {
  const screen = await renderScreen(listed());

  await userEvent.click(screen.getByRole("button", { name: `Ver los lotes de ${almonds.name}` }));
  await userEvent.click(screen.getByRole("button", { name: `Ver los lotes de ${honey.name}` }));

  await expect
    .element(screen.getByRole("table", { name: `Lotes de ${almonds.name}` }))
    .toBeVisible();
  await expect.element(screen.getByRole("table", { name: `Lotes de ${honey.name}` })).toBeVisible();
});

test("writes the footer from the cloud's summary", async () => {
  const screen = await renderScreen(
    listed([almonds], { productCount: 7, valueCents: 38_336_900, withoutCostCount: 3 }),
  );

  await expect
    .element(screen.getByText("7 productos con movimiento · valorizado $ 383.369,00 · 3 sin costo"))
    .toBeVisible();
});

test("writes the footer for a single product and leaves out the count of those without cost when there is none", async () => {
  const screen = await renderScreen(
    listed([almonds], { productCount: 1, valueCents: 12_400_100, withoutCostCount: 0 }),
  );

  await expect
    .element(screen.getByText("1 producto con movimiento · valorizado $ 124.001,00"))
    .toBeVisible();
});

const ORDERED_NAMES = [almonds.name, honey.name, crackers.name, tea.name];

test("opens on the products by name, the order a header leaves them in until another is pressed", async () => {
  const screen = await renderScreen(listed());
  await expect.element(screen.getByText(honey.name)).toBeVisible();

  expect(shownProductNames(screen, ORDERED_NAMES)).toEqual([
    almonds.name,
    crackers.name,
    honey.name,
    tea.name,
  ]);
});

test.each([
  [{ sortBy: "value", sort: "descending" }, [honey, almonds, crackers, tea]],
  [{ sortBy: "balance", sort: "ascending" }, [crackers, tea, almonds, honey]],
  [{ sortBy: "unitCost", sort: "ascending" }, [crackers, tea, honey, almonds]],
  [{ sortBy: "lots", sort: "descending" }, [almonds, honey, crackers, tea]],
  [{ sortBy: "product", sort: "descending" }, [tea, honey, crackers, almonds]],
] as const)(
  "opens on the order the URL asks for, %j, reading the values the cloud answered",
  async (order, products) => {
    const screen = await renderScreen(listed(), { filters: stockBalancesFilters.parse(order) });
    await expect.element(screen.getByText(honey.name)).toBeVisible();

    expect(shownProductNames(screen, ORDERED_NAMES)).toEqual(
      products.map((product) => product.name),
    );
  },
);

test.each([
  ["Saldo", "balance"],
  ["Costo unitario", "unitCost"],
  ["Valorizado", "value"],
  ["Lotes", "lots"],
] as const)(
  "reports the %s column as the order when its header is pressed",
  async (header, sortBy) => {
    const onFiltersChange = vi.fn();
    const screen = await renderScreen(listed(), { onFiltersChange });
    await expect.element(screen.getByText(almonds.name)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: header }));

    await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ sortBy });
  },
);
