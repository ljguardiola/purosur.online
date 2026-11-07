import { expect, test, vi } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { useProductRecipeLookup } from "./product-recipe-lookup";
import { mixDeFrutosSecos } from "./test-support/recipes";

function Probe({
  productId,
  enabled,
  fetchRecipes,
}: {
  productId: string;
  enabled: boolean;
  fetchRecipes: Parameters<typeof useProductRecipeLookup>[0]["fetchRecipes"];
}) {
  const lookup = useProductRecipeLookup({
    productId,
    enabled,
    onSessionEnded: () => {},
    fetchRecipes,
  });
  return <p>{lookup}</p>;
}

const recipes = { kind: "ok", value: { recipes: [mixDeFrutosSecos], products: [] } } as const;

test("calls a product assembled when the cloud lists a recipe for it", async () => {
  const screen = await render(
    <Probe
      productId={mixDeFrutosSecos.productId}
      enabled
      fetchRecipes={vi.fn().mockResolvedValue(recipes)}
    />,
  );

  await expect.element(screen.getByText("assembled")).toBeInTheDocument();
});

test("calls a product simple when the cloud lists no recipe for it", async () => {
  const screen = await render(
    <Probe productId="other-product" enabled fetchRecipes={vi.fn().mockResolvedValue(recipes)} />,
  );

  await expect.element(screen.getByText("simple")).toBeInTheDocument();
});

test("does not know while the answer is pending or failed", async () => {
  const screen = await render(
    <Probe
      productId={mixDeFrutosSecos.productId}
      enabled
      fetchRecipes={vi.fn().mockResolvedValue({ kind: "failed" })}
    />,
  );

  await expect.element(screen.getByText("unknown")).toBeInTheDocument();
});

test("asks the cloud for nothing while not enabled", async () => {
  const fetchRecipes = vi.fn().mockResolvedValue(recipes);

  const screen = await render(
    <Probe productId={mixDeFrutosSecos.productId} enabled={false} fetchRecipes={fetchRecipes} />,
  );

  await expect.element(screen.getByText("unknown")).toBeInTheDocument();
  expect(fetchRecipes).not.toHaveBeenCalled();
});
