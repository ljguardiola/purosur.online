import { describe, expect, it } from "vitest";
import { defineHelp } from "./help";

describe("defineHelp", () => {
  it("returns the categories and articles it was given, looked up by id", () => {
    const help = defineHelp("es-AR", {
      categories: {
        getting_started: "Primeros pasos",
      },
      articles: {
        intro: {
          category: "getting_started",
          title: "Bienvenida",
          body: [{ kind: "paragraph", text: "Cómo empezar." }],
        },
      },
    });

    expect(help.categories.getting_started).toBe("Primeros pasos");
    expect(help.articles.intro.title).toBe("Bienvenida");
    expect(help.articles.intro.body).toEqual([{ kind: "paragraph", text: "Cómo empezar." }]);
  });

  it("keeps an article's related list and article links intact", () => {
    const help = defineHelp("es-AR", {
      categories: {
        getting_started: "Primeros pasos",
        billing: "Facturación",
      },
      articles: {
        intro: {
          category: "getting_started",
          title: "Bienvenida",
          body: [{ kind: "articleLink", article: "billing_basics" }],
          related: ["billing_basics"],
        },
        billing_basics: {
          category: "billing",
          title: "Facturación básica",
          body: [{ kind: "paragraph", text: "Cómo facturar." }],
        },
      },
    });

    expect(help.articles.intro.related).toEqual(["billing_basics"]);
    expect(help.articles.intro.body).toEqual([{ kind: "articleLink", article: "billing_basics" }]);
  });
});
