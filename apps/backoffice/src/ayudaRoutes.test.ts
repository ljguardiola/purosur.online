import { expect, test } from "vitest";
import { articleHref, parseAyudaRoute, sectionHref } from "./ayudaRoutes";

test("sectionHref and articleHref build the /ayuda URL scheme", () => {
  expect(sectionHref("getting_started")).toBe("/ayuda/getting_started");
  expect(articleHref("getting_started", "intro")).toBe("/ayuda/getting_started/intro");
});

test("parseAyudaRoute reads no ids from the bare /ayuda path", () => {
  expect(parseAyudaRoute("/ayuda")).toEqual({ categoryId: null, articleId: null });
  expect(parseAyudaRoute("/ayuda/")).toEqual({ categoryId: null, articleId: null });
});

test("parseAyudaRoute reads the category id alone", () => {
  expect(parseAyudaRoute("/ayuda/getting_started")).toEqual({
    categoryId: "getting_started",
    articleId: null,
  });
});

test("parseAyudaRoute reads both the category and article id", () => {
  expect(parseAyudaRoute("/ayuda/getting_started/intro")).toEqual({
    categoryId: "getting_started",
    articleId: "intro",
  });
});
