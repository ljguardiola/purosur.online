import type { BrandSummary, CategorySummary, ProductSummary, TagSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { ProductReload } from "./catalog-queries";
import { EditProductModal, type EditProductModalServices } from "./edit-product-modal";
import type { GenerateInternalBarcodeOutcome } from "./products-api";
import { scanInputOf } from "./test-support/product-form";
import { almonds, driedFruits, groceries, honey } from "./test-support/products";
import { organico, sinColorantes, sinTacc, vegano } from "./test-support/tags";

// A modal panel is centered by a fixed-position overlay that never grows the document's scroll
// area, so a control past its clipped edge can't be scrolled into view at the default viewport.
beforeEach(async () => {
  await page.viewport(1280, 900);
});

function createServices(
  overrides: Partial<EditProductModalServices> = {},
): EditProductModalServices {
  return {
    editProduct: vi.fn(),
    createBrand: vi.fn(),
    createTag: vi.fn(),
    generateInternalBarcode: vi.fn(),
    ...overrides,
  };
}

type ModalOptions = {
  categories?: CategorySummary[];
  brands?: BrandSummary[];
  tags?: TagSummary[];
  reload?: (id: string) => Promise<ProductReload>;
  onClose?: () => void;
  onSaved?: () => void;
  onSessionEnded?: () => void;
};

function modalElement(
  target: ProductSummary | null,
  services: EditProductModalServices,
  options: ModalOptions,
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <EditProductModal
          target={target}
          onClose={options.onClose ?? (() => {})}
          onSaved={options.onSaved ?? (() => {})}
          onSessionEnded={options.onSessionEnded ?? (() => {})}
          reload={options.reload ?? vi.fn()}
          categories={options.categories ?? [groceries, driedFruits]}
          brands={options.brands ?? []}
          tags={options.tags ?? []}
          services={services}
        />
      </main>
    </FieldSizeProvider>
  );
}

async function renderModal(
  target: ProductSummary,
  services: EditProductModalServices,
  options: ModalOptions = {},
) {
  const screen = await render(modalElement(target, services, options));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toBeVisible();
  return {
    screen,
    dialog,
    rerender: (nextTarget: ProductSummary | null) =>
      screen.rerender(modalElement(nextTarget, services, options)),
  };
}

function found(product: ProductSummary) {
  return vi.fn<(id: string) => Promise<ProductReload>>().mockResolvedValue({
    kind: "found",
    product,
  });
}

function generateButtonOf(dialog: Locator) {
  return dialog.getByRole("button", { name: "Generar código interno" });
}

function pendingGenerate(services: EditProductModalServices) {
  let resolveGenerate: (outcome: GenerateInternalBarcodeOutcome) => void = () => {};
  vi.mocked(services.generateInternalBarcode).mockReturnValue(
    new Promise((resolve) => {
      resolveGenerate = resolve;
    }),
  );
  return (outcome: GenerateInternalBarcodeOutcome) => resolveGenerate(outcome);
}

test("prefills the edit modal with the product's net content quantity and unit", async () => {
  const honeyWithNetContent: ProductSummary = {
    ...honey,
    netContent: { quantity: 1.5, unit: "KG" },
  };
  const { dialog } = await renderModal(honeyWithNetContent, createServices());

  await expect.element(dialog.getByRole("textbox", { name: "Contenido neto" })).toHaveValue("1,5");
  await expect.element(dialog.getByRole("button", { name: "kg Unidad" })).toBeVisible();
});

test("opens the edit modal defaulting the net content unit to g when the product has none", async () => {
  const { dialog } = await renderModal(honey, createServices());

  await expect.element(dialog.getByRole("textbox", { name: "Contenido neto" })).toHaveValue("");
  await expect.element(dialog.getByRole("button", { name: "g Unidad" })).toBeVisible();
});

test("changes a product's net content on edit", async () => {
  const services = createServices();
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "ok" });
  const onSaved = vi.fn();
  const { dialog } = await renderModal(honey, services, { onSaved });

  await userEvent.fill(dialog.getByRole("textbox", { name: "Contenido neto" }), "500");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editProduct).mock.calls.length).toBe(1);
  expect(services.editProduct).toHaveBeenCalledWith("90d00000-0000-4000-8000-000000000001", {
    name: "Miel pura de abeja 1 kg",
    categoryId: "ca7e0000-0000-4000-8000-000000000001",
    brandId: null,
    saleUnit: "UNIT",
    barcodes: ["7790987000015"],
    tagIds: [],
    netContent: { quantity: 500, unit: "G" },
    version: 1,
  });
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
});

test("clears a product's net content by emptying the quantity on edit", async () => {
  const services = createServices();
  const honeyWithNetContent: ProductSummary = { ...honey, netContent: { quantity: 1, unit: "KG" } };
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "ok" });
  const { dialog } = await renderModal(honeyWithNetContent, services);

  await userEvent.fill(dialog.getByRole("textbox", { name: "Contenido neto" }), "");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editProduct).mock.calls.length).toBe(1);
  expect(services.editProduct).toHaveBeenCalledWith("90d00000-0000-4000-8000-000000000001", {
    name: "Miel pura de abeja 1 kg",
    categoryId: "ca7e0000-0000-4000-8000-000000000001",
    brandId: null,
    saleUnit: "UNIT",
    barcodes: ["7790987000015"],
    tagIds: [],
    netContent: null,
    version: 1,
  });
});

test("shows the server's net content error inline on edit", async () => {
  const services = createServices();
  vi.mocked(services.editProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "netContentQuantity",
  });
  const { dialog } = await renderModal(honey, services);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Revisá el contenido neto.")).toBeVisible();
});

test("asks to review the name when the cloud refuses a name that passes every local check", async () => {
  const services = createServices();
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "validation_failed", field: "name" });
  const { dialog } = await renderModal(honey, services);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Revisá el nombre del producto.")).toBeVisible();
  expect(dialog.getByText("Ingresá el nombre del producto.").query()).toBeNull();
});

test("asks to review the category when the cloud refuses the one chosen", async () => {
  const services = createServices();
  vi.mocked(services.editProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "categoryId",
  });
  const { dialog } = await renderModal(honey, services);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Revisá la categoría.")).toBeVisible();
  expect(dialog.getByText("Elegí una categoría.").query()).toBeNull();
});

test("shows the sale unit the cloud refuses on its own field, as on create", async () => {
  const services = createServices();
  vi.mocked(services.editProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "saleUnit",
  });
  const { dialog } = await renderModal(honey, services);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Revisá la unidad de venta.")).toBeVisible();
  expect(dialog.getByText("No se pudo guardar el cambio").query()).toBeNull();
});

test("shows on the sale unit field the discount that keeps the product sold by the unit", async () => {
  const services = createServices();
  vi.mocked(services.editProduct).mockResolvedValue({
    kind: "sale_unit_held_by_discount",
    discountName: "3x2 Yerba",
  });
  const { dialog } = await renderModal(honey, services);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(
      dialog.getByText(
        'No se puede vender por peso mientras la promoción "3x2 Yerba" no esté desactivada o terminada.',
      ),
    )
    .toBeVisible();
  expect(dialog.getByText("No se pudo guardar el cambio").query()).toBeNull();
});

test("shows the generic failure notice on edit when the cloud refuses the version", async () => {
  const services = createServices();
  vi.mocked(services.editProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "version",
  });
  const { dialog } = await renderModal(honey, services);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("No se pudo guardar el cambio")).toBeVisible();
});

test("shows the generic failure notice on edit when the loaded version is not one the request accepts", async () => {
  const services = createServices();
  const { dialog } = await renderModal({ ...honey, version: 0 }, services);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("No se pudo guardar el cambio")).toBeVisible();
  expect(services.editProduct).not.toHaveBeenCalled();
});

test("shows the server's rejection of the whole net content inline on edit", async () => {
  const services = createServices();
  vi.mocked(services.editProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "netContent",
  });
  const { dialog } = await renderModal(honey, services);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Revisá el contenido neto.")).toBeVisible();
});

test("reloading after a stale-version conflict restores the fresh net content quantity and unit", async () => {
  const services = createServices();
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "stale_version" });
  const freshened: ProductSummary = {
    ...honey,
    netContent: { quantity: 2.5, unit: "L" },
    version: 2,
  };
  const { dialog } = await renderModal(honey, services, { reload: found(freshened) });

  await userEvent.fill(dialog.getByRole("textbox", { name: "Contenido neto" }), "500");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByText("Otra persona cambió este producto")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar el producto" }));

  await expect.element(dialog.getByRole("textbox", { name: "Contenido neto" })).toHaveValue("2,5");
  await expect.element(dialog.getByRole("button", { name: "l Unidad" })).toBeVisible();
});

test("shows a stale-version conflict banner, and reloading restores the fresh product before saving again", async () => {
  const services = createServices();
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "stale_version" });
  const freshened: ProductSummary = { ...honey, name: "Miel pura de abeja 900 g", version: 2 };
  const reload = found(freshened);
  const { dialog } = await renderModal(honey, services, { reload });

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre/ }),
    "Miel pura de abeja 500 g",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Otra persona cambió este producto")).toBeVisible();
  expect(dialog.getByRole("button", { name: "Guardar los cambios" }).query()).toBeNull();

  vi.mocked(services.editProduct).mockResolvedValueOnce({ kind: "ok" });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar el producto" }));

  expect(reload).toHaveBeenCalledWith("90d00000-0000-4000-8000-000000000001");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Miel pura de abeja 900 g");
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre/ }),
    "Miel pura de abeja 1200 g",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  expect(services.editProduct).toHaveBeenLastCalledWith("90d00000-0000-4000-8000-000000000001", {
    name: "Miel pura de abeja 1200 g",
    categoryId: "ca7e0000-0000-4000-8000-000000000001",
    brandId: null,
    saleUnit: "UNIT",
    barcodes: ["7790987000015"],
    tagIds: [],
    netContent: null,
    version: 2,
  });
});

test("shows the category-not-leaf error on edit when the chosen category gained a subcategory meanwhile", async () => {
  const services = createServices();
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "category_not_leaf" });
  const { dialog } = await renderModal(honey, services);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByText('"Almacén" tiene subcategorías. Elegí una de ellas.'))
    .toBeVisible();
});

test("reloading after a stale-version conflict retitles the modal with the fresh name", async () => {
  const services = createServices();
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "stale_version" });
  const freshened: ProductSummary = { ...honey, name: "Miel pura de abeja 900 g", version: 2 };
  const { dialog } = await renderModal(honey, services, { reload: found(freshened) });

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByText("Otra persona cambió este producto")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar el producto" }));

  await expect
    .element(dialog.getByRole("heading", { name: "Miel pura de abeja 900 g" }))
    .toBeVisible();
});

test("marks the sale unit and barcode labels as required, like the name and category", async () => {
  const { dialog } = await renderModal(honey, createServices());

  for (const labelText of ["Unidad de venta", "Códigos de barras"]) {
    const label = dialog.getByText(labelText, { exact: true }).element() as HTMLElement;
    expect(getComputedStyle(label, "::after").content).toContain("*");
  }
  await expect
    .element(dialog.getByRole("radiogroup", { name: "Unidad de venta" }))
    .toHaveAttribute("aria-required", "true");
});

test("marks the fallback category label as required when there are no categories yet", async () => {
  const { dialog } = await renderModal(honey, createServices(), { categories: [] });

  const label = dialog.getByText("Categoría", { exact: true }).element() as HTMLElement;
  expect(getComputedStyle(label, "::after").content).toContain("*");
});

test("shows an invalid-code error on edit when the cloud rejects the listed barcodes", async () => {
  const services = createServices();
  vi.mocked(services.editProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "barcodes",
  });
  const { dialog } = await renderModal(honey, services);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByText("Alguno de los códigos de barras no es válido."))
    .toBeVisible();
  expect(dialog.getByText("Escaneá al menos un código de barras.").query()).toBeNull();
});

test("saving an edit includes a code typed in the scan input but not yet confirmed with Enter", async () => {
  const services = createServices();
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(honey, services);

  await userEvent.fill(scanInputOf(dialog), "7790000000099");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editProduct).mock.calls.length).toBe(1);
  expect(services.editProduct).toHaveBeenCalledWith("90d00000-0000-4000-8000-000000000001", {
    name: "Miel pura de abeja 1 kg",
    categoryId: "ca7e0000-0000-4000-8000-000000000001",
    brandId: null,
    saleUnit: "UNIT",
    barcodes: ["7790987000015", "7790000000099"],
    tagIds: [],
    netContent: null,
    version: 1,
  });
});

test("saving an edit is blocked when the code left in the scan input is already listed", async () => {
  const services = createServices();
  const { dialog } = await renderModal(honey, services);

  await userEvent.fill(scanInputOf(dialog), "7790987000015");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ese código ya está en la lista.")).toBeVisible();
  expect(services.editProduct).not.toHaveBeenCalled();
});

test("shows a generic barcode-taken error on edit when the cloud names no taken code", async () => {
  const services = createServices();
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "barcode_taken", codes: [] });
  const { dialog } = await renderModal(honey, services);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByText("Alguno de los códigos ya es de otro producto."))
    .toBeVisible();
});

test("generates an internal code from the edit modal and saves it alongside the existing code", async () => {
  const services = createServices();
  vi.mocked(services.generateInternalBarcode).mockResolvedValue({
    kind: "ok",
    code: "2000000000015",
  });
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "ok" });
  const { dialog } = await renderModal(honey, services);

  await userEvent.click(generateButtonOf(dialog));
  await expect.element(dialog.getByText("2000000000015")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editProduct).mock.calls.length).toBe(1);
  expect(services.editProduct).toHaveBeenCalledWith("90d00000-0000-4000-8000-000000000001", {
    name: "Miel pura de abeja 1 kg",
    categoryId: "ca7e0000-0000-4000-8000-000000000001",
    brandId: null,
    saleUnit: "UNIT",
    barcodes: ["7790987000015", "2000000000015"],
    tagIds: [],
    netContent: null,
    version: 1,
  });
});

test("drops an internal code that arrives after the edit modal moved to another product", async () => {
  const services = createServices();
  const resolveGenerate = pendingGenerate(services);
  const { dialog, rerender } = await renderModal(honey, services);

  await userEvent.click(generateButtonOf(dialog));
  await rerender(null);
  await expect.poll(() => dialog.query()).toBeNull();
  await rerender(almonds);
  await expect.element(dialog.getByText("7790000000001")).toBeVisible();

  resolveGenerate({ kind: "ok", code: "2000000000015" });
  // Rerendering drives React's async `act()`, which flushes the already-resolved response's
  // continuation before returning.
  await rerender(almonds);

  expect(dialog.getByText("2000000000015").query()).toBeNull();
  expect(dialog.getByText("7790987000015").query()).toBeNull();
  await expect.element(dialog.getByText("7790000000001")).toBeVisible();
});

test("shows the rate-limited notice when generating is refused for too many requests", async () => {
  const services = createServices();
  vi.mocked(services.generateInternalBarcode).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const { dialog } = await renderModal(honey, services);

  await userEvent.click(generateButtonOf(dialog));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("clears the rate-limited notice when generating again succeeds", async () => {
  const services = createServices();
  vi.mocked(services.generateInternalBarcode)
    .mockResolvedValueOnce({ kind: "rate_limited", retryAfterSeconds: 120 })
    .mockResolvedValueOnce({ kind: "ok", code: "2000000000022" });
  const { dialog } = await renderModal(honey, services);

  await userEvent.click(generateButtonOf(dialog));
  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await userEvent.click(generateButtonOf(dialog));

  await expect.element(dialog.getByText("2000000000022")).toBeVisible();
  expect(dialog.getByText("Demasiadas solicitudes").query()).toBeNull();
});

const granix: BrandSummary = {
  id: "b7a4d000-0000-4000-8000-000000000001",
  name: "Granix",
  active: true,
  version: 1,
  productCount: 42,
};
const litoral: BrandSummary = {
  id: "b7a4d000-0000-4000-8000-000000000003",
  name: "Yerba del Litoral",
  active: false,
  version: 2,
  productCount: 3,
};
const dulcor: BrandSummary = {
  id: "b7a4d000-0000-4000-8000-000000000009",
  name: "Dulcor",
  active: true,
  version: 1,
  productCount: 0,
};

function brandSelect(dialog: Locator) {
  return dialog.getByRole("button", { name: /Marca/ });
}

test("editing a product whose brand was deactivated shows it and keeps it on save", async () => {
  const services = createServices();
  const miel: ProductSummary = { ...honey, brandId: litoral.id };
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "ok" });
  const { dialog } = await renderModal(miel, services, { brands: [granix, litoral] });

  await expect
    .element(dialog.getByRole("button", { name: "Yerba del Litoral Inactiva Marca" }))
    .toBeVisible();
  await expect
    .element(dialog.getByText("Marca dada de baja. No se ofrece para productos nuevos."))
    .toBeVisible();
  await userEvent.click(brandSelect(dialog));
  await expect
    .element(dialog.getByRole("option", { name: "Yerba del Litoral Inactiva" }))
    .toBeVisible();
  await userEvent.keyboard("{Escape}");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editProduct).mock.calls.length).toBe(1);
  expect(services.editProduct).toHaveBeenCalledWith(
    "90d00000-0000-4000-8000-000000000001",
    expect.objectContaining({ brandId: litoral.id }),
  );
});

test("a product with an active brand is not offered the deactivated ones, and can drop its brand", async () => {
  const services = createServices();
  const miel: ProductSummary = { ...honey, brandId: granix.id };
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "ok" });
  const { dialog } = await renderModal(miel, services, { brands: [granix, litoral] });
  await expect.element(dialog.getByRole("button", { name: "Granix Marca" })).toBeVisible();
  expect(
    dialog.getByText("Marca dada de baja. No se ofrece para productos nuevos.").query(),
  ).toBeNull();

  await userEvent.click(brandSelect(dialog));
  await expect.element(dialog.getByRole("option", { name: "Granix" })).toBeVisible();
  expect(dialog.getByRole("option", { name: /Yerba del Litoral/ }).query()).toBeNull();
  await userEvent.click(dialog.getByRole("option", { name: "Sin marca" }));
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editProduct).mock.calls.length).toBe(1);
  expect(services.editProduct).toHaveBeenCalledWith(
    "90d00000-0000-4000-8000-000000000001",
    expect.objectContaining({ brandId: null }),
  );
});

test("the brand just created is selected even before the brands are read again", async () => {
  const services = createServices();
  vi.mocked(services.createBrand).mockResolvedValue({ kind: "ok", brand: dulcor });
  const { dialog } = await renderModal(honey, services, { brands: [granix] });

  await userEvent.click(dialog.getByRole("button", { name: "Nueva marca" }));
  const brandDialog = page.getByRole("dialog", { name: "Nueva marca" });
  await expect.element(brandDialog).toBeVisible();
  await userEvent.fill(brandDialog.getByRole("textbox", { name: /^Nombre/ }), "Dulcor");
  await userEvent.click(brandDialog.getByRole("button", { name: "Crear la marca" }));

  await expect.poll(() => page.getByRole("dialog", { name: "Nueva marca" }).query()).toBeNull();
  await expect
    .element(brandSelect(page.getByRole("dialog", { name: honey.name })))
    .toHaveTextContent("Dulcor");
});

function addTagButton(dialog: Locator) {
  return dialog.getByRole("button", { name: "Agregar distintivo" });
}

test("editing a product with a deactivated tag shows it as a removable chip with the help line, and keeps it on save", async () => {
  const services = createServices();
  const miel: ProductSummary = { ...honey, tagIds: [sinTacc.id, sinColorantes.id] };
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "ok" });
  const { dialog } = await renderModal(miel, services, { tags: [sinTacc, sinColorantes, vegano] });

  await expect.element(dialog.getByRole("button", { name: "Quitar Sin TACC" })).toBeVisible();
  await expect
    .element(dialog.getByRole("listitem").filter({ hasText: /Sin colorantes\s*Inactivo/ }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText('"Sin colorantes" está dado de baja. No se ofrece para productos nuevos.'),
    )
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editProduct).mock.calls.length).toBe(1);
  expect(services.editProduct).toHaveBeenCalledWith(
    "90d00000-0000-4000-8000-000000000001",
    expect.objectContaining({ tagIds: [sinTacc.id, sinColorantes.id] }),
  );
});

test("removing the deactivated tag drops the help line and the tag, which is not offered again", async () => {
  const services = createServices();
  const miel: ProductSummary = { ...honey, tagIds: [sinTacc.id, sinColorantes.id] };
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "ok" });
  const { dialog } = await renderModal(miel, services, { tags: [sinTacc, sinColorantes, vegano] });

  await userEvent.click(dialog.getByRole("button", { name: "Quitar Sin colorantes" }));

  expect(dialog.getByText(/está dado de baja/).query()).toBeNull();
  await userEvent.click(addTagButton(dialog));
  expect(
    page
      .getByRole("menuitem")
      .all()
      .map((item) => item.element().textContent),
  ).toEqual(["Vegano", "Crear distintivo…"]);
  await userEvent.keyboard("{Escape}");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editProduct).mock.calls.length).toBe(1);
  expect(services.editProduct).toHaveBeenCalledWith(
    "90d00000-0000-4000-8000-000000000001",
    expect.objectContaining({ tagIds: [sinTacc.id] }),
  );
});

test("a tag chosen is appended after the product's own, and every tag just created too, before the tags are read again", async () => {
  const services = createServices();
  const miel: ProductSummary = { ...honey, tagIds: [sinTacc.id] };
  const kosher: TagSummary = { ...organico, id: "7a600000-0000-4000-8000-000000000009", name: "Kosher" };
  vi.mocked(services.createTag)
    .mockResolvedValueOnce({ kind: "ok", tag: organico })
    .mockResolvedValueOnce({ kind: "ok", tag: kosher });
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "ok" });
  const { dialog } = await renderModal(miel, services, { tags: [sinTacc, vegano] });

  await userEvent.click(addTagButton(dialog));
  await userEvent.click(page.getByRole("menuitem", { name: "Vegano" }));
  for (const name of ["Orgánico", "Kosher"]) {
    await userEvent.click(addTagButton(dialog));
    await userEvent.click(page.getByRole("menuitem", { name: "Crear distintivo…" }));
    const tagDialog = page.getByRole("dialog", { name: "Nuevo distintivo" });
    await expect.element(tagDialog).toBeVisible();
    await userEvent.fill(tagDialog.getByRole("textbox", { name: /^Nombre/ }), name);
    await userEvent.click(tagDialog.getByRole("button", { name: "Crear el distintivo" }));
    await expect
      .poll(() => page.getByRole("dialog", { name: "Nuevo distintivo" }).query())
      .toBeNull();
  }

  const productForm = page.getByRole("dialog", { name: honey.name });
  await expect.element(productForm.getByRole("button", { name: "Quitar Orgánico" })).toBeVisible();
  await expect.element(productForm.getByRole("button", { name: "Quitar Kosher" })).toBeVisible();
  await userEvent.click(productForm.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editProduct).mock.calls.length).toBe(1);
  expect(services.editProduct).toHaveBeenCalledWith(
    "90d00000-0000-4000-8000-000000000001",
    expect.objectContaining({ tagIds: [sinTacc.id, vegano.id, organico.id, kosher.id] }),
  );
});

test("shows on the tags field that a tag chosen was deactivated meanwhile", async () => {
  const services = createServices();
  vi.mocked(services.editProduct).mockResolvedValue({ kind: "tag_inactive", tagId: vegano.id });
  const { dialog } = await renderModal(honey, services, { tags: [vegano] });
  await userEvent.click(addTagButton(dialog));
  await userEvent.click(page.getByRole("menuitem", { name: "Vegano" }));

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByText('"Vegano" se dio de baja. Quitalo para guardar.'))
    .toBeVisible();
});
