import { describe, expect, it } from "vitest";
import {
  recipeComponentCountText,
  recipeComponentNamesText,
  recipeSubtitle,
  recipesCountText,
} from "./recipe-summary-text";
import { cajaDeInfusiones, mixDeFrutosSecos } from "./test-support/recipes";

describe("recipeComponentCountText", () => {
  it.each([
    [1, "1 componente"],
    [2, "2 componentes"],
    [12, "12 componentes"],
  ])("counts %i components", (count, text) => {
    expect(recipeComponentCountText(count)).toBe(text);
  });
});

describe("recipeComponentNamesText", () => {
  it("joins the names as a Spanish list", () => {
    expect(recipeComponentNamesText(mixDeFrutosSecos.components)).toBe(
      "Almendras, Nueces, Maní y Pasas",
    );
    expect(recipeComponentNamesText(cajaDeInfusiones.components)).toBe("Té verde y Miel pura 1 kg");
  });

  it("starts the list with a capital letter and keeps the rest as given", () => {
    expect(recipeComponentNamesText([{ name: "almendras" }, { name: "nueces" }])).toBe(
      "Almendras y nueces",
    );
  });

  it("names the only component", () => {
    expect(recipeComponentNamesText([{ name: "Té verde" }])).toBe("Té verde");
  });
});

describe("recipeSubtitle", () => {
  it("names the category and how the assembled product is sold", () => {
    expect(recipeSubtitle(mixDeFrutosSecos)).toBe("Frutos secos · por peso");
    expect(recipeSubtitle(cajaDeInfusiones)).toBe("Infusiones · por unidad");
  });
});

describe("recipesCountText", () => {
  it.each([
    [1, "1 producto armado"],
    [3, "3 productos armados"],
  ])("counts %i assembled products", (count, text) => {
    expect(recipesCountText(count)).toBe(text);
  });
});
