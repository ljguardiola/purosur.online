import { describe, expectTypeOf, it } from "vitest";
import { defineMessages, type MessagesShape } from "./define-messages";

const esMessages = defineMessages("es-AR", ({ plural }) => ({
  cart: {
    empty: "El carrito está vacío",
    items: (params: { count: number }) =>
      plural(params.count, { other: "artículos", one: "artículo" }),
  },
}));

describe("MessagesShape", () => {
  it("accepts another locale's catalog that has the same keys and leaf signatures", () => {
    const otherLocaleSample = {
      cart: {
        empty: "The cart is empty",
        items: (params: { count: number }) => `${params.count} items`,
      },
    } satisfies MessagesShape<typeof esMessages>;

    expectTypeOf(otherLocaleSample).toExtend<MessagesShape<typeof esMessages>>();
  });

  it("rejects a catalog missing a key the Spanish one has", () => {
    expectTypeOf<{ cart: { empty: string } }>().not.toExtend<MessagesShape<typeof esMessages>>();
  });

  it("rejects a catalog whose leaf is not a string where Spanish has a string", () => {
    expectTypeOf<{
      cart: { empty: number; items: (params: { count: number }) => string };
    }>().not.toExtend<MessagesShape<typeof esMessages>>();
  });

  it("rejects a catalog whose function leaf takes different parameters", () => {
    expectTypeOf<{
      cart: { empty: string; items: (params: { count: string }) => string };
    }>().not.toExtend<MessagesShape<typeof esMessages>>();
  });
});

describe("defineMessages's typed lookups", () => {
  it("types a string leaf as a string", () => {
    expectTypeOf(esMessages.cart.empty).toExtend<string>();
  });

  it("types a function leaf by its own parameters and string return", () => {
    expectTypeOf(esMessages.cart.items).parameter(0).toEqualTypeOf<{ count: number }>();
    expectTypeOf(esMessages.cart.items).returns.toEqualTypeOf<string>();
  });

  it("does not accept parameters of the wrong shape at a function leaf's call site", () => {
    expectTypeOf<{ count: string }>().not.toExtend<Parameters<typeof esMessages.cart.items>[0]>();
  });

  it("has no key besides the ones the catalog defines", () => {
    expectTypeOf<keyof typeof esMessages.cart>().toEqualTypeOf<"empty" | "items">();
  });
});
