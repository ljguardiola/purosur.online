import {
  type RecipeList,
  type RecipeSaveBody,
  type RecipeSaveRefusal,
  type RecipeSummary,
  recipeListSchema,
  recipeSaveRefusalSchema,
  recipeSummarySchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type FetchRecipesOutcome = CloudReadOutcome<RecipeList>;

export type InvalidRecipeReason = Extract<RecipeSaveRefusal, { code: "invalid_recipe" }>["reason"];

type RequestRefusal =
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type SaveRecipeOutcome =
  | { kind: "ok"; recipe: RecipeSummary }
  | { kind: "validation_failed"; field: string }
  | { kind: "product_not_found" }
  | { kind: "stale_version" }
  | { kind: "component_not_found"; componentProductId: string }
  | { kind: "invalid_recipe"; reason: InvalidRecipeReason }
  | RequestRefusal;

function refusal(response: Response): RequestRefusal {
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  return { kind: "failed" };
}

export async function fetchRecipes(): Promise<FetchRecipesOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/recipes");
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const parsed = recipeListSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

function outcomeOf(refused: RecipeSaveRefusal): SaveRecipeOutcome {
  switch (refused.code) {
    case "product_not_found":
      return { kind: "product_not_found" };
    case "stale_version":
      return { kind: "stale_version" };
    case "component_not_found":
      return { kind: "component_not_found", componentProductId: refused.componentProductId };
    case "invalid_recipe":
      return { kind: "invalid_recipe", reason: refused.reason };
  }
}

export async function saveRecipe(
  productId: string,
  input: RecipeSaveBody,
): Promise<SaveRecipeOutcome> {
  const requestBody: RecipeSaveBody = {
    components: input.components.map((component) => ({
      componentProductId: component.componentProductId,
      quantityPerOutputUnit: component.quantityPerOutputUnit,
    })),
    version: input.version,
  };
  let response: Response;
  try {
    response = await fetch(`/api/recipes/${productId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = recipeSummarySchema.safeParse(await response.json().catch(() => undefined));
    return parsed.success ? { kind: "ok", recipe: parsed.data } : { kind: "failed" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response.clone());
    if (field !== undefined) {
      return { kind: "validation_failed", field };
    }
  }
  if (response.status === 400 || response.status === 404 || response.status === 409) {
    const refused = recipeSaveRefusalSchema.safeParse(await response.json().catch(() => undefined));
    return refused.success ? outcomeOf(refused.data) : { kind: "failed" };
  }
  return refusal(response);
}
