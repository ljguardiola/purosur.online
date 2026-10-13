import {
  MAX_STOCK_QUANTITY,
  STOCK_QUANTITY_DECIMALS,
  STOCK_QUANTITY_PER_UNIT,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { recipeSaveBodySchema } from "./recipe-save-body.js";

const NUTS = "11111111-1111-1111-1111-111111111111";
const RAISINS = "22222222-2222-2222-2222-222222222222";
const QUANTITY_MESSAGE = "quantityPerOutputUnit must be a positive integer number of thousandths";

const component = { componentProductId: NUTS, quantityPerOutputUnit: 600 };

function firstFailure(body: unknown): { path: unknown[]; message: unknown } | undefined {
  const result = recipeSaveBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { path: issue.path, message: issue.message };
}

describe("recipeSaveBodySchema", () => {
  it("reads the components in the order they are listed and the version loaded", () => {
    const body = {
      components: [component, { componentProductId: RAISINS, quantityPerOutputUnit: 400 }],
      version: 3,
    };

    expect(recipeSaveBodySchema.safeParse(body).data).toEqual(body);
  });

  it("accepts null as the version of a product that has no recipe yet", () => {
    expect(recipeSaveBodySchema.safeParse({ components: [component], version: null }).data).toEqual(
      {
        components: [component],
        version: null,
      },
    );
  });

  it("leaves it to the domain to refuse a recipe without components", () => {
    expect(recipeSaveBodySchema.safeParse({ components: [], version: null }).success).toBe(true);
  });

  it("reads a component id in upper case in lower case", () => {
    const parsed = recipeSaveBodySchema.parse({
      components: [{ ...component, componentProductId: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" }],
      version: null,
    });

    expect(parsed.components[0]?.componentProductId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  it.each([undefined, "", "not-a-uuid", 42])(
    "rejects the component id %j",
    (componentProductId) => {
      expect(
        firstFailure({ components: [{ ...component, componentProductId }], version: null }),
      ).toEqual({
        path: ["components", 0, "componentProductId"],
        message: "componentProductId must be a product's id",
      });
    },
  );

  it("accepts the smallest and the largest quantity a stock movement may carry", () => {
    for (const quantityPerOutputUnit of [1, MAX_STOCK_QUANTITY]) {
      expect(
        recipeSaveBodySchema.safeParse({
          components: [{ ...component, quantityPerOutputUnit }],
          version: null,
        }).success,
      ).toBe(true);
    }
  });

  it.each([undefined, null, "12", 0, -1000, 1.5, MAX_STOCK_QUANTITY + 1, Number.NaN])(
    "rejects the quantity %j",
    (quantityPerOutputUnit) => {
      expect(
        firstFailure({ components: [{ ...component, quantityPerOutputUnit }], version: null }),
      ).toEqual({
        path: ["components", 0, "quantityPerOutputUnit"],
        message: QUANTITY_MESSAGE,
      });
    },
  );

  it.each([undefined, 0, -1, 1.5, "1"])("rejects the version %j", (version) => {
    expect(firstFailure({ components: [component], version })).toEqual({
      path: ["version"],
      message: "version must be the positive integer it was loaded with",
    });
  });

  it.each([undefined, null, "nuts", {}])("rejects the components %j", (components) => {
    expect(firstFailure({ components, version: null })?.path).toEqual(["components"]);
  });

  it("declares the quantity's units", () => {
    const quantity = recipeSaveBodySchema.shape.components.element.shape.quantityPerOutputUnit;

    expect(quantity.meta()).toEqual({
      decimals: STOCK_QUANTITY_DECIMALS,
      perUnit: STOCK_QUANTITY_PER_UNIT,
    });
  });

  it("strips keys it does not know", () => {
    const parsed = recipeSaveBodySchema.parse({
      components: [{ ...component, name: "Nueces" }],
      version: null,
      productId: NUTS,
    });

    expect(parsed).toEqual({ components: [component], version: null });
  });

  it.each([null, undefined, "Mix", 1, []])("rejects the body %j as not an object", (body) => {
    expect(recipeSaveBodySchema.safeParse(body).success).toBe(false);
  });
});
