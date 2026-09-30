import { CalendarDate } from "@internationalized/date";
import { discountCreationBodySchema, discountEditBodySchema } from "@purosur/contracts";
import { DISCOUNT_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, test } from "vitest";
import { drinks, groceries, jams, spreads } from "../catalog/test-support/categories";
import {
  DISCOUNT_FIELDS,
  DISCOUNT_KIND_CARDS,
  DISCOUNT_MESSAGES,
  DISCOUNT_TARGET_KIND_OPTIONS,
  type DiscountFormValues,
  discountEditRequestFrom,
  discountFormValues,
  discountRequestFrom,
  EMPTY_DISCOUNT_FORM,
  eligibleTargets,
  targetForKind,
  targetOptions,
  targetPlaceholder,
  targetUnavailableMessage,
  WEEKDAY_OPTIONS,
} from "./discount-form";
import {
  almacenTuesdays,
  almondsProduct,
  discountTargets,
  sinTaccWinter,
  switchedOffPromotion,
  yerbaOff,
  yerbaProduct,
  yerbaThreeForTwo,
} from "./test-support/discounts";

const filled: DiscountFormValues = {
  name: "  Yerba de septiembre ",
  benefitKind: "PERCENT_OFF",
  targetKind: "PRODUCT",
  targetId: "7a1f3c1e-4f6a-4d0e-9d6e-000000000101",
  percent: " 15 ",
  buyQty: "",
  payQty: "",
  validFrom: new CalendarDate(2026, 9, 12),
  validTo: new CalendarDate(2026, 9, 30),
  weekdays: ["1", "3"],
};

const threeForTwo: DiscountFormValues = {
  ...filled,
  benefitKind: "BUY_N_PAY_M",
  percent: "",
  buyQty: " 3 ",
  payQty: "2",
};

describe("discountRequestFrom", () => {
  test("builds the request the cloud reads from the values of the form", () => {
    expect(discountRequestFrom(filled)).toEqual({
      name: "  Yerba de septiembre ",
      benefit: { kind: "PERCENT_OFF", percent: 15 },
      target: { kind: "PRODUCT", id: "7a1f3c1e-4f6a-4d0e-9d6e-000000000101" },
      validFrom: "2026-09-12",
      validTo: "2026-09-30",
      weekdays: [1, 3],
    });
    expect(discountCreationBodySchema.safeParse(discountRequestFrom(filled)).success).toBe(true);
  });

  test("keeps a target kind other than the product one", () => {
    const request = discountRequestFrom({ ...filled, targetKind: "TAG" });

    expect(request.target.kind).toBe("TAG");
  });

  test.each([[""], ["  "], ["quince"], ["15,5"], ["15.5"], ["-3"], ["1e1"]])(
    "sends a percentage the cloud refuses when %j is not a whole number",
    (percent) => {
      const result = discountCreationBodySchema.safeParse(
        discountRequestFrom({ ...filled, percent }),
      );

      expect(result.success).toBe(false);
    },
  );

  test("sends no weekday when none is marked", () => {
    expect(discountRequestFrom({ ...filled, weekdays: [] }).weekdays).toEqual([]);
  });

  test("builds a buy-N-pay-M request from the quantities, leaving the percentage out", () => {
    const request = discountRequestFrom(threeForTwo);

    expect(request.benefit).toEqual({ kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 });
    expect(request.target).toEqual({ kind: "PRODUCT", id: filled.targetId });
    expect(discountCreationBodySchema.safeParse(request).success).toBe(true);
  });

  test("builds a percentage request leaving the quantities out", () => {
    expect(discountRequestFrom({ ...filled, buyQty: "3", payQty: "2" }).benefit).toEqual({
      kind: "PERCENT_OFF",
      percent: 15,
    });
  });

  test.each([[""], ["tres"], ["2,5"], ["2.5"], ["-3"], ["1e1"]])(
    "sends quantities the cloud refuses when %j is not a whole number",
    (quantity) => {
      const buy = discountCreationBodySchema.safeParse(
        discountRequestFrom({ ...threeForTwo, buyQty: quantity }),
      );
      const pay = discountCreationBodySchema.safeParse(
        discountRequestFrom({ ...threeForTwo, buyQty: "20", payQty: quantity }),
      );

      expect(buy.success).toBe(false);
      expect(pay.success).toBe(false);
    },
  );

  test("leaves an unchosen target and unset dates for the cloud's shape to refuse", () => {
    const result = discountCreationBodySchema.safeParse(
      discountRequestFrom({ ...EMPTY_DISCOUNT_FORM, name: "Algo", percent: "10" }),
    );

    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([
      "target",
      "validFrom",
      "validTo",
    ]);
  });
});

describe("field messages", () => {
  test("asks for the name when it is empty, and names the limit when it is too long", () => {
    expect(DISCOUNT_MESSAGES.name({ ...filled, name: "  " })).toBe(
      "Ingresá el nombre de la promoción.",
    );
    expect(
      DISCOUNT_MESSAGES.name({ ...filled, name: "x".repeat(DISCOUNT_NAME_MAX_LENGTH + 1) }),
    ).toBe(`El nombre puede tener hasta ${DISCOUNT_NAME_MAX_LENGTH} caracteres.`);
    expect(DISCOUNT_MESSAGES.name(filled)).toBe("Revisá el nombre de la promoción.");
  });

  test("asks for a whole quantity of 2 or more to buy, whatever was typed", () => {
    expect(DISCOUNT_MESSAGES.buyQty()).toBe("Ingresá una cantidad entera de 2 o más.");
  });

  test.each([[""], ["0"], ["uno"], ["1,5"]])(
    "asks for a whole quantity of 1 or more to pay when %j was typed",
    (payQty) => {
      expect(DISCOUNT_MESSAGES.payQty({ ...threeForTwo, payQty })).toBe(
        "Ingresá una cantidad entera de 1 o más.",
      );
    },
  );

  test("asks to pay fewer units than are bought when the quantity to pay is whole", () => {
    expect(DISCOUNT_MESSAGES.payQty({ ...threeForTwo, payQty: "3" })).toBe(
      "Ingresá menos unidades que en Lleve.",
    );
  });

  test("states the whole percentage range, whatever was typed", () => {
    expect(DISCOUNT_MESSAGES.percent()).toBe("Ingresá un porcentaje entero entre 1 y 99.");
  });

  test.each([
    ["PRODUCT", "Elegí un producto."],
    ["CATEGORY", "Elegí una categoría."],
    ["TAG", "Elegí un distintivo."],
  ] as const)("asks for a %s when none is chosen", (targetKind, message) => {
    expect(DISCOUNT_MESSAGES.targetId({ ...filled, targetKind, targetId: null })).toBe(message);
  });

  test("asks to review the target the cloud refused when one is chosen", () => {
    expect(DISCOUNT_MESSAGES.targetId(filled)).toBe("Revisá el producto elegido.");
    expect(DISCOUNT_MESSAGES.targetId({ ...filled, targetKind: "CATEGORY" })).toBe(
      "Revisá la categoría elegida.",
    );
    expect(DISCOUNT_MESSAGES.targetId({ ...filled, targetKind: "TAG" })).toBe(
      "Revisá el distintivo elegido.",
    );
  });

  test("asks for the start date only while it is empty", () => {
    expect(DISCOUNT_MESSAGES.validFrom({ ...filled, validFrom: null })).toBe(
      "Ingresá la fecha de inicio.",
    );
    expect(DISCOUNT_MESSAGES.validFrom(filled)).toBe("Revisá la fecha de inicio.");
  });

  test("asks for the end date while it is empty, and otherwise says it cannot precede the start", () => {
    expect(DISCOUNT_MESSAGES.validTo({ ...filled, validTo: null })).toBe(
      "Ingresá la fecha de fin.",
    );
    expect(DISCOUNT_MESSAGES.validTo(filled)).toBe(
      "La fecha de fin no puede ser anterior a la de inicio.",
    );
  });

  test("asks to review the weekdays", () => {
    expect(DISCOUNT_MESSAGES.weekdays()).toBe("Revisá los días de la semana.");
  });
});

describe("field declarations", () => {
  test("puts a refused benefit on the field of the chosen kind", () => {
    expect(DISCOUNT_FIELDS.benefit(filled)).toBe("percent");
    expect(DISCOUNT_FIELDS.benefit(threeForTwo)).toBe("buyQty");
  });

  test("puts each refused quantity on its own field", () => {
    const result = discountCreationBodySchema.safeParse(
      discountRequestFrom({ ...threeForTwo, buyQty: "1", payQty: "0" }),
    );

    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "benefit.buyQty",
      "benefit.payQty",
    ]);
    expect(DISCOUNT_FIELDS["benefit.buyQty"]).toBe("buyQty");
    expect(DISCOUNT_FIELDS["benefit.payQty"]).toBe("payQty");
  });
});

describe("targetPlaceholder", () => {
  test.each([
    ["PRODUCT", "Elegí un producto"],
    ["CATEGORY", "Elegí una categoría"],
    ["TAG", "Elegí un distintivo"],
  ] as const)("invites choosing a %s", (kind, placeholder) => {
    expect(targetPlaceholder(kind)).toBe(placeholder);
  });
});

describe("targetUnavailableMessage", () => {
  test.each([
    ["PRODUCT", "Ya no está disponible. Elegí otro producto."],
    ["CATEGORY", "Ya no está disponible. Elegí otra categoría."],
    ["TAG", "Ya no está disponible. Elegí otro distintivo."],
  ] as const)("says a %s is gone and asks for another", (kind, message) => {
    expect(targetUnavailableMessage(kind)).toBe(message);
  });
});

describe("option lists", () => {
  test("offers a card for each kind of promotion", () => {
    expect(
      DISCOUNT_KIND_CARDS.map(({ value, label, description }) => [value, label, description]),
    ).toEqual([
      [
        "PERCENT_OFF",
        "Porcentaje de descuento",
        "Sobre un producto, una categoría o un distintivo",
      ],
      ["BUY_N_PAY_M", "Lleve N, pague M", "Sobre un producto por unidad"],
    ]);
  });

  test("offers the three target kinds for the segmented control", () => {
    expect(DISCOUNT_TARGET_KIND_OPTIONS).toEqual([
      { value: "PRODUCT", label: "Producto" },
      { value: "CATEGORY", label: "Categoría" },
      { value: "TAG", label: "Distintivo" },
    ]);
  });

  test("offers the weekdays Monday first, with their full names for assistive technology", () => {
    expect(
      WEEKDAY_OPTIONS.map(({ value, label, accessibleName }) => [value, label, accessibleName]),
    ).toEqual([
      ["1", "Lun", "Lunes"],
      ["2", "Mar", "Martes"],
      ["3", "Mié", "Miércoles"],
      ["4", "Jue", "Jueves"],
      ["5", "Vie", "Viernes"],
      ["6", "Sáb", "Sábado"],
      ["7", "Dom", "Domingo"],
    ]);
  });
});

describe("targetOptions", () => {
  const nothing = { products: [], categories: [], tags: [] };
  const honey = { id: "product-1", name: "Miel pura de abeja 1 kg", saleUnit: "UNIT" } as const;
  const rice = { id: "product-3", name: "Arroz", saleUnit: "UNIT" } as const;
  const sinTacc = { id: "tag-1", name: "Sin TACC" };
  const vegano = { id: "tag-2", name: "Vegano" };
  const organico = { id: "tag-4", name: "Orgánico" };

  test("offers every product it is given, by name", () => {
    const options = targetOptions("PRODUCT", { ...nothing, products: [honey, rice] });

    expect(options).toEqual([
      { value: "product-3", label: "Arroz" },
      { value: "product-1", label: "Miel pura de abeja 1 kg" },
    ]);
  });

  test("offers every category with its path, parents before their children", () => {
    const options = targetOptions("CATEGORY", {
      ...nothing,
      categories: [jams, drinks, spreads, groceries],
    });

    expect(options?.map((option) => option.label)).toEqual([
      "Almacén",
      "Almacén › Untables",
      "Almacén › Untables › Mermeladas",
      "Bebidas",
    ]);
  });

  test("offers every tag it is given, by name", () => {
    const options = targetOptions("TAG", { ...nothing, tags: [vegano, sinTacc, organico] });

    expect(options?.map((option) => option.label)).toEqual(["Orgánico", "Sin TACC", "Vegano"]);
  });

  test("offers nothing when there is nothing of the kind to choose", () => {
    expect(targetOptions("PRODUCT", nothing)).toBeUndefined();
    expect(targetOptions("CATEGORY", nothing)).toBeUndefined();
    expect(targetOptions("TAG", nothing)).toBeUndefined();
  });

  test("keeps a current product that is not among the products offered, marked inactive", () => {
    const options = targetOptions(
      "PRODUCT",
      { ...nothing, products: [honey] },
      { kind: "PRODUCT", id: "gone", name: "Aceite" },
    );

    expect(options).toEqual([
      { value: "gone", label: "Aceite", status: "Inactivo" },
      { value: "product-1", label: "Miel pura de abeja 1 kg" },
    ]);
  });

  test("keeps a current tag that is not among the tags offered, marked inactive", () => {
    const options = targetOptions(
      "TAG",
      { ...nothing, tags: [sinTacc] },
      { kind: "TAG", id: "tag-3", name: "Sin colorantes" },
    );

    expect(options).toEqual([
      { value: "tag-3", label: "Sin colorantes", status: "Inactivo" },
      { value: "tag-1", label: "Sin TACC" },
    ]);
  });

  test("does not offer the current target of another kind", () => {
    const options = targetOptions(
      "TAG",
      { ...nothing, tags: [sinTacc] },
      { kind: "PRODUCT", id: "gone", name: "Aceite" },
    );

    expect(options).toEqual([{ value: "tag-1", label: "Sin TACC" }]);
  });

  test("does not list an offered current target twice", () => {
    const options = targetOptions(
      "PRODUCT",
      { ...nothing, products: [honey] },
      { kind: "PRODUCT", id: honey.id, name: honey.name },
    );

    expect(options).toEqual([{ value: "product-1", label: "Miel pura de abeja 1 kg" }]);
  });
});

describe("eligibleTargets", () => {
  test("offers a percentage promotion every target it is given", () => {
    expect(eligibleTargets("PERCENT_OFF", discountTargets)).toEqual(discountTargets);
  });

  test("offers a buy-N-pay-M promotion only the products sold by the unit", () => {
    expect(eligibleTargets("BUY_N_PAY_M", discountTargets)).toEqual({
      products: [yerbaProduct],
      categories: [],
      tags: [],
    });
  });
});

describe("targetForKind", () => {
  test("keeps a product sold by the unit when switching to buy-N-pay-M", () => {
    expect(targetForKind(filled, "BUY_N_PAY_M", discountTargets)).toEqual({
      targetKind: "PRODUCT",
      targetId: yerbaProduct.id,
    });
  });

  test("clears a product sold by weight when switching to buy-N-pay-M", () => {
    expect(
      targetForKind({ ...filled, targetId: almondsProduct.id }, "BUY_N_PAY_M", discountTargets),
    ).toEqual({ targetKind: "PRODUCT", targetId: null });
  });

  test("turns a category or a tag into an unchosen product when switching to buy-N-pay-M", () => {
    const category = { ...filled, targetKind: "CATEGORY", targetId: "category-1" } as const;

    expect(targetForKind(category, "BUY_N_PAY_M", discountTargets)).toEqual({
      targetKind: "PRODUCT",
      targetId: null,
    });
  });

  test("keeps the product when switching to a percentage, since it applies to any product", () => {
    expect(
      targetForKind({ ...threeForTwo, targetId: yerbaProduct.id }, "PERCENT_OFF", discountTargets),
    ).toEqual({ targetKind: "PRODUCT", targetId: yerbaProduct.id });
  });
});

describe("discountFormValues", () => {
  test("fills the form from a promotion, weekdays as the chips' values", () => {
    expect(discountFormValues(sinTaccWinter)).toEqual({
      name: "Sin TACC de invierno",
      benefitKind: "PERCENT_OFF",
      targetKind: "TAG",
      targetId: sinTaccWinter.target.id,
      percent: "20",
      buyQty: "",
      payQty: "",
      validFrom: new CalendarDate(2026, 12, 1),
      validTo: new CalendarDate(2027, 2, 28),
      weekdays: ["1", "3", "5"],
      active: true,
      version: 2,
    });
  });

  test("fills the quantities of a buy-N-pay-M promotion, leaving the percentage empty", () => {
    expect(discountFormValues(yerbaThreeForTwo)).toMatchObject({
      benefitKind: "BUY_N_PAY_M",
      targetKind: "PRODUCT",
      targetId: yerbaThreeForTwo.target.id,
      percent: "",
      buyQty: "3",
      payQty: "2",
    });
  });

  test("carries the switch and the version of a deactivated promotion", () => {
    expect(discountFormValues(switchedOffPromotion)).toMatchObject({ active: false, version: 4 });
  });

  test("leaves no weekday marked for a promotion that runs every day", () => {
    expect(discountFormValues(yerbaOff).weekdays).toEqual([]);
  });

  test("marks the weekdays of a promotion in week order", () => {
    expect(discountFormValues({ ...almacenTuesdays, weekdays: [5, 2] }).weekdays).toEqual([
      "2",
      "5",
    ]);
  });
});

describe("discountEditRequestFrom", () => {
  test("adds the loaded version and the switch to the request the cloud reads", () => {
    const request = discountEditRequestFrom(discountFormValues(switchedOffPromotion));

    expect(request).toEqual({
      name: "Aceite apagado",
      benefit: { kind: "PERCENT_OFF", percent: 30 },
      target: { kind: "PRODUCT", id: switchedOffPromotion.target.id },
      validFrom: "2026-09-01",
      validTo: "2026-10-15",
      weekdays: [],
      version: 4,
      active: false,
    });
    expect(discountEditBodySchema.safeParse(request).success).toBe(true);
  });

  test("sends the switch as it was left", () => {
    const values = { ...discountFormValues(yerbaOff), active: false };

    expect(discountEditRequestFrom(values).active).toBe(false);
  });
});
