import { expect, test } from "vitest";
import { tagsFooterText } from "./tags-footer-text";
import { sinColorantes, sinTacc, vegano } from "./test-support/tags";

test("counts the tags and the tagged products, with no inactive part when every tag is active", () => {
  expect(tagsFooterText([sinTacc, vegano], 2)).toBe("2 distintivos · 2 productos");
});

test("counts the inactive tags", () => {
  expect(tagsFooterText([sinTacc, sinColorantes], 1)).toBe(
    "2 distintivos · 1 inactivo · 1 producto",
  );
  expect(tagsFooterText([sinColorantes, { ...sinColorantes, id: "tag-9" }], 0)).toBe(
    "2 distintivos · 2 inactivos · 0 productos",
  );
});

test("groups the thousands of a large count", () => {
  expect(tagsFooterText([sinTacc], 1200)).toBe("1 distintivo · 1.200 productos");
});
