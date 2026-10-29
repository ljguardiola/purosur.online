import type { CategorySummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { NewProductModal, type NewProductModalServices } from "./new-product-modal";
import { driedFruits, groceries, honey } from "./test-support/products";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

const coldCuts: CategorySummary = {
  id: "ca7e0000-0000-4000-8000-000000000010",
  name: "Fiambres",
  version: 1,
  parentId: null,
};

function createServices(): NewProductModalServices {
  return {
    createProduct: vi.fn(),
    createBrand: vi.fn(),
    createCategory: vi.fn(),
    createTag: vi.fn(),
    generateInternalBarcode: vi.fn(),
  };
}

async function renderModal(services: NewProductModalServices) {
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
          tags={[]}
          services={services}
        />
      </main>
    </FieldSizeProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: "Nuevo producto" });
  await expect.element(dialog).toBeVisible();
  return dialog;
}

function categorySelect(dialog: Locator) {
  return dialog.getByRole("combobox", { name: /^Categoría/ });
}

test("typing a category that does not exist offers to create it, opening the category modal with the typed name", async () => {
  const dialog = await renderModal(createServices());

  await userEvent.fill(categorySelect(dialog), "Fiambres");
  await userEvent.click(page.getByRole("option", { name: "Crear categoría «Fiambres»" }));

  const categoryDialog = page.getByRole("dialog", { name: "Nueva categoría" });
  await expect
    .element(categoryDialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Fiambres");
});

test("typing part of an existing category offers it and no creation entry", async () => {
  const dialog = await renderModal(createServices());

  await userEvent.fill(categorySelect(dialog), "almac");

  await expect.element(page.getByRole("option", { name: "Almacén" })).toBeVisible();
  expect(page.getByRole("option", { name: /^Crear categoría/ }).query()).toBeNull();
});

test("saving the stacked category selects it and keeps the rest of the product form as typed", async () => {
  const services = createServices();
  vi.mocked(services.createCategory).mockResolvedValue({ kind: "ok", category: coldCuts });
  vi.mocked(services.createProduct).mockResolvedValue({ kind: "ok", product: honey });
  const dialog = await renderModal(services);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Jamón cocido");
  await userEvent.fill(categorySelect(dialog), "Fiambres");
  await userEvent.click(page.getByRole("option", { name: "Crear categoría «Fiambres»" }));
  const categoryDialog = page.getByRole("dialog", { name: "Nueva categoría" });

  await userEvent.click(categoryDialog.getByRole("button", { name: "Crear la categoría" }));

  await expect.poll(() => page.getByRole("dialog", { name: "Nueva categoría" }).query()).toBeNull();
  expect(services.createCategory).toHaveBeenCalledWith({ name: "Fiambres", parentId: null });
  await expect.element(categorySelect(dialog)).toHaveValue("Fiambres");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Jamón cocido");
});
