import { FACTURA_C_VOUCHER_TYPE } from "../model/factura-c-fiscal-block.js";
import {
  type LocalStanding,
  otherVoucherToKeep,
  requestBehindVoucher,
} from "../model/orphan-authorization.js";
import type { TaxAuthorityVoucher } from "../model/unclear-outcome-decision.js";
import type { AuthorizationNumber, OrphanStandingReader } from "./orphan-authorization-ports.js";

export async function localStandingBehindVoucher(
  reader: OrphanStandingReader,
  authorization: AuthorizationNumber,
  voucher: TaxAuthorityVoucher,
): Promise<LocalStanding> {
  const atNumber = await reader.requestsAtNumber(authorization);
  if (atNumber.kind === "already_regularized") {
    return atNumber;
  }
  const request = requestBehindVoucher(voucher, atNumber.requests);
  if (request === null) {
    return { kind: "no_local_sale" };
  }
  return {
    kind: "local_sale",
    saleId: request.saleId,
    otherAuthorizedVoucher: otherVoucherToKeep(
      { voucherType: FACTURA_C_VOUCHER_TYPE, ...authorization },
      {
        otherDocuments: await reader.otherDocumentsOfSale(request.saleId, request.fiscalDocumentId),
        creditNotes: await reader.creditNotesOfSale(request.saleId),
      },
    ),
  };
}
