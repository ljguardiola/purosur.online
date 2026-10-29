import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { ProductCreationModal } from "../platform/creation-parts";
import { StubProductCreationModal } from "../platform/test-support/creation-parts";
import { render } from "../shell/test-support/render-with-router";
import {
  LinkSupplierItemModal,
  type LinkSupplierItemModalServices,
} from "./link-supplier-item-modal";
import { LINK_CHOICES, NO_PROPOSAL } from "./test-support/supplier-item-links";
import { EXTRACTED_ROWS, READ_LIST } from "./test-support/supplier-price-lists";

const nutRow = EXTRACTED_ROWS[2] as (typeof EXTRACTED_ROWS)[number];
const LIST = { ...READ_LIST, version: 3, requiresVatRate: false };

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(products = LINK_CHOICES.products): LinkSupplierItemModalServices {
  return {
    linkSupplierPriceListRow: vi.fn<LinkSupplierItemModalServices["linkSupplierPriceListRow"]>(),
    fetchSupplierItemLinkProposal: vi
      .fn<LinkSupplierItemModalServices["fetchSupplierItemLinkProposal"]>()
      .mockResolvedValue({ kind: "ok", value: NO_PROPOSAL }),
    fetchSupplierItemLinkChoices: vi
      .fn<LinkSupplierItemModalServices["fetchSupplierItemLinkChoices"]>()
      .mockResolvedValue({ kind: "ok", value: { ...LINK_CHOICES, products } }),
    createPackaging: vi.fn<LinkSupplierItemModalServices["createPackaging"]>(),
  };
}

async function opened(
  productCreationModal?: ProductCreationModal,
  products = LINK_CHOICES.products,
) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <LinkSupplierItemModal
          list={LIST}
          target={nutRow}
          mayCreatePackaging
          remembersOnConfirm
          onCreateProduct={null}
          {...(productCreationModal ? { productCreationModal } : {})}
          services={createServices(products)}
          onLinked={() => {}}
          onOutdated={() => {}}
          onClose={() => {}}
          onSessionEnded={() => {}}
        />
      </main>
    </FieldSizeProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: nutRow.description });
  await expect
    .element(
      products.length > 0 || productCreationModal
        ? dialog.getByRole("combobox", { name: /^Producto del catálogo/ })
        : dialog.getByText("No hay productos activos"),
    )
    .toBeVisible();
  return { screen, dialog };
}

test("typing a product that does not exist offers to create it, opening the product form with the typed text", async () => {
  const { screen, dialog } = await opened(StubProductCreationModal);

  await userEvent.fill(
    dialog.getByRole("combobox", { name: /^Producto del catálogo/ }),
    "Yerba mate",
  );
  await userEvent.click(page.getByRole("option", { name: "Crear producto «Yerba mate»" }));

  await expect
    .element(
      screen
        .getByRole("dialog", { name: "Nuevo producto" })
        .getByText("Nombre tipeado: Yerba mate"),
    )
    .toBeVisible();
});

test("saving the created product selects it, with no purchase packaging to choose yet", async () => {
  const { screen, dialog } = await opened(StubProductCreationModal);
  await userEvent.fill(
    dialog.getByRole("combobox", { name: /^Producto del catálogo/ }),
    "Yerba mate",
  );
  await userEvent.click(page.getByRole("option", { name: "Crear producto «Yerba mate»" }));

  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Nuevo producto" })
      .getByRole("button", { name: "Guardar lo creado" }),
  );

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Nuevo producto" }).query())
    .toBeNull();
  await expect
    .element(dialog.getByRole("combobox", { name: /^Producto del catálogo/ }))
    .toHaveValue("Yerba mate");
  await expect
    .element(dialog.getByText("Este producto no tiene presentaciones de compra"))
    .toBeVisible();
});

test("offers no product creation when the modal is given no way to create one", async () => {
  const { dialog } = await opened();

  await userEvent.fill(
    dialog.getByRole("combobox", { name: /^Producto del catálogo/ }),
    "Yerba mate",
  );

  await expect.element(page.getByText("Sin resultados")).toBeVisible();
  expect(page.getByRole("option", { name: /^Crear producto/ }).query()).toBeNull();
});

test("with no products at all, still offers creating the first one and selects it once saved", async () => {
  const { screen, dialog } = await opened(StubProductCreationModal, []);
  await userEvent.fill(
    dialog.getByRole("combobox", { name: /^Producto del catálogo/ }),
    "Yerba mate",
  );
  await userEvent.click(page.getByRole("option", { name: "Crear producto «Yerba mate»" }));

  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Nuevo producto" })
      .getByRole("button", { name: "Guardar lo creado" }),
  );

  await expect
    .element(dialog.getByRole("combobox", { name: /^Producto del catálogo/ }))
    .toHaveValue("Yerba mate");
});

test("with no products at all and no way to create one, shows the empty state", async () => {
  const { dialog } = await opened(undefined, []);

  await expect.element(dialog.getByText("No hay productos activos")).toBeVisible();
});
