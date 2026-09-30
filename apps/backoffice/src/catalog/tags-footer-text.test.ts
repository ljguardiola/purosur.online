import type { ProductSummary } from "@purosur/contracts";
import { expect, test } from "vitest";
import { tagsFooterText } from "./tags-footer-text";
import { almonds, honey } from "./test-support/products";
import { sinColorantes, sinTacc, vegano } from "./test-support/tags";

function carrying(product: ProductSummary, ...tagIds: string[]): ProductSummary {
  return { ...product, tagIds };
}

test("counts the tags and the products carrying any of them, with no inactive part when every tag is active", () => {
  expect(
    tagsFooterText([sinTacc, vegano], [carrying(honey, sinTacc.id), carrying(almonds, vegano.id)]),
  ).toBe("2 distintivos · 2 productos");
});

test("counts a product carrying several of the tags once", () => {
  expect(
    tagsFooterText(
      [sinTacc, vegano],
      [carrying(honey, sinTacc.id, vegano.id), carrying(almonds, vegano.id)],
    ),
  ).toBe("2 distintivos · 2 productos");
});

test("leaves out the products carrying none of the tags", () => {
  expect(
    tagsFooterText([sinTacc], [carrying(honey, sinTacc.id), carrying(almonds, vegano.id), honey]),
  ).toBe("1 distintivo · 1 producto");
});

test("counts the inactive tags", () => {
  expect(tagsFooterText([sinTacc, sinColorantes], [carrying(honey, sinColorantes.id)])).toBe(
    "2 distintivos · 1 inactivo · 1 producto",
  );
  expect(tagsFooterText([sinColorantes, { ...sinColorantes, id: "tag-9" }], [])).toBe(
    "2 distintivos · 2 inactivos · 0 productos",
  );
});

test("groups the thousands of a large count", () => {
  const products = Array.from({ length: 1200 }, (_, index) =>
    carrying({ ...honey, id: `product-${index}` }, sinTacc.id),
  );
  expect(tagsFooterText([sinTacc], products)).toBe("1 distintivo · 1.200 productos");
});
