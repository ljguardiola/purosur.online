import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { productsListFilters } from "./routes";
import {
  almondOil,
  cabriola,
  creamCheese,
  honey,
  lavenderOil,
  retiredHoney,
  vitora,
} from "./test-support/products";
import {
  createServices,
  mockLoaded,
  renderScreen,
  type Screen,
} from "./test-support/products-list-screen";

function brandFilter(screen: Screen) {
  return screen.getByRole("combobox", { name: /Marca/ });
}

const brands = [cabriola, vitora];
const products = [almondOil, lavenderOil, creamCheese, honey];

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

test("filtering by a brand lists only that brand's products", async () => {
  const services = createServices();
  mockLoaded(services, products, undefined, brands);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("4 productos activos")).toBeVisible();

  await userEvent.click(brandFilter(screen));
  await userEvent.click(screen.getByRole("option", { name: "Vitora" }));

  await expect.element(screen.getByText("2 productos activos")).toBeVisible();
  await expect.element(screen.getByText("Aceite de Almendras")).toBeVisible();
  await expect.element(screen.getByText("Aceite de Lavanda")).toBeVisible();
  expect(screen.getByText("Queso crema").query()).toBeNull();
  expect(screen.getByText("Miel pura de abeja 1 kg").query()).toBeNull();
});

test("filtering by Sin marca lists only the products with no brand", async () => {
  const services = createServices();
  mockLoaded(services, products, undefined, brands);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("4 productos activos")).toBeVisible();

  await userEvent.click(brandFilter(screen));
  await userEvent.click(screen.getByRole("option", { name: "Sin marca" }));

  await expect.element(screen.getByText("1 producto activo")).toBeVisible();
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  expect(screen.getByText("Aceite de Almendras").query()).toBeNull();
});

test("offers Todas, Sin marca and then the brands that have listed products by name", async () => {
  const services = createServices();
  mockLoaded(services, [almondOil, creamCheese], undefined, [
    ...brands,
    { ...vitora, id: "b2a40000-0000-4000-8000-000000000003", name: "Granuz" },
  ]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 productos activos")).toBeVisible();

  await userEvent.click(brandFilter(screen));

  const labels = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent?.trim());
  expect(labels).toEqual(["Todas", "Sin marca", "Cabriola", "Vitora"]);
});

test("typing in the brand filter narrows its options", async () => {
  const services = createServices();
  mockLoaded(services, products, undefined, brands);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("4 productos activos")).toBeVisible();
  await userEvent.click(brandFilter(screen));

  await userEvent.fill(brandFilter(screen), "cabr");

  await expect.element(screen.getByRole("option", { name: "Cabriola" })).toBeVisible();
  expect(screen.getByRole("option", { name: "Vitora" }).query()).toBeNull();
});

test("reports the chosen brand to the URL", async () => {
  const services = createServices();
  mockLoaded(services, products, undefined, brands);
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, () => {}, { onFiltersChange });
  await expect.element(screen.getByText("4 productos activos")).toBeVisible();

  await userEvent.click(brandFilter(screen));
  await userEvent.click(screen.getByRole("option", { name: "Cabriola" }));

  expect(onFiltersChange).toHaveBeenLastCalledWith({
    ...productsListFilters.parse({}),
    brand: cabriola.id,
  });
});

test("opens on the brand it is given", async () => {
  const services = createServices();
  mockLoaded(services, products, undefined, brands);

  const screen = await renderScreen(services, () => {}, {
    filters: { ...productsListFilters.parse({}), brand: cabriola.id },
  });

  await expect.element(brandFilter(screen)).toHaveValue("Cabriola");
  await expect.element(screen.getByText("Queso crema")).toBeVisible();
  expect(screen.getByText("Aceite de Almendras").query()).toBeNull();
});

test("falls back to every brand when the brand it is given is not one the list offers", async () => {
  const services = createServices();
  mockLoaded(services, products, undefined, brands);
  const onFiltersChange = vi.fn();

  const screen = await renderScreen(services, () => {}, {
    filters: { ...productsListFilters.parse({}), brand: "deleted-brand" },
    onFiltersChange,
  });

  await expect.element(screen.getByText("4 productos activos")).toBeVisible();
  await expect.element(brandFilter(screen)).toHaveValue("Todas");
  expect(onFiltersChange).toHaveBeenLastCalledWith(productsListFilters.parse({}));
});

test("keeps every brand once a status with none of the chosen brand's products made it fall back", async () => {
  const services = createServices();
  mockLoaded(services, products, undefined, brands);
  vi.mocked(services.fetchProducts).mockImplementation(async (status) => ({
    kind: "ok",
    value: status === "inactive" ? [retiredHoney] : products,
  }));
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("4 productos activos")).toBeVisible();
  await userEvent.click(brandFilter(screen));
  await userEvent.click(screen.getByRole("option", { name: "Vitora" }));
  await expect.element(screen.getByText("2 productos activos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Estado: Activos" }));
  await userEvent.click(screen.getByRole("option", { name: "Inactivos" }));
  await expect.element(brandFilter(screen)).toHaveValue("Todas");
  await userEvent.click(screen.getByRole("button", { name: "Estado: Inactivos" }));
  await userEvent.click(screen.getByRole("option", { name: "Activos" }));

  await expect.element(screen.getByText("4 productos activos")).toBeVisible();
  await expect.element(brandFilter(screen)).toHaveValue("Todas");
});
