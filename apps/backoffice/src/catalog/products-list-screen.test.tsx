import type { CategorySummary, ProductSummary } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { productsListFilters } from "./routes";
import { almonds, driedFruits, groceries, honey } from "./test-support/products";
import {
  createServices,
  mockLoaded,
  openDeactivateProductModal,
  openEditProductModal,
  openNewProductModal,
  renderScreen,
  screenElement,
} from "./test-support/products-list-screen";

test("shows the breadcrumb, heading, each product's data and the product count", async () => {
  const services = createServices();
  mockLoaded(services, [honey, almonds]);

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Catálogo")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Productos", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "Por unidad" })).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "Por peso" })).toBeVisible();
  await expect.element(screen.getByText("2 productos activos")).toBeVisible();
});

test("the search field filters by name or barcode, case-insensitively", async () => {
  const services = createServices();
  mockLoaded(services, [honey, almonds]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 productos activos")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar por nombre o código de barras"), "7790000");
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(screen.getByText("Miel pura de abeja 1 kg").query()).toBeNull();

  await userEvent.fill(screen.getByPlaceholder("Buscar por nombre o código de barras"), "MIEL");
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  expect(screen.getByText("Almendras peladas").query()).toBeNull();
});

test("the Producto header reverses the alphabetical order of the products", async () => {
  const services = createServices();
  mockLoaded(services, [honey, almonds]);
  const screen = await renderScreen(services);
  const productNames = () =>
    screen
      .getByRole("row")
      .elements()
      .map((row) => row.textContent ?? "")
      .filter((text) => text.includes("Miel") || text.includes("Almendras"));
  await expect.poll(productNames).toHaveLength(2);
  expect(productNames()[0]).toContain("Almendras peladas");
  expect(productNames()[1]).toContain("Miel pura de abeja 1 kg");

  await userEvent.click(screen.getByRole("button", { name: "Producto" }));

  await expect.poll(() => productNames()[0]).toContain("Miel pura de abeja 1 kg");
  expect(productNames()[1]).toContain("Almendras peladas");
});

test("the category filter narrows the list", async () => {
  const services = createServices();
  mockLoaded(services, [honey, almonds]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 productos activos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Categoría: Todas" }));
  await userEvent.click(screen.getByRole("option", { name: "Frutos secos" }));

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(screen.getByText("Miel pura de abeja 1 kg").query()).toBeNull();
});

const drinks: CategorySummary = { id: "ca7e0000-0000-4000-8000-000000000004", name: "Bebidas", version: 1, parentId: null };
const otherGroceries: CategorySummary = {
  id: "ca7e0000-0000-4000-8000-000000000005",
  name: "Otros",
  version: 1,
  parentId: "ca7e0000-0000-4000-8000-000000000001",
};
const otherDrinks: CategorySummary = {
  id: "ca7e0000-0000-4000-8000-000000000006",
  name: "Otros",
  version: 1,
  parentId: "ca7e0000-0000-4000-8000-000000000004",
};

test("the category filter offers only leaf categories, labeled by their full path, in tree order", async () => {
  const soda: ProductSummary = {
    ...almonds,
    id: "90d00000-0000-4000-8000-000000000003",
    name: "Soda 2 l",
    categoryId: otherDrinks.id,
    categoryName: "Otros",
  };
  const matchboxes: ProductSummary = {
    ...honey,
    id: "90d00000-0000-4000-8000-000000000004",
    name: "Fósforos",
    categoryId: otherGroceries.id,
    categoryName: "Otros",
  };
  const services = createServices();
  mockLoaded(
    services,
    [soda, matchboxes],
    [otherDrinks, drinks, otherGroceries, groceries, driedFruits],
  );
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 productos activos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Categoría: Todas" }));

  await expect
    .poll(() =>
      screen
        .getByRole("option")
        .all()
        .map((option) => option.element().textContent ?? ""),
    )
    .toEqual(["Todas", "Almacén › Otros", "Bebidas › Otros", "Frutos secos"]);

  await userEvent.click(screen.getByRole("option", { name: "Bebidas › Otros" }));

  await expect.element(screen.getByText("Fósforos")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Soda 2 l")).toBeVisible();
});

test("the Categoría column shows each product's category by its full path", async () => {
  const matchboxes: ProductSummary = {
    ...honey,
    id: "90d00000-0000-4000-8000-000000000004",
    name: "Fósforos",
    categoryId: otherGroceries.id,
    categoryName: "Otros",
  };
  const services = createServices();
  mockLoaded(services, [matchboxes], [groceries, otherGroceries]);
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("cell", { name: "Almacén › Otros" })).toBeVisible();
});

test("the Categoría column falls back to the category name the product carries when that category isn't loaded", async () => {
  const services = createServices();
  mockLoaded(services, [almonds], [groceries]);
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("cell", { name: "Frutos secos" })).toBeVisible();
});

test("the unit filter narrows the list", async () => {
  const services = createServices();
  mockLoaded(services, [honey, almonds]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 productos activos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Unidad: Todas" }));
  await userEvent.click(screen.getByRole("option", { name: "Por peso" }));

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(screen.getByText("Miel pura de abeja 1 kg").query()).toBeNull();
});

test("the status filter defaults to active products and refetches with the selected status", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  expect(services.fetchProducts).toHaveBeenLastCalledWith("active");

  const inactiveAlmonds: ProductSummary = { ...almonds, active: false };
  vi.mocked(services.fetchProducts).mockResolvedValueOnce({
    kind: "ok",
    value: [inactiveAlmonds],
  });
  await userEvent.click(screen.getByRole("button", { name: "Estado: Activos" }));
  await userEvent.click(screen.getByRole("option", { name: "Inactivos" }));

  expect(services.fetchProducts).toHaveBeenLastCalledWith("inactive");
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
});

test("shows an Estado column with an Activo or Inactivo tag", async () => {
  const services = createServices();
  const inactiveAlmonds: ProductSummary = { ...almonds, active: false };
  mockLoaded(services, [honey, inactiveAlmonds]);
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("cell", { name: "Activo" })).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "Inactivo" })).toBeVisible();
});

test("the actions column offers the ban action only on an active row", async () => {
  const services = createServices();
  const inactiveAlmonds: ProductSummary = { ...almonds, active: false };
  mockLoaded(services, [honey, inactiveAlmonds]);
  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("button", { name: "Editar el producto Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Desactivar el producto Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Editar el producto Almendras peladas" }))
    .toBeVisible();
  expect(
    screen.getByRole("button", { name: "Desactivar el producto Almendras peladas" }).query(),
  ).toBeNull();
});

test("shows a blank empty state naming active products when there are none", async () => {
  const services = createServices();
  mockLoaded(services, []);

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();
  await expect.element(screen.getByText("Creá uno para verlo en la lista.")).toBeVisible();
  await expect.element(screen.getByText("0 productos activos")).not.toBeInTheDocument();
});

test("shows an empty state naming inactive products, with no create prompt, when there are none", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();

  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "ok", value: [] });
  await userEvent.click(screen.getByRole("button", { name: "Estado: Activos" }));
  await userEvent.click(screen.getByRole("option", { name: "Inactivos" }));

  await expect.element(screen.getByText("No hay productos inactivos")).toBeVisible();
  expect(screen.getByText(/Creá/).query()).toBeNull();
});

test("shows the no-products-yet empty state when every status is listed and there are none", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Estado: Activos" }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));

  await expect.element(screen.getByText("Todavía no hay productos")).toBeVisible();
  await expect.element(screen.getByText("Creá el primero para verlo en la lista.")).toBeVisible();
});

test("shows a filtered empty state when the search matches nothing", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar por nombre o código de barras"), "zzz");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
  await expect.element(screen.getByText("0 productos activos")).not.toBeInTheDocument();
});

test("shows a load error with a retry action when the products fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "failed" });
  vi.mocked(services.fetchCategories).mockResolvedValueOnce({ kind: "ok", value: [] });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir los productos")).toBeVisible();

  mockLoaded(services, [honey]);
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("1 producto activo")).toBeVisible();
});

test("retrying a failed load starts again from the loading placeholder", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries] });
  let finishRetry: (outcome: Awaited<ReturnType<typeof services.fetchProducts>>) => void = () => {};
  vi.mocked(services.fetchProducts)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finishRetry = resolve;
      }),
    );
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir los productos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("No pudimos abrir los productos")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("table", { name: "Productos" }))
    .toHaveAttribute("aria-busy", "true");
  finishRetry({ kind: "ok", value: [honey] });
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
});

test("a failed categories load fails the screen too, and retrying reads only what failed", async () => {
  const services = createServices();
  vi.mocked(services.fetchProducts).mockResolvedValue({ kind: "ok", value: [honey] });
  vi.mocked(services.fetchCategories).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir los productos")).toBeVisible();

  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries] });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  expect(services.fetchProducts).toHaveBeenCalledTimes(1);
  expect(services.fetchCategories).toHaveBeenCalledTimes(2);
});

test("the create and print actions are disabled while the data loads and after it fails to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries] });
  let finishLoad: (outcome: Awaited<ReturnType<typeof services.fetchProducts>>) => void = () => {};
  vi.mocked(services.fetchProducts).mockReturnValueOnce(
    new Promise((resolve) => {
      finishLoad = resolve;
    }),
  );
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Nuevo producto" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Imprimir etiquetas" })).toBeDisabled();

  finishLoad({ kind: "failed" });
  await expect.element(screen.getByText("No pudimos abrir los productos")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Nuevo producto" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Imprimir etiquetas" })).toBeDisabled();
});

test("the create and print actions stay available while the shown products refresh", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  const dialog = await openDeactivateProductModal(screen, honey);
  vi.mocked(services.fetchProducts).mockReturnValueOnce(new Promise(() => {}));

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect
    .element(screen.getByRole("table", { name: "Productos" }))
    .toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("Miel pura de abeja 1 kg").query()).not.toBeNull();
  await expect.element(screen.getByRole("button", { name: "Nuevo producto" })).toBeEnabled();
  await expect.element(screen.getByRole("button", { name: "Imprimir etiquetas" })).toBeEnabled();
});

test("shows the rate-limited notice with the time to wait and a retry action", async () => {
  const services = createServices();
  vi.mocked(services.fetchProducts).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("navigates to Mi cuenta when the products request comes back forbidden", async () => {
  window.history.pushState(null, "", "/products");
  const services = createServices();
  vi.mocked(services.fetchProducts).mockResolvedValue({ kind: "forbidden" });
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});

test("ends the session when the products request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchProducts).mockResolvedValue({ kind: "unauthenticated" });
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("has no accessibility violations once loaded, and with the create modal open", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 producto activo")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openNewProductModal(screen);
  await expectNoAccessibilityViolations(document.body);
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  await openEditProductModal(screen, honey);
  await expectNoAccessibilityViolations(document.body);
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  await openDeactivateProductModal(screen, honey);
  await expectNoAccessibilityViolations(document.body);
});

test("opens with the filters and ordering it is given", async () => {
  const services = createServices();
  const inactiveAlmonds: ProductSummary = { ...almonds, active: false };
  const inactiveWalnuts: ProductSummary = {
    ...almonds,
    id: "90d00000-0000-4000-8000-000000000003",
    name: "Nueces peladas",
    barcodes: ["7790000000002"],
    active: false,
  };
  const inactiveHoney: ProductSummary = { ...honey, name: "Miel peladas", active: false };
  mockLoaded(services, [inactiveAlmonds, inactiveHoney, inactiveWalnuts]);

  const screen = await renderScreen(services, () => {}, {
    filters: {
      search: "peladas",
      category: driedFruits.id,
      unit: "KG",
      status: "inactive",
      sort: "descending",
    },
  });

  await expect.element(screen.getByText("Nueces peladas")).toBeVisible();
  expect(services.fetchProducts).toHaveBeenLastCalledWith("inactive");
  await expect
    .element(screen.getByPlaceholder("Buscar por nombre o código de barras"))
    .toHaveValue("peladas");
  await expect
    .element(screen.getByRole("button", { name: "Categoría: Frutos secos" }))
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Unidad: Por peso" })).toBeVisible();
  expect(screen.getByText("Miel peladas").query()).toBeNull();
  const names = screen
    .getByRole("row")
    .elements()
    .map((row) => row.textContent ?? "")
    .filter((text) => text.includes("peladas"));
  expect(names[0]).toContain("Nueces peladas");
  expect(names[1]).toContain("Almendras peladas");
});

test("falls back to every category when the category it is given is not one the list offers", async () => {
  const services = createServices();
  mockLoaded(services, [honey, almonds]);
  const onFiltersChange = vi.fn();

  const screen = await renderScreen(services, () => {}, {
    filters: { ...productsListFilters.parse({}), category: "deleted-category" },
    onFiltersChange,
  });

  await expect.element(screen.getByText("2 productos activos")).toBeVisible();
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Categoría: Todas" })).toBeVisible();
  expect(onFiltersChange).toHaveBeenLastCalledWith(productsListFilters.parse({}));
});

test("keeps the category it is given while the categories are still loading, and drops it once they load without it", async () => {
  const services = createServices();
  vi.mocked(services.fetchProducts).mockResolvedValue({ kind: "ok", value: [honey] });
  let finishCategories: (outcome: Awaited<ReturnType<typeof services.fetchCategories>>) => void =
    () => {};
  vi.mocked(services.fetchCategories).mockReturnValue(
    new Promise((resolve) => {
      finishCategories = resolve;
    }),
  );
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, () => {}, {
    filters: { ...productsListFilters.parse({}), category: "deleted-category" },
    onFiltersChange,
  });
  await expect
    .element(screen.getByRole("table", { name: "Productos" }))
    .toHaveAttribute("aria-busy", "true");
  expect(onFiltersChange).not.toHaveBeenCalled();

  finishCategories({ kind: "ok", value: [groceries] });

  await expect.poll(() => onFiltersChange.mock.calls.length).toBe(1);
  expect(onFiltersChange).toHaveBeenCalledWith(productsListFilters.parse({}));
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
});

test("reports every change to its filters, so they can be kept for a reload", async () => {
  const services = createServices();
  mockLoaded(services, [honey, almonds]);
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, () => {}, { onFiltersChange });
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Unidad: Todas" }));
  await userEvent.click(screen.getByRole("option", { name: "Por peso" }));
  await userEvent.fill(screen.getByPlaceholder("Buscar por nombre o código de barras"), "alm");

  expect(onFiltersChange).toHaveBeenLastCalledWith({
    ...productsListFilters.parse({}),
    unit: "KG",
    search: "alm",
  });
});

test("does not report its filters again when the route hands it a new callback", async () => {
  const services = createServices();
  mockLoaded(services, [honey, almonds]);
  const onFiltersChange = vi.fn();
  const filters = productsListFilters.parse({});
  const screen = await renderScreen(services, () => {}, { filters, onFiltersChange });
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Unidad: Todas" }));
  await userEvent.click(screen.getByRole("option", { name: "Por peso" }));
  await expect.poll(() => onFiltersChange.mock.calls.length).toBe(1);

  await screen.rerender(
    screenElement(services, () => {}, {
      filters,
      onFiltersChange: (reported) => onFiltersChange(reported),
    }),
  );

  expect(onFiltersChange).toHaveBeenCalledTimes(1);
});
