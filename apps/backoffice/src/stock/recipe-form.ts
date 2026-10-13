import {
  type RecipeList,
  type RecipeSaveBody,
  type RecipeSummary,
  recipeSaveBodySchema,
} from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import { sortedItems, textOrder } from "@purosur/ui";
import {
  formatStockQuantityInput,
  parseStockQuantity,
  quantityMessage,
} from "../platform/stock-quantity";
import type { InvalidRecipeReason } from "./recipes-api";

export type RecipeComponentValues = {
  productId: string;
  name: string;
  saleUnit: SaleUnit;
  quantity: string;
};

export type RecipeFormValues = {
  productId: string | null;
  components: RecipeComponentValues[];
  version: number | null;
};

export const EMPTY_RECIPE_FORM: RecipeFormValues = {
  productId: null,
  components: [],
  version: null,
};

export const RECIPE_FIELDS = { components: "components", version: null } as const;

export const RECIPE_PRODUCT_REQUIRED = "Elegí el producto armado.";
export const RECIPE_PRODUCT_NOT_FOUND = "Este producto ya no está disponible. Elegí otro.";
export const RECIPE_NO_COMPONENTS = "Agregá al menos un componente.";
const RECIPE_QUANTITY_NOT_POSITIVE = "ingresá una cantidad mayor a cero.";
const RECIPE_COMPONENT_NOT_FOUND = "Este componente ya no está disponible. Quitalo.";
const RECIPE_COMPONENT_REPEATED = "Este componente está repetido.";
const RECIPE_COMPONENT_IS_PRODUCT =
  "El producto armado no puede ser componente de su propia receta.";

type ProductOption = { value: string; label: string };

const productNameOrder = textOrder((product: RecipeList["products"][number]) => product.name);

function optionsOf(products: readonly RecipeList["products"][number][]): ProductOption[] {
  return sortedItems(products, { order: productNameOrder, direction: "ascending" }).map(
    (product) => ({ value: product.id, label: product.name }),
  );
}

export function recipeProductOptions(
  products: RecipeList["products"],
  recipes: readonly RecipeSummary[],
): [ProductOption, ...ProductOption[]] | undefined {
  const withRecipe = new Set(recipes.map((recipe) => recipe.productId));
  const [first, ...rest] = optionsOf(products.filter((product) => !withRecipe.has(product.id)));
  return first && [first, ...rest];
}

export function recipeComponentOptions(
  products: RecipeList["products"],
  assembledProductId: string | null,
  components: readonly Pick<RecipeComponentValues, "productId">[],
): ProductOption[] {
  const taken = new Set([
    assembledProductId,
    ...components.map((component) => component.productId),
  ]);
  return optionsOf(products.filter((product) => !taken.has(product.id)));
}

export function recipeComponentsHeading(saleUnit: SaleUnit | null): string {
  if (saleUnit === null) {
    return "Componentes";
  }
  return saleUnit === "KG"
    ? "Componentes por kg de producto terminado"
    : "Componentes por unidad de producto terminado";
}

function quantityOf(component: RecipeComponentValues): number {
  return parseStockQuantity(component.quantity, component.saleUnit) ?? Number.NaN;
}

export function recipeSaveRequestFrom(values: RecipeFormValues): RecipeSaveBody {
  return {
    components: values.components.map((component) => ({
      componentProductId: component.productId,
      quantityPerOutputUnit: quantityOf(component),
    })),
    version: values.version,
  };
}

const componentSchema = recipeSaveBodySchema.shape.components.element;

function withLowercaseInitial(message: string): string {
  return `${message.charAt(0).toLowerCase()}${message.slice(1)}`;
}

export function recipeComponentsMessage({ components }: RecipeFormValues): string {
  if (components.length === 0) {
    return RECIPE_NO_COMPONENTS;
  }
  const wrong = components.find(
    (component) =>
      !componentSchema.safeParse({
        componentProductId: component.productId,
        quantityPerOutputUnit: quantityOf(component),
      }).success,
  );
  if (!wrong) {
    return "Revisá los componentes.";
  }
  if (wrong.quantity.trim() === "") {
    return `${wrong.name}: ingresá la cantidad.`;
  }
  return parseStockQuantity(wrong.quantity, wrong.saleUnit) === 0
    ? `${wrong.name}: ${RECIPE_QUANTITY_NOT_POSITIVE}`
    : `${wrong.name}: ${withLowercaseInitial(quantityMessage(wrong.saleUnit))}`;
}

export function recipeFormValuesOf(recipe: RecipeSummary): RecipeFormValues {
  return {
    productId: recipe.productId,
    components: recipe.components.map((component) => ({
      productId: component.componentProductId,
      name: component.name,
      saleUnit: component.saleUnit,
      quantity: formatStockQuantityInput(component.quantityPerOutputUnit, component.saleUnit),
    })),
    version: recipe.version,
  };
}

type RowRefusal =
  | { kind: "component_not_found"; componentProductId: string }
  | { kind: "invalid_recipe"; reason: InvalidRecipeReason };

export function recipeRowRefusalOf(
  outcome: RowRefusal,
  values: RecipeFormValues,
): { productId: string; message: string } | undefined {
  if (outcome.kind === "component_not_found") {
    return { productId: outcome.componentProductId, message: RECIPE_COMPONENT_NOT_FOUND };
  }
  const { reason } = outcome;
  if (reason.kind === "repeated_component") {
    return { productId: reason.componentProductId, message: RECIPE_COMPONENT_REPEATED };
  }
  if (reason.kind === "invalid_quantity") {
    const component = values.components.find(
      (other) => other.productId === reason.componentProductId,
    );
    return {
      productId: reason.componentProductId,
      message: quantityMessage(component?.saleUnit ?? "UNIT"),
    };
  }
  if (reason.kind === "self_component" && values.productId !== null) {
    return { productId: values.productId, message: RECIPE_COMPONENT_IS_PRODUCT };
  }
  return undefined;
}
