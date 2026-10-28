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
  CREATION_BRAND,
  CREATION_BRANDS,
  CREATION_CATEGORIES,
  CREATION_TAG_LIST,
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
    fetchProductCreationBrands: vi
      .fn<CreateProductFromSupplierItemModalServices["fetchProductCreationBrands"]>()
      .mockResolvedValue({ kind: "ok", value: CREATION_BRANDS }),
    fetchProductCreationTags: vi
      .fn<CreateProductFromSupplierItemModalServices["fetchProductCreationTags"]>()
      .mockResolvedValue({ kind: "ok", value: CREATION_TAG_LIST }),
    createBrand: vi.fn<CreateProductFromSupplierItemModalServices["createBrand"]>(),
    createTag: vi.fn<CreateProductFromSupplierItemModalServices["createTag"]>(),
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
  mayCreateBrandsAndTags = true,
  onCreated = () => {},
  onOutdated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  services?: CreateProductFromSupplierItemModalServices;
  list?: Parameters<typeof CreateProductFromSupplierItemModal>[0]["list"];
  target?: typeof nutRow | null;
  mayCreateBrandsAndTags?: boolean;
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
          mayCreateBrandsAndTags={mayCreateBrandsAndTags}
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

test("names the supplier, and shows the item's code, presentation and price as the list states them, none of them editable", async () => {
  const screen = await renderModal();
  const dialog = dialogOf(screen);

  await expect.element(dialog.getByText("Crear producto desde la lista")).toBeVisible();
  await expect.element(dialog.getByText("Distribuidora Andina")).toBeVisible();
  await expect.element(dialog.getByText("NM-10")).toBeVisible();
  await expect.element(dialog.getByText("Presentación de compra")).toBeVisible();
  await expect.element(dialog.getByText("Caja 10 kg")).toBeVisible();
  await expect.element(dialog.getByText("$ 142.000,00")).toBeVisible();
  expect(dialog.getByRole("textbox", { name: /^Presentación de compra/ }).query()).toBeNull();
});

test("offers the product's fields as a new product does, in the same order, the name filled from the item's description", async () => {
  const screen = await renderModal();
  const dialog = dialogOf(screen);

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Nuez mariposa extra light x 10 kg");
  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: /Marca/ })).toBeVisible();
  await expect.element(dialog.getByRole("group", { name: "Distintivos" })).toBeVisible();
  const labels = [
    dialog.getByRole("textbox", { name: /^Nombre/ }),
    dialog.getByRole("button", { name: /^Elegí una categoría/ }),
    dialog.getByRole("button", { name: /Marca/ }),
    dialog.getByRole("textbox", { name: "Contenido neto" }),
    dialog.getByRole("group", { name: "Distintivos" }),
    dialog.getByRole("radio", { name: "Por unidad" }),
    dialog.getByRole("button", { name: "Generar código interno" }),
    dialog.getByRole("textbox", { name: /^Contiene/ }),
  ].map((locator) => locator.element());
  const inOrder = labels.every(
    (element, index) =>
      index === 0 ||
      (labels[index - 1]?.compareDocumentPosition(element) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(inOrder).toBe(true);
  await expect
    .element(dialog.getByRole("button", { name: /Marca/ }))
    .toHaveTextContent("Sin marca");
});

test("starts with the barcode the reading found", async () => {
  const screen = await renderModal();

  await expect.element(dialogOf(screen).getByText("7790001000029")).toBeVisible();
});

test("asks for the presentation, empty, and no barcode when the item has none", async () => {
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
  await expect.element(dialog.getByText("u", { exact: true }).last()).toBeVisible();
});

test("asks for the barcode and the category, without claiming the barcode the list gave is missing", async () => {
  const screen = await renderModal();
  const dialog = dialogOf(screen);

  await expect.element(dialog.getByText("7790001000029")).toBeVisible();
  expect(dialog.getByText(/falta completar/).query()).toBeNull();
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
    brandId: null,
    barcodes: ["7790001000029"],
    tagIds: [],
    netContent: null,
    packagingName: null,
    quantityPerPackage: 10_000,
    vatRate: null,
  });
});

test("creates the product with the name changed, the brand chosen and the net content typed", async () => {
  const services = createServices();
  const screen = await renderModal({ services });
  const dialog = dialogOf(screen);
  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Aceite de almendras");
  await userEvent.click(dialog.getByRole("button", { name: /Marca/ }));
  await userEvent.click(dialog.getByRole("option", { name: CREATION_BRAND.name }));
  await userEvent.fill(dialog.getByRole("textbox", { name: "Contenido neto" }), "125");
  await userEvent.click(dialog.getByRole("button", { name: "g Unidad" }));
  await userEvent.click(dialog.getByRole("option", { name: "ml" }));
  await userEvent.click(dialog.getByRole("button", { name: "Agregar distintivo" }));
  await userEvent.click(page.getByRole("menuitem", { name: "Sin TACC" }));
  await fillTheRest(dialog);
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .poll(() => vi.mocked(services.createProductFromSupplierItem).mock.calls.length)
    .toBe(1);
  expect(services.createProductFromSupplierItem).toHaveBeenCalledWith(
    LIST.id,
    nutRow.id,
    expect.objectContaining({
      name: "Aceite de almendras",
      brandId: CREATION_BRAND.id,
      tagIds: [CREATION_TAG_LIST.tags[0]?.id],
      netContent: { quantity: 125, unit: "ML" },
    }),
  );
});

test("does not create the product with the name cleared, and shows the message a new product shows", async () => {
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

test("shows the same net content message as a new product for a quantity that is not valid", async () => {
  const services = createServices();
  const screen = await renderModal({ services });
  const dialog = dialogOf(screen);
  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();

  await userEvent.fill(dialog.getByRole("textbox", { name: "Contenido neto" }), "0");
  await fillTheRest(dialog);
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .element(dialog.getByText(/^Ingresá una cantidad mayor que cero, de hasta/))
    .toBeVisible();
  expect(services.createProductFromSupplierItem).not.toHaveBeenCalled();
});

test("offers only the active brands, and the active tags, by name", async () => {
  const screen = await renderModal({
    services: createServices({
      fetchProductCreationBrands: vi.fn().mockResolvedValue({
        kind: "ok",
        value: [
          CREATION_BRAND,
          {
            ...CREATION_BRAND,
            id: "b2a00000-0000-4000-8000-000000000002",
            name: "Granuz",
            active: false,
          },
        ],
      }),
    }),
  });
  const dialog = dialogOf(screen);
  await expect.element(dialog.getByRole("button", { name: /Marca/ })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: /Marca/ }));

  const options = dialog.getByRole("option").all();
  expect(options.map((option) => option.element().textContent)).toEqual(["Sin marca", "Dulcor"]);
});

test("offers to create a brand and a tag to a session that may manage the catalog, and creates the brand without losing what was typed", async () => {
  const services = createServices();
  const dulcorNuevo = {
    ...CREATION_BRAND,
    id: "b2a00000-0000-4000-8000-000000000009",
    name: "Cabriola",
  };
  vi.mocked(services.createBrand).mockResolvedValue({ kind: "ok", brand: dulcorNuevo });
  const screen = await renderModal({ services });
  const dialog = dialogOf(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Aceite de almendras");

  await userEvent.click(dialog.getByRole("button", { name: "Nueva marca" }));
  const brandDialog = page.getByRole("dialog", { name: "Nueva marca" });
  await userEvent.fill(brandDialog.getByRole("textbox", { name: /^Nombre/ }), "Cabriola");
  await userEvent.click(brandDialog.getByRole("button", { name: "Crear la marca" }));

  expect(services.createBrand).toHaveBeenCalledWith({ name: "Cabriola" });
  await expect.poll(() => page.getByRole("dialog", { name: "Nueva marca" }).query()).toBeNull();
  await expect.element(dialog.getByRole("button", { name: /Marca/ })).toHaveTextContent("Cabriola");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Aceite de almendras");
  await userEvent.click(dialog.getByRole("button", { name: "Agregar distintivo" }));
  await expect.element(page.getByRole("menuitem", { name: "Crear distintivo…" })).toBeVisible();
});

test("offers no way to create a brand or a tag to a session that may not manage the catalog", async () => {
  const screen = await renderModal({ mayCreateBrandsAndTags: false });
  const dialog = dialogOf(screen);
  await expect.element(dialog.getByRole("button", { name: /Marca/ })).toBeVisible();

  expect(dialog.getByRole("button", { name: "Nueva marca" }).query()).toBeNull();
  await userEvent.click(dialog.getByRole("button", { name: "Agregar distintivo" }));
  await expect.element(page.getByRole("menuitem", { name: "Sin TACC" })).toBeVisible();
  expect(page.getByRole("menuitem", { name: "Crear distintivo…" }).query()).toBeNull();
});

test("says the brands are loading and creating waits for them", async () => {
  const services = createServices({
    fetchProductCreationBrands: vi.fn().mockReturnValue(new Promise(() => {})),
  });
  const screen = await renderModal({ services });
  const dialog = dialogOf(screen);

  await expect.element(dialog.getByRole("button", { name: "Crear el producto" })).toBeDisabled();
  expect(dialog.getByRole("button", { name: /Marca/ }).query()).toBeNull();
});

test("says the brands could not be opened, and reading them again recovers", async () => {
  const services = createServices({
    fetchProductCreationBrands: vi
      .fn()
      .mockResolvedValueOnce({ kind: "failed" })
      .mockResolvedValue({ kind: "ok", value: CREATION_BRANDS }),
  });
  const screen = await renderModal({ services });
  const dialog = dialogOf(screen);

  await expect.element(dialog.getByText("No pudimos abrir las marcas")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  await expect.element(dialog.getByRole("button", { name: /Marca/ })).toBeVisible();
});

test("says the tags are loading and creating waits for them", async () => {
  const services = createServices({
    fetchProductCreationTags: vi.fn().mockReturnValue(new Promise(() => {})),
  });
  const screen = await renderModal({ services });
  const dialog = dialogOf(screen);

  await expect.element(dialog.getByRole("button", { name: "Crear el producto" })).toBeDisabled();
  expect(dialog.getByRole("group", { name: "Distintivos" }).query()).toBeNull();
});

test("says the tags could not be opened, and reading them again recovers", async () => {
  const services = createServices({
    fetchProductCreationTags: vi
      .fn()
      .mockResolvedValueOnce({ kind: "failed" })
      .mockResolvedValue({ kind: "ok", value: CREATION_TAG_LIST }),
  });
  const screen = await renderModal({ services });
  const dialog = dialogOf(screen);

  await expect.element(dialog.getByText("No pudimos abrir los distintivos")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  await expect.element(dialog.getByRole("group", { name: "Distintivos" })).toBeVisible();
});

test("ends the session when the brands or the tags come back unauthenticated", async () => {
  const onSessionEnded = vi.fn();
  await renderModal({
    services: createServices({
      fetchProductCreationBrands: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
    }),
    onSessionEnded,
  });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("tells the chosen brand was deactivated, on the brand, the way a new product does", async () => {
  const services = createServices();
  vi.mocked(services.createProductFromSupplierItem).mockResolvedValue({ kind: "brand_inactive" });
  const screen = await renderModal({ services });

  const dialog = await create(screen);

  await expect
    .element(dialog.getByText("La marca elegida se dio de baja. Elegí otra o dejala sin marca."))
    .toBeVisible();
});

test("tells the tag that was deactivated by name, on the tags, the way a new product does", async () => {
  const services = createServices();
  vi.mocked(services.createProductFromSupplierItem).mockResolvedValue({
    kind: "tag_inactive",
    tagId: CREATION_TAG_LIST.tags[0]?.id ?? "",
  });
  const screen = await renderModal({ services });

  const dialog = await create(screen);

  await expect
    .element(dialog.getByText('"Sin TACC" se dio de baja. Quitalo para guardar.'))
    .toBeVisible();
});

test("creates the product with the presentation typed for an item whose list states none", async () => {
  const services = createServices();
  const screen = await renderModal({ services, target: pasasRow });
  const dialog = dialogOf(screen);
  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Presentación de compra/ }),
    "Caja 10 kg",
  );
  await userEvent.fill(
    dialog.getByRole("textbox", { name: "Escanear otro código" }),
    "7790001000036",
  );
  await fillTheRest(dialog);
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect
    .poll(() => vi.mocked(services.createProductFromSupplierItem).mock.calls.length)
    .toBe(1);
  expect(services.createProductFromSupplierItem).toHaveBeenCalledWith(
    LIST.id,
    pasasRow.id,
    expect.objectContaining({ packagingName: "Caja 10 kg", barcodes: ["7790001000036"] }),
  );
});

test("lets the person sell by weight, and then the quantity is in kilos", async () => {
  const services = createServices();
  const screen = await renderModal({ services });
  const dialog = dialogOf(screen);
  await expect.element(dialog.getByRole("button", { name: /^Elegí una categoría/ })).toBeVisible();

  await userEvent.click(radioLabel(dialog, "Por peso"));
  await expect.element(dialog.getByText("kg", { exact: true }).last()).toBeVisible();
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

test("says there are no categories to choose from, without sending the person to a screen", async () => {
  const services = createServices({
    fetchProductCreationCategories: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
  });
  const screen = await renderModal({ services });
  const dialog = dialogOf(screen);

  await expect.element(dialog.getByText("No hay categorías para elegir")).toBeVisible();
  expect(dialog.getByText(/Categorías/).query()).toBeNull();
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

test("tells the item's presentation is too long, and creating stays available", async () => {
  const services = createServices();
  vi.mocked(services.createProductFromSupplierItem).mockResolvedValue({
    kind: "presentation_too_long",
  });
  const screen = await renderModal({ services });

  const dialog = await create(screen);

  await expect
    .element(dialog.getByText("La presentación de la lista es demasiado larga"))
    .toBeVisible();
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
