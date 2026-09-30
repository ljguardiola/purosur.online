import { CalendarDate } from "@internationalized/date";
import { discountCreationBodySchema } from "@purosur/contracts";
import { DISCOUNT_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, test } from "vitest";
import { drinks, groceries, jams, spreads } from "../catalog/test-support/categories";
import { almonds, honey } from "../catalog/test-support/products";
import { organico, sinColorantes, sinTacc, vegano } from "../catalog/test-support/tags";
import {
  DISCOUNT_KIND_CARDS,
  DISCOUNT_MESSAGES,
  DISCOUNT_TARGET_KIND_OPTIONS,
  type DiscountFormValues,
  discountRequestFrom,
  EMPTY_DISCOUNT_FORM,
  targetOptions,
  targetPlaceholder,
  targetUnavailableMessage,
  WEEKDAY_OPTIONS,
} from "./discount-form";

const filled: DiscountFormValues = {
  name: "  Yerba de septiembre ",
  benefitKind: "PERCENT_OFF",
  targetKind: "PRODUCT",
  targetId: "7a1f3c1e-4f6a-4d0e-9d6e-000000000101",
  percent: " 15 ",
  validFrom: new CalendarDate(2026, 9, 12),
  validTo: new CalendarDate(2026, 9, 30),
  weekdays: ["1", "3"],
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
  test("offers one kind card, the percentage one", () => {
    expect(
      DISCOUNT_KIND_CARDS.map(({ value, label, description }) => [value, label, description]),
    ).toEqual([
      [
        "PERCENT_OFF",
        "Porcentaje de descuento",
        "Sobre un producto, una categoría o un distintivo",
      ],
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

  test("offers the active products by name", () => {
    const options = targetOptions("PRODUCT", {
      ...nothing,
      products: [
        honey,
        { ...almonds, active: false },
        { ...honey, id: "product-3", name: "Arroz" },
      ],
    });

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

  test("offers the active tags by name", () => {
    const options = targetOptions("TAG", {
      ...nothing,
      tags: [vegano, sinColorantes, sinTacc, organico],
    });

    expect(options?.map((option) => option.label)).toEqual(["Orgánico", "Sin TACC", "Vegano"]);
  });

  test("offers nothing when there is nothing of the kind to choose", () => {
    expect(targetOptions("PRODUCT", nothing)).toBeUndefined();
    expect(targetOptions("CATEGORY", nothing)).toBeUndefined();
    expect(targetOptions("TAG", nothing)).toBeUndefined();
  });

  test("keeps an inactive target that is the current value, marked inactive", () => {
    const inactive = { ...almonds, active: false };

    const options = targetOptions(
      "PRODUCT",
      { ...nothing, products: [honey, inactive] },
      { kind: "PRODUCT", id: inactive.id, name: inactive.name },
    );

    expect(options).toEqual([
      { value: "product-2", label: "Almendras peladas", status: "Inactivo" },
      { value: "product-1", label: "Miel pura de abeja 1 kg" },
    ]);
  });

  test("keeps an inactive tag that is the current value, marked inactive", () => {
    const options = targetOptions(
      "TAG",
      { ...nothing, tags: [sinTacc, sinColorantes] },
      { kind: "TAG", id: sinColorantes.id, name: sinColorantes.name },
    );

    expect(options).toEqual([
      { value: "tag-3", label: "Sin colorantes", status: "Inactivo" },
      { value: "tag-1", label: "Sin TACC" },
    ]);
  });

  test("keeps a current product that is not among the products read at all, marked inactive", () => {
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

  test("does not offer the current target of another kind", () => {
    const options = targetOptions(
      "TAG",
      { ...nothing, tags: [sinTacc] },
      { kind: "PRODUCT", id: "gone", name: "Aceite" },
    );

    expect(options).toEqual([{ value: "tag-1", label: "Sin TACC" }]);
  });

  test("does not list an active current target twice", () => {
    const options = targetOptions(
      "PRODUCT",
      { ...nothing, products: [honey] },
      { kind: "PRODUCT", id: honey.id, name: honey.name },
    );

    expect(options).toEqual([{ value: "product-1", label: "Miel pura de abeja 1 kg" }]);
  });
});
