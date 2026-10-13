import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchRecipes, saveRecipe } from "./recipes-api";
import { almendras, mixDeFrutosSecos, nueces, recipeList } from "./test-support/recipes";

function jsonResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  return new Response(
    body === undefined ? null : JSON.stringify(body),
    headers ? { status, headers } : { status },
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const JSON_BODY = { headers: { "Content-Type": "application/json" } };
const save = {
  components: [{ componentProductId: almendras.id, quantityPerOutputUnit: 400 }],
  version: 2,
};

const refusals = [
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
] as const;

describe("fetchRecipes", () => {
  test("lists the recipes with the products a recipe may use on 200", async () => {
    const list = recipeList([mixDeFrutosSecos]);
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, list));

    expect(await fetchRecipes()).toEqual({ kind: "ok", value: list });
    expect(fetch).toHaveBeenCalledWith("/api/recipes");
  });

  test("returns failed when the list does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { recipes: [mixDeFrutosSecos] }));

    expect(await fetchRecipes()).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await fetchRecipes()).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

    expect(await fetchRecipes()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await fetchRecipes()).toEqual({ kind: "failed" });
  });
});

describe("saveRecipe", () => {
  test("puts the components and the loaded version and answers the saved recipe on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, mixDeFrutosSecos));

    expect(await saveRecipe(mixDeFrutosSecos.productId, save)).toEqual({
      kind: "ok",
      recipe: mixDeFrutosSecos,
    });
    expect(fetch).toHaveBeenCalledWith(`/api/recipes/${mixDeFrutosSecos.productId}`, {
      method: "PUT",
      ...JSON_BODY,
      body: JSON.stringify(save),
    });
  });

  test("sends a null version for a recipe that does not exist yet", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, mixDeFrutosSecos));

    await saveRecipe(mixDeFrutosSecos.productId, { ...save, version: null });

    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ ...save, version: null }),
    );
  });

  test("returns failed when the saved recipe does not have the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { productId: "x" }));

    expect(await saveRecipe(mixDeFrutosSecos.productId, save)).toEqual({ kind: "failed" });
  });

  test("returns validation_failed with the field the cloud refused", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "validation_failed", details: [{ field: "components" }] }),
    );

    expect(await saveRecipe(mixDeFrutosSecos.productId, save)).toEqual({
      kind: "validation_failed",
      field: "components",
    });
  });

  test("returns product_not_found on a 404", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(404, { code: "product_not_found", message: "gone" }),
    );

    expect(await saveRecipe(mixDeFrutosSecos.productId, save)).toEqual({
      kind: "product_not_found",
    });
  });

  test("returns stale_version on a 409", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(409, { code: "stale_version", message: "changed" }),
    );

    expect(await saveRecipe(mixDeFrutosSecos.productId, save)).toEqual({ kind: "stale_version" });
  });

  test("returns component_not_found with the component the cloud no longer finds", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, {
        code: "component_not_found",
        message: "gone",
        componentProductId: nueces.id,
      }),
    );

    expect(await saveRecipe(mixDeFrutosSecos.productId, save)).toEqual({
      kind: "component_not_found",
      componentProductId: nueces.id,
    });
  });

  test.each([
    [{ kind: "no_components" }],
    [{ kind: "self_component" }],
    [{ kind: "repeated_component", componentProductId: nueces.id }],
    [{ kind: "invalid_quantity", componentProductId: nueces.id }],
  ])("returns invalid_recipe with the reason %j", async (reason) => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, { code: "invalid_recipe", message: "broken", reason }),
    );

    expect(await saveRecipe(mixDeFrutosSecos.productId, save)).toEqual({
      kind: "invalid_recipe",
      reason,
    });
  });

  test("returns failed on a 400 whose body is no known refusal", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "other" }));

    expect(await saveRecipe(mixDeFrutosSecos.productId, save)).toEqual({ kind: "failed" });
  });

  test.each(refusals)("answers a %i as %j", async (status, outcome) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    expect(await saveRecipe(mixDeFrutosSecos.productId, save)).toEqual(outcome);
  });

  test("returns rate_limited with the Retry-After header on 429", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

    expect(await saveRecipe(mixDeFrutosSecos.productId, save)).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 30,
    });
  });

  test("returns failed when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    expect(await saveRecipe(mixDeFrutosSecos.productId, save)).toEqual({ kind: "failed" });
  });
});
