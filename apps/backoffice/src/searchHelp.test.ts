import type { HelpArticle } from "@purosur/ui";
import { expect, test } from "vitest";
import { articleMatchesQuery, searchArticles } from "./searchHelp";

const intro: HelpArticle<string, string> = {
  category: "getting_started",
  title: "Primeros pasos en Puro Sur",
  body: [
    { kind: "heading", text: "Antes de empezar" },
    { kind: "paragraph", text: "Configurá tu catálogo antes de abrir la caja." },
    { kind: "steps", items: ["Cargá tus productos", "Abrí la caja"] },
    { kind: "note", text: "Podés cambiar esto más adelante." },
    { kind: "articleLink", article: "billing_basics" },
  ],
};

test("matches on the title, case- and accent-insensitively", () => {
  expect(articleMatchesQuery(intro, "PRIMEROS")).toBe(true);
  expect(articleMatchesQuery(intro, "catalogo")).toBe(true);
});

test("matches on paragraph, heading, note and step text", () => {
  expect(articleMatchesQuery(intro, "antes de empezar")).toBe(true);
  expect(articleMatchesQuery(intro, "abrir la caja")).toBe(true);
  expect(articleMatchesQuery(intro, "cambiar esto")).toBe(true);
});

test("does not match unrelated text", () => {
  expect(articleMatchesQuery(intro, "facturación")).toBe(false);
});

test("searchArticles returns only the matching ids, and none for a blank query", () => {
  const other: HelpArticle<string, string> = {
    category: "billing",
    title: "Facturación básica",
    body: [{ kind: "paragraph", text: "Cómo emitir una factura." }],
  };
  const articles = { intro, other };

  expect(searchArticles(articles, "factura")).toEqual([["other", other]]);
  expect(searchArticles(articles, "")).toEqual([]);
  expect(searchArticles(articles, "   ")).toEqual([]);
});
