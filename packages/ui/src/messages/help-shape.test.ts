import { describe, expectTypeOf, it } from "vitest";
import { defineHelp, type HelpArticle, type HelpArticles, type HelpBlock } from "./help";

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

// Fixed stand-ins for `defineHelp`'s two inferred type parameters, so the assertions below check
// `HelpArticles` itself — the constraint `defineHelp` actually uses — rather than a union that
// would stay valid even if that constraint stopped being enforced.
type FixtureCategories = typeof help.categories;
type FixtureArticleIds = Record<ArticleId, HelpArticle<string, string>>;
type FixtureArticles = HelpArticles<FixtureCategories, FixtureArticleIds>;

describe("HelpArticles", () => {
  it("accepts an article whose category, related entries, and articleLink all point at real ids", () => {
    type Valid = {
      intro: {
        category: "getting_started";
        title: string;
        body: readonly [{ kind: "articleLink"; article: "billing_basics" }];
        related: readonly ["billing_basics"];
      };
    };

    expectTypeOf<Valid>().toExtend<FixtureArticles>();
  });

  it("rejects an article whose category isn't one of the given categories", () => {
    type UnknownCategory = {
      intro: { category: "not-a-real-category"; title: string; body: readonly [] };
    };

    expectTypeOf<UnknownCategory>().not.toExtend<FixtureArticles>();
  });

  it("rejects an article whose related list names an id that doesn't exist", () => {
    type UnknownRelated = {
      intro: {
        category: "getting_started";
        title: string;
        body: readonly [];
        related: readonly ["ghost-article"];
      };
    };

    expectTypeOf<UnknownRelated>().not.toExtend<FixtureArticles>();
  });

  it("rejects an articleLink block that names an id that doesn't exist", () => {
    type UnknownArticleLink = {
      intro: {
        category: "getting_started";
        title: string;
        body: readonly [{ kind: "articleLink"; article: "ghost-article" }];
      };
    };

    expectTypeOf<UnknownArticleLink>().not.toExtend<FixtureArticles>();
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
