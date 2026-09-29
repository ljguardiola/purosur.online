import type { BrandSummary } from "@purosur/contracts";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { honey } from "./test-support/products";
import {
  createServices,
  mockLoaded,
  openEditProductModal,
  renderScreen,
  type Screen,
  type ScreenLocator,
} from "./test-support/products-list-screen";

const granix: BrandSummary = {
  id: "brand-1",
  name: "Granix",
  active: true,
  version: 1,
  productCount: 42,
};
const dulcor: BrandSummary = {
  id: "brand-9",
  name: "Dulcor",
  active: true,
  version: 1,
  productCount: 0,
};

async function openStackedNewBrandModal(screen: Screen, productDialog: ScreenLocator) {
  await userEvent.click(productDialog.getByRole("button", { name: "Nueva marca" }));
  const brandDialog = screen.getByRole("dialog", { name: "Nueva marca" });
  await expect.element(brandDialog).toBeVisible();
  return brandDialog;
}

test("creating a brand leaves the catalog unread while the product form is open, and reads it once the form closes", async () => {
  const services = createServices();
  mockLoaded(services, [honey], undefined, [granix]);
  vi.mocked(services.createBrand).mockResolvedValue({ kind: "ok", brand: dulcor });
  const screen = await renderScreen(services);
  const productDialog = await openEditProductModal(screen, honey);
  const brandsReads = vi.mocked(services.fetchBrands).mock.calls.length;
  const productsReads = vi.mocked(services.fetchProducts).mock.calls.length;

  const brandDialog = await openStackedNewBrandModal(screen, productDialog);
  await userEvent.fill(brandDialog.getByRole("textbox", { name: /^Nombre/ }), "Dulcor");
  await userEvent.click(brandDialog.getByRole("button", { name: "Crear la marca" }));
  await expect.poll(() => screen.getByRole("dialog", { name: "Nueva marca" }).query()).toBeNull();

  expect(vi.mocked(services.fetchBrands).mock.calls.length).toBe(brandsReads);
  expect(vi.mocked(services.fetchProducts).mock.calls.length).toBe(productsReads);
  vi.mocked(services.fetchBrands).mockResolvedValue({ kind: "ok", value: [granix, dulcor] });
  await userEvent.click(
    screen.getByRole("dialog", { name: honey.name }).getByRole("button", { name: "Cancelar" }),
  );
  await expect
    .poll(() => vi.mocked(services.fetchBrands).mock.calls.length)
    .toBeGreaterThan(brandsReads);
});

test("the products screen fails to open when its brands fail to load", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.fetchBrands).mockResolvedValue({ kind: "failed" });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir los productos")).toBeVisible();
});
