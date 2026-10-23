import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PRODUCT_LINK_CANDIDATE_LIMIT, productLinkCandidates } from "./product-link-candidates.js";

const product = (id: string, name: string) => ({ id, name });

describe("productLinkCandidates", () => {
  it("proposes the products whose name words appear in the text", () => {
    const products = [
      product("1", "Yerba Taragüi"),
      product("2", "Azúcar Ledesma"),
      product("3", "Fideos Matarazzo"),
    ];

    expect(productLinkCandidates(products, "YERBA MATE TARAGUI 1 KG")).toEqual([
      product("1", "Yerba Taragüi"),
    ]);
  });

  it("drops products with no word in common", () => {
    expect(productLinkCandidates([product("1", "Aceite")], "Yerba mate")).toEqual([]);
  });

  it("puts the product with more words in common first", () => {
    const products = [
      product("1", "Yerba"),
      product("2", "Yerba Taragüi Suave"),
      product("3", "Yerba Taragüi"),
    ];

    expect(
      productLinkCandidates(products, "yerba taragui suave 500 g").map(({ id }) => id),
    ).toEqual(["2", "3", "1"]);
  });

  it("orders products with the same score by name, then by id", () => {
    const products = [
      product("3", "Yerba Zeta"),
      product("2", "Yerba Álamo"),
      product("1", "Yerba Beta"),
      product("0", "Yerba Beta"),
    ];

    expect(productLinkCandidates(products, "yerba").map(({ id }) => id)).toEqual([
      "2",
      "0",
      "1",
      "3",
    ]);
  });

  it("counts each word of the product once, however often the text repeats it", () => {
    const products = [product("1", "Sal"), product("2", "Sal fina")];

    expect(productLinkCandidates(products, "sal sal sal fina").map(({ id }) => id)).toEqual([
      "2",
      "1",
    ]);
  });

  it("counts a product word once when its name repeats it", () => {
    const products = [product("1", "Sal sal"), product("2", "Sal fina")];

    expect(productLinkCandidates(products, "sal fina").map(({ id }) => id)).toEqual(["2", "1"]);
  });

  it("matches a text word that abbreviates a product word from its third letter", () => {
    expect(productLinkCandidates([product("1", "Mermelada")], "MERM durazno")).toHaveLength(1);
    expect(productLinkCandidates([product("1", "Mermelada")], "ME durazno")).toEqual([]);
  });

  it("matches a text word of exactly three letters that starts a product word", () => {
    expect(productLinkCandidates([product("1", "Mermelada")], "mer durazno")).toHaveLength(1);
  });

  it("does not count a combining mark standing alone as a word", () => {
    expect(productLinkCandidates([product("1", "\u0301 sal")], "\u0301 pan")).toEqual([]);
  });

  it("does not match a text word longer than the product word", () => {
    expect(productLinkCandidates([product("1", "Sal")], "salsa")).toEqual([]);
  });

  it("ignores accents and case on both sides", () => {
    expect(productLinkCandidates([product("1", "CAFÉ")], "cafe")).toHaveLength(1);
    expect(productLinkCandidates([product("1", "cafe")], "CAFÉ")).toHaveLength(1);
  });

  it("matches the digits of a weight written apart from its unit", () => {
    const products = [product("1", "Arroz 1 kg"), product("2", "Arroz 5 kg")];

    expect(productLinkCandidates(products, "arroz 5 kg").map(({ id }) => id)).toEqual(["2", "1"]);
  });

  it("proposes nothing for a text without words", () => {
    expect(productLinkCandidates([product("1", "Sal")], " - ")).toEqual([]);
  });

  it("proposes nothing without products", () => {
    expect(productLinkCandidates([], "yerba")).toEqual([]);
  });

  it("caps the answer at twenty by default", () => {
    expect(PRODUCT_LINK_CANDIDATE_LIMIT).toBe(20);
    const products = Array.from({ length: 25 }, (_, index) =>
      product(`${index}`, `Yerba ${index}`),
    );

    expect(productLinkCandidates(products, "yerba")).toHaveLength(20);
  });

  it("caps the answer at the limit given, keeping the best ones", () => {
    const products = [product("1", "Yerba"), product("2", "Yerba Taragüi")];

    expect(productLinkCandidates(products, "yerba taragui", 1)).toEqual([
      product("2", "Yerba Taragüi"),
    ]);
  });

  it("never answers more than the limit nor a product with no word in common", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { maxLength: 30 }),
        fc.string(),
        fc.integer({ min: 0, max: 10 }),
        (names, text, limit) => {
          const products = names.map((name, index) => product(`${index}`, name));

          const candidates = productLinkCandidates(products, text, limit);

          expect(candidates.length).toBeLessThanOrEqual(limit);
          for (const candidate of candidates) {
            expect(products).toContainEqual(candidate);
          }
        },
      ),
    );
  });
});
