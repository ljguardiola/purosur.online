import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  almondOil,
  createServices,
  renderScreen,
  withoutPrice,
} from "./test-support/prices-list-screen";

function listing(...products: (typeof almondOil)[]) {
  return {
    kind: "ok" as const,
    value: {
      products,
      pendingCount: products.length,
      activeProductCount: products.length,
      reviewWindowDays: 30,
      categories: [],
    },
  };
}

test("names a product by its name, brand and net content in the row and its actions", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(listing(almondOil, withoutPrice));

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Aceite de Almendras Vitora 30 ml")).toBeVisible();
  await expect
    .element(
      screen.getByRole("button", {
        name: "Confirmar el precio de Aceite de Almendras Vitora 30 ml sin cambios",
      }),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByRole("button", { name: "Cambiar el precio de Aceite de Almendras Vitora 30 ml" }),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Fideos", { exact: true })).toBeVisible();
});

test("names the product by its description in the notice after confirming its row", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(listing(almondOil));
  vi.mocked(services.confirmPrice).mockResolvedValue({ kind: "ok" });

  const screen = await renderScreen(services);
  await userEvent.click(
    screen.getByRole("button", {
      name: "Confirmar el precio de Aceite de Almendras Vitora 30 ml sin cambios",
    }),
  );

  await expect
    .element(screen.getByText(/^Aceite de Almendras Vitora 30 ml sigue a /))
    .toBeVisible();
});

test("titles the price modal with the product's description", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(listing(almondOil));

  const screen = await renderScreen(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Cambiar el precio de Aceite de Almendras Vitora 30 ml" }),
  );

  await expect
    .element(
      screen.getByRole("dialog").getByRole("heading", {
        name: "Aceite de Almendras Vitora 30 ml",
      }),
    )
    .toBeVisible();
});
