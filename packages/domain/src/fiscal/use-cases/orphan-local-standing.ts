import { FACTURA_C_VOUCHER_TYPE } from "../model/factura-c-fiscal-block.js";
import {
  creditNotesDecidedFor,
  type LocalRequestAtNumber,
  type LocalStanding,
  type OrphanRegularization,
  otherVoucherToKeep,
  requestBehindVoucher,
  type VoucherReference,
  withVouchersConfirmedAuthorized,
} from "../model/orphan-authorization.js";
import type { TaxAuthorityVoucher } from "../model/unclear-outcome-decision.js";
import type { AuthorizationNumber, OrphanStandingReader } from "./orphan-authorization-ports.js";

export type RequestBehindAuthorization =
  | { kind: "request"; request: LocalRequestAtNumber }
  | { kind: "no_local_sale" }
  | { kind: "already_regularized" };

export interface StandingOfPass {
  confirmedVouchers: readonly { saleId: string; voucher: VoucherReference }[];
  regularizations: readonly OrphanRegularization[];
}

const NOTHING_DECIDED_IN_PASS: StandingOfPass = { confirmedVouchers: [], regularizations: [] };

export async function requestBehindAuthorization(
  reader: OrphanStandingReader,
  authorization: AuthorizationNumber,
  voucher: TaxAuthorityVoucher,
): Promise<RequestBehindAuthorization> {
  const atNumber = await reader.requestsAtNumber(authorization);
  if (atNumber.kind === "already_regularized") {
    return atNumber;
  }
  const request = requestBehindVoucher(voucher, atNumber.requests);
  return request === null ? { kind: "no_local_sale" } : { kind: "request", request };
}

export async function localStandingOfRequest(
  reader: OrphanStandingReader,
  authorization: AuthorizationNumber,
  behind: RequestBehindAuthorization,
  pass: StandingOfPass = NOTHING_DECIDED_IN_PASS,
): Promise<LocalStanding> {
  if (behind.kind !== "request") {
    return behind;
  }
  const { request } = behind;
  const voucher = { voucherType: FACTURA_C_VOUCHER_TYPE, ...authorization };
  return {
    kind: "local_sale",
    saleId: request.saleId,
    otherAuthorizedVoucher: otherVoucherToKeep(voucher, {
      otherDocuments: withVouchersConfirmedAuthorized(
        voucher,
        await reader.otherDocumentsOfSale(request.saleId, request.fiscalDocumentId),
        pass.confirmedVouchers.flatMap(({ saleId, voucher: confirmed }) =>
          saleId === request.saleId ? [confirmed] : [],
        ),
      ),
      creditNotes: [
        ...(await reader.creditNotesOfSale(request.saleId)),
        ...creditNotesDecidedFor(request.saleId, pass.regularizations),
      ],
    }),
  };
}

export async function localStandingBehindVoucher(
  reader: OrphanStandingReader,
  authorization: AuthorizationNumber,
  voucher: TaxAuthorityVoucher,
): Promise<LocalStanding> {
  return localStandingOfRequest(
    reader,
    authorization,
    await requestBehindAuthorization(reader, authorization, voucher),
  );
}
