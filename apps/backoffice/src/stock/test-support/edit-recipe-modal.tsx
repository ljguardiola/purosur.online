import type { RecipeList, RecipeSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { vi } from "vitest";
import type { ProductPriceSection } from "../../platform/product-price-section";
import { render } from "../../shell/test-support/render-with-router";
import { EditRecipeModal, type EditRecipeModalServices } from "../edit-recipe-modal";
import type { fetchRecipes } from "../recipes-api";
import { mixDeFrutosSecos, recipeList, recipeProducts } from "./recipes";
import { RecipesReader } from "./recipes-reader";

export function renderEditRecipeModal({
  saveRecipe = vi.fn<EditRecipeModalServices["saveRecipe"]>(),
  target = mixDeFrutosSecos,
  products = recipeProducts,
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
  saveRecipe?: EditRecipeModalServices["saveRecipe"];
  readRecipes?: typeof fetchRecipes;
  target?: RecipeSummary;
  products?: RecipeList["products"];
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
        <EditRecipeModal
          target={target}
          products={products}
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

export type EditRecipeModalScreen = Awaited<ReturnType<typeof renderEditRecipeModal>>;
