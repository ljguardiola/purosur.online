import { describe, expectTypeOf, it } from "vitest";
import { defineHelp, type HelpBlock } from "./help";

const help = defineHelp("es-AR", {
  categories: {
    getting_started: "Primeros pasos",
    billing: "Facturación",
  },
  articles: {
    intro: {
      category: "getting_started",
      title: "Bienvenida",
      body: [
        { kind: "heading", text: "Antes de empezar" },
        { kind: "articleLink", article: "billing_basics" },
      ],
      related: ["billing_basics"],
    },
    billing_basics: {
      category: "billing",
      title: "Facturación básica",
      body: [{ kind: "paragraph", text: "Cómo facturar." }],
    },
  },
});

type ArticleId = keyof typeof help.articles;
type CategoryId = keyof typeof help.categories;

describe("defineHelp's reference safety", () => {
  it("types an article's category as one of the catalog's own category ids", () => {
    expectTypeOf<typeof help.articles.intro.category>().toExtend<CategoryId>();
    expectTypeOf<"nonexistent-category">().not.toExtend<CategoryId>();
  });

  it("types a related list's entries as the catalog's own article ids", () => {
    type RelatedEntry = NonNullable<(typeof help.articles.intro)["related"]>[number];

    expectTypeOf<RelatedEntry>().toExtend<ArticleId>();
    expectTypeOf<"ghost-article">().not.toExtend<ArticleId>();
  });

  it("types an articleLink block's article as the catalog's own article ids", () => {
    type ArticleLinkBlock = Extract<
      (typeof help.articles.intro)["body"][number],
      { kind: "articleLink" }
    >;

    expectTypeOf<ArticleLinkBlock["article"]>().toExtend<ArticleId>();
    expectTypeOf<"ghost-article">().not.toExtend<ArticleId>();
  });
});

describe("HelpBlock", () => {
  it("is a closed union of the drawn block kinds", () => {
    expectTypeOf<{ kind: "bogus"; text: string }>().not.toExtend<HelpBlock<ArticleId>>();
  });

  it("requires steps to carry at least one item", () => {
    type StepsItems = Extract<HelpBlock<ArticleId>, { kind: "steps" }>["items"];

    expectTypeOf<readonly []>().not.toExtend<StepsItems>();
    expectTypeOf<readonly [string]>().toExtend<StepsItems>();
  });
});
