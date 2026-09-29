import { expect, test } from "vitest";
import { tagsFooterText } from "./tags-footer-text";
import { sinColorantes, sinTacc, vegano } from "./test-support/tags";

test("counts the tags and their products, with no inactive part when every tag is active", () => {
  expect(tagsFooterText([sinTacc, vegano])).toBe("2 distintivos · 52 productos");
});

test("counts the inactive tags", () => {
  expect(tagsFooterText([sinTacc, sinColorantes])).toBe(
    "2 distintivos · 1 inactivo · 37 productos",
  );
  expect(tagsFooterText([sinColorantes, { ...sinColorantes, id: "tag-9" }])).toBe(
    "2 distintivos · 2 inactivos · 6 productos",
  );
});

test("uses the singular for one tag and one product", () => {
  expect(tagsFooterText([{ ...sinTacc, productCount: 1 }])).toBe("1 distintivo · 1 producto");
});

test("groups the thousands of a large count", () => {
  expect(tagsFooterText([{ ...sinTacc, productCount: 1200 }])).toBe(
    "1 distintivo · 1.200 productos",
  );
});
