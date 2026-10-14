import type { AssemblyBatchBody, AssemblyBatchPreview, RecipeSummary } from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import {
  formatStockQuantityInput,
  parseStockQuantity,
  quantityMessage,
} from "../platform/stock-quantity";
import type { AssemblyBatchPreviewRequest } from "./assembly-batches-api";

type RecipeComponent = RecipeSummary["components"][number];
export type AssemblyBatchProposal = AssemblyBatchPreview["proposal"];

export type AssemblyBatchFormValues = {
  productId: string | null;
  size: string;
  used: Record<string, string>;
  output: string | null;
};

export const EMPTY_ASSEMBLY_BATCH_FORM: AssemblyBatchFormValues = {
  productId: null,
  size: "",
  used: {},
  output: null,
};

export const ASSEMBLY_BATCH_FIELDS = {
  productId: "productId",
  recipeVersion: (values: AssemblyBatchFormValues) =>
    values.productId === null ? ("productId" as const) : ("size" as const),
  used: "used",
  output: "output",
} as const;

export const ASSEMBLY_BATCH_PRODUCT_REQUIRED = "Elegí el producto armado.";
export const ASSEMBLY_BATCH_PRODUCT_NOT_FOUND = "Este producto ya no tiene receta. Elegí otro.";
export const ASSEMBLY_BATCH_NOTHING_USED = "Usá al menos un componente.";
export const ASSEMBLY_BATCH_OUTPUT_REFUSED =
  "La cantidad obtenida no es válida para este producto.";

type Inputs = {
  recipe: RecipeSummary | undefined;
  proposal: AssemblyBatchProposal | undefined;
};

export function usedText(
  values: Pick<AssemblyBatchFormValues, "used">,
  component: RecipeComponent,
  proposal: AssemblyBatchProposal | undefined,
): string {
  const typed = values.used[component.componentProductId];
  if (typed !== undefined) {
    return typed;
  }
  const proposed = proposal?.used.find(
    (use) => use.componentProductId === component.componentProductId,
  )?.quantity;
  return proposed === undefined ? "" : formatStockQuantityInput(proposed, component.saleUnit);
}

export function outputText(
  values: Pick<AssemblyBatchFormValues, "output">,
  saleUnit: SaleUnit,
  proposal: AssemblyBatchProposal | undefined,
): string {
  if (values.output !== null) {
    return values.output;
  }
  return proposal?.output == null ? "" : formatStockQuantityInput(proposal.output, saleUnit);
}

function batchSize(size: string, saleUnit: SaleUnit): number | undefined {
  const parsed = parseStockQuantity(size, saleUnit);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

export function proposalRequestOf(
  values: AssemblyBatchFormValues,
  recipe: RecipeSummary | undefined,
): { productId: string; size: number } | undefined {
  if (recipe === undefined) {
    return undefined;
  }
  const size = batchSize(values.size, recipe.saleUnit);
  return size === undefined ? undefined : { productId: recipe.productId, size };
}

function usedQuantity(
  values: AssemblyBatchFormValues,
  component: RecipeComponent,
  proposal: AssemblyBatchProposal | undefined,
): number {
  return (
    parseStockQuantity(usedText(values, component, proposal), component.saleUnit) ?? Number.NaN
  );
}

function outputQuantity(
  values: AssemblyBatchFormValues,
  saleUnit: SaleUnit,
  proposal: AssemblyBatchProposal | undefined,
): number {
  return parseStockQuantity(outputText(values, saleUnit, proposal), saleUnit) ?? Number.NaN;
}

export function lotPreviewRequestOf(
  values: AssemblyBatchFormValues,
  { recipe, proposal }: Inputs,
): AssemblyBatchPreviewRequest | undefined {
  const request = proposalRequestOf(values, recipe);
  if (recipe === undefined || request === undefined || proposal === undefined) {
    return undefined;
  }
  const used = recipe.components.map((component) => ({
    componentProductId: component.componentProductId,
    quantity: usedQuantity(values, component, proposal),
  }));
  const output = outputQuantity(values, recipe.saleUnit, proposal);
  if (used.some(({ quantity }) => Number.isNaN(quantity)) || !(output > 0)) {
    return undefined;
  }
  return { ...request, used, output };
}

export function assemblyBatchBodyOf(
  values: AssemblyBatchFormValues,
  { recipe, proposal }: Inputs,
): AssemblyBatchBody {
  return {
    productId: values.productId ?? "",
    recipeVersion: recipe === undefined || proposal === undefined ? Number.NaN : recipe.version,
    used: (recipe?.components ?? []).map((component) => ({
      componentProductId: component.componentProductId,
      quantity: usedQuantity(values, component, proposal),
    })),
    output: recipe === undefined ? Number.NaN : outputQuantity(values, recipe.saleUnit, proposal),
  };
}

function withLowercaseInitial(message: string): string {
  return `${message.charAt(0).toLowerCase()}${message.slice(1)}`;
}

export function batchSizeMessage(size: string, saleUnit: SaleUnit, proposed: boolean): string {
  if (size.trim() === "") {
    return "Ingresá el tamaño de la tanda.";
  }
  const parsed = parseStockQuantity(size, saleUnit);
  if (parsed === undefined) {
    return quantityMessage(saleUnit);
  }
  if (parsed === 0) {
    return "Ingresá un tamaño mayor a cero para la tanda.";
  }
  return proposed
    ? "Revisá el tamaño de la tanda."
    : "Todavía no se calcularon las cantidades de la tanda. Probá de nuevo.";
}

export function batchUsedMessage(
  values: AssemblyBatchFormValues,
  recipe: RecipeSummary,
  proposal: AssemblyBatchProposal | undefined,
): string {
  const wrong = recipe.components.find((component) =>
    Number.isNaN(usedQuantity(values, component, proposal)),
  );
  if (wrong === undefined) {
    return "Revisá lo usado.";
  }
  return usedText(values, wrong, proposal).trim() === ""
    ? `${wrong.name}: ingresá la cantidad usada.`
    : `${wrong.name}: ${withLowercaseInitial(quantityMessage(wrong.saleUnit))}`;
}

export function batchOutputMessage(output: string, saleUnit: SaleUnit): string {
  if (output.trim() === "") {
    return "Ingresá lo obtenido.";
  }
  return parseStockQuantity(output, saleUnit) === undefined
    ? quantityMessage(saleUnit)
    : "Ingresá una cantidad obtenida mayor a cero.";
}
