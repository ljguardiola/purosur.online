import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { radioLabel } from "../platform/test-support/radio-label";
import { render } from "../shell/test-support/render-with-router";
import {
  CreateProductFromSupplierItemModal,
  type CreateProductFromSupplierItemModalServices,
} from "./create-product-from-supplier-item-modal";
import { LINK_CHOICES } from "./test-support/supplier-item-links";
import {
  CREATION_CATEGORIES,
  DRIED_FRUITS,
  PRODUCT_CREATED,
} from "./test-support/supplier-item-products";
import { EXTRACTED_ROWS, READ_LIST } from "./test-support/supplier-price-lists";

const [, pasasRow, nutRow] = EXTRACTED_ROWS as [
  (typeof EXTRACTED_ROWS)[number],
  (typeof EXTRACTED_ROWS)[number],
  (typeof EXTRACTED_ROWS)[number],
];
const LIST = { ...READ_LIST, version: 3, requiresVatRate: false };

beforeEach(async () => {
  window.history.pushState(null, "", "/");
  await page.viewport(1280, 900);
});

function createServices(
  overrides: Partial<CreateProductFromSupplierItemModalServices> = {},
): CreateProductFromSupplierItemModalServices {
  return {
    createProductFromSupplierItem: vi
      .fn<CreateProductFromSupplierItemModalServices["createProductFromSupplierItem"]>()
      .mockResolvedValue({ kind: "ok", created: PRODUCT_CREATED }),
    fetchProductCreationCategories: vi
      .fn<CreateProductFromSupplierItemModalServices["fetchProductCreationCategories"]>()
      .mockResolvedValue({ kind: "ok", value: CREATION_CATEGORIES }),
    fetchSupplierItemLinkChoices: vi
      .fn<CreateProductFromSupplierItemModalServices["fetchSupplierItemLinkChoices"]>()
      .mockResolvedValue({ kind: "ok", value: LINK_CHOICES }),
    generateInternalBarcode:
      vi.fn<CreateProductFromSupplierItemModalServices["generateInternalBarcode"]>(),
    ...overrides,
  };
}

function renderModal({
  services = createServices(),
  list = LIST,
  target = nutRow,
  onCreated = () => {},
  onOutdated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  services?: CreateProductFromSupplierItemModalServices;
  list?: Parameters<typeof CreateProductFromSupplierItemModal>[0]["list"];
  target?: typeof nutRow | null;
  onCreated?: () => void;
  onOutdated?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <CreateProductFromSupplierItemModal
          list={list}
          target={target}
          services={services}
          onCreated={onCreated}
          onOutdated={onOutdated}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type ModalScreen = Awaited<ReturnType<typeof renderModal>>;

function dialogOf(screen: ModalScreen) {
  return screen.getByRole("dialog");
}

async function chooseCategory(dialog: Locator) {
  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén › Frutos secos" }));
}

async function fillTheRest(dialog: Locator, quantity = "10") {
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Contiene/ }), quantity);
  await chooseCategory(dialog);
}

async function create(screen: ModalScreen) {
  const dialog = dialogOf(screen);
  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();
  await fillTheRest(dialog);
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));
  return dialog;
}

test("shows nothing while there is no item to create the product from", async () => {
  const screen = await renderModal({ target: null });

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("names the item and the supplier, and shows the item's code, presentation and price", async () => {
  const screen = await renderModal();
  const dialog = dialogOf(screen);

  await expect.element(dialog.getByText("Crear producto desde la lista")).toBeVisible();
  await expect
    .element(dialog.getByText("Nuez mariposa extra light x 10 kg · Distribuidora Andina"))
    .toBeVisible();
  await expect.element(dialog.getByText("NM-10")).toBeVisible();
  await expect.element(dialog.getByText("Caja 10 kg").first()).toBeVisible();
  await expect.element(dialog.getByText("$ 142.000,00")).toBeVisible();
});

test("starts with the item's description as the name, its presentation, and the barcode the reading found", async () => {
  const screen = await renderModal();
  const dialog = dialogOf(screen);

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Nuez mariposa extra light x 10 kg");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Presentación de compra/ }))
    .toHaveValue("Caja 10 kg");
  await expect.element(dialog.getByText("7790001000029")).toBeVisible();
});

test("starts with an empty presentation and no barcode when the item has none", async () => {
  const screen = await renderModal({ target: pasasRow });
  const dialog = dialogOf(screen);

  await expect
    .element(dialog.getByRole("textbox", { name: /^Presentación de compra/ }))
    .toHaveValue("");
  expect(dialog.getByRole("button", { name: /^Quitar el código/ }).query()).toBeNull();
});

test("starts sold by the unit, with the quantity in units", async () => {
  const screen = await renderModal();
  const dialog = dialogOf(screen);

  await expect.element(dialog.getByRole("radio", { name: "Por unidad" })).toBeChecked();
  await expect.element(dialog.getByText("u", { exact: true })).toBeVisible();
});

test("asks for what is still missing to save the product", async () => {
  const screen = await renderModal();
  const dialog = dialogOf(screen);

  await expect.element(dialog.getByText("Para guardarlo falta completar:")).toBeVisible();
  await expect
    .element(dialog.getByRole("button", { name: "Generar código interno" }))
    .toBeVisible();
  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();
});

test("creates the product with what was filled in and tells the screen", async () => {
  const services = createServices();
  const onCreated = vi.fn();
  const screen = await renderModal({ services, onCreated });

  await create(screen);

  await expect.poll(() => onCreated.mock.calls.length).toBe(1);
  expect(services.createProductFromSupplierItem).toHaveBeenCalledWith(LIST.id, nutRow.id, {
    version: 3,
    name: "Nuez mariposa extra light x 10 kg",
    saleUnit: "UNIT",
    categoryId: DRIED_FRUITS.id,
    barcodes: ["7790001000029"],
    packagingName: "Caja 10 kg",
    quantityPerPackage: 10_000,
    vatRate: null,
  });
});

test("creates the product with an edited name and presentation", async () => {
  const services = createServices();
  const screen = await renderModal({ services });
  const dialog = dialogOf(screen);
  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Nuez mariposa");
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Presentación de compra/ }),
    "Caja de 10",
  );
  await fillTheRest(dialog);
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .poll(() => vi.mocked(services.createProductFromSupplierItem).mock.calls.length)
    .toBe(1);
  expect(services.createProductFromSupplierItem).toHaveBeenCalledWith(
    LIST.id,
    nutRow.id,
    expect.objectContaining({ name: "Nuez mariposa", packagingName: "Caja de 10" }),
  );
});

test("lets the person sell by weight, and then the quantity is in kilos", async () => {
  const services = createServices();
  const screen = await renderModal({ services });
  const dialog = dialogOf(screen);
  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();

  await userEvent.click(radioLabel(dialog, "Por peso"));
  await expect.element(dialog.getByText("kg", { exact: true })).toBeVisible();
  await fillTheRest(dialog, "10,5");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .poll(() => vi.mocked(services.createProductFromSupplierItem).mock.calls.length)
    .toBe(1);
  expect(services.createProductFromSupplierItem).toHaveBeenCalledWith(
    LIST.id,
    nutRow.id,
    expect.objectContaining({ saleUnit: "KG", quantityPerPackage: 10_500 }),
  );
});

test("does not create the product without a category, a barcode or a quantity, and says what is missing", async () => {
  const services = createServices();
  const screen = await renderModal({ services, target: pasasRow });
  const dialog = dialogOf(screen);
  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Elegí una categoría.")).toBeVisible();
  await expect.element(dialog.getByText("Escaneá al menos un código de barras.")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá la cantidad por presentación.")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá el nombre de la presentación.")).toBeVisible();
  expect(services.createProductFromSupplierItem).not.toHaveBeenCalled();
});

test("does not create the product without a name", async () => {
  const services = createServices();
  const screen = await renderModal({ services });
  const dialog = dialogOf(screen);
  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();

  await userEvent.clear(dialog.getByRole("textbox", { name: /^Nombre/ }));
  await fillTheRest(dialog);
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(dialog.getByText("Ingresá el nombre del producto.")).toBeVisible();
  expect(services.createProductFromSupplierItem).not.toHaveBeenCalled();
});

test("generates an internal barcode for the product", async () => {
  const services = createServices();
  vi.mocked(services.generateInternalBarcode).mockResolvedValue({
    kind: "ok",
    code: "2000000000015",
  });
  const screen = await renderModal({ services, target: pasasRow });
  const dialog = dialogOf(screen);
  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Generar código interno" }));

  await expect.element(dialog.getByText("2000000000015")).toBeVisible();
});

test("only offers the categories without subcategories, with their full path", async () => {
  const screen = await renderModal();
  const dialog = dialogOf(screen);

  await userEvent.click(dialog.getByRole("button", { name: /^Elegí una categoría/ }));

  await expect
    .element(dialog.getByRole("option", { name: "Almacén › Frutos secos" }))
    .toBeVisible();
  expect(dialog.getByRole("option", { name: "Almacén", exact: true }).query()).toBeNull();
});

test("says the categories are loading and creating waits for them", async () => {
  const services = createServices({
    fetchProductCreationCategories: vi.fn().mockReturnValue(new Promise(() => {})),
  });
  const screen = await renderModal({ services });
  const dialog = dialogOf(screen);

  await expect.element(dialog.getByRole("button", { name: "Crear el producto" })).toBeDisabled();
  expect(dialog.getByRole("button", { name: /^Elegí una categoría/ }).query()).toBeNull();
});

test("says the categories could not be opened, and reading them again recovers", async () => {
  const services = createServices({
    fetchProductCreationCategories: vi
      .fn()
      .mockResolvedValueOnce({ kind: "failed" })
      .mockResolvedValue({ kind: "ok", value: CREATION_CATEGORIES }),
  });
  const screen = await renderModal({ services });
  const dialog = dialogOf(screen);

  await expect.element(dialog.getByText("No pudimos abrir las categorías")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();
});

test("says there are no categories to choose from", async () => {
  const services = createServices({
    fetchProductCreationCategories: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
  });
  const screen = await renderModal({ services });

  await expect.element(dialogOf(screen).getByText("No hay categorías para elegir")).toBeVisible();
});

test("ends the session when the categories come back unauthenticated", async () => {
  const services = createServices({
    fetchProductCreationCategories: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  const onSessionEnded = vi.fn();
  await renderModal({ services, onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("does not ask for the VAT rate when the list's prices carry it", async () => {
  const services = createServices();
  const screen = await renderModal({ services });
  await expect
    .element(dialogOf(screen).getByRole("button", { name: /^Elegí una categoría/ }))
    .toBeVisible();

  expect(screen.getByText("IVA del ítem").query()).toBeNull();
  expect(services.fetchSupplierItemLinkChoices).not.toHaveBeenCalled();
});

test("asks for the VAT rate with the cloud's default chosen when the list's prices exclude it", async () => {
  const services = createServices();
  const screen = await renderModal({ services, list: { ...LIST, requiresVatRate: true } });
  const dialog = dialogOf(screen);

  await expect.element(dialog.getByText("IVA del ítem")).toBeVisible();
  await expect.element(dialog.getByRole("radio", { name: "21 %" })).toBeChecked();
  await userEvent.click(radioLabel(dialog, "10,5 %"));
  await fillTheRest(dialog);
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .poll(() => vi.mocked(services.createProductFromSupplierItem).mock.calls.length)
    .toBe(1);
  expect(services.createProductFromSupplierItem).toHaveBeenCalledWith(
    LIST.id,
    nutRow.id,
    expect.objectContaining({ vatRate: 1_050 }),
  );
});

test("tells the barcode already belongs to another product, on the barcodes", async () => {
  const services = createServices();
  vi.mocked(services.createProductFromSupplierItem).mockResolvedValue({
    kind: "barcode_taken",
    codes: ["7790001000029"],
  });
  const screen = await renderModal({ services });

  const dialog = await create(screen);

  await expect
    .element(dialog.getByText("El código 7790001000029 ya es de otro producto."))
    .toBeVisible();
});

test("tells the category has subcategories, on the category", async () => {
  const services = createServices();
  vi.mocked(services.createProductFromSupplierItem).mockResolvedValue({
    kind: "category_not_leaf",
  });
  const screen = await renderModal({ services });

  const dialog = await create(screen);

  await expect
    .element(dialog.getByText("La categoría elegida tiene subcategorías. Elegí una de ellas."))
    .toBeVisible();
});

test("shows the field the cloud refuses, on that field", async () => {
  const services = createServices();
  vi.mocked(services.createProductFromSupplierItem).mockResolvedValue({
    kind: "validation_failed",
    field: "quantityPerPackage",
  });
  const screen = await renderModal({ services });

  const dialog = await create(screen);

  await expect
    .element(dialog.getByText("Escribí una cantidad entera de unidades, por ejemplo 16."))
    .toBeVisible();
});

test("tells the chosen category no longer exists, on the category", async () => {
  const services = createServices();
  vi.mocked(services.createProductFromSupplierItem).mockResolvedValue({
    kind: "validation_failed",
    field: "categoryId",
  });
  const screen = await renderModal({ services });

  const dialog = await create(screen);

  await expect.element(dialog.getByText("Revisá la categoría.")).toBeVisible();
});

test("tells the VAT rate is missing when the cloud needs one", async () => {
  const services = createServices();
  vi.mocked(services.createProductFromSupplierItem).mockResolvedValue({
    kind: "vat_rate_missing",
  });
  const screen = await renderModal({ services });

  const dialog = await create(screen);

  await expect.element(dialog.getByText("Elegí el IVA del ítem")).toBeVisible();
});

test("tells the product was not created, and creating stays available", async () => {
  const services = createServices();
  vi.mocked(services.createProductFromSupplierItem).mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ services });

  const dialog = await create(screen);

  await expect.element(dialog.getByText("No se pudo crear el producto")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Crear el producto" })).toBeEnabled();
});

test("tells there are too many requests, and when to try again", async () => {
  const services = createServices();
  vi.mocked(services.createProductFromSupplierItem).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
  const screen = await renderModal({ services });

  const dialog = await create(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test.each([
  ["stale_version", "La lista cambió"],
  ["not_editable", "La lista ya no se puede modificar"],
  ["not_found", "Esta lista ya no existe"],
  ["already_linked", "Este ítem ya tiene un producto"],
] as const)("tells %s, and updating the list reports it", async (kind, title) => {
  const services = createServices();
  vi.mocked(services.createProductFromSupplierItem).mockResolvedValue({ kind });
  const onOutdated = vi.fn();
  const screen = await renderModal({ services, onOutdated });

  const dialog = await create(screen);

  await expect.element(dialog.getByText(title).first()).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));
  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("ends the session when creating finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.createProductFromSupplierItem).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ services, onSessionEnded });

  await create(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when creating comes back forbidden", async () => {
  window.history.pushState(null, "", "/lists");
  const services = createServices();
  vi.mocked(services.createProductFromSupplierItem).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ services });

  await create(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("cancel closes the modal without calling the cloud", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const screen = await renderModal({ services, onClose });

  await userEvent.click(dialogOf(screen).getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.createProductFromSupplierItem).not.toHaveBeenCalled();
});

test("has no accessibility violations", async () => {
  const screen = await renderModal({ list: { ...LIST, requiresVatRate: true } });
  await expect
    .element(dialogOf(screen).getByRole("button", { name: /^Elegí una categoría/ }))
    .toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});
