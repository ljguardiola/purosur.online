import type { ProductSummary } from "@purosur/contracts";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { productsListFilters } from "./routes";
import { honey } from "./test-support/products";
import {
  createServices,
  mockLoaded,
  openEditProductModal,
  renderScreen,
} from "./test-support/products-list-screen";

test("the row action opens the edit modal pre-filled with the product's data", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();

  await userEvent.click(
    screen.getByRole("button", { name: "Editar el producto Miel pura de abeja 1 kg" }),
  );

  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 1 kg" }))
    .toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Miel pura de abeja 1 kg");
  await expect.element(dialog.getByRole("radio", { name: "Por unidad" })).toBeChecked();
  await expect.element(dialog.getByText("7790987000015")).toBeVisible();
});

test("edits a product and shows the updated data in the list", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  const updated: ProductSummary = { ...honey, name: "Miel pura de abeja 500 g", version: 2 };
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "ok" });
  vi.mocked(services.fetchProducts)
    .mockResolvedValueOnce({ kind: "ok", value: [honey] })
    .mockResolvedValueOnce({ kind: "ok", value: [updated] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Editar el producto Miel pura de abeja 1 kg" }),
  );
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre/ }),
    "Miel pura de abeja 500 g",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editProduct).mock.calls.length).toBe(1);
  expect(services.editProduct).toHaveBeenCalledWith("product-1", {
    name: "Miel pura de abeja 500 g",
    categoryId: "category-1",
    brandId: null,
    saleUnit: "UNIT",
    barcodes: ["7790987000015"],
    tagIds: [],
    netContent: null,
    version: 1,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Miel pura de abeja 500 g")).toBeVisible();
});

test("reloading an inactive product after a stale-version conflict finds it", async () => {
  const services = createServices();
  const inactiveHoney: ProductSummary = { ...honey, active: false };
  mockLoaded(services, [inactiveHoney]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, inactiveHoney);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByText("Otra persona cambió este producto")).toBeVisible();

  const freshened: ProductSummary = {
    ...inactiveHoney,
    name: "Miel pura de abeja 900 g",
    version: 2,
  };
  vi.mocked(services.fetchProducts).mockImplementation(async (status) =>
    status === "all" ? { kind: "ok", value: [freshened] } : { kind: "ok", value: [] },
  );
  await userEvent.click(dialog.getByRole("button", { name: "Recargar el producto" }));

  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 900 g" }))
    .toBeVisible();
});

test("a stale-version reload reads only the list on screen when it holds the product, and refills the form from it", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, honey);
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByText("Otra persona cambió este producto")).toBeVisible();
  const freshened: ProductSummary = { ...honey, name: "Miel pura de abeja 900 g", version: 2 };
  vi.mocked(services.fetchProducts).mockClear();
  vi.mocked(services.fetchProducts).mockResolvedValue({ kind: "ok", value: [freshened] });

  await userEvent.click(dialog.getByRole("button", { name: "Recargar el producto" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Miel pura de abeja 900 g");
  expect(vi.mocked(services.fetchProducts).mock.calls).toEqual([["active"]]);
});

test("a stale-version reload over the list of every product reads that list once", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services, () => {}, {
    filters: productsListFilters.parse({ status: "all" }),
  });
  const dialog = await openEditProductModal(screen, honey);
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByText("Otra persona cambió este producto")).toBeVisible();
  const freshened: ProductSummary = { ...honey, name: "Miel pura de abeja 900 g", version: 2 };
  vi.mocked(services.fetchProducts).mockClear();
  vi.mocked(services.fetchProducts).mockResolvedValue({ kind: "ok", value: [freshened] });

  await userEvent.click(dialog.getByRole("button", { name: "Recargar el producto" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Miel pura de abeja 900 g");
  expect(vi.mocked(services.fetchProducts).mock.calls).toEqual([["all"]]);
});

test("a stale-version reload of a product the list on screen does not hold reads every product once", async () => {
  const services = createServices();
  const inactiveHoney: ProductSummary = { ...honey, active: false };
  mockLoaded(services, [inactiveHoney]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, inactiveHoney);
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByText("Otra persona cambió este producto")).toBeVisible();
  const freshened: ProductSummary = { ...inactiveHoney, name: "Miel pura de abeja 900 g" };
  vi.mocked(services.fetchProducts).mockClear();
  vi.mocked(services.fetchProducts).mockImplementation(async (status) =>
    status === "all" ? { kind: "ok", value: [freshened] } : { kind: "ok", value: [] },
  );

  await userEvent.click(dialog.getByRole("button", { name: "Recargar el producto" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Miel pura de abeja 900 g");
  expect(vi.mocked(services.fetchProducts).mock.calls).toEqual([["active"], ["all"]]);
});

test("a stale-version reload whose list read fails closes the edit modal for the list's failure, and a retry leaves it closed", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, honey);
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByText("Otra persona cambió este producto")).toBeVisible();
  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "failed" });

  await userEvent.click(dialog.getByRole("button", { name: "Recargar el producto" }));

  await expect.element(screen.getByText("No pudimos abrir los productos")).toBeVisible();
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await expect
    .element(screen.getByRole("table", { name: "Productos" }).getByText(honey.name))
    .toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
});
