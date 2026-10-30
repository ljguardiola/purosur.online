import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { ProductCreationModal } from "../platform/creation-parts";
import { StubProductCreationModal } from "../platform/test-support/creation-parts";
import { render } from "../shell/test-support/render-with-router";
import { NewRecipeModal } from "./new-recipe-modal";
import { mixDeFrutosSecos, recipeProducts } from "./test-support/recipes";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

async function opened(
  productCreationModal?: ProductCreationModal,
  products: typeof recipeProducts = recipeProducts,
) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <NewRecipeModal
          open
          products={products}
          recipes={products.length > 0 ? [mixDeFrutosSecos] : []}
          {...(productCreationModal ? { productCreationModal } : {})}
          services={{ saveRecipe: vi.fn() }}
          onSaved={() => {}}
          onClose={() => {}}
          onSessionEnded={() => {}}
        />
      </main>
    </FieldSizeProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: "Nueva receta" });
  await expect
    .element(
      products.length > 0 || productCreationModal
        ? dialog.getByRole("combobox", { name: /^Producto armado/ })
        : dialog.getByText("No hay productos para armar"),
    )
    .toBeVisible();
  return { screen, dialog };
}

async function saveCreatedProduct(screen: Awaited<ReturnType<typeof opened>>["screen"]) {
  const creation = screen.getByRole("dialog", { name: "Nuevo producto" });
  await expect.element(creation.getByText("Nombre tipeado: Yerba mate")).toBeVisible();
  await userEvent.click(creation.getByRole("button", { name: "Guardar lo creado" }));
  await expect
    .poll(() => screen.getByRole("dialog", { name: "Nuevo producto" }).query())
    .toBeNull();
}

test("typing an assembled product that does not exist offers to create it and selects it once saved", async () => {
  const { screen, dialog } = await opened(StubProductCreationModal);

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Producto armado/ }), "Yerba mate");
  await userEvent.click(page.getByRole("option", { name: "Crear producto «Yerba mate»" }));
  await saveCreatedProduct(screen);

  await expect
    .element(dialog.getByRole("combobox", { name: /^Producto armado/ }))
    .toHaveValue("Yerba mate");
});

test("typing a component that does not exist offers to create it and adds it to the recipe once saved", async () => {
  const { screen, dialog } = await opened(StubProductCreationModal);
  await userEvent.click(dialog.getByRole("button", { name: "Agregar un componente" }));

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Componente/ }), "Yerba mate");
  await userEvent.click(page.getByRole("option", { name: "Crear producto «Yerba mate»" }));
  await saveCreatedProduct(screen);

  await expect
    .element(dialog.getByRole("textbox", { name: "Cantidad de Yerba mate" }))
    .toBeVisible();
});

test("offers no product creation when the modal is given no way to create one", async () => {
  const { dialog } = await opened();

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Producto armado/ }), "Yerba mate");

  await expect.element(page.getByText("Sin resultados")).toBeVisible();
  expect(page.getByRole("option", { name: /^Crear producto/ }).query()).toBeNull();
});

test("with no products to assemble, still offers creating one and, once saved, a component can be created too", async () => {
  const { screen, dialog } = await opened(StubProductCreationModal, []);
  await userEvent.fill(dialog.getByRole("combobox", { name: /^Producto armado/ }), "Yerba mate");
  await userEvent.click(page.getByRole("option", { name: "Crear producto «Yerba mate»" }));
  await saveCreatedProduct(screen);
  await expect
    .element(dialog.getByRole("combobox", { name: /^Producto armado/ }))
    .toHaveValue("Yerba mate");

  await userEvent.click(dialog.getByRole("button", { name: "Agregar un componente" }));
  await userEvent.fill(dialog.getByRole("combobox", { name: /^Componente/ }), "Pasas");

  await expect.element(page.getByRole("option", { name: "Crear producto «Pasas»" })).toBeVisible();
});

test("with no products to assemble and no way to create one, shows the empty state", async () => {
  const { dialog } = await opened(undefined, []);

  await expect.element(dialog.getByText("No hay productos para armar")).toBeVisible();
});
