import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { StubProductCreationModal } from "../platform/test-support/creation-parts";
import { render } from "../shell/test-support/render-with-router";
import { EditRecipeModal } from "./edit-recipe-modal";
import { mixDeFrutosSecos, recipeProducts } from "./test-support/recipes";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

test("typing a component that does not exist offers to create it and adds it to the recipe once saved", async () => {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <EditRecipeModal
          target={mixDeFrutosSecos}
          products={recipeProducts}
          productCreationModal={StubProductCreationModal}
          services={{ saveRecipe: vi.fn() }}
          onSaved={() => {}}
          onClose={() => {}}
          onSessionEnded={() => {}}
        />
      </main>
    </FieldSizeProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: "Mix de frutos secos" });
  await userEvent.click(dialog.getByRole("button", { name: "Agregar un componente" }));

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Componente/ }), "Yerba mate");
  await userEvent.click(page.getByRole("option", { name: "Crear producto «Yerba mate»" }));
  const creation = screen.getByRole("dialog", { name: "Nuevo producto" });
  await expect.element(creation.getByText("Nombre tipeado: Yerba mate")).toBeVisible();
  await userEvent.click(creation.getByRole("button", { name: "Guardar lo creado" }));

  await expect
    .element(dialog.getByRole("textbox", { name: "Cantidad de Yerba mate" }))
    .toBeVisible();
});
