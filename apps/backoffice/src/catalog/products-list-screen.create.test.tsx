import type { ProductSummary } from "@purosur/contracts";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { radioLabel } from "./test-support/product-form";
import { almonds, honey } from "./test-support/products";
import {
  createServices,
  mockLoaded,
  openNewProductModal,
  renderScreen,
} from "./test-support/products-list-screen";

test("opens the create modal, and cancel closes it without calling the API", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 producto activo")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await expect.element(dialog.getByRole("heading", { name: "Nuevo producto" })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("creates a product and shows it in the list", async () => {
  const services = createServices();
  mockLoaded(services, []);
  const created: ProductSummary = {
    id: "product-3",
    name: "Pasta de maní 380 g",
    categoryId: "category-1",
    brandId: null,
    categoryName: "Almacén",
    saleUnit: "KG",
    barcodes: ["7790000000099"],
    tagIds: [],
    netContent: null,
    active: true,
    labelCode: null,
    version: 1,
  };
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok" });
  vi.mocked(services.fetchProducts)
    .mockResolvedValueOnce({ kind: "ok", value: [] })
    .mockResolvedValueOnce({ kind: "ok", value: [created, honey] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Pasta de maní 380 g");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por peso"));
  await userEvent.fill(
    dialog.getByRole("textbox", { name: "Escanear otro código" }),
    "7790000000099",
  );
  await userEvent.keyboard("{Enter}");
  await expect.element(dialog.getByText("7790000000099")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.poll(() => vi.mocked(services.createProduct).mock.calls.length).toBe(1);
  expect(services.createProduct).toHaveBeenCalledWith({
    name: "Pasta de maní 380 g",
    categoryId: "category-1",
    brandId: null,
    saleUnit: "KG",
    barcodes: ["7790000000099"],
    tagIds: [],
    netContent: null,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Pasta de maní 380 g")).toBeVisible();
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  expect(services.fetchProducts).toHaveBeenCalledTimes(2);
});

test("a product created while only inactive products are listed stays out of the list", async () => {
  const services = createServices();
  const inactiveAlmonds: ProductSummary = { ...almonds, active: false };
  mockLoaded(services, [inactiveAlmonds]);
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Estado: Activos" }));
  await userEvent.click(screen.getByRole("option", { name: "Inactivos" }));
  await expect.element(screen.getByText("1 producto inactivo")).toBeVisible();

  const dialog = await openNewProductModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Pasta de maní 380 g");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por unidad"));
  await userEvent.fill(
    dialog.getByRole("textbox", { name: "Escanear otro código" }),
    "7790000000099",
  );
  await userEvent.keyboard("{Enter}");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("1 producto inactivo")).toBeVisible();
  expect(screen.getByText("Pasta de maní 380 g").query()).toBeNull();
});
