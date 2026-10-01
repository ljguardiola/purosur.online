import type { PriceProduct } from "@purosur/contracts";
import { expect, test } from "vitest";
import { modalEyebrow, reviewedCellText } from "./price-review-age";

const rice: PriceProduct = {
  id: "product-2",
  name: "Arroz",
  categoryId: "category-1",
  categoryName: "Almacén",
  saleUnit: "KG",
  currentPrice: {
    id: "00000000-0000-4000-8000-000000000001",
    unitPrice: 750000,
    validFrom: "2026-08-16T12:00:00.000Z",
  },
  daysSinceReview: 40,
  pending: true,
};

test.each([
  { daysSinceReview: null, text: "Nunca" },
  { daysSinceReview: 0, text: "Hoy" },
  { daysSinceReview: 1, text: "Hace 1 día" },
  { daysSinceReview: 2, text: "Hace 2 días" },
  { daysSinceReview: 40, text: "Hace 40 días" },
])(
  "the review cell reads $text for an age of $daysSinceReview days",
  ({ daysSinceReview, text }) => {
    expect(reviewedCellText(daysSinceReview)).toBe(text);
  },
);

test.each([
  { daysSinceReview: 0, pending: false, eyebrow: "Revisado hoy" },
  { daysSinceReview: 1, pending: false, eyebrow: "Revisado hace 1 día" },
  { daysSinceReview: 30, pending: false, eyebrow: "Revisado hace 30 días" },
  { daysSinceReview: 1, pending: true, eyebrow: "Sin revisar hace 1 día" },
  { daysSinceReview: 31, pending: true, eyebrow: "Sin revisar hace 31 días" },
])(
  "the modal reads $eyebrow for an age of $daysSinceReview days when pending is $pending",
  ({ daysSinceReview, pending, eyebrow }) => {
    expect(modalEyebrow({ ...rice, daysSinceReview, pending })).toBe(eyebrow);
  },
);

test("a price reviewed today is announced as reviewed today even when the cloud marks it pending", () => {
  expect(modalEyebrow({ ...rice, daysSinceReview: 0, pending: true })).toBe("Revisado hoy");
});

test("a product with no price, or never reviewed, has no review age in the modal", () => {
  expect(modalEyebrow({ ...rice, currentPrice: null })).toBe("Sin precio");
  expect(modalEyebrow({ ...rice, daysSinceReview: null })).toBe("Sin precio");
});
