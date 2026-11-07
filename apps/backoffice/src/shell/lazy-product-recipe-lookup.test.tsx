import { expect, test } from "vitest";
import { LazyProductRecipeLookup } from "./lazy-product-recipe-lookup";
import { render } from "./test-support/render-with-router";

test("hands unknown to the render function while the lookup code downloads, and keeps handing the answer after it", async () => {
  const handed: string[] = [];

  const screen = await render(
    <LazyProductRecipeLookup productId="product-1" enabled={false} onSessionEnded={() => {}}>
      {(lookup) => {
        handed.push(lookup);
        return <p>{`lookup `}</p>;
      }}
    </LazyProductRecipeLookup>,
  );

  expect(handed[0]).toBe("unknown");
  await expect.element(screen.getByText("lookup unknown")).toBeInTheDocument();
});
