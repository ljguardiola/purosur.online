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
  secondsSinceReview: 3_456_000,
  pending: true,
};

test.each([
  { secondsSinceReview: null, text: "Nunca" },
  { secondsSinceReview: 0, text: "hace un momento" },
  { secondsSinceReview: 300, text: "hace 5 minutos" },
  { secondsSinceReview: 3 * 3600, text: "hace 3 horas" },
  { secondsSinceReview: 2 * 86_400, text: "hace 2 días" },
  { secondsSinceReview: 40 * 86_400, text: "hace 1 mes" },
])(
  "the review cell reads $text for an age of $secondsSinceReview seconds",
  ({ secondsSinceReview, text }) => {
    expect(reviewedCellText(secondsSinceReview)).toBe(text);
  },
);

test.each([
  { secondsSinceReview: 0, pending: false, eyebrow: "Revisado hace un momento" },
  { secondsSinceReview: 86_400, pending: false, eyebrow: "Revisado hace 1 día" },
  { secondsSinceReview: 3 * 3600, pending: false, eyebrow: "Revisado hace 3 horas" },
  { secondsSinceReview: 300, pending: true, eyebrow: "Sin revisar hace 5 minutos" },
  { secondsSinceReview: 31 * 86_400, pending: true, eyebrow: "Sin revisar hace 1 mes" },
])(
  "the modal reads $eyebrow for an age of $secondsSinceReview seconds when pending is $pending",
  ({ secondsSinceReview, pending, eyebrow }) => {
    expect(modalEyebrow({ ...rice, secondsSinceReview, pending })).toBe(eyebrow);
  },
);

test("a product with no price, or never reviewed, has no review age in the modal", () => {
  expect(modalEyebrow({ ...rice, currentPrice: null })).toBe("Sin precio");
  expect(modalEyebrow({ ...rice, secondsSinceReview: null })).toBe("Sin precio");
});
