import { CalendarDate } from "@internationalized/date";
import { freightBodySchema } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  EMPTY_FREIGHT_FORM,
  FREIGHT_FIELD_MESSAGES,
  FREIGHT_FIELDS,
  type FreightFormValues,
  freightFormValuesOf,
  freightPeriodOf,
  freightPeriodOptions,
  freightRequestFrom,
} from "./freight-form";
import {
  compraAndina,
  compraMolinos,
  envioDesdeBuenosAires,
  retiroEnElMolino,
} from "./test-support/freights";

function values(overrides: Partial<FreightFormValues> = {}): FreightFormValues {
  return {
    date: new CalendarDate(2026, 9, 12),
    amount: "18.500,00",
    ownTrip: false,
    carrierName: "Expreso Sur",
    description: "Envío desde Buenos Aires",
    purchaseIds: [compraAndina.id],
    ...overrides,
  };
}

describe("EMPTY_FREIGHT_FORM", () => {
  it("starts without a date, an amount, a means, a description or purchases", () => {
    expect(EMPTY_FREIGHT_FORM).toEqual({
      date: null,
      amount: "",
      ownTrip: false,
      carrierName: "",
      description: "",
      purchaseIds: [],
    });
  });
});

describe("freightRequestFrom", () => {
  it("builds the body of a freight carried by a carrier, trimming the texts", () => {
    expect(
      freightRequestFrom(
        values({
          carrierName: "  Expreso Sur ",
          description: " Envío desde Buenos Aires ",
          purchaseIds: [compraAndina.id, compraMolinos.id],
        }),
      ),
    ).toEqual({
      date: "2026-09-12",
      amountCents: 1_850_000,
      description: "Envío desde Buenos Aires",
      means: { kind: "carrier", name: "Expreso Sur" },
      purchaseIds: [compraAndina.id, compraMolinos.id],
    });
  });

  it("builds the store's own trip without the typed carrier", () => {
    expect(freightRequestFrom(values({ ownTrip: true })).means).toEqual({ kind: "own_trip" });
  });

  it("builds a body the contract accepts from complete values", () => {
    expect(freightBodySchema.safeParse(freightRequestFrom(values())).success).toBe(true);
  });

  const refusedValues: [string, Partial<FreightFormValues>][] = [
    ["a missing date", { date: null }],
    ["an amount that is not a number", { amount: "mucho" }],
    ["an amount of zero", { amount: "0" }],
    ["a missing carrier", { carrierName: "  " }],
    ["a missing description", { description: " " }],
    ["no purchase", { purchaseIds: [] }],
  ];

  it.each(refusedValues)("builds a body the contract refuses for %s", (_name, overrides) => {
    expect(freightBodySchema.safeParse(freightRequestFrom(values(overrides))).success).toBe(false);
  });

  it("does not need a carrier for the store's own trip", () => {
    expect(
      freightBodySchema.safeParse(freightRequestFrom(values({ ownTrip: true, carrierName: "" })))
        .success,
    ).toBe(true);
  });
});

describe("FREIGHT_FIELDS", () => {
  it("lands each problem of the body on the field that holds its value", () => {
    expect(FREIGHT_FIELDS).toMatchObject({
      date: "date",
      amountCents: "amount",
      description: "description",
      means: "carrierName",
      purchaseIds: "purchaseIds",
    });
  });
});

describe("freightFormValuesOf", () => {
  it("fills the form with a carried freight's date, amount, carrier, description and purchases", () => {
    expect(freightFormValuesOf(envioDesdeBuenosAires)).toEqual({
      date: new CalendarDate(2026, 9, 12),
      amount: "18500,00",
      ownTrip: false,
      carrierName: "Expreso Sur",
      description: "Envío desde Buenos Aires",
      purchaseIds: [compraAndina.id, compraMolinos.id],
    });
  });

  it("fills the form with a freight made on the store's own trip", () => {
    expect(freightFormValuesOf(retiroEnElMolino)).toMatchObject({
      ownTrip: true,
      carrierName: "",
      amount: "9000,00",
    });
  });

  it("builds again the body of the freight it was filled from", () => {
    expect(freightRequestFrom(freightFormValuesOf(envioDesdeBuenosAires))).toEqual({
      date: envioDesdeBuenosAires.date,
      amountCents: envioDesdeBuenosAires.amountCents,
      description: envioDesdeBuenosAires.description,
      means: envioDesdeBuenosAires.means,
      purchaseIds: envioDesdeBuenosAires.purchases.map((purchase) => purchase.id),
    });
  });
});

describe("FREIGHT_FIELD_MESSAGES", () => {
  it("asks for the date, and says it cannot be in the future once it is typed", () => {
    expect(FREIGHT_FIELD_MESSAGES.date(values({ date: null }))).toBe("Ingresá la fecha del flete.");
    expect(FREIGHT_FIELD_MESSAGES.date(values())).toBe(
      "La fecha del flete no puede ser posterior a hoy.",
    );
  });

  it("explains how to write an amount that is not a number", () => {
    expect(FREIGHT_FIELD_MESSAGES.amount(values({ amount: "mucho" }))).toBe(
      "Escribí el monto con coma para los centavos, por ejemplo 1.250,50.",
    );
  });

  it("says an amount of zero is not enough", () => {
    expect(FREIGHT_FIELD_MESSAGES.amount(values({ amount: "0" }))).toBe(
      "El monto tiene que ser mayor a cero.",
    );
  });

  it("says an amount is too large when it is a positive number", () => {
    expect(FREIGHT_FIELD_MESSAGES.amount(values({ amount: "999999999999,00" }))).toBe(
      "El monto es demasiado grande.",
    );
  });

  it("asks for the carrier, and says how long its name may be", () => {
    expect(FREIGHT_FIELD_MESSAGES.carrierName(values({ carrierName: " " }))).toBe(
      "Ingresá el medio del flete.",
    );
    expect(FREIGHT_FIELD_MESSAGES.carrierName(values({ carrierName: "a".repeat(500) }))).toMatch(
      /^El medio puede tener hasta \d+ caracteres\.$/,
    );
  });

  it("asks for the description, and says how long it may be", () => {
    expect(FREIGHT_FIELD_MESSAGES.description(values({ description: " " }))).toBe(
      "Ingresá la descripción del flete.",
    );
    expect(FREIGHT_FIELD_MESSAGES.description(values({ description: "a".repeat(2000) }))).toMatch(
      /^La descripción puede tener hasta \d+ caracteres\.$/,
    );
  });

  it("asks for at least one purchase", () => {
    expect(FREIGHT_FIELD_MESSAGES.purchaseIds(values({ purchaseIds: [] }))).toBe(
      "Elegí al menos una compra.",
    );
  });
});

describe("freightPeriodOptions", () => {
  it("offers each period the cloud lists freights for, the shortest first", () => {
    expect(freightPeriodOptions.map((option) => option.label)).toEqual([
      "Últimos 30 días",
      "Últimos 90 días",
      "Últimos 365 días",
    ]);
  });

  it("gives back the period an option stands for", () => {
    expect(freightPeriodOptions.map((option) => freightPeriodOf(option.value))).toEqual([
      30, 90, 365,
    ]);
  });

  it("falls back to no period for a value that is not an option", () => {
    expect(freightPeriodOf("7")).toBeUndefined();
  });
});
