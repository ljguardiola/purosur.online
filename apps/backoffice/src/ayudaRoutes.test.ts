import { defineHelp } from "@purosur/ui";
import { expect, test } from "vitest";
import { articleHref, resolveAyudaPath, sectionHref } from "./ayudaRoutes";

const help = defineHelp("es-AR", {
  categories: {
    getting_started: { label: "Primeros pasos" },
    billing: { label: "Facturación" },
  },
  articles: {
    intro: { category: "getting_started", title: "Bienvenida", body: [] },
  },
});

test("sectionHref and articleHref build the /ayuda URL scheme", () => {
  expect(sectionHref("getting_started")).toBe("/ayuda/getting_started");
  expect(articleHref("getting_started", "intro")).toBe("/ayuda/getting_started/intro");
});

test("resolves the bare /ayuda path, with or without a trailing slash, to no selection", () => {
  const home = { path: "/ayuda", categoryId: null, articleId: null };
  expect(resolveAyudaPath(help, "/ayuda")).toEqual(home);
  expect(resolveAyudaPath(help, "/ayuda/")).toEqual(home);
});

test("resolves a known category", () => {
  expect(resolveAyudaPath(help, "/ayuda/getting_started")).toEqual({
    path: "/ayuda/getting_started",
    categoryId: "getting_started",
    articleId: null,
  });
});

test("resolves a known article under its own category", () => {
  expect(resolveAyudaPath(help, "/ayuda/getting_started/intro")).toEqual({
    path: "/ayuda/getting_started/intro",
    categoryId: "getting_started",
    articleId: "intro",
  });
});

test("moves an article reached under another category to its own category's URL", () => {
  expect(resolveAyudaPath(help, "/ayuda/billing/intro").path).toBe("/ayuda/getting_started/intro");
  expect(resolveAyudaPath(help, "/ayuda/unknown/intro").path).toBe("/ayuda/getting_started/intro");
});

test("sends an unknown article back to its category, or to /ayuda when that is unknown too", () => {
  expect(resolveAyudaPath(help, "/ayuda/getting_started/unknown").path).toBe(
    "/ayuda/getting_started",
  );
  expect(resolveAyudaPath(help, "/ayuda/unknown/unknown").path).toBe("/ayuda");
});

test("sends an unknown category to /ayuda", () => {
  expect(resolveAyudaPath(help, "/ayuda/unknown")).toEqual({
    path: "/ayuda",
    categoryId: null,
    articleId: null,
  });
});

test("never mistakes an object's built-in property names for catalog ids", () => {
  expect(resolveAyudaPath(help, "/ayuda/constructor").path).toBe("/ayuda");
  expect(resolveAyudaPath(help, "/ayuda/x/constructor").path).toBe("/ayuda");
  expect(resolveAyudaPath(help, "/ayuda/getting_started/toString").path).toBe(
    "/ayuda/getting_started",
  );
  expect(resolveAyudaPath(help, "/ayuda/__proto__").path).toBe("/ayuda");
});

test("sends every path outside the /ayuda scheme to /ayuda", () => {
  for (const path of ["/", "/ventas", "/ayudas", "/ayuda/getting_started/intro/extra"]) {
    expect(resolveAyudaPath(help, path).path).toBe("/ayuda");
  }
});
