import { PRE_EMISSION_GATE_FAILURE_REASONS } from "@purosur/domain";
import { expect, test } from "vitest";
import { preEmissionCheckReasonLabel } from "./pre-emission-check-reason-label";

test.each([
  ["issuer_identification_missing", "Falta la identificación fiscal del emisor"],
  ["legal_name_missing", "Falta la razón social del emisor"],
  ["gross_income_registration_missing", "Falta la inscripción en Ingresos Brutos del emisor"],
  ["activity_start_date_missing", "Falta la fecha de inicio de actividades del emisor"],
  ["buyer_tax_status_missing", "Falta la condición del Consumidor Final ante el IVA"],
] as const)("says in plain Spanish that the check failed because of %s", (reason, label) => {
  expect(preEmissionCheckReasonLabel(reason)).toBe(label);
});

test("words every reason the check can fail for", () => {
  for (const reason of PRE_EMISSION_GATE_FAILURE_REASONS) {
    expect(preEmissionCheckReasonLabel(reason)).not.toBe("");
  }
});
