import {
  DISCOUNT_BUY_QTY_MIN,
  DISCOUNT_NAME_MAX_LENGTH,
  DISCOUNT_PAY_QTY_MIN,
  DISCOUNT_PERCENT_MAX,
  DISCOUNT_PERCENT_MIN,
  DISCOUNT_QTY_MAX,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { discountCreationBodySchema, discountNameSchema } from "./discount-creation.js";

const ID = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";

const valid = {
  name: "Verano",
  benefit: { kind: "PERCENT_OFF", percent: 15 },
  target: { kind: "CATEGORY", id: ID },
  validFrom: "2026-12-01",
  validTo: "2027-02-28",
  weekdays: [6, 7],
};

function failures(body: unknown): { path: unknown[]; message: string }[] {
  const result = discountCreationBodySchema.safeParse(body);
  return result.success
    ? []
    : result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
}

describe("discountCreationBodySchema", () => {
  it("accepts a complete body", () => {
    expect(discountCreationBodySchema.safeParse(valid).data).toEqual(valid);
  });

  it("trims the name", () => {
    expect(discountCreationBodySchema.safeParse({ ...valid, name: "  Verano  " }).data?.name).toBe(
      "Verano",
    );
  });

  it("strips keys it does not know", () => {
    expect(
      discountCreationBodySchema.safeParse({ ...valid, active: false, version: 4 }).data,
    ).toEqual(valid);
  });

  it.each([null, undefined, "Verano", 1, []])("rejects the body %j as not an object", (body) => {
    expect(discountCreationBodySchema.safeParse(body).success).toBe(false);
  });

  describe("name", () => {
    it.each([undefined, "", "   ", 42, null])("rejects the name %j as empty", (name) => {
      expect(failures({ ...valid, name })).toEqual([
        { path: ["name"], message: "name must not be empty" },
      ]);
    });

    it("accepts a name of exactly the domain's maximum length and rejects a longer one", () => {
      expect(
        discountCreationBodySchema.safeParse({
          ...valid,
          name: "a".repeat(DISCOUNT_NAME_MAX_LENGTH),
        }).success,
      ).toBe(true);
      expect(failures({ ...valid, name: "a".repeat(DISCOUNT_NAME_MAX_LENGTH + 1) })).toEqual([
        {
          path: ["name"],
          message: `name must be at most ${DISCOUNT_NAME_MAX_LENGTH} characters`,
        },
      ]);
    });
  });

  describe("benefit", () => {
    it.each([DISCOUNT_PERCENT_MIN, DISCOUNT_PERCENT_MAX])(
      "accepts the domain's boundary percent %j",
      (percent) => {
        expect(
          discountCreationBodySchema.safeParse({
            ...valid,
            benefit: { kind: "PERCENT_OFF", percent },
          }).success,
        ).toBe(true);
      },
    );

    it.each([DISCOUNT_PERCENT_MIN - 1, DISCOUNT_PERCENT_MAX + 1, 15.5, "15", null, undefined])(
      "rejects the percent %j on benefit.percent",
      (percent) => {
        expect(failures({ ...valid, benefit: { kind: "PERCENT_OFF", percent } })).toEqual([
          {
            path: ["benefit", "percent"],
            message: `percent must be a whole number from ${DISCOUNT_PERCENT_MIN} to ${DISCOUNT_PERCENT_MAX}`,
          },
        ]);
      },
    );

    it.each([undefined, null, {}, { kind: "BUY_ONE" }, { kind: "percent_off", percent: 10 }])(
      "rejects the benefit %j as not a listed kind",
      (benefit) => {
        const [failure] = failures({ ...valid, benefit });
        expect(failure?.path[0]).toBe("benefit");
        expect(failure?.message).toBe("benefit must be an object with a listed kind");
      },
    );
  });

  describe("buy-N-pay-M benefit", () => {
    const buyNPayM = {
      ...valid,
      benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
      target: { kind: "PRODUCT", id: ID },
    };

    function withQuantities(buyQty: unknown, payQty: unknown) {
      return { ...buyNPayM, benefit: { kind: "BUY_N_PAY_M", buyQty, payQty } };
    }

    it("accepts buying some units of a product and paying fewer", () => {
      expect(discountCreationBodySchema.safeParse(buyNPayM).data).toEqual(buyNPayM);
    });

    it("accepts the domain's smallest quantities", () => {
      expect(
        discountCreationBodySchema.safeParse(
          withQuantities(DISCOUNT_BUY_QTY_MIN, DISCOUNT_PAY_QTY_MIN),
        ).success,
      ).toBe(true);
    });

    it("accepts the domain's largest quantities", () => {
      expect(
        discountCreationBodySchema.safeParse(withQuantities(DISCOUNT_QTY_MAX, DISCOUNT_QTY_MAX - 1))
          .success,
      ).toBe(true);
    });

    it.each([DISCOUNT_BUY_QTY_MIN - 1, 0, DISCOUNT_QTY_MAX + 1, 2.5, "3", null, undefined])(
      "rejects the buyQty %j on benefit.buyQty",
      (buyQty) => {
        expect(failures(withQuantities(buyQty, 1))).toEqual([
          {
            path: ["benefit", "buyQty"],
            message: `buyQty must be a whole number from ${DISCOUNT_BUY_QTY_MIN} to ${DISCOUNT_QTY_MAX}`,
          },
        ]);
      },
    );

    it.each([DISCOUNT_PAY_QTY_MIN - 1, -1, DISCOUNT_QTY_MAX + 1, 1.5, "2", null, undefined])(
      "rejects the payQty %j on benefit.payQty",
      (payQty) => {
        expect(failures(withQuantities(3, payQty))).toEqual([
          {
            path: ["benefit", "payQty"],
            message: `payQty must be a whole number from ${DISCOUNT_PAY_QTY_MIN} to ${DISCOUNT_QTY_MAX}`,
          },
        ]);
      },
    );

    it.each([
      [3, 3],
      [3, 4],
    ])("rejects buying %j and paying %j on benefit.payQty", (buyQty, payQty) => {
      expect(failures(withQuantities(buyQty, payQty))).toEqual([
        { path: ["benefit", "payQty"], message: "payQty must be less than buyQty" },
      ]);
    });

    it.each(["CATEGORY", "TAG"])("rejects a %s target on target.kind", (kind) => {
      expect(failures({ ...buyNPayM, target: { kind, id: ID } })).toEqual([
        {
          path: ["target", "kind"],
          message: "target.kind must be PRODUCT for a BUY_N_PAY_M benefit",
        },
      ]);
    });

    it("reports only the target's own problem when the target is malformed", () => {
      expect(failures({ ...buyNPayM, target: { kind: "BRAND", id: ID } })).toEqual([
        { path: ["target", "kind"], message: "target.kind must be PRODUCT, CATEGORY or TAG" },
      ]);
    });

    it("reports a non-product target next to a malformed target id", () => {
      expect(failures({ ...buyNPayM, target: { kind: "TAG", id: "not-an-id" } })).toEqual([
        { path: ["target", "id"], message: "target.id must be an existing target's id" },
        {
          path: ["target", "kind"],
          message: "target.kind must be PRODUCT for a BUY_N_PAY_M benefit",
        },
      ]);
    });

    it("reports a non-product target next to an empty name", () => {
      expect(
        failures({ ...buyNPayM, name: "", target: { kind: "TAG", id: ID } }).map(
          (failure) => failure.path,
        ),
      ).toEqual([["name"], ["target", "kind"]]);
    });

    it("reports a non-product target next to the problems of other fields", () => {
      expect(
        failures({ ...withQuantities(1, 1), target: { kind: "TAG", id: ID } }).map(
          (failure) => failure.path,
        ),
      ).toEqual([
        ["benefit", "buyQty"],
        ["target", "kind"],
      ]);
    });
  });

  describe("target", () => {
    it.each(["PRODUCT", "CATEGORY", "TAG"])("accepts a %s target", (kind) => {
      expect(
        discountCreationBodySchema.safeParse({ ...valid, target: { kind, id: ID } }).success,
      ).toBe(true);
    });

    it.each(["BRAND", "product", undefined, 1])("rejects the target kind %j", (kind) => {
      expect(failures({ ...valid, target: { kind, id: ID } })).toEqual([
        { path: ["target", "kind"], message: "target.kind must be PRODUCT, CATEGORY or TAG" },
      ]);
    });

    it.each([undefined, "", "not-an-id", 5, null])("rejects the target id %j", (id) => {
      expect(failures({ ...valid, target: { kind: "TAG", id } })).toEqual([
        { path: ["target", "id"], message: "target.id must be an existing target's id" },
      ]);
    });

    it.each([undefined, null, "TAG"])("rejects the target %j", (target) => {
      expect(failures({ ...valid, target })).toEqual([
        { path: ["target"], message: "target must be an object with a kind and an id" },
      ]);
    });
  });

  describe("validity", () => {
    it("accepts a window of a single day", () => {
      expect(
        discountCreationBodySchema.safeParse({
          ...valid,
          validFrom: "2026-12-01",
          validTo: "2026-12-01",
        }).success,
      ).toBe(true);
    });

    it("reports an end before the start on validTo", () => {
      expect(failures({ ...valid, validFrom: "2026-12-02", validTo: "2026-12-01" })).toEqual([
        { path: ["validTo"], message: "validTo must not be before validFrom" },
      ]);
    });

    it("reports an end before the start next to the problems of other fields", () => {
      expect(
        failures({ ...valid, name: " ", validFrom: "2026-12-02", validTo: "2026-12-01" }).map(
          (failure) => failure.path,
        ),
      ).toEqual([["name"], ["validTo"]]);
    });

    it("does not report the window order while either day is not a calendar day", () => {
      expect(failures({ ...valid, validFrom: "2026-12-32", validTo: "2026-12-01" })).toEqual([
        { path: ["validFrom"], message: "validFrom must be a calendar day as YYYY-MM-DD" },
      ]);
    });

    it.each(["validFrom", "validTo"])("rejects %s when it is absent", (field) => {
      expect(failures({ ...valid, [field]: undefined })).toEqual([
        { path: [field], message: `${field} must be a calendar day as YYYY-MM-DD` },
      ]);
    });

    it.each([
      "2026-02-30",
      "2026-13-01",
      "0000-06-15",
      "01/12/2026",
      "2026-12-01T00:00:00Z",
      20261201,
      null,
    ])("rejects %j as a day", (day) => {
      expect(failures({ ...valid, validFrom: day, validTo: "2030-01-01" })).toEqual([
        { path: ["validFrom"], message: "validFrom must be a calendar day as YYYY-MM-DD" },
      ]);
      expect(failures({ ...valid, validFrom: "2020-01-01", validTo: day })).toEqual([
        { path: ["validTo"], message: "validTo must be a calendar day as YYYY-MM-DD" },
      ]);
    });
  });

  describe("weekdays", () => {
    it("accepts an empty list", () => {
      expect(discountCreationBodySchema.safeParse({ ...valid, weekdays: [] }).success).toBe(true);
    });

    it("keeps the order it was sent in", () => {
      expect(
        discountCreationBodySchema.safeParse({ ...valid, weekdays: [7, 1] }).data?.weekdays,
      ).toEqual([7, 1]);
    });

    it.each([[[0]], [[8]], [[1.5]], [[1, 1]], [[-1, 2]]])("rejects %j", (weekdays) => {
      expect(failures({ ...valid, weekdays })).toEqual([
        {
          path: ["weekdays"],
          message: "weekdays must be distinct ISO weekdays, 1 (Monday) to 7 (Sunday)",
        },
      ]);
    });

    it.each([undefined, null, "1", 1, ["1"], [null]])(
      "rejects %j as not a list of numbers",
      (weekdays) => {
        expect(failures({ ...valid, weekdays })).toEqual([
          {
            path: expect.arrayContaining(["weekdays"]),
            message: "weekdays must be distinct ISO weekdays, 1 (Monday) to 7 (Sunday)",
          },
        ]);
      },
    );
  });
});

describe("discountNameSchema", () => {
  it("declares the longest name it accepts, counted in characters", () => {
    expect(discountNameSchema.meta()?.maxLength).toBe(DISCOUNT_NAME_MAX_LENGTH);
  });

  it("flags a name that is too long with a custom issue and an empty one with a too-small issue", () => {
    const codes = (name: string) => {
      const result = discountNameSchema.safeParse(name);
      return result.success ? [] : result.error.issues.map((issue) => issue.code);
    };

    expect(codes("x".repeat(DISCOUNT_NAME_MAX_LENGTH + 1))).toEqual(["custom"]);
    expect(codes("  ")).toEqual(["too_small"]);
    expect(codes("Verano")).toEqual([]);
  });
});
