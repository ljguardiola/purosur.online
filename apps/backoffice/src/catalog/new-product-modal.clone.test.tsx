import type { ListedProduct } from "@purosur/contracts";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { sinTacc } from "../platform/test-support/tags";
import type { NewProductModalServices } from "./new-product-modal";
import { createServices, renderNewProductModal } from "./test-support/new-product-modal";
import { scanInputOf } from "./test-support/product-form";
import { almondOil, groceries, honey, vitora } from "./test-support/products";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

const source: ListedProduct = {
  ...almondOil,
  tagIds: [sinTacc.id],
  coverageDays: 21,
  barcodes: ["7790001234567", "7790001234574"],
};

async function renderClone(
  services: NewProductModalServices,
  { onClose = () => {}, onCreated = () => {} } = {},
) {
  const screen = await renderNewProductModal(services, {
    source,
    onClose,
    onCreated,
    brands: [vitora],
    tags: [sinTacc],
  });
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Clonar producto" })).toBeVisible();
  return { dialog };
}

test("opens with the source product's fields filled and no barcode", async () => {
  const { dialog } = await renderClone(createServices());

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Aceite de Almendras");
  await expect.element(dialog.getByRole("combobox", { name: /^Categoría/ })).toHaveValue("Almacén");
  await expect.element(dialog.getByRole("radio", { name: "Por unidad" })).toBeChecked();
  await expect.element(dialog.getByRole("textbox", { name: "Contenido neto" })).toHaveValue("30");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Días de cobertura/ }))
    .toHaveValue("21");
  await expect.element(dialog.getByRole("combobox", { name: /^Marca/ })).toHaveValue("Vitora");
  await expect.element(dialog.getByText("Sin TACC")).toBeVisible();
  expect(dialog.getByText("7790001234567").query()).toBeNull();
  expect(dialog.getByText("7790001234574").query()).toBeNull();
});

test("creates the clone with the changed name and the added barcode, and nothing else carried over", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok", product: honey });
  const onCreated = vi.fn();
  const { dialog } = await renderClone(services, { onCreated });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Limonada con Jengibre");
  await userEvent.fill(scanInputOf(dialog), "7790000000099");
  await userEvent.keyboard("{Enter}");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.poll(() => onCreated.mock.calls.length).toBe(1);
  expect(services.createProduct).toHaveBeenCalledOnce();
  expect(services.createProduct).toHaveBeenCalledWith({
    name: "Limonada con Jengibre",
    categoryId: groceries.id,
    brandId: vitora.id,
    saleUnit: "UNIT",
    barcodes: ["7790000000099"],
    tagIds: [sinTacc.id],
    netContent: { quantity: 30, unit: "ML" },
    coverageDays: 21,
  });
});

test("closing the form creates nothing", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderClone(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledOnce();
  expect(services.createProduct).not.toHaveBeenCalled();
});
