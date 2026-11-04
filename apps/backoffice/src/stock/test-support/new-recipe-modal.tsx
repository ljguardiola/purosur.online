import type { RecipeList, RecipeSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expect, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { ProductPriceSection } from "../../platform/product-price-section";
import { render } from "../../shell/test-support/render-with-router";
import { NewRecipeModal, type NewRecipeModalServices } from "../new-recipe-modal";
import type { fetchRecipes } from "../recipes-api";
import { mixDeFrutosSecos, recipeList, recipeProducts } from "./recipes";
import { RecipesReader } from "./recipes-reader";

export function renderNewRecipeModal({
  saveRecipe = vi.fn<NewRecipeModalServices["saveRecipe"]>(),
  products = recipeProducts,
  recipes = [mixDeFrutosSecos],
  productPriceSection,
  maySetPrice,
  onSaved = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
  readRecipes = vi.fn<typeof fetchRecipes>().mockResolvedValue({
    kind: "ok",
    value: recipeList([mixDeFrutosSecos]),
  }),
}: {
  saveRecipe?: NewRecipeModalServices["saveRecipe"];
  readRecipes?: typeof fetchRecipes;
  products?: RecipeList["products"];
  recipes?: RecipeSummary[];
  productPriceSection?: ProductPriceSection;
  maySetPrice?: boolean;
  onSaved?: (recipe: RecipeSummary) => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <RecipesReader read={readRecipes} />
        <NewRecipeModal
          open
          products={products}
          recipes={recipes}
          productPriceSection={productPriceSection}
          maySetPrice={maySetPrice}
          services={{ saveRecipe }}
          onSaved={onSaved}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

export type NewRecipeModalScreen = Awaited<ReturnType<typeof renderNewRecipeModal>>;

// A locator click scrolls the option into view first, and the scroll event closes the list.
export async function choose(screen: NewRecipeModalScreen, combobox: RegExp, name: string) {
  await userEvent.click(screen.getByRole("dialog").getByRole("combobox", { name: combobox }));
  await expect.element(screen.getByRole("option", { name })).toBeVisible();
  (screen.getByRole("option", { name }).element() as HTMLElement).click();
}

export async function chooseProduct(screen: NewRecipeModalScreen, name: string) {
  await choose(screen, /^Producto armado/, name);
}

export async function addComponent(screen: NewRecipeModalScreen, name: string, quantity: string) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Agregar un componente" }));
  await choose(screen, /^Componente/, name);
  await userEvent.fill(dialog.getByRole("textbox", { name: `Cantidad de ${name}` }), quantity);
}
