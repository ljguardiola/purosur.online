import type { TaxAuthorityEvidence } from "../model/unclear-outcome-decision.js";
import type { TaxAuthorityLastAuthorizedLookup } from "./tax-authority-count-ports.js";
import type { TaxAuthorityVoucherLookup } from "./unclear-outcome-ports.js";
import type { WsaaToken } from "./wsaa-token-ports.js";

export async function taxAuthorityEvidenceOf(
  {
    vouchers,
    taxAuthority,
  }: { vouchers: TaxAuthorityVoucherLookup; taxAuthority: TaxAuthorityLastAuthorizedLookup },
  token: WsaaToken,
  voucher: { pointOfSale: number; voucherType: number; number: number },
): Promise<TaxAuthorityEvidence> {
  const { pointOfSale, voucherType } = voucher;
  const answer = await vouchers.voucherAt({ token, ...voucher });
  if (answer.kind === "found") {
    return { kind: "voucher", voucher: answer.voucher };
  }
  if (answer.kind === "no_answer") {
    return { kind: "no_answer" };
  }
  const lastAuthorized = await taxAuthority.lastAuthorized({ token, pointOfSale, voucherType });
  return {
    kind: "no_voucher",
    lastAuthorized: lastAuthorized.kind === "read" ? lastAuthorized.number : null,
  };
}
