import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { productsListFilters } from "./routes";
import {
  almondOil,
  creamCheese,
  hierbasDelOasis,
  honey,
  lavenderOil,
  serenisima,
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

const brands = [serenisima, hierbasDelOasis];
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
  await userEvent.click(screen.getByRole("option", { name: "Hierbas del Oasis" }));

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
    { ...hierbasDelOasis, id: "b2a40000-0000-4000-8000-000000000003", name: "Granuz" },
  ]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 productos activos")).toBeVisible();

  await userEvent.click(brandFilter(screen));

  const labels = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent?.trim());
  expect(labels).toEqual(["Todas", "Sin marca", "Hierbas del Oasis", "Serenísima"]);
});

test("typing in the brand filter narrows its options", async () => {
  const services = createServices();
  mockLoaded(services, products, undefined, brands);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("4 productos activos")).toBeVisible();
  await userEvent.click(brandFilter(screen));

  await userEvent.fill(brandFilter(screen), "sere");

  await expect.element(screen.getByRole("option", { name: "Serenísima" })).toBeVisible();
  expect(screen.getByRole("option", { name: "Hierbas del Oasis" }).query()).toBeNull();
});

test("reports the chosen brand to the URL", async () => {
  const services = createServices();
  mockLoaded(services, products, undefined, brands);
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, () => {}, { onFiltersChange });
  await expect.element(screen.getByText("4 productos activos")).toBeVisible();

  await userEvent.click(brandFilter(screen));
  await userEvent.click(screen.getByRole("option", { name: "Serenísima" }));

  expect(onFiltersChange).toHaveBeenLastCalledWith({
    ...productsListFilters.parse({}),
    brand: serenisima.id,
  });
});

test("opens on the brand it is given", async () => {
  const services = createServices();
  mockLoaded(services, products, undefined, brands);

  const screen = await renderScreen(services, () => {}, {
    filters: { ...productsListFilters.parse({}), brand: serenisima.id },
  });

  await expect.element(brandFilter(screen)).toHaveValue("Serenísima");
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
