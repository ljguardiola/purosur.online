import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import type { CategorySummary } from "./categoriesApi";
import type { ProductSummary } from "./productsApi";
import {
  almacen,
  almendras,
  createServices,
  frutosSecos,
  miel,
  mockLoaded,
  openDeactivateProductModal,
  openEditProductModal,
  openNewProductModal,
  renderScreen,
} from "./test-support/productsListScreen";

test("shows the breadcrumb, heading, each product's data and the product count", async () => {
  const services = createServices();
  mockLoaded(services, [miel, almendras]);

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
  mockLoaded(services, [miel, almendras]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 productos activos")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar por nombre o código de barras"), "7790000");
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(screen.getByText("Miel pura de abeja 1 kg").query()).toBeNull();

  await userEvent.fill(screen.getByPlaceholder("Buscar por nombre o código de barras"), "MIEL");
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  expect(screen.getByText("Almendras peladas").query()).toBeNull();
});

test("the category filter narrows the list", async () => {
  const services = createServices();
  mockLoaded(services, [miel, almendras]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 productos activos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Categoría: Todas" }));
  await userEvent.click(screen.getByRole("option", { name: "Frutos secos" }));

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(screen.getByText("Miel pura de abeja 1 kg").query()).toBeNull();
});

const bebidas: CategorySummary = { id: "category-4", name: "Bebidas", version: 1, parentId: null };
const otrosDeAlmacen: CategorySummary = {
  id: "category-5",
  name: "Otros",
  version: 1,
  parentId: "category-1",
};
const otrosDeBebidas: CategorySummary = {
  id: "category-6",
  name: "Otros",
  version: 1,
  parentId: "category-4",
};

test("the category filter offers only leaf categories, labeled by their full path, in tree order", async () => {
  const soda: ProductSummary = {
    ...almendras,
    id: "product-3",
    name: "Soda 2 l",
    categoryId: otrosDeBebidas.id,
    categoryName: "Otros",
  };
  const fosforos: ProductSummary = {
    ...miel,
    id: "product-4",
    name: "Fósforos",
    categoryId: otrosDeAlmacen.id,
    categoryName: "Otros",
  };
  const services = createServices();
  mockLoaded(
    services,
    [soda, fosforos],
    [otrosDeBebidas, bebidas, otrosDeAlmacen, almacen, frutosSecos],
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
  const fosforos: ProductSummary = {
    ...miel,
    id: "product-4",
    name: "Fósforos",
    categoryId: otrosDeAlmacen.id,
    categoryName: "Otros",
  };
  const services = createServices();
  mockLoaded(services, [fosforos], [almacen, otrosDeAlmacen]);
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("cell", { name: "Almacén › Otros" })).toBeVisible();
});

test("the Categoría column falls back to the category name the product carries when that category isn't loaded", async () => {
  const services = createServices();
  mockLoaded(services, [almendras], [almacen]);
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("cell", { name: "Frutos secos" })).toBeVisible();
});

test("the unit filter narrows the list", async () => {
  const services = createServices();
  mockLoaded(services, [miel, almendras]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 productos activos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Unidad: Todas" }));
  await userEvent.click(screen.getByRole("option", { name: "Por peso" }));

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(screen.getByText("Miel pura de abeja 1 kg").query()).toBeNull();
});

test("the status filter defaults to active products and refetches with the selected status", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  expect(services.fetchProducts).toHaveBeenLastCalledWith("active");

  const inactiveAlmendras: ProductSummary = { ...almendras, active: false };
  vi.mocked(services.fetchProducts).mockResolvedValueOnce({
    kind: "ok",
    value: [inactiveAlmendras],
  });
  await userEvent.click(screen.getByRole("button", { name: "Estado: Activos" }));
  await userEvent.click(screen.getByRole("option", { name: "Inactivos" }));

  expect(services.fetchProducts).toHaveBeenLastCalledWith("inactive");
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
});

test("shows an Estado column with an Activo or Inactivo tag", async () => {
  const services = createServices();
  const inactiveAlmendras: ProductSummary = { ...almendras, active: false };
  mockLoaded(services, [miel, inactiveAlmendras]);
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("cell", { name: "Activo" })).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "Inactivo" })).toBeVisible();
});

test("the actions column offers the ban action only on an active row", async () => {
  const services = createServices();
  const inactiveAlmendras: ProductSummary = { ...almendras, active: false };
  mockLoaded(services, [miel, inactiveAlmendras]);
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
});

test("shows an empty state naming inactive products, with no create prompt, when there are none", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
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
  mockLoaded(services, [miel]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar por nombre o código de barras"), "zzz");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("shows a load error with a retry action when the products fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "failed" });
  vi.mocked(services.fetchCategories).mockResolvedValueOnce({ kind: "ok", value: [] });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir los productos")).toBeVisible();

  mockLoaded(services, [miel]);
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("1 producto activo")).toBeVisible();
});

test("shows the rate-limited notice with a retry action", async () => {
  const services = createServices();
  vi.mocked(services.fetchProducts).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("navigates to Mi cuenta when the products request comes back forbidden", async () => {
  window.history.pushState(null, "", "/catalog/products");
  const services = createServices();
  vi.mocked(services.fetchProducts).mockResolvedValue({ kind: "forbidden" });
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
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
  mockLoaded(services, [miel]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 producto activo")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openNewProductModal(screen);
  await expectNoAccessibilityViolations(document.body);
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  await openEditProductModal(screen, miel);
  await expectNoAccessibilityViolations(document.body);
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  await openDeactivateProductModal(screen, miel);
  await expectNoAccessibilityViolations(document.body);
});
