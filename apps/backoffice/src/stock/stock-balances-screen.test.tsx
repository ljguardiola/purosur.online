import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { type StockBalancesFilters, stockBalancesFilters } from "./routes";
import { StockBalancesScreen } from "./stock-balances-screen";
import type { StockBalancesScreenServices } from "./stock-balances-services";
import { almonds, crackers, honey, oats, tea } from "./test-support/stock-fixtures";

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

function listed(products = [almonds, honey, crackers, tea]) {
  const services = createServices();
  vi.mocked(services.fetchStockBalances).mockResolvedValue({ kind: "ok", value: { products } });
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
  await expect.element(screen.getByText("4 productos")).toBeVisible();
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
  await expect.element(screen.getByText("1 producto", { exact: true })).toBeVisible();
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
    .mockResolvedValueOnce({ kind: "ok", value: { products: [almonds] } });
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
  await expect.element(screen.getByText("2 productos")).toBeVisible();
});

test("marks no active product as deactivated", async () => {
  const screen = await renderScreen(listed([almonds]));

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(screen.getByText("Desactivado").query()).toBeNull();
});
