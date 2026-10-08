import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  rankProductSearch,
  SEARCH_RESULT_LIMIT,
  type SearchableProduct,
} from "./product-search.js";

function product(id: string, name: string, timesSoldHere = 0): SearchableProduct {
  return { id, name, saleUnit: "UNIT", timesSoldHere };
}

function ids(products: SearchableProduct[], query: string): string[] {
  return rankProductSearch(products, query).hits.map((hit) => hit.product.id);
}

describe("rankProductSearch", () => {
  it("keeps only the products whose name matches, with where the query matched", () => {
    const yerba = product("yerba", "Yerba mate");
    const fideos = product("fideos", "Fideos");

    expect(rankProductSearch([fideos, yerba], "mat")).toEqual({
      hits: [{ product: yerba, matches: [{ start: 6, length: 3 }] }],
      more: false,
    });
  });

  it("finds nothing for a query without words", () => {
    expect(rankProductSearch([product("a", "Arroz")], "  ")).toEqual({ hits: [], more: false });
  });

  it("puts the products most sold at this register first", () => {
    const products = [
      product("a", "Arroz", 1),
      product("b", "Arveja", 5),
      product("c", "Avena", 3),
    ];

    expect(ids(products, "a")).toEqual(["b", "c", "a"]);
  });

  it("orders products sold the same number of times by name in Spanish order", () => {
    const products = [
      product("1", "Té Oliva"),
      product("2", "Té Zanahoria"),
      product("3", "Té Ñoqui"),
    ];

    expect(ids(products, "te")).toEqual(["3", "1", "2"]);
  });

  it("orders products with the same name and sales by id", () => {
    const names = [product("b", "Arroz"), product("c", "Arroz"), product("a", "Arroz")];

    expect(ids(names, "arr")).toEqual(["a", "b", "c"]);
    expect(ids([...names].reverse(), "arr")).toEqual(["a", "b", "c"]);
  });

  it("lists up to the limit without saying there are more", () => {
    const products = Array.from({ length: SEARCH_RESULT_LIMIT }, (_, index) =>
      product(`p${index}`, "Arroz"),
    );

    const { hits, more } = rankProductSearch(products, "arroz");

    expect(hits).toHaveLength(SEARCH_RESULT_LIMIT);
    expect(more).toBe(false);
  });

  it("lists the first products in ranked order and says there are more past the limit", () => {
    const products = Array.from({ length: SEARCH_RESULT_LIMIT + 1 }, (_, index) =>
      product(`p${index}`, "Arroz", index),
    );

    const { hits, more } = rankProductSearch(products, "arroz");

    expect(more).toBe(true);
    expect(hits.map((hit) => hit.product.timesSoldHere)).toEqual(
      Array.from({ length: SEARCH_RESULT_LIMIT }, (_, index) => SEARCH_RESULT_LIMIT - index),
    );
  });

  it("lists at most the limit, and more exactly when more products matched", () => {
    fc.assert(
      fc.property(fc.nat({ max: 60 }), (count) => {
        const products = Array.from({ length: count }, (_, index) => product(`p${index}`, "Arroz"));

        const { hits, more } = rankProductSearch(products, "arroz");

        expect(hits.length).toBe(Math.min(count, SEARCH_RESULT_LIMIT));
        expect(more).toBe(count > SEARCH_RESULT_LIMIT);
      }),
    );
  });

  it("does not count products that do not match towards the limit", () => {
    const matching = Array.from({ length: SEARCH_RESULT_LIMIT }, (_, index) =>
      product(`a${index}`, "Arroz"),
    );
    const others = Array.from({ length: 5 }, (_, index) => product(`f${index}`, "Fideos", 99));

    expect(rankProductSearch([...others, ...matching], "arroz").more).toBe(false);
  });
});
