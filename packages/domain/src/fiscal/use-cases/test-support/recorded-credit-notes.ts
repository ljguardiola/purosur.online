import type { OrphanRegularization, SaleCreditNote } from "../../model/orphan-authorization.js";

export function creditNotesRecordedFor(
  saleId: string,
  regularizations: readonly (OrphanRegularization | null)[],
): SaleCreditNote[] {
  return regularizations.flatMap((regularization) =>
    regularization?.kind === "credit_note" && regularization.saleId === saleId
      ? [
          {
            creditedVoucher: regularization.associatedVoucher,
            keptVoucher: regularization.keptVoucher,
          },
        ]
      : [],
  );
}
