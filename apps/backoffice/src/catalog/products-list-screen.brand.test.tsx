import type { BrandSummary, ProductSummary } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  createServices,
  honey,
  mockLoaded,
  openEditProductModal,
  openNewProductModal,
  radioLabel,
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
const cabrales: BrandSummary = {
  id: "brand-2",
  name: "Cabrales",
  active: true,
  version: 1,
  productCount: 9,
};
const litoral: BrandSummary = {
  id: "brand-3",
  name: "Yerba del Litoral",
  active: false,
  version: 2,
  productCount: 3,
};
const dulcor: BrandSummary = {
  id: "brand-9",
  name: "Dulcor",
  active: true,
  version: 1,
  productCount: 0,
};

function brandSelect(dialog: ScreenLocator) {
  return dialog.getByRole("button", { name: /Marca/ });
}

async function fillNewProduct(dialog: ScreenLocator) {
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre/ }),
    "Dátiles sin carozo 250 g",
  );
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por unidad"));
  await userEvent.fill(dialog.getByRole("textbox", { name: "Escanear otro código" }), "111");
  await userEvent.keyboard("{Enter}");
}

async function openStackedNewBrandModal(screen: Screen, productDialog: ScreenLocator) {
  await userEvent.click(productDialog.getByRole("button", { name: "Nueva marca" }));
  const brandDialog = screen.getByRole("dialog", { name: "Nueva marca" });
  await expect.element(brandDialog).toBeVisible();
  return brandDialog;
}

test("a new product starts with no brand, offering only the active brands by name", async () => {
  const services = createServices();
  mockLoaded(services, [honey], undefined, [granix, litoral, cabrales]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 producto activo")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await expect.element(brandSelect(dialog)).toHaveTextContent("Sin marca");
  await userEvent.click(brandSelect(dialog));

  const options = dialog.getByRole("option").all();
  expect(options.map((option) => option.element().textContent)).toEqual([
    "Sin marca",
    "Cabrales",
    "Granix",
  ]);
});

test("creates a product with no brand", async () => {
  const services = createServices();
  mockLoaded(services, [], undefined, [granix]);
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();
  const dialog = await openNewProductModal(screen);

  await fillNewProduct(dialog);
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.poll(() => vi.mocked(services.createProduct).mock.calls.length).toBe(1);
  expect(services.createProduct).toHaveBeenCalledWith(expect.objectContaining({ brandId: null }));
});

test("creates a product with the brand chosen", async () => {
  const services = createServices();
  mockLoaded(services, [], undefined, [granix]);
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();
  const dialog = await openNewProductModal(screen);

  await fillNewProduct(dialog);
  await userEvent.click(brandSelect(dialog));
  await userEvent.click(dialog.getByRole("option", { name: "Granix" }));
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.poll(() => vi.mocked(services.createProduct).mock.calls.length).toBe(1);
  expect(services.createProduct).toHaveBeenCalledWith(
    expect.objectContaining({ brandId: "brand-1" }),
  );
});

test("editing a product whose brand was deactivated shows it and keeps it on save", async () => {
  const services = createServices();
  const miel: ProductSummary = { ...honey, brandId: litoral.id };
  mockLoaded(services, [miel], undefined, [granix, litoral]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);

  const dialog = await openEditProductModal(screen, miel);

  await expect.element(brandSelect(dialog)).toHaveTextContent("Yerba del Litoral");
  await expect
    .element(dialog.getByText("Marca dada de baja. No se ofrece para productos nuevos."))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editProduct).mock.calls.length).toBe(1);
  expect(services.editProduct).toHaveBeenCalledWith(
    "product-1",
    expect.objectContaining({ brandId: litoral.id }),
  );
});

test("a product with an active brand is not offered the deactivated ones, and can drop its brand", async () => {
  const services = createServices();
  const miel: ProductSummary = { ...honey, brandId: granix.id };
  mockLoaded(services, [miel], undefined, [granix, litoral]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, miel);
  await expect.element(brandSelect(dialog)).toHaveTextContent("Granix");
  expect(
    dialog.getByText("Marca dada de baja. No se ofrece para productos nuevos.").query(),
  ).toBeNull();

  await userEvent.click(brandSelect(dialog));
  expect(dialog.getByRole("option", { name: "Yerba del Litoral" }).query()).toBeNull();
  await userEvent.click(dialog.getByRole("option", { name: "Sin marca" }));
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editProduct).mock.calls.length).toBe(1);
  expect(services.editProduct).toHaveBeenCalledWith(
    "product-1",
    expect.objectContaining({ brandId: null }),
  );
});

test("creates a brand in a modal stacked over the product form, then selects it without losing what was typed", async () => {
  const services = createServices();
  mockLoaded(services, [], undefined, [granix]);
  vi.mocked(services.createBrand).mockResolvedValue({ kind: "ok", brand: dulcor });
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();
  const productDialog = await openNewProductModal(screen);
  await fillNewProduct(productDialog);

  const brandDialog = await openStackedNewBrandModal(screen, productDialog);
  await expect.element(brandDialog.getByText("Marcas", { exact: true })).toBeVisible();
  vi.mocked(services.fetchBrands).mockResolvedValue({ kind: "ok", value: [granix, dulcor] });
  await userEvent.fill(brandDialog.getByRole("textbox", { name: /^Nombre/ }), "Dulcor");
  await userEvent.click(brandDialog.getByRole("button", { name: "Crear la marca" }));

  expect(services.createBrand).toHaveBeenCalledWith({ name: "Dulcor" });
  await expect.poll(() => screen.getByRole("dialog", { name: "Nueva marca" }).query()).toBeNull();
  const productForm = screen.getByRole("dialog", { name: "Nuevo producto" });
  await expect.element(brandSelect(productForm)).toHaveTextContent("Dulcor");
  await expect
    .element(productForm.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Dátiles sin carozo 250 g");
  await expect.element(productForm.getByText("111")).toBeVisible();

  await userEvent.click(productForm.getByRole("button", { name: "Crear el producto" }));
  await expect.poll(() => vi.mocked(services.createProduct).mock.calls.length).toBe(1);
  expect(services.createProduct).toHaveBeenCalledWith({
    name: "Dátiles sin carozo 250 g",
    categoryId: "category-1",
    brandId: "brand-9",
    saleUnit: "UNIT",
    barcodes: ["111"],
    netContent: null,
  });
});

test("the brand just created is selected even before the brands are read again", async () => {
  const services = createServices();
  mockLoaded(services, [honey], undefined, [granix]);
  vi.mocked(services.createBrand).mockResolvedValue({ kind: "ok", brand: dulcor });
  const screen = await renderScreen(services);
  const productDialog = await openEditProductModal(screen, honey);

  const brandDialog = await openStackedNewBrandModal(screen, productDialog);
  vi.mocked(services.fetchBrands).mockReturnValue(new Promise(() => {}));
  await userEvent.fill(brandDialog.getByRole("textbox", { name: /^Nombre/ }), "Dulcor");
  await userEvent.click(brandDialog.getByRole("button", { name: "Crear la marca" }));

  await expect.poll(() => screen.getByRole("dialog", { name: "Nueva marca" }).query()).toBeNull();
  await expect
    .element(brandSelect(screen.getByRole("dialog", { name: honey.name })))
    .toHaveTextContent("Dulcor");
});

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

test("a brand name already taken shows the error in the stacked modal and keeps the product form", async () => {
  const services = createServices();
  mockLoaded(services, [], undefined, [granix]);
  vi.mocked(services.createBrand).mockResolvedValue({ kind: "name_taken" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();
  const productDialog = await openNewProductModal(screen);
  await fillNewProduct(productDialog);

  const brandDialog = await openStackedNewBrandModal(screen, productDialog);
  await userEvent.fill(brandDialog.getByRole("textbox", { name: /^Nombre/ }), "granix");
  await userEvent.click(brandDialog.getByRole("button", { name: "Crear la marca" }));

  await expect.element(brandDialog.getByText("Ya existe una marca con este nombre.")).toBeVisible();
  await userEvent.click(brandDialog.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog", { name: "Nueva marca" }).query()).toBeNull();
  const productForm = screen.getByRole("dialog", { name: "Nuevo producto" });
  await expect
    .element(productForm.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Dátiles sin carozo 250 g");
  await expect.element(brandSelect(productForm)).toHaveTextContent("Sin marca");
});

test("a failed brand creation shows the error notice in the stacked modal, keeping the name typed", async () => {
  const services = createServices();
  mockLoaded(services, [], undefined, [granix]);
  vi.mocked(services.createBrand).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();
  const productDialog = await openNewProductModal(screen);

  const brandDialog = await openStackedNewBrandModal(screen, productDialog);
  await userEvent.fill(brandDialog.getByRole("textbox", { name: /^Nombre/ }), "Dulcor");
  await userEvent.click(brandDialog.getByRole("button", { name: "Crear la marca" }));

  await expect.element(brandDialog.getByText("No se guardó la marca")).toBeVisible();
  await expect.element(brandDialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect.element(brandDialog.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("Dulcor");
});

test("shows on the brand field that the brand chosen was deactivated meanwhile", async () => {
  const services = createServices();
  mockLoaded(services, [], undefined, [granix]);
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "brand_inactive" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();
  const dialog = await openNewProductModal(screen);
  await fillNewProduct(dialog);
  await userEvent.click(brandSelect(dialog));
  await userEvent.click(dialog.getByRole("option", { name: "Granix" }));

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(dialog.getByText("La marca elegida se dio de baja. Elegí otra o dejala sin marca."))
    .toBeVisible();
});

test("shows on the brand field that the brand chosen no longer exists", async () => {
  const services = createServices();
  mockLoaded(services, [], undefined, [granix]);
  vi.mocked(services.createProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "brandId",
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();
  const dialog = await openNewProductModal(screen);
  await fillNewProduct(dialog);

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("La marca elegida ya no existe.")).toBeVisible();
});

test("the products screen fails to open when its brands fail to load", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.fetchBrands).mockResolvedValue({ kind: "failed" });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir los productos")).toBeVisible();
});

test("has no accessibility violations with the brand modal stacked over the product form", async () => {
  const services = createServices();
  mockLoaded(services, [honey], undefined, [granix]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 producto activo")).toBeVisible();
  const productDialog = await openNewProductModal(screen);

  await openStackedNewBrandModal(screen, productDialog);

  await expectNoAccessibilityViolations(document.body);
});
