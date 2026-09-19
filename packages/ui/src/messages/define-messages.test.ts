import { describe, expect, it } from "vitest";
import { defineMessages } from "./define-messages";

describe("defineMessages", () => {
  it("returns the tree the builder produces, looked up by key", () => {
    const messages = defineMessages("es-AR", () => ({
      cart: {
        empty: "El carrito está vacío",
      },
    }));

    expect(messages.cart.empty).toBe("El carrito está vacío");
  });

  it("hands the builder locale-bound plural, number, and date formatters", () => {
    const messages = defineMessages("es-AR", ({ plural, number }) => ({
      cart: {
        items: (params: { count: number }) =>
          plural(params.count, {
            other: `${number(params.count)} artículos`,
            one: "1 artículo",
          }),
      },
    }));

    expect(messages.cart.items({ count: 1 })).toBe("1 artículo");
    expect(messages.cart.items({ count: 3 })).toBe("3 artículos");
  });

  it("supports trees nested more than one level deep", () => {
    const messages = defineMessages("es-AR", () => ({
      alerts: {
        stock: {
          low: "Quedan pocas unidades",
        },
      },
    }));

    expect(messages.alerts.stock.low).toBe("Quedan pocas unidades");
  });
});
