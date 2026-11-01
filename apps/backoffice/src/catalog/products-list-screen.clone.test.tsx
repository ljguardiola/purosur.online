import type { ListedProduct } from "@purosur/contracts";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { almondOil, honey, retiredHoney } from "./test-support/products";
import {
  createServices,
  mockLoaded,
  openCloneProductModal,
  renderScreen,
} from "./test-support/products-list-screen";

test("the row action opens the clone form filled from the product", async () => {
  const services = createServices();
  mockLoaded(services, [almondOil]);
  const screen = await renderScreen(services);

  const dialog = await openCloneProductModal(screen, almondOil);

  await expect.element(dialog.getByRole("heading", { name: "Clonar producto" })).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Aceite de Almendras");
});

test("an inactive product can be cloned too", async () => {
  const services = createServices();
  mockLoaded(services, [retiredHoney]);
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Estado: Activos" }));
  await userEvent.click(screen.getByRole("option", { name: "Inactivos" }));

  const dialog = await openCloneProductModal(screen, retiredHoney);

  await expect.element(dialog.getByRole("heading", { name: "Clonar producto" })).toBeVisible();
});

test("the new-product button still opens an empty form", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  const screen = await renderScreen(services);
  await openCloneProductModal(screen, honey);
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Nuevo producto" }));

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Nuevo producto" })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("");
});

test("confirming the clone refreshes the list", async () => {
  const services = createServices();
  const created: ListedProduct = {
    ...honey,
    id: "90d00000-0000-4000-8000-000000000010",
    name: "Miel de azahar",
    barcodes: ["7790000000099"],
  };
  mockLoaded(services, [honey]);
  vi.mocked(services.fetchProducts)
    .mockResolvedValueOnce({ kind: "ok", value: [honey] })
    .mockResolvedValueOnce({ kind: "ok", value: [honey, created] });
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok", product: created });
  const screen = await renderScreen(services);
  const dialog = await openCloneProductModal(screen, honey);
  await userEvent.fill(
    dialog.getByRole("textbox", { name: "Escanear otro código" }),
    "7790000000099",
  );
  await userEvent.keyboard("{Enter}");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.poll(() => vi.mocked(services.createProduct).mock.calls.length).toBe(1);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("2 productos activos")).toBeVisible();
  expect(services.fetchProducts).toHaveBeenCalledTimes(2);
});
