import { Button } from "@purosur/ui";
import { beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { emptyPurchaseLine, type PurchaseLineValues } from "./purchase-form";
import { useReviewPurchasedPrices } from "./purchased-prices-review";

beforeEach(() => {
  window.history.pushState(null, "", "/purchases");
});

function Review({
  lines,
  onReviewed,
}: {
  lines: PurchaseLineValues[];
  onReviewed: (reviewing: boolean) => void;
}) {
  const reviewPurchasedPrices = useReviewPurchasedPrices();
  return <Button onPress={() => onReviewed(reviewPurchasedPrices(lines))}>Revisar</Button>;
}

async function review(lines: PurchaseLineValues[]) {
  const answers: boolean[] = [];
  const screen = await render(
    <Review lines={lines} onReviewed={(reviewing) => answers.push(reviewing)} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Revisar" }));
  return answers;
}

test("goes to the prices with the products of the lines chosen for review", async () => {
  const answers = await review([
    { ...emptyPurchaseLine(1), productId: "product-a", reviewPriceNow: true },
    { ...emptyPurchaseLine(2), productId: "product-b" },
  ]);

  await expect.poll(() => window.location.pathname).toBe("/products/prices");
  expect(window.history.state).toMatchObject({ purchasedProductsToReview: ["product-a"] });
  expect(answers).toEqual([true]);
});

test("stays where it is when no line was chosen for review", async () => {
  const answers = await review([{ ...emptyPurchaseLine(1), productId: "product-a" }]);

  expect(answers).toEqual([false]);
  expect(window.location.pathname).toBe("/purchases");
});
