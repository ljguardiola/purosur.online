import { parseDate } from "@internationalized/date";
import { buyerIdentificationThresholdRecordBodySchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import {
  amountMessage,
  EMPTY_THRESHOLD_FORM,
  notAfterLatestMessage,
  thresholdRequestFrom,
  validFromMessage,
} from "./buyer-identification-threshold-form";

test("builds the request from the typed amount and the chosen day, in cents", () => {
  const request = thresholdRequestFrom({
    amount: "15.000,50",
    validFrom: parseDate("2026-10-01"),
  });

  expect(request).toEqual({ amount: 1_500_050, valid_from: "2026-10-01" });
  expect(buyerIdentificationThresholdRecordBodySchema.safeParse(request).success).toBe(true);
});

test.each([
  ["no amount", { amount: "", validFrom: parseDate("2026-10-01") }, "amount"],
  [
    "an amount that is not a number",
    { amount: "mucho", validFrom: parseDate("2026-10-01") },
    "amount",
  ],
  ["no day", { amount: "100", validFrom: null }, "valid_from"],
])("a request with %s is refused by the contract, naming %s", (_case, values, field) => {
  const result = buyerIdentificationThresholdRecordBodySchema.safeParse(
    thresholdRequestFrom(values),
  );

  expect(result.error?.issues[0]?.path[0]).toBe(field);
});

test.each([
  { amount: "", reason: "Ingresá el importe del umbral." },
  {
    amount: "12.50",
    reason: "Escribí el importe con coma para los decimales, por ejemplo 7.500,50.",
  },
  { amount: "0", reason: "Ingresá un importe mayor a cero." },
])("a typed amount of '$amount' can't be saved: $reason", ({ amount, reason }) => {
  expect(amountMessage({ ...EMPTY_THRESHOLD_FORM, amount })).toBe(reason);
});

test("an amount the cloud refuses with a valid shape asks to review it", () => {
  expect(amountMessage({ ...EMPTY_THRESHOLD_FORM, amount: "100" })).toBe("Revisá el importe.");
});

test("an amount above zero the contract refuses asks to review it, never for one above zero", () => {
  expect(amountMessage({ ...EMPTY_THRESHOLD_FORM, amount: "999.999.999.999.999,00" })).toBe(
    "Revisá el importe.",
  );
});

test("asks to choose the day when none was chosen, and to review it otherwise", () => {
  expect(validFromMessage(EMPTY_THRESHOLD_FORM)).toBe("Elegí desde cuándo rige el umbral.");
  expect(validFromMessage({ ...EMPTY_THRESHOLD_FORM, validFrom: parseDate("2026-10-01") })).toBe(
    "Revisá la fecha.",
  );
});

test("names the start of the latest threshold, written dd/mm/aaaa", () => {
  expect(notAfterLatestMessage("2026-10-01")).toBe(
    "Tiene que ser posterior al 01/10/2026, el inicio del último umbral cargado.",
  );
});
