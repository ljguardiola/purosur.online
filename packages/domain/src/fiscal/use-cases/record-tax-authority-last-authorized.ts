import type { FiscalTaskDocumentType } from "../model/fiscal-task.js";
import { voucherTypeOfDocumentType } from "../model/fiscal-voucher-type.js";
import type { TaxAuthorityCountPorts } from "./tax-authority-count-ports.js";

export interface RecordTaxAuthorityLastAuthorizedInput {
  pointOfSale: number;
  documentType: FiscalTaskDocumentType;
}

export type RecordTaxAuthorityLastAuthorizedOutcome =
  | { kind: "recorded" }
  | { kind: "no_token" }
  | { kind: "no_answer" };

export async function recordTaxAuthorityLastAuthorized(
  { tokens, taxAuthority, vouchers, counts, clock }: TaxAuthorityCountPorts,
  { pointOfSale, documentType }: RecordTaxAuthorityLastAuthorizedInput,
): Promise<RecordTaxAuthorityLastAuthorizedOutcome> {
  const voucherType = voucherTypeOfDocumentType(documentType);
  const token = await tokens.validToken();
  if (token === null) {
    return { kind: "no_token" };
  }
  const answer = await taxAuthority.lastAuthorized({
    token,
    pointOfSale,
    voucherType,
  });
  if (answer.kind === "no_answer") {
    return { kind: "no_answer" };
  }
  let issuedOn: string | null = null;
  if (answer.number > 0) {
    const voucher = await vouchers.voucherAt({
      token,
      pointOfSale,
      voucherType,
      number: answer.number,
    });
    issuedOn = voucher.kind === "found" ? voucher.voucher.issuedOn : null;
  }
  await counts.advance({
    pointOfSale,
    documentType,
    lastAuthorized: answer.number,
    issuedOn,
    readAt: clock.now(),
  });
  return { kind: "recorded" };
}
