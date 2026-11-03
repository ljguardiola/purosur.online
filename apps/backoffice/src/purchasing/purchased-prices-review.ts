import { useNavigate } from "@tanstack/react-router";
import { purchasedProductsToReviewState } from "../platform/purchased-products-to-review";
import { type PurchaseLineValues, priceReviewProductIds } from "./purchase-form";

export function useReviewPurchasedPrices(): (lines: readonly PurchaseLineValues[]) => boolean {
  const navigate = useNavigate();
  return (lines) => {
    const productIds = priceReviewProductIds(lines);
    if (productIds.length === 0) {
      return false;
    }
    void navigate({
      to: "/prices",
      state: (previous) => ({ ...previous, ...purchasedProductsToReviewState(productIds) }),
    });
    return true;
  };
}
