import type { TagSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { NewProductModal, type NewProductModalServices } from "./new-product-modal";
import { fillNewProductFieldsExceptBarcodes, scanInputOf } from "./test-support/product-form";
import { driedFruits, groceries } from "./test-support/products";
import { organico, sinColorantes, sinTacc, vegano } from "./test-support/tags";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function createServices(): NewProductModalServices {
  return {
    createProduct: vi.fn(),
    createBrand: vi.fn(),
    createTag: vi.fn(),
    generateInternalBarcode: vi.fn(),
  };
}

async function renderModal(services: NewProductModalServices, tags: TagSummary[]) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <NewProductModal
          open
          onClose={() => {}}
          onCreated={() => {}}
          onSessionEnded={() => {}}
          categories={[groceries, driedFruits]}
          brands={[]}
          tags={tags}
          services={services}
        />
      </main>
    </FieldSizeProvider>,
  );
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Nuevo producto" })).toBeVisible();
  return { screen, dialog };
}

async function fillNewProduct(dialog: Locator) {
  await fillNewProductFieldsExceptBarcodes(dialog);
  await userEvent.fill(scanInputOf(dialog), "111");
  await userEvent.keyboard("{Enter}");
}

function addTagButton(dialog: Locator) {
  return dialog.getByRole("button", { name: "Agregar distintivo" });
}

async function chooseTag(dialog: Locator, name: string) {
  await userEvent.click(addTagButton(dialog));
  await userEvent.click(page.getByRole("menuitem", { name }));
}

async function openStackedNewTagModal(dialog: Locator) {
  await userEvent.click(addTagButton(dialog));
  await userEvent.click(page.getByRole("menuitem", { name: "Crear distintivo…" }));
  const tagDialog = page.getByRole("dialog", { name: "Nuevo distintivo" });
  await expect.element(tagDialog).toBeVisible();
  return tagDialog;
}

async function submit(dialog: Locator) {
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));
}

test("a new product starts with no tags and offers the active ones by name, then creating one", async () => {
  const { dialog } = await renderModal(createServices(), [
    vegano,
    sinColorantes,
    organico,
    sinTacc,
  ]);

  await expect.element(dialog.getByRole("group", { name: "Distintivos" })).toBeVisible();
  expect(dialog.getByRole("button", { name: /^Quitar/ }).query()).toBeNull();
  await userEvent.click(addTagButton(dialog));

  const items = page.getByRole("menuitem").all();
  expect(items.map((item) => item.element().textContent)).toEqual([
    "Orgánico",
    "Sin TACC",
    "Vegano",
    "Crear distintivo…",
  ]);
});

test("creates a product with exactly the tags chosen, and a removed one is not sent", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok" });
  const { dialog } = await renderModal(services, [sinTacc, vegano, organico]);
  await fillNewProduct(dialog);

  await chooseTag(dialog, "Vegano");
  await chooseTag(dialog, "Sin TACC");
  await chooseTag(dialog, "Orgánico");
  await userEvent.click(dialog.getByRole("button", { name: "Quitar Sin TACC" }));
  await submit(dialog);

  await expect.poll(() => vi.mocked(services.createProduct).mock.calls.length).toBe(1);
  expect(services.createProduct).toHaveBeenCalledWith(
    expect.objectContaining({ tagIds: [vegano.id, organico.id] }),
  );
});

test("creates a tag in a modal stacked over the product form, appends it as a chip without losing what was typed", async () => {
  const services = createServices();
  vi.mocked(services.createTag).mockResolvedValue({ kind: "ok", tag: organico });
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok" });
  const { screen, dialog: productDialog } = await renderModal(services, [sinTacc]);
  await fillNewProduct(productDialog);
  await chooseTag(productDialog, "Sin TACC");

  const tagDialog = await openStackedNewTagModal(productDialog);
  await expect.element(tagDialog.getByText("Distintivos", { exact: true })).toBeVisible();
  await userEvent.fill(tagDialog.getByRole("textbox", { name: /^Nombre/ }), "Orgánico");
  await userEvent.click(tagDialog.getByRole("button", { name: "Crear el distintivo" }));

  expect(services.createTag).toHaveBeenCalledWith({ name: "Orgánico" });
  await expect
    .poll(() => screen.getByRole("dialog", { name: "Nuevo distintivo" }).query())
    .toBeNull();
  const productForm = screen.getByRole("dialog", { name: "Nuevo producto" });
  const chips = productForm.getByRole("listitem").all();
  expect(chips.slice(0, 2).map((chip) => chip.element().textContent)).toEqual([
    "Sin TACC",
    "Orgánico",
  ]);
  await expect
    .element(productForm.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Producto nuevo");

  await submit(productForm);
  await expect.poll(() => vi.mocked(services.createProduct).mock.calls.length).toBe(1);
  expect(services.createProduct).toHaveBeenCalledWith(
    expect.objectContaining({ tagIds: [sinTacc.id, organico.id] }),
  );
});

test("a tag name already taken shows the error in the stacked modal and keeps the product form", async () => {
  const services = createServices();
  vi.mocked(services.createTag).mockResolvedValue({ kind: "name_taken" });
  const { screen, dialog: productDialog } = await renderModal(services, [sinTacc]);
  await fillNewProduct(productDialog);

  const tagDialog = await openStackedNewTagModal(productDialog);
  await userEvent.fill(tagDialog.getByRole("textbox", { name: /^Nombre/ }), "sin tacc");
  await userEvent.click(tagDialog.getByRole("button", { name: "Crear el distintivo" }));

  await expect
    .element(tagDialog.getByText("Ya existe un distintivo con este nombre."))
    .toBeVisible();
  await userEvent.click(tagDialog.getByRole("button", { name: "Cancelar" }));
  await expect
    .poll(() => screen.getByRole("dialog", { name: "Nuevo distintivo" }).query())
    .toBeNull();
  const productForm = screen.getByRole("dialog", { name: "Nuevo producto" });
  await expect
    .element(productForm.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Producto nuevo");
  expect(productForm.getByRole("button", { name: "Quitar Sin TACC" }).query()).toBeNull();
});

test("shows on the tags field that a tag chosen was deactivated meanwhile", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "tag_inactive" });
  const { dialog } = await renderModal(services, [sinTacc]);
  await fillNewProduct(dialog);
  await chooseTag(dialog, "Sin TACC");

  await submit(dialog);

  await expect
    .element(dialog.getByText("Un distintivo elegido se dio de baja. Quitalo para guardar."))
    .toBeVisible();
});

test("shows on the tags field that a tag chosen no longer exists", async () => {
  const services = createServices();
  vi.mocked(services.createProduct).mockResolvedValue({
    kind: "validation_failed",
    field: "tagIds",
  });
  const { dialog } = await renderModal(services, [sinTacc]);
  await fillNewProduct(dialog);

  await submit(dialog);

  await expect.element(dialog.getByText("Un distintivo elegido ya no existe.")).toBeVisible();
});

test("has no accessibility violations with the tag modal stacked over the product form", async () => {
  const { dialog } = await renderModal(createServices(), [sinTacc]);

  await openStackedNewTagModal(dialog);

  await expectNoAccessibilityViolations(document.body);
});
