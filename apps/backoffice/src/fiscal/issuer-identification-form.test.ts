import { parseDate } from "@internationalized/date";
import { issuerIdentificationEditBodySchema } from "@purosur/contracts";
import { FICTIONAL_CUIT, FICTIONAL_LEGAL_NAME } from "@purosur/domain/fiscal/test-support";
import { expect, test } from "vitest";
import type { IssuerIdentification } from "./issuer-identification-api";
import {
  activityStartDateMessage,
  EMPTY_ISSUER_IDENTIFICATION_FORM,
  grossIncomeRegistrationMessage,
  issuerIdentificationFormValuesFrom,
  issuerIdentificationRequestFrom,
  latestActivityStartDate,
  legalNameMessage,
} from "./issuer-identification-form";

const complete: IssuerIdentification = {
  legalName: FICTIONAL_LEGAL_NAME,
  grossIncomeRegistration: "0000000-00",
  activityStartDate: "2019-03-01",
  authorizedCuit: FICTIONAL_CUIT,
  taxStatus: "Responsable Monotributo",
  version: 3,
};

const lateOnSeptember30InArgentina = new Date("2026-10-01T02:00:00Z");

test("fills the form with the identification's values and version", () => {
  expect(issuerIdentificationFormValuesFrom(complete)).toEqual({
    legalName: FICTIONAL_LEGAL_NAME,
    grossIncomeRegistration: "0000000-00",
    activityStartDate: parseDate("2019-03-01"),
    version: 3,
  });
});

test("fills the form empty for each value an incomplete identification lacks", () => {
  expect(
    issuerIdentificationFormValuesFrom({
      ...complete,
      legalName: null,
      grossIncomeRegistration: null,
      activityStartDate: null,
    }),
  ).toEqual({ ...EMPTY_ISSUER_IDENTIFICATION_FORM, version: 3 });
});

test("builds the request from the trimmed values, the chosen day and the version", () => {
  const request = issuerIdentificationRequestFrom({
    legalName: `  ${FICTIONAL_LEGAL_NAME} `,
    grossIncomeRegistration: " 0000000-00 ",
    activityStartDate: parseDate("2019-03-01"),
    version: 3,
  });

  expect(request).toEqual({
    legal_name: FICTIONAL_LEGAL_NAME,
    gross_income_registration: "0000000-00",
    activity_start_date: "2019-03-01",
    version: 3,
  });
  expect(
    issuerIdentificationEditBodySchema(lateOnSeptember30InArgentina).safeParse(request).success,
  ).toBe(true);
});

test("a request without a day is refused by the contract on the activity start date", () => {
  const result = issuerIdentificationEditBodySchema(lateOnSeptember30InArgentina).safeParse(
    issuerIdentificationRequestFrom({
      ...issuerIdentificationFormValuesFrom(complete),
      activityStartDate: null,
    }),
  );

  expect(result.error?.issues[0]?.path[0]).toBe("activity_start_date");
});

test.each([
  { legalName: " ", reason: "Ingresá la razón social." },
  { legalName: "a".repeat(201), reason: "Ingresá como mucho 200 caracteres." },
  { legalName: FICTIONAL_LEGAL_NAME, reason: "Revisá la razón social." },
])("a legal name of $legalName.length characters gets: $reason", ({ legalName, reason }) => {
  expect(legalNameMessage({ ...EMPTY_ISSUER_IDENTIFICATION_FORM, legalName })).toBe(reason);
});

test.each([
  { grossIncomeRegistration: " ", reason: "Ingresá el número de Ingresos Brutos." },
  { grossIncomeRegistration: "1".repeat(101), reason: "Ingresá como mucho 100 caracteres." },
  { grossIncomeRegistration: "0000000-00", reason: "Revisá el número de Ingresos Brutos." },
])(
  "an Ingresos Brutos registration of $grossIncomeRegistration.length characters gets: $reason",
  ({ grossIncomeRegistration, reason }) => {
    expect(
      grossIncomeRegistrationMessage({
        ...EMPTY_ISSUER_IDENTIFICATION_FORM,
        grossIncomeRegistration,
      }),
    ).toBe(reason);
  },
);

test.each([
  { day: null, reason: "Elegí la fecha de inicio de actividades." },
  { day: "2026-10-01", reason: "La fecha no puede ser futura." },
  { day: "2026-09-30", reason: "Revisá la fecha de inicio de actividades." },
])(
  "an activity start date of $day, on Argentina's September 30, gets: $reason",
  ({ day, reason }) => {
    const message = activityStartDateMessage(lateOnSeptember30InArgentina);

    expect(
      message({
        ...EMPTY_ISSUER_IDENTIFICATION_FORM,
        activityStartDate: day === null ? null : parseDate(day),
      }),
    ).toBe(reason);
  },
);

test("offers Argentina's day as the latest activity start date", () => {
  expect(latestActivityStartDate(lateOnSeptember30InArgentina)).toEqual(parseDate("2026-09-30"));
});
