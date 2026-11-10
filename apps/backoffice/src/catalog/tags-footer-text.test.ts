import { expect, test } from "vitest";
import { sinColorantes, sinTacc, vegano } from "../platform/test-support/tags";
import { tagsFooterText } from "./tags-footer-text";

test("counts the tags and the tagged products, with no inactive part when every tag is active", () => {
  expect(tagsFooterText([sinTacc, vegano], 2)).toBe("2 etiquetas · 2 productos");
});

test("counts the inactive tags", () => {
  expect(tagsFooterText([sinTacc, sinColorantes], 1)).toBe("2 etiquetas · 1 inactiva · 1 producto");
  expect(tagsFooterText([sinColorantes, { ...sinColorantes, id: "tag-9" }], 0)).toBe(
    "2 etiquetas · 2 inactivas · 0 productos",
  );
});

test("groups the thousands of a large count", () => {
  expect(tagsFooterText([sinTacc], 1200)).toBe("1 etiqueta · 1.200 productos");
});
