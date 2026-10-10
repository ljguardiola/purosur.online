import { searchArticles } from "@purosur/ui";
import { describe, expect, it } from "vitest";
import { help } from "./register-help";

const titles = Object.values(help.articles).map((article) => article.title);

describe("the register's help", () => {
  it("starts with the sections on adding products to a sale and on cancelling it", () => {
    expect(titles).toEqual([
      "Agregar un producto escaneándolo",
      "Agregar un producto buscándolo por nombre",
      "Cancelar una venta",
    ]);
  });

  it("files every section under a category it declares", () => {
    for (const article of Object.values(help.articles)) {
      expect(Object.keys(help.categories)).toContain(article.category);
    }
  });

  it.each([
    ["lector", "Agregar un producto escaneándolo"],
    ["flechas", "Agregar un producto buscándolo por nombre"],
    ["reembolso", "Cancelar una venta"],
  ])("finds the section on %s by a word from its body", (word, title) => {
    expect(searchArticles(help.articles, word).map(([, article]) => article.title)).toEqual([
      title,
    ]);
  });
});
