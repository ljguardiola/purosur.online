import { expect, test } from "vitest";
import { almondOil, honey, lavenderOil, pricedAlmonds, vitora } from "./test-support/products";
import { createServices, mockLoaded, renderScreen } from "./test-support/products-list-screen";

test("shows each product's brand, net content, barcode and current price", async () => {
  const services = createServices();
  mockLoaded(services, [almondOil], undefined, [vitora]);

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("cell", { name: "Aceite de Almendras" })).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "Vitora" })).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "30 ml" })).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "7790001234567" })).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "$ 4.500,00" })).toBeVisible();
});

test("shows the columns in order after the product's name", async () => {
  const services = createServices();
  mockLoaded(services, [almondOil], undefined, [vitora]);

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("cell", { name: "Aceite de Almendras" })).toBeVisible();
  const headers = screen
    .getByRole("columnheader")
    .elements()
    .map((header) => header.textContent?.trim());
  expect(headers).toEqual([
    "Producto",
    "Marca",
    "Contenido neto",
    "Código de barras",
    "Categoría",
    "Unidad",
    "Precio",
    "Estado",
    "Acciones",
  ]);
});

test("leaves the brand and net content cells empty and reads Sin precio for a product without them", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("cell", { name: "Sin precio" })).toBeVisible();
  const row = screen.getByRole("row", { name: /Miel pura de abeja 1 kg/ });
  const cells = row
    .getByRole("cell")
    .elements()
    .map((cell) => cell.textContent?.trim());
  expect(cells.slice(0, 4)).toEqual(["Miel pura de abeja 1 kg", "", "", "7790987000015"]);
});

test("still shows the name of an inactive brand", async () => {
  const services = createServices();
  mockLoaded(services, [almondOil], undefined, [{ ...vitora, active: false }]);

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("cell", { name: "Vitora" })).toBeVisible();
});

test("shows the price of a product sold by weight per kilogram", async () => {
  const services = createServices();
  mockLoaded(services, [pricedAlmonds]);

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("cell", { name: "$ 1.200,00 / kg" })).toBeVisible();
});

test("shows the first barcode and how many more a product has", async () => {
  const services = createServices();
  mockLoaded(services, [lavenderOil]);

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("cell", { name: "7790001234574 +1" })).toBeVisible();
});
