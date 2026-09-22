import { defineHelp } from "@purosur/ui";
import { expect, test } from "vitest";
import { articleHref, resolveHelpPath, sectionHref } from "./helpRoutes";

const help = defineHelp("es-AR", {
  categories: {
    getting_started: { label: "Primeros pasos" },
    billing: { label: "Facturación" },
  },
  articles: {
    intro: { category: "getting_started", title: "Bienvenida", body: [] },
  },
});

test("sectionHref and articleHref build the /help URL scheme", () => {
  expect(sectionHref("getting_started")).toBe("/help/getting_started");
  expect(articleHref("getting_started", "intro")).toBe("/help/getting_started/intro");
});

test("resolves the bare /help path, with or without a trailing slash, to no selection", () => {
  const home = { path: "/help", categoryId: null, articleId: null };
  expect(resolveHelpPath(help, "/help")).toEqual(home);
  expect(resolveHelpPath(help, "/help/")).toEqual(home);
});

test("resolves a known category", () => {
  expect(resolveHelpPath(help, "/help/getting_started")).toEqual({
    path: "/help/getting_started",
    categoryId: "getting_started",
    articleId: null,
  });
});

test("resolves a known article under its own category", () => {
  expect(resolveHelpPath(help, "/help/getting_started/intro")).toEqual({
    path: "/help/getting_started/intro",
    categoryId: "getting_started",
    articleId: "intro",
  });
});

test("moves an article reached under another category to its own category's URL", () => {
  expect(resolveHelpPath(help, "/help/billing/intro").path).toBe("/help/getting_started/intro");
  expect(resolveHelpPath(help, "/help/unknown/intro").path).toBe("/help/getting_started/intro");
});

test("sends an unknown article back to its category, or to /help when that is unknown too", () => {
  expect(resolveHelpPath(help, "/help/getting_started/unknown").path).toBe("/help/getting_started");
  expect(resolveHelpPath(help, "/help/unknown/unknown").path).toBe("/help");
});

test("sends an unknown category to /help", () => {
  expect(resolveHelpPath(help, "/help/unknown")).toEqual({
    path: "/help",
    categoryId: null,
    articleId: null,
  });
});

test("never mistakes an object's built-in property names for catalog ids", () => {
  expect(resolveHelpPath(help, "/help/constructor").path).toBe("/help");
  expect(resolveHelpPath(help, "/help/x/constructor").path).toBe("/help");
  expect(resolveHelpPath(help, "/help/getting_started/toString").path).toBe(
    "/help/getting_started",
  );
  expect(resolveHelpPath(help, "/help/__proto__").path).toBe("/help");
});

test("sends every path outside the /help scheme to /help", () => {
  for (const path of ["/", "/ventas", "/helps", "/help/getting_started/intro/extra"]) {
    expect(resolveHelpPath(help, path).path).toBe("/help");
  }
});
