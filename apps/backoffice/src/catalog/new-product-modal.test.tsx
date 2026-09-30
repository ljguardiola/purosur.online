import type { BrandSummary, CategorySummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { NewProductModal, type NewProductModalServices } from "./new-product-modal";
import type { GenerateInternalBarcodeOutcome } from "./products-api";
import {
  fillNewProductFieldsExceptBarcodes,
  radioLabel,
  scanInputOf,
} from "./test-support/product-form";
import { driedFruits, groceries } from "./test-support/products";

// A modal panel is centered by a fixed-position overlay that never grows the document's scroll
// area, so a control past its clipped edge can't be scrolled into view at the default viewport.
beforeEach(async () => {
  await page.viewport(1280, 900);
});

function createServices(overrides: Partial<NewProductModalServices> = {}): NewProductModalServices {
  return {
    createProduct: vi.fn(),
    createBrand: vi.fn(),
    createTag: vi.fn(),
    generateInternalBarcode: vi.fn(),
    ...overrides,
  };
}

type ModalOptions = {
  categories?: CategorySummary[];
  brands?: BrandSummary[];
  onClose?: () => void;
  onCreated?: () => void;
  onSessionEnded?: () => void;
};

function modalElement(open: boolean, services: NewProductModalServices, options: ModalOptions) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <NewProductModal
          open={open}
          onClose={options.onClose ?? (() => {})}
          onCreated={options.onCreated ?? (() => {})}
          onSessionEnded={options.onSessionEnded ?? (() => {})}
          categories={options.categories ?? [groceries, driedFruits]}
          brands={options.brands ?? []}
          tags={[]}
          services={services}
        />
      </main>
    </FieldSizeProvider>
  );
}

async function renderModal(services: NewProductModalServices, options: ModalOptions = {}) {
  const screen = await render(modalElement(true, services, options));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Nuevo producto" })).toBeVisible();
  return {
    screen,
    dialog,
    rerender: (open: boolean) => screen.rerender(modalElement(open, services, options)),
  };
}

async function scanCode(dialog: ReturnType<typeof scanInputOf>, code: string) {
  await userEvent.fill(dialog, code);
  await userEvent.keyboard("{Enter}");
}

function generateButtonOf(dialog: Awaited<ReturnType<typeof renderModal>>["dialog"]) {
  return dialog.getByRole("button", { name: "Generar código interno" });
}

function pendingGenerate(services: NewProductModalServices) {
  let resolveGenerate: (outcome: GenerateInternalBarcodeOutcome) => void = () => {};
  vi.mocked(services.generateInternalBarcode).mockReturnValue(
    new Promise((resolve) => {
      resolveGenerate = resolve;
    }),
  );
  return (outcome: GenerateInternalBarcodeOutcome) => resolveGenerate(outcome);
}

test("creates a product with a net content", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok" });
  const onCreated = vi.fn();
  const { dialog } = await renderModal(services, { onCreated });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Pasta de maní 380 g");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por peso"));
  await userEvent.fill(dialog.getByRole("textbox", { name: "Contenido neto" }), "1,5");
  await userEvent.click(dialog.getByRole("button", { name: "g Unidad" }));
  await userEvent.click(dialog.getByRole("option", { name: "kg" }));
  await scanCode(scanInputOf(dialog), "7790000000099");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.poll(() => vi.mocked(services.createProduct).mock.calls.length).toBe(1);
  expect(services.createProduct).toHaveBeenCalledWith({
    name: "Pasta de maní 380 g",
    categoryId: "category-1",
    brandId: null,
    saleUnit: "KG",
    barcodes: ["7790000000099"],
    tagIds: [],
    netContent: { quantity: 1.5, unit: "KG" },
  });
  await expect.poll(() => onCreated.mock.calls.length).toBe(1);
});

test("rejects an invalid net content quantity, without calling the API", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Producto nuevo");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por unidad"));
  await userEvent.fill(dialog.getByRole("textbox", { name: "Contenido neto" }), "0");
  await scanCode(scanInputOf(dialog), "12345");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(
      dialog.getByText(
        "Ingresá una cantidad mayor que cero, de hasta 100.000 y con hasta 3 decimales.",
      ),
    )
    .toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("reports an invalid net content quantity on the first submit even without a sale unit", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Producto nuevo");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.fill(dialog.getByRole("textbox", { name: "Contenido neto" }), "abc");
  await scanCode(scanInputOf(dialog), "12345");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Elegí la unidad de venta.")).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Ingresá una cantidad mayor que cero, de hasta 100.000 y con hasta 3 decimales.",
      ),
    )
    .toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("shows the server's net content error inline on create", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "netContentQuantity",
  });
  const { dialog } = await renderModal(services);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await scanCode(scanInputOf(dialog), "12345");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Revisá el contenido neto.")).toBeVisible();
});

test("rejects a net content quantity above the maximum, stating the limit, without calling the API", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await userEvent.fill(dialog.getByRole("textbox", { name: "Contenido neto" }), "100001");
  await scanCode(scanInputOf(dialog), "12345");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(
      dialog.getByText(
        "Ingresá una cantidad mayor que cero, de hasta 100.000 y con hasta 3 decimales.",
      ),
    )
    .toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("shows the server's rejection of the whole net content inline on create", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "netContent",
  });
  const { dialog } = await renderModal(services);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await scanCode(scanInputOf(dialog), "12345");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Revisá el contenido neto.")).toBeVisible();
});

test("asks to review the name when the cloud refuses a name that passes every local check", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "validation_failed", field: "name" });
  const { dialog } = await renderModal(services);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await scanCode(scanInputOf(dialog), "12345");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Revisá el nombre del producto.")).toBeVisible();
  expect(dialog.getByText("Ingresá el nombre del producto.").query()).toBeNull();
});

test("asks to review the category when the cloud refuses the one chosen", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "categoryId",
  });
  const { dialog } = await renderModal(services);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await scanCode(scanInputOf(dialog), "12345");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Revisá la categoría.")).toBeVisible();
  expect(dialog.getByText("Elegí una categoría.").query()).toBeNull();
});

test("asks to review the sale unit when the cloud refuses the one chosen", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "saleUnit",
  });
  const { dialog } = await renderModal(services);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await scanCode(scanInputOf(dialog), "12345");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Revisá la unidad de venta.")).toBeVisible();
  expect(dialog.getByText("Elegí la unidad de venta.").query()).toBeNull();
});

test("shows the generic failure notice on create when the cloud refuses a field the form does not have", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "version",
  });
  const { dialog } = await renderModal(services);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await scanCode(scanInputOf(dialog), "12345");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("No se pudo crear el producto")).toBeVisible();
});

test("opens the create modal with neither a category nor a sale unit pre-chosen", async () => {
  const { dialog } = await renderModal(createServices());

  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();
  await expect.element(dialog.getByRole("radio", { name: "Por unidad" })).not.toBeChecked();
  await expect.element(dialog.getByRole("radio", { name: "Por peso" })).not.toBeChecked();
});

test("rejects creating a product without choosing a category, without calling the API", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Producto nuevo");
  await userEvent.click(radioLabel(dialog, "Por unidad"));
  await scanCode(scanInputOf(dialog), "12345");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Elegí una categoría.")).toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("rejects creating a product without choosing a sale unit, without calling the API", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Producto nuevo");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await scanCode(scanInputOf(dialog), "12345");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Elegí la unidad de venta.")).toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("shows the name-too-long error on create, without calling the API", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "a".repeat(101));
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(dialog.getByText("El nombre puede tener hasta 100 caracteres."))
    .toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("shows no category selector when there are no categories yet, and still blocks creating without one", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services, { categories: [] });

  expect(dialog.getByRole("button", { name: /Categoría/ }).query()).toBeNull();
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Producto nuevo");
  await userEvent.click(radioLabel(dialog, "Por unidad"));
  await scanCode(scanInputOf(dialog), "12345");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Elegí una categoría.")).toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("rejects creating a product without a barcode, without calling the API", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);
  await fillNewProductFieldsExceptBarcodes(dialog);

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Escaneá al menos un código de barras.")).toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("shows the barcode-taken error on create and keeps the modal open, reporting no creation", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({
    kind: "barcode_taken",
    codes: ["7790000000099"],
  });
  const onCreated = vi.fn();
  const { dialog } = await renderModal(services, { onCreated });
  await fillNewProductFieldsExceptBarcodes(dialog);
  await scanCode(scanInputOf(dialog), "7790000000099");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(dialog.getByText("El código 7790000000099 ya es de otro producto."))
    .toBeVisible();
  await expect.element(dialog).toBeVisible();
  expect(onCreated).not.toHaveBeenCalled();
});

test("shows the category-not-leaf error on create when the chosen category gained a subcategory meanwhile", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "category_not_leaf" });
  const { dialog } = await renderModal(services);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await scanCode(scanInputOf(dialog), "7790000000099");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(dialog.getByText('"Almacén" tiene subcategorías. Elegí una de ellas.'))
    .toBeVisible();
  expect(services.createProduct).toHaveBeenCalledTimes(1);
});

test("pressing Enter in the scan input adds the code instead of submitting the form", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);

  await scanCode(scanInputOf(dialog), "7790000000099");

  await expect.element(dialog.getByText("7790000000099")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Nuevo producto" })).toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("marks the sale unit and barcode labels as required, like the name and category", async () => {
  const { dialog } = await renderModal(createServices());

  for (const labelText of ["Unidad de venta", "Códigos de barras"]) {
    const label = dialog.getByText(labelText, { exact: true }).element() as HTMLElement;
    expect(getComputedStyle(label, "::after").content).toContain("*");
  }
  await expect
    .element(dialog.getByRole("radiogroup", { name: "Unidad de venta" }))
    .toHaveAttribute("aria-required", "true");
});

test("marks the fallback category label as required when there are no categories yet", async () => {
  const { dialog } = await renderModal(createServices(), { categories: [] });

  const label = dialog.getByText("Categoría", { exact: true }).element() as HTMLElement;
  expect(getComputedStyle(label, "::after").content).toContain("*");
});

test("shows an invalid-code error, not the required one, when the cloud rejects listed barcodes", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "barcodes",
  });
  const { dialog } = await renderModal(services);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await scanCode(scanInputOf(dialog), "7790000000099");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(dialog.getByText("Alguno de los códigos de barras no es válido."))
    .toBeVisible();
  expect(dialog.getByText("Escaneá al menos un código de barras.").query()).toBeNull();
});

test("creating includes a code typed in the scan input but not yet confirmed with Enter", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await userEvent.fill(scanInputOf(dialog), "7790000000099");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.poll(() => vi.mocked(services.createProduct).mock.calls.length).toBe(1);
  expect(services.createProduct).toHaveBeenCalledWith({
    name: "Producto nuevo",
    categoryId: "category-1",
    brandId: null,
    saleUnit: "UNIT",
    barcodes: ["7790000000099"],
    tagIds: [],
    netContent: null,
  });
});

test("creating is blocked when the code left in the scan input is invalid", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await userEvent.fill(scanInputOf(dialog), "779 0001");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(dialog.getByText("El código de barras no puede tener espacios."))
    .toBeVisible();
  expect(services.createProduct).not.toHaveBeenCalled();
});

test("shows a generic barcode-taken error when the cloud names no taken code", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "barcode_taken", codes: [] });
  const { dialog } = await renderModal(services);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await scanCode(scanInputOf(dialog), "7790000000099");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(dialog.getByText("Alguno de los códigos ya es de otro producto."))
    .toBeVisible();
});

test("generates an internal code, adds it to the list, and saves the product with it", async () => {
  const services = createServices();
  vi.mocked(services.generateInternalBarcode).mockResolvedValue({
    kind: "ok",
    code: "2000000000015",
  });
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok" });
  const { dialog } = await renderModal(services);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Ensalada de fruta 300 g");
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por peso"));

  await userEvent.click(generateButtonOf(dialog));
  await expect.element(dialog.getByText("2000000000015")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.poll(() => vi.mocked(services.createProduct).mock.calls.length).toBe(1);
  expect(services.createProduct).toHaveBeenCalledWith({
    name: "Ensalada de fruta 300 g",
    categoryId: "category-1",
    brandId: null,
    saleUnit: "KG",
    barcodes: ["2000000000015"],
    tagIds: [],
    netContent: null,
  });
});

test("drops an internal code that arrives after the create modal was closed and opened again", async () => {
  const services = createServices();
  const resolveGenerate = pendingGenerate(services);
  const { dialog, rerender } = await renderModal(services);

  await userEvent.click(generateButtonOf(dialog));
  await rerender(false);
  await expect.poll(() => dialog.query()).toBeNull();
  await rerender(true);
  await expect.element(generateButtonOf(dialog)).not.toBeDisabled();

  resolveGenerate({ kind: "ok", code: "2000000000015" });
  // Rerendering drives React's async `act()`, which flushes the already-resolved response's
  // continuation before returning.
  await rerender(true);

  expect(dialog.getByText("2000000000015").query()).toBeNull();
});

test("shows the rate-limited notice when generating is refused for too many requests", async () => {
  const services = createServices();
  vi.mocked(services.generateInternalBarcode).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const { dialog } = await renderModal(services);

  await userEvent.click(generateButtonOf(dialog));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  expect(
    dialog.getByText("No se pudo generar el código interno. Probá de nuevo.").query(),
  ).toBeNull();
});

test("clears the rate-limited notice when generating again succeeds", async () => {
  const services = createServices();
  vi.mocked(services.generateInternalBarcode)
    .mockResolvedValueOnce({ kind: "rate_limited", retryAfterSeconds: 120 })
    .mockResolvedValueOnce({ kind: "ok", code: "2000000000015" });
  const { dialog } = await renderModal(services);

  await userEvent.click(generateButtonOf(dialog));
  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await userEvent.click(generateButtonOf(dialog));

  await expect.element(dialog.getByText("2000000000015")).toBeVisible();
  expect(dialog.getByText("Demasiadas solicitudes").query()).toBeNull();
});

test("keeps a rate-limited notice raised by saving when generating afterwards succeeds", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  vi.mocked(services.generateInternalBarcode).mockResolvedValue({
    kind: "ok",
    code: "2000000000015",
  });
  const { dialog } = await renderModal(services);
  await fillNewProductFieldsExceptBarcodes(dialog);
  await userEvent.fill(scanInputOf(dialog), "7790000000099");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));
  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();

  await userEvent.click(generateButtonOf(dialog));

  await expect.element(dialog.getByText("2000000000015")).toBeVisible();
  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

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

function brandSelect(dialog: Locator) {
  return dialog.getByRole("button", { name: /Marca/ });
}

async function fillNewProduct(dialog: Locator) {
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre/ }),
    "Dátiles sin carozo 250 g",
  );
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(radioLabel(dialog, "Por unidad"));
  await scanCode(scanInputOf(dialog), "111");
}

async function openStackedNewBrandModal(productDialog: Locator) {
  await userEvent.click(productDialog.getByRole("button", { name: "Nueva marca" }));
  const brandDialog = page.getByRole("dialog", { name: "Nueva marca" });
  await expect.element(brandDialog).toBeVisible();
  return brandDialog;
}

test("a new product starts with no brand, offering only the active brands by name", async () => {
  const { dialog } = await renderModal(createServices(), {
    brands: [granix, litoral, cabrales],
  });

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
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok" });
  const { dialog } = await renderModal(services, { brands: [granix] });

  await fillNewProduct(dialog);
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.poll(() => vi.mocked(services.createProduct).mock.calls.length).toBe(1);
  expect(services.createProduct).toHaveBeenCalledWith(expect.objectContaining({ brandId: null }));
});

test("creates a product with the brand chosen", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok" });
  const { dialog } = await renderModal(services, { brands: [granix] });

  await fillNewProduct(dialog);
  await userEvent.click(brandSelect(dialog));
  await userEvent.click(dialog.getByRole("option", { name: "Granix" }));
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.poll(() => vi.mocked(services.createProduct).mock.calls.length).toBe(1);
  expect(services.createProduct).toHaveBeenCalledWith(
    expect.objectContaining({ brandId: "brand-1" }),
  );
});

test("creates a brand in a modal stacked over the product form, then selects it without losing what was typed", async () => {
  const services = createServices();
  vi.mocked(services.createBrand).mockResolvedValue({ kind: "ok", brand: dulcor });
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok" });
  const { screen, dialog: productDialog } = await renderModal(services, { brands: [granix] });
  await fillNewProduct(productDialog);

  const brandDialog = await openStackedNewBrandModal(productDialog);
  await expect.element(brandDialog.getByText("Marcas", { exact: true })).toBeVisible();
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
    tagIds: [],
    netContent: null,
  });
});

test("a brand name already taken shows the error in the stacked modal and keeps the product form", async () => {
  const services = createServices();
  vi.mocked(services.createBrand).mockResolvedValue({ kind: "name_taken" });
  const { screen, dialog: productDialog } = await renderModal(services, { brands: [granix] });
  await fillNewProduct(productDialog);

  const brandDialog = await openStackedNewBrandModal(productDialog);
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
  vi.mocked(services.createBrand).mockResolvedValue({ kind: "failed" });
  const { dialog: productDialog } = await renderModal(services, { brands: [granix] });

  const brandDialog = await openStackedNewBrandModal(productDialog);
  await userEvent.fill(brandDialog.getByRole("textbox", { name: /^Nombre/ }), "Dulcor");
  await userEvent.click(brandDialog.getByRole("button", { name: "Crear la marca" }));

  await expect.element(brandDialog.getByText("No se guardó la marca")).toBeVisible();
  await expect.element(brandDialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect.element(brandDialog.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("Dulcor");
});

test("shows on the brand field that the brand chosen was deactivated meanwhile", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "brand_inactive" });
  const { dialog } = await renderModal(services, { brands: [granix] });
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
  vi.mocked(services.createProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "brandId",
  });
  const { dialog } = await renderModal(services, { brands: [granix] });
  await fillNewProduct(dialog);

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("La marca elegida ya no existe.")).toBeVisible();
});

test("has no accessibility violations with the brand modal stacked over the product form", async () => {
  const { dialog } = await renderModal(createServices(), { brands: [granix] });

  await openStackedNewBrandModal(dialog);

  await expectNoAccessibilityViolations(document.body);
});
