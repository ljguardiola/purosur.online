import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { StubCategoryCreationModal } from "../platform/test-support/creation-parts";
import { render } from "../shell/test-support/render-with-router";
import {
  CreateProductFromSupplierItemModal,
  type CreateProductFromSupplierItemModalServices,
} from "./create-product-from-supplier-item-modal";
import { LINK_CHOICES } from "./test-support/supplier-item-links";
import {
  CREATION_BRANDS,
  CREATION_CATEGORIES,
  CREATION_TAG_LIST,
  PRODUCT_CREATED,
} from "./test-support/supplier-item-products";
import { EXTRACTED_ROWS, READ_LIST } from "./test-support/supplier-price-lists";

const nutRow = EXTRACTED_ROWS[2] as (typeof EXTRACTED_ROWS)[number];
const LIST = { ...READ_LIST, version: 3, requiresVatRate: false };

beforeEach(async () => {
  window.history.pushState(null, "", "/");
  await page.viewport(1280, 900);
});

function createServices(): CreateProductFromSupplierItemModalServices {
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
  };
}

async function opened(
  mayCreateBrandsAndTags: boolean,
  services: CreateProductFromSupplierItemModalServices = createServices(),
) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <CreateProductFromSupplierItemModal
          list={LIST}
          target={nutRow}
          mayCreateBrandsAndTags={mayCreateBrandsAndTags}
          categoryCreationModal={StubCategoryCreationModal}
          services={services}
          onCreated={() => {}}
          onOutdated={() => {}}
          onClose={() => {}}
          onSessionEnded={() => {}}
        />
      </main>
    </FieldSizeProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: "Crear producto desde la lista" });
  await expect.element(dialog.getByRole("combobox", { name: /^Categoría/ })).toBeVisible();
  return { screen, dialog };
}

test("typing a category that does not exist offers to create it, opening the category form with the typed text", async () => {
  const { screen, dialog } = await opened(true);

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Categoría/ }), "Fiambres");
  await userEvent.click(page.getByRole("option", { name: "Crear categoría «Fiambres»" }));

  const creation = screen.getByRole("dialog", { name: "Nueva categoría" });
  await expect.element(creation.getByText("Nombre tipeado: Fiambres")).toBeVisible();
});

test("saving the created category selects it and keeps what was typed in the product form", async () => {
  const { screen, dialog } = await opened(true);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Contiene/ }), "10");
  await userEvent.fill(dialog.getByRole("combobox", { name: /^Categoría/ }), "Fiambres");
  await userEvent.click(page.getByRole("option", { name: "Crear categoría «Fiambres»" }));

  await userEvent.click(
    screen.getByRole("dialog", { name: "Nueva categoría" }).getByRole("button", {
      name: "Guardar lo creado",
    }),
  );

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Nueva categoría" }).query())
    .toBeNull();
  await expect
    .element(dialog.getByRole("combobox", { name: /^Categoría/ }))
    .toHaveValue("Fiambres");
  await expect.element(dialog.getByRole("textbox", { name: /^Contiene/ })).toHaveValue("10");
});

test("offers no category creation to a person who may not manage the catalog", async () => {
  const { dialog } = await opened(false);

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Categoría/ }), "Fiambres");

  await expect.element(page.getByText("Sin resultados")).toBeVisible();
  expect(page.getByRole("option", { name: /^Crear categoría/ }).query()).toBeNull();
});

test("with no categories yet, still offers creating the typed one for a person who may manage the catalog", async () => {
  const services = createServices();
  vi.mocked(services.fetchProductCreationCategories).mockResolvedValue({ kind: "ok", value: [] });
  const { screen, dialog } = await opened(true, services);

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Categoría/ }), "Fiambres");
  await userEvent.click(page.getByRole("option", { name: "Crear categoría «Fiambres»" }));
  await userEvent.click(
    screen.getByRole("dialog", { name: "Nueva categoría" }).getByRole("button", {
      name: "Guardar lo creado",
    }),
  );

  await expect
    .element(dialog.getByRole("combobox", { name: /^Categoría/ }))
    .toHaveValue("Fiambres");
});
