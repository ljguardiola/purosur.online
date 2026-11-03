import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { StubProductPriceSection } from "../platform/test-support/creation-parts";
import { render } from "../shell/test-support/render-with-router";
import { EditRecipeModal, type EditRecipeModalServices } from "./edit-recipe-modal";
import { mixDeFrutosSecos, recipeProducts } from "./test-support/recipes";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  maySetPrice = true,
  withSection = true,
}: {
  maySetPrice?: boolean;
  saveRecipe?: () => void;
  withSection?: boolean;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <EditRecipeModal
          target={mixDeFrutosSecos}
          products={recipeProducts}
          {...(withSection ? { productPriceSection: StubProductPriceSection } : {})}
          maySetPrice={maySetPrice}
          services={{ saveRecipe: vi.fn<EditRecipeModalServices["saveRecipe"]>() }}
          onSaved={() => {}}
          onClose={() => {}}
          onSessionEnded={() => {}}
        />
      </main>
    </FieldSizeProvider>,
  );
}

test("hands the section the recipe's product and its components with their quantities in thousandths", async () => {
  const screen = await renderModal();
  const section = screen.getByRole("region", { name: "Precio de venta de prueba" });

  await expect
    .element(
      section.getByText(
        "Producto a0000000-0000-4000-8000-000000000001: Mix de frutos secos por KG",
      ),
    )
    .toBeVisible();
  await expect.element(section.getByText("Almendras: 400")).toBeVisible();
  await expect.element(section.getByText("Pasas: 100")).toBeVisible();
});

test("hands the section the components as they are being edited, unsaved", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByRole("textbox", { name: "Cantidad de Almendras" }), "0,7");

  await expect.element(dialog.getByText("Almendras: 700")).toBeVisible();
});

test("leaves out a component whose quantity is not valid yet", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await userEvent.clear(dialog.getByRole("textbox", { name: "Cantidad de Almendras" }));

  await expect.element(dialog.getByText("Pasas: 100")).toBeVisible();
  await expect.element(dialog.getByText(/^Almendras: /)).not.toBeInTheDocument();
});

test("hides the section while no component is valid", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  for (const name of ["Almendras", "Nueces", "Maní", "Pasas"]) {
    await userEvent.clear(dialog.getByRole("textbox", { name: `Cantidad de ${name}` }));
  }

  await expect
    .element(screen.getByRole("region", { name: "Precio de venta de prueba" }))
    .not.toBeInTheDocument();
});

test.each([
  [true, "Puede fijar el precio"],
  [false, "No puede fijar el precio"],
])("tells the section whether the person may set prices: %s", async (maySetPrice, text) => {
  const screen = await renderModal({ maySetPrice });

  await expect.element(screen.getByRole("dialog").getByText(text)).toBeVisible();
});

test("shows no section when none is provided", async () => {
  const screen = await renderModal({ withSection: false });

  await expect
    .element(screen.getByRole("dialog").getByText("Almendras: 400"))
    .not.toBeInTheDocument();
});
