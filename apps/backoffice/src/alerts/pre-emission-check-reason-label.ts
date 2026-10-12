import type { PreEmissionGateFailureReason } from "@purosur/domain";

const PRE_EMISSION_CHECK_REASON_LABELS = {
  issuer_identification_missing: "Falta la identificación fiscal del emisor",
  legal_name_missing: "Falta la razón social del emisor",
  gross_income_registration_missing: "Falta la inscripción en Ingresos Brutos del emisor",
  activity_start_date_missing: "Falta la fecha de inicio de actividades del emisor",
  buyer_tax_status_missing: "Falta la condición del Consumidor Final ante el IVA",
} satisfies Record<PreEmissionGateFailureReason, string>;

export function preEmissionCheckReasonLabel(reason: PreEmissionGateFailureReason): string {
  return PRE_EMISSION_CHECK_REASON_LABELS[reason];
}
