import type { PriceProduct } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { PricesListScreenServices } from "./prices-list-services";
import { ProductPriceCostSection } from "./product-price-cost-section";
import { createServices, rice, withoutPrice } from "./test-support/prices-list-screen";

function priceListOf(...products: PriceProduct[]) {
  return {
    kind: "ok",
    value: {
      products,
      pendingCount: 0,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
  } as const;
}

function renderSection(
  services: PricesListScreenServices,
  product: PriceProduct = rice,
  onSessionEnded: () => void = () => {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <ProductPriceCostSection
        productId={product.id}
        productName={product.name}
        saleUnit={product.saleUnit}
        onSessionEnded={onSessionEnded}
        services={services}
      />
    </FieldSizeProvider>,
  );
}

test("asks the cloud only for the price of the product", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(priceListOf(rice));

  await renderSection(services);

  await vi.waitFor(() =>
    expect(services.fetchPrices).toHaveBeenCalledExactlyOnceWith({
      review: "all",
      productIds: [rice.id],
    }),
  );
});

test("shows the current price, the cost and the margin the cloud answers", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(priceListOf(rice));

  const screen = await renderSection(services);

  await expect.element(screen.getByText("$ 7.500,00 / kg")).toBeVisible();
  await expect.element(screen.getByText("$ 4.280,00 / kg")).toBeVisible();
  await expect.element(screen.getByText("$ 4.460,00 / kg")).toBeVisible();
  await expect.element(screen.getByText("40,5 %")).toBeVisible();
});

test("shows Sin precio and the empty cost for a product with neither", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(priceListOf(withoutPrice));

  const screen = await renderSection(services, withoutPrice);

  await expect.element(screen.getByText("Sin precio")).toBeVisible();
  await expect.element(screen.getByText("Sin costo registrado")).toBeVisible();
});

test("changes the price with the same modal and request as the prices list", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(priceListOf(rice));
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "ok" });
  const screen = await renderSection(services);
  await expect.element(screen.getByText("$ 7.500,00 / kg")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio" }));
  await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect
    .poll(() => vi.mocked(services.setPrice).mock.lastCall)
    .toEqual([
      "product-2",
      { unitPrice: 800000, expectedCurrentPriceId: "00000000-0000-4000-8000-000000000001" },
    ]);
  await expect.element(screen.getByText("Precio actualizado")).toBeVisible();
});

test("reads the price again after it is saved", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValueOnce(priceListOf(rice));
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "ok" });
  const screen = await renderSection(services);
  await expect.element(screen.getByText("$ 7.500,00 / kg")).toBeVisible();
  vi.mocked(services.fetchPrices).mockResolvedValue(
    priceListOf({
      ...rice,
      currentPrice: { id: "price-2", unitPrice: 800000, validFrom: "2026-09-25T12:00:00.000Z" },
    }),
  );

  await userEvent.click(screen.getByRole("button", { name: "Cambiar el precio" }));
  await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "8000");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.element(screen.getByText("$ 8.000,00 / kg")).toBeVisible();
});

test("ends the session when the cloud answers that it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderSection(services, rice, onSessionEnded);

  await vi.waitFor(() => expect(onSessionEnded).toHaveBeenCalledOnce());
});

test("lets the person retry a failed read", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValueOnce({ kind: "failed" });
  vi.mocked(services.fetchPrices).mockResolvedValue(priceListOf(rice));
  const screen = await renderSection(services);

  await userEvent.click(screen.getByRole("button", { name: /Reintentar/ }));

  await expect.element(screen.getByText("$ 7.500,00 / kg")).toBeVisible();
});
