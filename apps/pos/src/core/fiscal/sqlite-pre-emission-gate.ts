import {
  type BuyerTaxStatusOption,
  type IssuerIdentificationInEffect,
  latestBuyerTaxStatusSet,
  latestIssuerIdentification,
  type PreEmissionGateOutcome,
} from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";

interface IssuerRow {
  version: number;
  legal_name: string | null;
  gross_income_registration: string | null;
  activity_start_date: string | null;
  authorized_cuit: string;
  tax_status: string;
}

interface BuyerTaxStatusSetRow {
  params_version: number;
  options: string;
}

interface StoredBuyerTaxStatusOption {
  code: number;
  description: string;
  invoice_class: string;
}

export interface PreEmissionGateOutcomeRecord {
  saleId: string;
  evaluatedAt: Date;
  outcome: PreEmissionGateOutcome;
}

export function readIssuerIdentificationInEffect(
  database: LocalDatabase,
): IssuerIdentificationInEffect | undefined {
  const versions = database
    .prepare<[], IssuerRow>(
      `SELECT version, legal_name, gross_income_registration, activity_start_date,
              authorized_cuit, tax_status
       FROM issuer_identification_versions`,
    )
    .all()
    .map((row) => ({
      legalName: row.legal_name,
      grossIncomeRegistration: row.gross_income_registration,
      activityStartDate: row.activity_start_date,
      authorizedCuit: row.authorized_cuit,
      taxStatus: row.tax_status,
      version: row.version,
    }));
  return latestIssuerIdentification(versions);
}

export function readBuyerTaxStatusSetInEffect(
  database: LocalDatabase,
): readonly BuyerTaxStatusOption[] | undefined {
  const sets = database
    .prepare<[], BuyerTaxStatusSetRow>("SELECT params_version, options FROM buyer_tax_status_sets")
    .all()
    .map((row) => ({
      paramsVersion: row.params_version,
      options: (JSON.parse(row.options) as StoredBuyerTaxStatusOption[]).map((option) => ({
        code: option.code,
        description: option.description,
        invoiceClass: option.invoice_class,
      })),
    }));
  return latestBuyerTaxStatusSet(sets)?.options;
}

export function insertPreEmissionGateOutcome(
  database: LocalDatabase,
  { saleId, evaluatedAt, outcome }: PreEmissionGateOutcomeRecord,
): void {
  database
    .prepare(
      `INSERT INTO pre_emission_gate_outcomes (sale_id, evaluated_at, outcome, failure_reason, document)
       VALUES (@sale_id, @evaluated_at, @outcome, @failure_reason, @document)`,
    )
    .run({
      sale_id: saleId,
      evaluated_at: evaluatedAt.toISOString(),
      outcome: outcome.kind === "passed" ? "PASSED" : "FAILED",
      failure_reason: outcome.kind === "failed" ? outcome.reason : null,
      document: outcome.kind === "passed" ? JSON.stringify(outcome.document) : null,
    });
}
