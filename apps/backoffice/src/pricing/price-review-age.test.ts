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
  lastReviewedAt: "2026-08-16T12:00:00.000Z",
  pending: true,
};

test.each([
  {
    reviewedAt: new Date(2026, 8, 24, 23, 0),
    viewedAt: new Date(2026, 8, 25, 8, 0),
    cell: "Hace 1 día",
    eyebrow: "Revisado hace 1 día",
  },
  {
    reviewedAt: new Date(2026, 8, 25, 0, 10),
    viewedAt: new Date(2026, 8, 25, 23, 50),
    cell: "Hoy",
    eyebrow: "Revisado hoy",
  },
])(
  "the review age counts local calendar days, so one viewed at $viewedAt reads $cell",
  ({ reviewedAt, viewedAt, cell, eyebrow }) => {
    const lastReviewedAt = reviewedAt.toISOString();

    expect(reviewedCellText(lastReviewedAt, viewedAt)).toBe(cell);
    expect(modalEyebrow({ ...rice, lastReviewedAt, pending: false }, viewedAt)).toBe(eyebrow);
  },
);

test("a price reviewed late yesterday counts as reviewed one calendar day ago the next morning, though fewer than 24 hours passed", () => {
  expect(
    reviewedCellText(new Date(2026, 8, 24, 23, 30).toISOString(), new Date(2026, 8, 25, 0, 30)),
  ).toBe("Hace 1 día");
});

test("a price reviewed earlier today is announced as reviewed today even with a zero-day review window", () => {
  const pendingUnderAZeroDayWindow = {
    ...rice,
    lastReviewedAt: new Date(2026, 8, 25, 8, 0).toISOString(),
    pending: true,
  };

  expect(modalEyebrow(pendingUnderAZeroDayWindow, new Date(2026, 8, 25, 12, 0))).toBe(
    "Revisado hoy",
  );
});

test.each([
  { pending: false, eyebrow: "Revisado hace 30 días" },
  { pending: true, eyebrow: "Sin revisar hace 30 días" },
])(
  "the modal calls a price overdue exactly when the cloud marks it pending: $eyebrow",
  ({ pending, eyebrow }) => {
    const product = {
      ...rice,
      lastReviewedAt: new Date(2026, 7, 26, 12, 0).toISOString(),
      pending,
    };

    expect(modalEyebrow(product, new Date(2026, 8, 25, 12, 0))).toBe(eyebrow);
  },
);
