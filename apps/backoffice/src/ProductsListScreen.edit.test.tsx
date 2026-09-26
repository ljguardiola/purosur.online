import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { ProductSummary } from "./productsApi";
import {
  createServices,
  miel,
  mockLoaded,
  openEditProductModal,
  renderScreen,
} from "./test-support/productsListScreen";

test("the row action opens the edit modal pre-filled with the product's data", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
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
  const mielConContenido: ProductSummary = {
    ...miel,
    netContent: { quantity: 1.5, unit: "KG" },
  };
  mockLoaded(services, [mielConContenido]);
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, mielConContenido);

  await expect.element(dialog.getByRole("textbox", { name: "Contenido neto" })).toHaveValue("1,5");
  await expect.element(dialog.getByRole("button", { name: "kg Unidad" })).toBeVisible();
});

test("opens the edit modal defaulting the net content unit to g when the product has none", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
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
  mockLoaded(services, [miel]);
  const updated: ProductSummary = { ...miel, name: "Miel pura de abeja 500 g", version: 2 };
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "ok", value: updated });
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
  mockLoaded(services, [miel]);
  const updated: ProductSummary = { ...miel, netContent: { quantity: 500, unit: "G" }, version: 2 };
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "ok", value: updated });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, miel);

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
  const mielConContenido: ProductSummary = { ...miel, netContent: { quantity: 1, unit: "KG" } };
  mockLoaded(services, [mielConContenido]);
  const updated: ProductSummary = { ...mielConContenido, netContent: null, version: 2 };
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "ok", value: updated });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, mielConContenido);

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
  mockLoaded(services, [miel]);
  vi.mocked(services.editProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "netContentQuantity",
  });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, miel);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByText("Ingresá una cantidad mayor que cero, con hasta 3 decimales."))
    .toBeVisible();
});

test("shows the server's rejection of the whole net content inline on edit", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.editProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "netContent",
  });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, miel);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Revisá el contenido neto.")).toBeVisible();
});

test("reloading after a stale-version conflict restores the fresh net content quantity and unit", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services);
  const dialog = await openEditProductModal(screen, miel);

  await userEvent.fill(dialog.getByRole("textbox", { name: "Contenido neto" }), "500");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByText("Otra persona cambió este producto")).toBeVisible();

  const freshened: ProductSummary = {
    ...miel,
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
  mockLoaded(services, [miel]);
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

  const freshened: ProductSummary = { ...miel, name: "Miel pura de abeja 900 g", version: 2 };
  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "ok", value: [freshened] });
  vi.mocked(services.editProduct).mockResolvedValueOnce({
    kind: "ok",
    value: { ...freshened, name: "Miel pura de abeja 1200 g", version: 3 },
  });
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
  mockLoaded(services, [miel]);
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
