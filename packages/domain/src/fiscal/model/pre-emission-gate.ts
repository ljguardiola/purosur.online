import type { BuyerTaxStatusOption } from "./buyer-tax-status-set.js";
import { selectConsumerBuyerTaxStatus } from "./consumer-buyer-tax-status.js";

export interface IssuerIdentificationInEffect {
  legalName: string | null;
  grossIncomeRegistration: string | null;
  activityStartDate: string | null;
  authorizedCuit: string;
  taxStatus: string;
  version: number;
}

interface FacturaCIssuer {
  legalName: string;
  cuit: string;
  taxStatus: string;
  grossIncomeRegistration: string;
  activityStartDate: string;
  version: number;
}

export interface FacturaC {
  invoiceClass: "C";
  total: number;
  netAmount: number;
  vatAmount: 0;
  issuer: FacturaCIssuer;
  buyerTaxStatusCode: number;
}

export type PreEmissionGateFailureReason =
  | "issuer_identification_missing"
  | "legal_name_missing"
  | "gross_income_registration_missing"
  | "activity_start_date_missing"
  | "buyer_tax_status_missing";

export type PreEmissionGateOutcome =
  | { kind: "passed"; document: FacturaC }
  | { kind: "failed"; reason: PreEmissionGateFailureReason };

export interface PreEmissionGateInput {
  total: number;
  issuer: IssuerIdentificationInEffect | undefined;
  buyerTaxStatuses: readonly BuyerTaxStatusOption[] | undefined;
}

function isPresent(value: string | null): value is string {
  return value !== null && value.trim() !== "";
}

function failed(reason: PreEmissionGateFailureReason): PreEmissionGateOutcome {
  return { kind: "failed", reason };
}

export function preEmissionGate({
  total,
  issuer,
  buyerTaxStatuses,
}: PreEmissionGateInput): PreEmissionGateOutcome {
  if (issuer === undefined) {
    return failed("issuer_identification_missing");
  }
  const { legalName, grossIncomeRegistration, activityStartDate } = issuer;
  if (!isPresent(legalName)) {
    return failed("legal_name_missing");
  }
  if (!isPresent(grossIncomeRegistration)) {
    return failed("gross_income_registration_missing");
  }
  if (!isPresent(activityStartDate)) {
    return failed("activity_start_date_missing");
  }
  const buyerTaxStatus = selectConsumerBuyerTaxStatus(buyerTaxStatuses ?? []);
  if (buyerTaxStatus === undefined) {
    return failed("buyer_tax_status_missing");
  }
  return {
    kind: "passed",
    document: {
      invoiceClass: "C",
      total,
      netAmount: total,
      vatAmount: 0,
      issuer: {
        legalName,
        cuit: issuer.authorizedCuit,
        taxStatus: issuer.taxStatus,
        grossIncomeRegistration,
        activityStartDate,
        version: issuer.version,
      },
      buyerTaxStatusCode: buyerTaxStatus.code,
    },
  };
}
