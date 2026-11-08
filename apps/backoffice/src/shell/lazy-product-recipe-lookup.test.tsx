import { expect, test } from "vitest";
import { LazyProductRecipeLookup } from "./lazy-product-recipe-lookup";
import { render } from "./test-support/render-with-router";

test("hands unknown to the render function while the lookup code downloads, and hands it its answer once it has", async () => {
  const handed: string[] = [];

  await render(
    <LazyProductRecipeLookup productId="product-1" enabled={false} onSessionEnded={() => {}}>
      {(lookup) => {
        handed.push(lookup);
        return null;
      }}
    </LazyProductRecipeLookup>,
  );

  expect(handed[0]).toBe("unknown");
  await import("../stock/product-recipe-lookup");
  await expect.poll(() => handed.length).toBeGreaterThan(1);
  expect(handed.every((lookup) => lookup === "unknown")).toBe(true);
});
