import { expect, test } from "vitest";
import {
  purchasedProductsToReviewIn,
  purchasedProductsToReviewState,
} from "./purchased-products-to-review";

test("reads back the products a purchase left to review", () => {
  const state = { key: "entry", ...purchasedProductsToReviewState(["product-1", "product-2"]) };

  expect(purchasedProductsToReviewIn(state)).toEqual(["product-1", "product-2"]);
});

test("reads no products from a state a purchase did not leave", () => {
  expect(purchasedProductsToReviewIn(null)).toEqual([]);
  expect(purchasedProductsToReviewIn({ key: "entry" })).toEqual([]);
  expect(purchasedProductsToReviewIn({ purchasedProductsToReview: "product-1" })).toEqual([]);
  expect(purchasedProductsToReviewIn({ purchasedProductsToReview: [1] })).toEqual([]);
});
