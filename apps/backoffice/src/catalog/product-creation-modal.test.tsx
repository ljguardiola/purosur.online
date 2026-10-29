import { FieldSizeProvider } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { radioLabel } from "../platform/test-support/radio-label";
import { tagList } from "../platform/test-support/tags";
import { render } from "../shell/test-support/render-with-router";
import { ProductCreationModal } from "./product-creation-modal";
import type { ProductCreationModalServices } from "./product-creation-modal-services";
import { scanInputOf } from "./test-support/product-form";
import { driedFruits, groceries, honey } from "./test-support/products";

const granuz = {
  id: "b7a4d000-0000-4000-8000-000000000001",
  name: "Granuz",
  active: true,
  version: 1,
  productCount: 42,
};

function createServices(): ProductCreationModalServices {
  return {
    fetchCategories: vi.fn().mockResolvedValue({ kind: "ok", value: [groceries, driedFruits] }),
    fetchBrands: vi.fn().mockResolvedValue({ kind: "ok", value: [granuz] }),
    fetchTags: vi.fn().mockResolvedValue({ kind: "ok", value: tagList([]) }),
    createProduct: vi
      .fn()
      .mockResolvedValue({ kind: "ok", product: { ...honey, brandId: granuz.id } }),
    createBrand: vi.fn(),
    createCategory: vi.fn(),
    createTag: vi.fn(),
    generateInternalBarcode: vi.fn(),
  };
}

function renderPart(
  services: ProductCreationModalServices,
  options: { open?: boolean; onCreated?: (created: unknown) => void } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <ProductCreationModal
          open={options.open ?? true}
          initialName="Pasta de maní"
          onCreated={options.onCreated ?? (() => {})}
          onClose={() => {}}
          onSessionEnded={() => {}}
          services={services}
        />
      </main>
    </FieldSizeProvider>,
  );
}

test("shows nothing while closed, without reading the catalog", async () => {
  const services = createServices();
  const screen = await renderPart(services, { open: false });

  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.fetchCategories).not.toHaveBeenCalled();
});

test("opens the new product form with the typed text as its description and the stored catalog to choose from", async () => {
  const screen = await renderPart(createServices());

  const dialog = screen.getByRole("dialog", { name: "Nuevo producto" });
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Pasta de maní");
  await userEvent.click(dialog.getByRole("combobox", { name: /^Categoría/ }));
  await expect.element(page.getByRole("option", { name: "Almacén" })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await userEvent.click(dialog.getByRole("combobox", { name: /^Marca/ }));
  await expect.element(page.getByRole("option", { name: "Granuz" })).toBeVisible();
});

test("hands back the product it created with the name of its brand", async () => {
  const services = createServices();
  const onCreated = vi.fn();
  const screen = await renderPart(services, { onCreated });
  const dialog = screen.getByRole("dialog", { name: "Nuevo producto" });
  await userEvent.click(dialog.getByRole("combobox", { name: /^Categoría/ }));
  await userEvent.click(page.getByRole("option", { name: "Almacén" }));
  await userEvent.click(dialog.getByRole("combobox", { name: /^Marca/ }));
  await userEvent.click(page.getByRole("option", { name: "Granuz" }));
  await userEvent.click(radioLabel(dialog, "Por unidad"));
  await userEvent.fill(scanInputOf(dialog), "7790000000099");
  await userEvent.keyboard("{Enter}");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.poll(() => onCreated.mock.calls.length).toBe(1);
  expect(onCreated).toHaveBeenCalledWith({ ...honey, brandId: granuz.id, brandName: "Granuz" });
});
