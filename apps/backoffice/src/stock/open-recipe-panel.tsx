import type { RecipeSummary } from "@purosur/contracts";
import { DetailPanel } from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { useEffect, useEffectEvent } from "react";
import { type BackofficeAccess, canManageBatches } from "../shell/backoffice-access";
import { ProductRecipeSection, type ProductRecipeSectionServices } from "./product-recipe-section";

export type OpenRecipePanelProps = {
  recipes: readonly RecipeSummary[];
  recipesAreLoaded: boolean;
  openRecipe: string | undefined;
  access: BackofficeAccess;
  services: ProductRecipeSectionServices;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function OpenRecipePanel({
  recipes,
  recipesAreLoaded,
  openRecipe,
  access,
  services,
  onClose,
  onSessionEnded,
}: OpenRecipePanelProps) {
  const recipe = recipes.find((candidate) => candidate.productId === openRecipe);
  const closeUnlisted = useEffectEvent(onClose);
  useEffect(() => {
    if (recipesAreLoaded && openRecipe !== undefined && recipe === undefined) {
      closeUnlisted();
    }
  }, [recipesAreLoaded, openRecipe, recipe]);

  if (recipe === undefined) {
    return null;
  }
  return (
    <DetailPanel
      open
      onClose={onClose}
      recordKey={recipe.productId}
      title={formatProductDescription({
        name: recipe.productName,
        brandName: recipe.brandName,
        netContent: recipe.netContent,
      })}
    >
      <ProductRecipeSection
        productId={recipe.productId}
        productName={recipe.productName}
        saleUnit={recipe.saleUnit}
        mayRegisterBatches={canManageBatches(access)}
        onSessionEnded={onSessionEnded}
        services={services}
      />
    </DetailPanel>
  );
}
