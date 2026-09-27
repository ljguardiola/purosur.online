import { defineHelp } from "@purosur/ui";
import { expect, test } from "vitest";
import { canonicalHelpPage, isRequestedPage } from "./help-page";

const help = defineHelp("es-AR", {
  categories: {
    getting_started: { label: "Primeros pasos" },
    billing: { label: "Facturación" },
  },
  articles: {
    intro: { category: "getting_started", title: "Bienvenida", body: [] },
  },
});

const home = { categoryId: null, articleId: null };

test("resolves the help home to no selection", () => {
  expect(canonicalHelpPage(help, {})).toEqual(home);
});

test("resolves a known category", () => {
  expect(canonicalHelpPage(help, { categoryId: "getting_started" })).toEqual({
    categoryId: "getting_started",
    articleId: null,
  });
});

test("resolves a known article under its own category", () => {
  expect(canonicalHelpPage(help, { categoryId: "getting_started", articleId: "intro" })).toEqual({
    categoryId: "getting_started",
    articleId: "intro",
  });
});

test("moves an article reached under another category to its own category", () => {
  const ownCategory = { categoryId: "getting_started", articleId: "intro" };
  expect(canonicalHelpPage(help, { categoryId: "billing", articleId: "intro" })).toEqual(
    ownCategory,
  );
  expect(canonicalHelpPage(help, { categoryId: "unknown", articleId: "intro" })).toEqual(
    ownCategory,
  );
});

test("sends an unknown article back to its category, or to the help home when that is unknown too", () => {
  expect(canonicalHelpPage(help, { categoryId: "getting_started", articleId: "unknown" })).toEqual({
    categoryId: "getting_started",
    articleId: null,
  });
  expect(canonicalHelpPage(help, { categoryId: "unknown", articleId: "unknown" })).toEqual(home);
});

test("sends an unknown category to the help home", () => {
  expect(canonicalHelpPage(help, { categoryId: "unknown" })).toEqual(home);
});

test("never mistakes an object's built-in property names for catalog ids", () => {
  expect(canonicalHelpPage(help, { categoryId: "constructor" })).toEqual(home);
  expect(canonicalHelpPage(help, { categoryId: "x", articleId: "constructor" })).toEqual(home);
  expect(canonicalHelpPage(help, { categoryId: "getting_started", articleId: "toString" })).toEqual(
    { categoryId: "getting_started", articleId: null },
  );
  expect(canonicalHelpPage(help, { categoryId: "__proto__" })).toEqual(home);
});

test("tells whether the canonical page is the one requested", () => {
  expect(isRequestedPage(home, {})).toBe(true);
  expect(
    isRequestedPage({ categoryId: "billing", articleId: null }, { categoryId: "billing" }),
  ).toBe(true);
  expect(
    isRequestedPage(
      { categoryId: "getting_started", articleId: "intro" },
      { categoryId: "billing", articleId: "intro" },
    ),
  ).toBe(false);
});
