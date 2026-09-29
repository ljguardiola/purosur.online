import type { ProductSummary } from "@purosur/contracts";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { productsListFilters } from "./routes";
import {
  createServices,
  honey,
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

test("prefills the edit modal with the product's net content quantity and unit", async () => {
  const services = createServices();
  const honeyWithNetContent: ProductSummary = {
    ...honey,
    netContent: { quantity: 1.5, unit: "KG" },
  };
  mockLoaded(services, [honeyWithNetContent]);
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, honeyWithNetContent);

  await expect.element(dialog.getByRole("textbox", { name: "Contenido neto" })).toHaveValue("1,5");
  await expect.element(dialog.getByRole("button", { name: "kg Unidad" })).toBeVisible();
});

test("opens the edit modal defaulting the net content unit to g when the product has none", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();

  await userEvent.click(
    screen.getByRole("button", { name: "Editar el producto Miel pura de abeja 1 kg" }),
  );
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByRole("textbox", { name: "Contenido neto" })).toHaveValue("");
  await expect.element(dialog.getByRole("button", { name: "g Unidad" })).toBeVisible();
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
    saleUnit: "UNIT",
    barcodes: ["7790987000015"],
    netContent: null,
    version: 1,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Miel pura de abeja 500 g")).toBeVisible();
});

test("changes a product's net content on edit", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, honey);

  await userEvent.fill(dialog.getByRole("textbox", { name: "Contenido neto" }), "500");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editProduct).mock.calls.length).toBe(1);
  expect(services.editProduct).toHaveBeenCalledWith("product-1", {
    name: "Miel pura de abeja 1 kg",
    categoryId: "category-1",
    saleUnit: "UNIT",
    barcodes: ["7790987000015"],
    netContent: { quantity: 500, unit: "G" },
    version: 1,
  });
});

test("clears a product's net content by emptying the quantity on edit", async () => {
  const services = createServices();
  const honeyWithNetContent: ProductSummary = { ...honey, netContent: { quantity: 1, unit: "KG" } };
  mockLoaded(services, [honeyWithNetContent]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, honeyWithNetContent);

  await userEvent.fill(dialog.getByRole("textbox", { name: "Contenido neto" }), "");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editProduct).mock.calls.length).toBe(1);
  expect(services.editProduct).toHaveBeenCalledWith("product-1", {
    name: "Miel pura de abeja 1 kg",
    categoryId: "category-1",
    saleUnit: "UNIT",
    barcodes: ["7790987000015"],
    netContent: null,
    version: 1,
  });
});

test("shows the server's net content error inline on edit", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.editProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "netContentQuantity",
  });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, honey);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Revisá el contenido neto.")).toBeVisible();
});

test("asks to review the name when the cloud refuses a name that passes every local check", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "validation_failed", field: "name" });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, honey);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Revisá el nombre del producto.")).toBeVisible();
  expect(dialog.getByText("Ingresá el nombre del producto.").query()).toBeNull();
});

test("asks to review the category when the cloud refuses the one chosen", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.editProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "categoryId",
  });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, honey);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Revisá la categoría.")).toBeVisible();
  expect(dialog.getByText("Elegí una categoría.").query()).toBeNull();
});

test("shows the sale unit the cloud refuses on its own field, as on create", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.editProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "saleUnit",
  });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, honey);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Revisá la unidad de venta.")).toBeVisible();
  expect(dialog.getByText("No se pudo guardar el cambio").query()).toBeNull();
});

test("shows the generic failure notice on edit when the cloud refuses the version", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.editProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "version",
  });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, honey);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("No se pudo guardar el cambio")).toBeVisible();
});

test("shows the server's rejection of the whole net content inline on edit", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.editProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "netContent",
  });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, honey);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Revisá el contenido neto.")).toBeVisible();
});

test("reloading after a stale-version conflict restores the fresh net content quantity and unit", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, honey);

  await userEvent.fill(dialog.getByRole("textbox", { name: "Contenido neto" }), "500");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByText("Otra persona cambió este producto")).toBeVisible();

  const freshened: ProductSummary = {
    ...honey,
    netContent: { quantity: 2.5, unit: "L" },
    version: 2,
  };
  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "ok", value: [freshened] });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar el producto" }));

  await expect.element(dialog.getByRole("textbox", { name: "Contenido neto" })).toHaveValue("2,5");
  await expect.element(dialog.getByRole("button", { name: "l Unidad" })).toBeVisible();
});

test("shows a stale-version conflict banner, and reloading restores the fresh product before saving again", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "stale_version" });
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

  await expect.element(dialog.getByText("Otra persona cambió este producto")).toBeVisible();
  expect(dialog.getByRole("button", { name: "Guardar los cambios" }).query()).toBeNull();

  const freshened: ProductSummary = { ...honey, name: "Miel pura de abeja 900 g", version: 2 };
  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "ok", value: [freshened] });
  vi.mocked(services.editProduct).mockResolvedValueOnce({ kind: "ok" });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar el producto" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Miel pura de abeja 900 g");
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre/ }),
    "Miel pura de abeja 1200 g",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  expect(services.editProduct).toHaveBeenLastCalledWith("product-1", {
    name: "Miel pura de abeja 1200 g",
    categoryId: "category-1",
    saleUnit: "UNIT",
    barcodes: ["7790987000015"],
    netContent: null,
    version: 2,
  });
});

test("shows the category-not-leaf error on edit when the chosen category gained a subcategory meanwhile", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "category_not_leaf" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Editar el producto Miel pura de abeja 1 kg" }),
  );
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByText('"Almacén" tiene subcategorías. Elegí una de ellas.'))
    .toBeVisible();
});

test("reloading after a stale-version conflict retitles the modal with the fresh name", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, honey);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByText("Otra persona cambió este producto")).toBeVisible();

  const freshened: ProductSummary = { ...honey, name: "Miel pura de abeja 900 g", version: 2 };
  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "ok", value: [freshened] });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar el producto" }));

  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 900 g" }))
    .toBeVisible();
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
