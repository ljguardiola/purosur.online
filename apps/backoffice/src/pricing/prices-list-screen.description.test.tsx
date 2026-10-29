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

test("names the product by its description in the notice after saving its new price", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(listing(almondOil));
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "ok" });

  const screen = await renderScreen(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Cambiar el precio de Aceite de Almendras Vitora 30 ml" }),
  );
  await userEvent.fill(screen.getByLabelText("Precio de venta por unidad"), "8000");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.element(screen.getByText(/^Aceite de Almendras Vitora 30 ml pasa a /)).toBeVisible();
});

test.each([
  {
    outcome: { kind: "not_found" as const },
    text: "Aceite de Almendras Vitora 30 ml ya no está en el catálogo.",
  },
  {
    outcome: { kind: "stale_price" as const },
    text: "Revisá el precio actual de Aceite de Almendras Vitora 30 ml.",
  },
  {
    outcome: { kind: "failed" as const },
    text: "No se pudo confirmar el precio de Aceite de Almendras Vitora 30 ml",
  },
  {
    outcome: { kind: "no_price_to_confirm" as const },
    text: "Aceite de Almendras Vitora 30 ml todavía no tiene precio.",
  },
])(
  "names the product by its description in the notice of a row confirm that ends in $outcome.kind",
  async ({ outcome, text }) => {
    const services = createServices();
    vi.mocked(services.fetchPrices).mockResolvedValue(listing(almondOil));
    vi.mocked(services.confirmPrice).mockResolvedValue(outcome);

    const screen = await renderScreen(services);
    await userEvent.click(
      screen.getByRole("button", {
        name: "Confirmar el precio de Aceite de Almendras Vitora 30 ml sin cambios",
      }),
    );

    await expect.element(screen.getByText(text)).toBeVisible();
  },
);
