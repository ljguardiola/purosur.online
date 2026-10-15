import {
  diagnoseNumberingConflict as diagnose,
  isNumberingConflictAnswer,
  NUMBERING_CONFLICT_REASK_INTERVAL_MS,
  type NumberingConflictDiagnosis,
} from "../model/numbering-conflict.js";
import type {
  DiagnoseNumberingConflictPorts,
  NumberingFreeze,
} from "./numbering-conflict-ports.js";

export interface DiagnoseNumberingConflictInput {
  fiscalDocumentId: string;
}

export type DiagnoseNumberingConflictOutcome =
  | { kind: "date_behind" }
  | { kind: "collision"; freeze: "frozen" | "already_frozen" }
  | { kind: "already_diagnosed"; diagnosis: NumberingConflictDiagnosis }
  | { kind: "not_a_numbering_conflict" }
  | { kind: "not_found" }
  | { kind: "retry"; askAgainAt: Date };

export async function diagnoseNumberingConflict(
  { requests, lanes, clock, tokens, vouchers, taxAuthority }: DiagnoseNumberingConflictPorts,
  { fiscalDocumentId }: DiagnoseNumberingConflictInput,
): Promise<DiagnoseNumberingConflictOutcome> {
  const pointOfSale = await requests.pointOfSaleOf(fiscalDocumentId);
  if (pointOfSale === null) {
    return { kind: "not_found" };
  }

  return lanes.inPointOfSaleLane<DiagnoseNumberingConflictOutcome>(pointOfSale, async (lane) => {
    const request = await lane.numberingConflictRequest(fiscalDocumentId);
    if (request === null) {
      return { kind: "not_found" };
    }
    if (!isNumberingConflictAnswer(request)) {
      return { kind: "not_a_numbering_conflict" };
    }
    if (request.diagnosis !== null) {
      return { kind: "already_diagnosed", diagnosis: request.diagnosis };
    }

    const retry = (): DiagnoseNumberingConflictOutcome => ({
      kind: "retry",
      askAgainAt: new Date(clock.now().getTime() + NUMBERING_CONFLICT_REASK_INTERVAL_MS),
    });
    const token = await tokens.validToken();
    if (token === null) {
      return retry();
    }
    const lastAuthorized = await taxAuthority.lastAuthorized({ token, pointOfSale });
    if (lastAuthorized.kind === "no_answer") {
      return retry();
    }
    let lastAuthorizedIssuedOn: string | null = null;
    if (lastAuthorized.number > 0) {
      const voucher = await vouchers.voucherAt({
        token,
        pointOfSale,
        number: lastAuthorized.number,
      });
      if (voucher.kind === "no_answer") {
        return retry();
      }
      lastAuthorizedIssuedOn = voucher.kind === "found" ? voucher.voucher.issuedOn : null;
    }

    const diagnosis = diagnose({
      number: request.number,
      issuedOn: request.issuedOn,
      lastAuthorized: lastAuthorized.number,
      lastAuthorizedIssuedOn,
    });
    const diagnosedAt = clock.now();
    if (diagnosis.kind === "date_behind") {
      await lane.recordNumberingDiagnosis({
        fiscalDocumentId,
        diagnosis,
        diagnosedAt,
        freeze: null,
      });
      return diagnosis;
    }
    const freeze: NumberingFreeze | null =
      (await lane.numberingFreeze()) === null
        ? { countBeforeFreeze: await lane.taxAuthorityCount(), frozenAt: diagnosedAt }
        : null;
    await lane.recordNumberingDiagnosis({ fiscalDocumentId, diagnosis, diagnosedAt, freeze });
    return { kind: "collision", freeze: freeze === null ? "already_frozen" : "frozen" };
  });
}
