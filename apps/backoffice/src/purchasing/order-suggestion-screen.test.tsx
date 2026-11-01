import type { OrderSuggestion } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { type OrderSuggestionFilters, orderSuggestionFilters } from "./order-suggestion-filters";
import { OrderSuggestionScreen } from "./order-suggestion-screen";
import type { OrderSuggestionScreenServices } from "./order-suggestion-services";
import { ORDER_SUGGESTION } from "./test-support/order-suggestion";
import { suppliersWithCuits } from "./test-support/suppliers";

const { andina, granos, cerealera } = suppliersWithCuits("30-70000001-1", "30-70000002-9");
const [almonds, cookies] = ORDER_SUGGESTION.lines as [
  OrderSuggestion["lines"][number],
  OrderSuggestion["lines"][number],
];

beforeEach(async () => {
  window.history.pushState(null, "", "/");
  await page.viewport(1440, 900);
});

afterEach(() => page.viewport(414, 896));

function createServices(
  overrides: Partial<OrderSuggestionScreenServices> = {},
): OrderSuggestionScreenServices {
  return {
    fetchOrderSuggestion: vi.fn(),
    fetchSuppliers: vi.fn().mockResolvedValue({ kind: "ok", value: [andina, granos, cerealera] }),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function screenElement(
  services: OrderSuggestionScreenServices,
  {
    filters = orderSuggestionFilters.parse({}),
    onFiltersChange = () => {},
    onSessionEnded = () => {},
  }: {
    filters?: OrderSuggestionFilters;
    onFiltersChange?: (filters: OrderSuggestionFilters) => void;
    onSessionEnded?: () => void;
  } = {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <OrderSuggestionScreen
          services={services}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(...args: Parameters<typeof screenElement>) {
  return render(screenElement(...args));
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

function lineRows(screen: Screen) {
  return screen.getByRole("row").all().slice(1);
}

async function loaded(
  services: OrderSuggestionScreenServices,
  suggestion: OrderSuggestion = ORDER_SUGGESTION,
  options: Parameters<typeof screenElement>[1] = {},
) {
  vi.mocked(services.fetchOrderSuggestion).mockResolvedValue({ kind: "ok", value: suggestion });
  const screen = await renderScreen(services, options);
  await expect.element(screen.getByRole("table", { name: "Sugerencia de pedido" })).toBeVisible();
  return screen;
}

function supplierSelect(screen: Screen, productName: string) {
  return screen.getByRole("button", { name: new RegExp(`Proveedor de ${productName}`) });
}

test("shows the breadcrumb and the heading", async () => {
  const screen = await loaded(createServices());

  await expect.element(screen.getByText("Pedidos").first()).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Sugerencia de pedido", level: 1 }))
    .toBeVisible();
});

test("shows a row for each product, with its description and category, sold, stock and coverage", async () => {
  const screen = await loaded(createServices());

  await expect.poll(() => lineRows(screen)).toHaveLength(3);
  const row = screen.getByRole("row", { name: /Almendras peladas/ });
  await expect.element(row.getByText("Frutos secos")).toBeVisible();
  await expect.element(row.getByText("120 kg", { exact: true })).toBeVisible();
  await expect.element(row.getByText("10 kg", { exact: true })).toBeVisible();
  await expect.element(row.getByText("15 días")).toBeVisible();
});

test("describes the product with its brand name and net content", async () => {
  const screen = await loaded(createServices(), {
    lines: [
      {
        ...almonds,
        name: "Aceite de Almendras",
        brandName: "Vitora",
        netContent: { quantity: 30, unit: "ML" },
      },
    ],
  });

  await expect
    .element(screen.getByText("Aceite de Almendras Vitora 30 ml", { exact: true }))
    .toBeVisible();
});

test("proposes the cheapest supplier with its packages, quantity, price per unit and list date", async () => {
  const screen = await loaded(createServices());

  await expect
    .poll(() => supplierSelect(screen, "Almendras peladas").element().textContent)
    .toContain("Frutos Secos Mendoza");
  const row = screen.getByRole("row", { name: /Almendras peladas/ });
  await expect.element(row.getByText("2 × 25 kg")).toBeVisible();
  await expect.element(row.getByText("50 kg", { exact: true })).toBeVisible();
  await expect.element(row.getByText("$ 10.180,00 / kg", { exact: true })).toBeVisible();
  await expect.element(row.getByText("20/10/2026", { exact: true })).toBeVisible();
});

test("writes a product sold by the unit with no unit in its price", async () => {
  const screen = await loaded(createServices());

  const honey = screen.getByRole("row", { name: /Miel pura de abeja 1 kg/ });
  await expect.element(honey.getByText("1 × 12 u")).toBeVisible();
  await expect.element(honey.getByText("$ 5.583,33", { exact: true })).toBeVisible();
});

test("offers every priced supplier with its price per unit and list date, the cheapest marked", async () => {
  const screen = await loaded(createServices());

  await userEvent.click(supplierSelect(screen, "Almendras peladas"));

  const options = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);
  expect(options).toEqual([
    "Frutos Secos Mendoza · $ 10.180,00 / kg · 20/10/2026El más barato",
    "Distribuidora del Sur · $ 10.640,00 / kg · 02/09/2026",
    "Dejar fuera del pedido",
  ]);
});

test("shows the packages, quantity, price per unit and date of the supplier chosen instead", async () => {
  const screen = await loaded(createServices());

  await userEvent.click(supplierSelect(screen, "Almendras peladas"));
  await userEvent.click(screen.getByRole("option", { name: /Distribuidora del Sur/ }));

  const row = screen.getByRole("row", { name: /Almendras peladas/ });
  await expect
    .poll(() => supplierSelect(screen, "Almendras peladas").element().textContent)
    .toContain("Distribuidora del Sur");
  await expect.element(row.getByText("10 × 5 kg")).toBeVisible();
  await expect.element(row.getByText("$ 10.640,00 / kg", { exact: true })).toBeVisible();
  await expect.element(row.getByText("02/09/2026", { exact: true })).toBeVisible();
  expect(row.getByText("20/10/2026", { exact: true }).query()).toBeNull();
});

test("changing the supplier of a line leaves the other lines as they were", async () => {
  const screen = await loaded(createServices());

  await userEvent.click(supplierSelect(screen, "Almendras peladas"));
  await userEvent.click(screen.getByRole("option", { name: /Distribuidora del Sur/ }));

  await expect
    .poll(() => supplierSelect(screen, "Miel pura de abeja 1 kg").element().textContent)
    .toContain("Apícola Los Tilos");
});

test("leaves a line out of the order, showing it as left out", async () => {
  const screen = await loaded(createServices());

  await userEvent.click(supplierSelect(screen, "Almendras peladas"));
  await userEvent.click(screen.getByRole("option", { name: "Dejar fuera del pedido" }));

  const row = screen.getByRole("row", { name: /Almendras peladas/ });
  await expect.element(row.getByText("Fuera del pedido", { exact: true })).toBeVisible();
  expect(row.getByText("2 × 25 kg").query()).toBeNull();
  expect(row.getByText("20/10/2026", { exact: true }).query()).toBeNull();
});

test("puts a line back in the order by choosing a supplier again", async () => {
  const screen = await loaded(createServices());
  await userEvent.click(supplierSelect(screen, "Almendras peladas"));
  await userEvent.click(screen.getByRole("option", { name: "Dejar fuera del pedido" }));

  await userEvent.click(supplierSelect(screen, "Almendras peladas"));
  await userEvent.click(screen.getByRole("option", { name: /Frutos Secos Mendoza/ }));

  await expect
    .element(screen.getByRole("row", { name: /Almendras peladas/ }).getByText("2 × 25 kg"))
    .toBeVisible();
});

test("shows a product without a price as having no proposed supplier, with the quantity it needs", async () => {
  const screen = await loaded(createServices());

  const row = screen.getByRole("row", { name: /Galletas de avena integrales/ });
  await expect.element(row.getByText("Almacén")).toBeVisible();
  await expect.element(row.getByText("Sin precio en ninguna lista cargada")).toBeVisible();
  await expect.element(row.getByText("30 u", { exact: true })).toBeVisible();
  await expect
    .poll(() => supplierSelect(screen, "Galletas de avena integrales").element().textContent)
    .toContain("Elegir proveedor");
});

test("offers the active suppliers and leaving out to a product without a price", async () => {
  const screen = await loaded(createServices());

  await userEvent.click(supplierSelect(screen, "Galletas de avena integrales"));

  const options = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);
  expect(options).toEqual(["Distribuidora Andina", "Granos del Valle", "Dejar fuera del pedido"]);
});

test("keeps showing the quantity needed when a supplier is picked for a product without a price", async () => {
  const screen = await loaded(createServices());

  await userEvent.click(supplierSelect(screen, "Galletas de avena integrales"));
  await userEvent.click(screen.getByRole("option", { name: "Granos del Valle" }));

  const row = screen.getByRole("row", { name: /Galletas de avena integrales/ });
  await expect
    .poll(() => supplierSelect(screen, "Galletas de avena integrales").element().textContent)
    .toContain("Granos del Valle");
  await expect.element(row.getByText("30 u", { exact: true })).toBeVisible();
});

test("leaves a product without a price out of the order", async () => {
  const screen = await loaded(createServices());

  await userEvent.click(supplierSelect(screen, "Galletas de avena integrales"));
  await userEvent.click(screen.getByRole("option", { name: "Dejar fuera del pedido" }));

  await expect
    .element(
      screen
        .getByRole("row", { name: /Galletas de avena integrales/ })
        .getByText("Fuera del pedido", { exact: true }),
    )
    .toBeVisible();
});

test("offers only leaving out to a product without a price while the suppliers are not read", async () => {
  const screen = await loaded(
    createServices({ fetchSuppliers: vi.fn().mockResolvedValue({ kind: "failed" }) }),
  );

  await userEvent.click(supplierSelect(screen, "Galletas de avena integrales"));

  expect(
    screen
      .getByRole("option")
      .elements()
      .map((option) => option.textContent),
  ).toEqual(["Dejar fuera del pedido"]);
});

test("does not read the suppliers when every product has a price", async () => {
  const services = createServices();
  await loaded(services, { lines: [almonds] });

  expect(services.fetchSuppliers).not.toHaveBeenCalled();
});

test.each([
  ["missing its VAT rate", "vat_rate_missing", "Falta el IVA del ítem"],
  ["through a link that has to be made again", "link_outdated", "Hay que volver a vincularlo"],
] as const)("lists an offer %s as not selectable, with its reason", async (_name, reason, text) => {
  const screen = await loaded(createServices(), {
    lines: [
      {
        ...almonds,
        unpricedOffers: [
          {
            supplier: { id: "5a900000-0000-4000-8000-000000000009", name: "Mayorista Norte" },
            quantity: 10_000,
            saleUnit: "KG",
            priceCents: 9_900_000,
            listDate: "2026-08-15",
            reason,
          },
        ],
      },
    ],
  });

  const row = screen.getByRole("row", { name: /Almendras peladas/ });
  await expect.element(row.getByText("Mayorista Norte", { exact: true })).toBeVisible();
  await expect.element(row.getByText(text)).toBeVisible();
  await userEvent.click(supplierSelect(screen, "Almendras peladas"));
  expect(
    screen
      .getByRole("option")
      .elements()
      .some((option) => option.textContent?.includes("Mayorista Norte")),
  ).toBe(false);
});

test("counts the products shown", async () => {
  const screen = await loaded(createServices());

  await expect.element(screen.getByText("3 productos")).toBeVisible();
});

test("counts a single product in the singular", async () => {
  const screen = await loaded(createServices(), { lines: [cookies] });

  await expect.element(screen.getByText("1 producto", { exact: true })).toBeVisible();
});

test("searches the products by name and reports the search", async () => {
  const onFiltersChange = vi.fn();
  const screen = await loaded(createServices(), ORDER_SUGGESTION, { onFiltersChange });

  await userEvent.fill(screen.getByPlaceholder("Buscar un producto"), "miel");

  await expect.poll(() => lineRows(screen)).toHaveLength(1);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg", { exact: true })).toBeVisible();
  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toEqual({ search: "miel" });
});

test("opens on the search the URL carries", async () => {
  const screen = await loaded(createServices(), ORDER_SUGGESTION, {
    filters: orderSuggestionFilters.parse({ search: "galle" }),
  });

  await expect.poll(() => lineRows(screen)).toHaveLength(1);
  await expect.element(screen.getByPlaceholder("Buscar un producto")).toHaveValue("galle");
});

test("says nothing matches when the search hides every product", async () => {
  const screen = await loaded(createServices());

  await userEvent.fill(screen.getByPlaceholder("Buscar un producto"), "zzz");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("says no product needs ordering when the suggestion is empty", async () => {
  const screen = await loaded(createServices(), { lines: [] });

  await expect.element(screen.getByText("Ningún producto necesita pedirse")).toBeVisible();
});

test("shows the table loading until the suggestion arrives", async () => {
  const services = createServices();
  const pending = deferred<Awaited<ReturnType<typeof services.fetchOrderSuggestion>>>();
  vi.mocked(services.fetchOrderSuggestion).mockReturnValue(pending.promise);
  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Sugerencia de pedido" }))
    .toHaveAttribute("aria-busy", "true");
  pending.resolve({ kind: "ok", value: ORDER_SUGGESTION });
  await expect.element(screen.getByText("Almendras peladas", { exact: true })).toBeVisible();
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchOrderSuggestion>>>();
  vi.mocked(services.fetchOrderSuggestion)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir la sugerencia de pedido")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Sugerencia de pedido" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: ORDER_SUGGESTION });
  await expect.element(screen.getByText("Almendras peladas", { exact: true })).toBeVisible();
});

test("ends the session when the suggestion comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchOrderSuggestion).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the suggestion comes back forbidden", async () => {
  window.history.pushState(null, "", "/order-suggestion");
  const services = createServices();
  vi.mocked(services.fetchOrderSuggestion).mockResolvedValue({ kind: "forbidden" });
  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("has no accessibility violations once loaded", async () => {
  const screen = await loaded(createServices());

  await expectNoAccessibilityViolations(screen.container);
});
