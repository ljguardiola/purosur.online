import { describe, expect, it } from "vitest";
import { defineHelp } from "./help";

describe("defineHelp", () => {
  it("returns the categories and articles it was given, looked up by id", () => {
    const help = defineHelp("es-AR", {
      categories: {
        getting_started: { label: "Primeros pasos", icon: "flag" },
      },
      articles: {
        intro: {
          category: "getting_started",
          title: "Bienvenida",
          body: [{ kind: "paragraph", text: "Cómo empezar." }],
        },
      },
    });

    expect(help.categories.getting_started).toEqual({ label: "Primeros pasos", icon: "flag" });
    expect(help.articles.intro.title).toBe("Bienvenida");
    expect(help.articles.intro.body).toEqual([{ kind: "paragraph", text: "Cómo empezar." }]);
  });

  it("accepts a category with no icon", () => {
    const help = defineHelp("es-AR", {
      categories: {
        getting_started: { label: "Primeros pasos" },
      },
      articles: {},
    });

    expect(help.categories.getting_started).toEqual({ label: "Primeros pasos" });
  });

  it("keeps an article's related list and article links intact", () => {
    const help = defineHelp("es-AR", {
      categories: {
        getting_started: { label: "Primeros pasos", icon: "flag" },
        billing: { label: "Facturación", icon: "landmark" },
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
