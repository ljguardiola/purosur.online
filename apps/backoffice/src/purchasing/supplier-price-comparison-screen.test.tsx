import type { SupplierPriceComparison } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  type SupplierPriceComparisonFilters,
  supplierPriceComparisonFilters,
} from "./supplier-price-comparison-filters";
import { SupplierPriceComparisonScreen } from "./supplier-price-comparison-screen";
import type { SupplierPriceComparisonScreenServices } from "./supplier-price-comparison-services";
import { PRICE_COMPARISON } from "./test-support/supplier-price-comparison";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<SupplierPriceComparisonScreenServices> = {},
): SupplierPriceComparisonScreenServices {
  return { fetchSupplierPriceComparison: vi.fn(), ...overrides };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function screenElement(
  services: SupplierPriceComparisonScreenServices,
  {
    filters = supplierPriceComparisonFilters.parse({}),
    onFiltersChange = () => {},
    onSessionEnded = () => {},
  }: {
    filters?: SupplierPriceComparisonFilters;
    onFiltersChange?: (filters: SupplierPriceComparisonFilters) => void;
    onSessionEnded?: () => void;
  } = {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <SupplierPriceComparisonScreen
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

function offerRows(screen: Screen) {
  return screen.getByRole("row").all().slice(1);
}

async function loaded(
  services: SupplierPriceComparisonScreenServices,
  comparison: SupplierPriceComparison = PRICE_COMPARISON,
  options: Parameters<typeof screenElement>[1] = {},
) {
  vi.mocked(services.fetchSupplierPriceComparison).mockResolvedValue({
    kind: "ok",
    value: comparison,
  });
  const screen = await renderScreen(services, options);
  await expect.element(screen.getByRole("table", { name: "Comparación de precios" })).toBeVisible();
  return screen;
}

test("shows the breadcrumb and the heading", async () => {
  const screen = await loaded(createServices());

  await expect.element(screen.getByText("Pedidos").first()).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Comparación de precios", level: 1 }))
    .toBeVisible();
});

test("shows a row for each offer, with the product and its category on the first offer of each", async () => {
  const screen = await loaded(createServices());

  await expect.poll(() => offerRows(screen)).toHaveLength(4);
  const almonds = screen.getByRole("row", { name: /Frutos Secos Mendoza/ });
  await expect.element(almonds.getByText("Almendras peladas")).toBeVisible();
  await expect.element(almonds.getByText("Frutos secos")).toBeVisible();
  const second = screen.getByRole("row", { name: /Distribuidora del Sur/ });
  expect(second.element().textContent).not.toContain("Almendras peladas");
});

test("shows each offer's supplier, presentation with its price, price per sale unit and list date", async () => {
  const screen = await loaded(createServices());

  const offer = screen.getByRole("row", { name: /Distribuidora del Sur/ });
  await expect.element(offer.getByText("Bolsa 5 kg · $ 53.200,00")).toBeVisible();
  await expect.element(offer.getByText("$ 10.640,00 / kg")).toBeVisible();
  await expect.element(offer.getByText("02/09/2026")).toBeVisible();
});

test("writes the price per sale unit of a product sold by the unit with no unit", async () => {
  const screen = await loaded(createServices());

  const honey = screen.getByRole("row", { name: /Apícola Los Tilos/ });
  await expect.element(honey.getByText("Caja x 12 · $ 67.000,00")).toBeVisible();
  await expect.element(honey.getByText("$ 5.583,33", { exact: true })).toBeVisible();
});

test("marks only the offer the cloud says is the cheapest", async () => {
  const screen = await loaded(createServices());

  await expect
    .element(screen.getByRole("row", { name: /Frutos Secos Mendoza/ }).getByText("El más barato"))
    .toBeVisible();
  expect(
    screen
      .getByRole("row", { name: /Distribuidora del Sur/ })
      .getByText("El más barato")
      .query(),
  ).toBeNull();
  expect(screen.getByText("El más barato").elements()).toHaveLength(2);
});

test("shows a product with no offers as having no price in any loaded list", async () => {
  const screen = await loaded(createServices());

  const cookies = screen.getByRole("row", { name: /Galletas de avena integrales/ });
  await expect.element(cookies.getByText("Almacén")).toBeVisible();
  await expect.element(cookies.getByText("Sin precio en ninguna lista cargada")).toBeVisible();
});

test("counts the products shown", async () => {
  const screen = await loaded(createServices());

  await expect.element(screen.getByText("3 productos")).toBeVisible();
});

test("counts a single product in the singular", async () => {
  const [almonds] = PRICE_COMPARISON.products as [SupplierPriceComparison["products"][number]];
  const screen = await loaded(createServices(), { products: [almonds] });

  await expect.element(screen.getByText("1 producto", { exact: true })).toBeVisible();
});

test("searches the products by name and reports the search", async () => {
  const onFiltersChange = vi.fn();
  const screen = await loaded(createServices(), PRICE_COMPARISON, { onFiltersChange });

  await userEvent.fill(screen.getByPlaceholder("Buscar un producto"), "miel");

  await expect.poll(() => offerRows(screen)).toHaveLength(1);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  await expect.element(screen.getByText("1 producto", { exact: true })).toBeVisible();
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ search: "miel", category: "" });
});

test("offers every category once, after Todas, and filters by the one chosen", async () => {
  const onFiltersChange = vi.fn();
  const screen = await loaded(createServices(), PRICE_COMPARISON, { onFiltersChange });

  await userEvent.click(screen.getByRole("button", { name: /Categoría:/ }));
  expect(
    screen
      .getByRole("option")
      .elements()
      .map((option) => option.textContent),
  ).toEqual(["Todas", "Almacén", "Frutos secos"]);
  await userEvent.click(screen.getByRole("option", { name: "Frutos secos" }));

  await expect.poll(() => offerRows(screen)).toHaveLength(2);
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ search: "", category: "Frutos secos" });
});

test("opens on the filters the URL carries", async () => {
  const screen = await loaded(createServices(), PRICE_COMPARISON, {
    filters: supplierPriceComparisonFilters.parse({ category: "Almacén", search: "galle" }),
  });

  await expect.poll(() => offerRows(screen)).toHaveLength(1);
  await expect.element(screen.getByPlaceholder("Buscar un producto")).toHaveValue("galle");
});

test("shows every product when the URL names a category the list does not offer", async () => {
  const screen = await loaded(createServices(), PRICE_COMPARISON, {
    filters: supplierPriceComparisonFilters.parse({ category: "Bebidas" }),
  });

  await expect.poll(() => offerRows(screen)).toHaveLength(4);
});

test("says there is nothing to compare yet when no product is linked", async () => {
  const screen = await loaded(createServices(), { products: [] });

  await expect.element(screen.getByText("Todavía no hay precios para comparar")).toBeVisible();
});

test("says nothing matches when the filters hide every product", async () => {
  const screen = await loaded(createServices());

  await userEvent.fill(screen.getByPlaceholder("Buscar un producto"), "zzz");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("shows the table loading until the comparison arrives", async () => {
  const services = createServices();
  const pending = deferred<Awaited<ReturnType<typeof services.fetchSupplierPriceComparison>>>();
  vi.mocked(services.fetchSupplierPriceComparison).mockReturnValue(pending.promise);
  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Comparación de precios" }))
    .toHaveAttribute("aria-busy", "true");
  pending.resolve({ kind: "ok", value: PRICE_COMPARISON });
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchSupplierPriceComparison>>>();
  vi.mocked(services.fetchSupplierPriceComparison)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByText("No pudimos abrir la comparación de precios"))
    .toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Comparación de precios" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: PRICE_COMPARISON });
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
});

test("ends the session when the comparison comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceComparison).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the comparison comes back forbidden", async () => {
  window.history.pushState(null, "", "/price-comparison");
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceComparison).mockResolvedValue({ kind: "forbidden" });
  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("has no accessibility violations once loaded", async () => {
  const screen = await loaded(createServices());

  await expectNoAccessibilityViolations(screen.container);
});
