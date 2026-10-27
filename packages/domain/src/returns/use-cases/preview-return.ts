import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import {
  assessReturnDraft,
  type ReturnDraftLine,
  type ReturnLineAssessment,
  refundableTotal,
} from "../model/return-draft.js";
import { returnSaleLines } from "../model/return-sale.js";
import type { ReturnSaleReader } from "./return-ports.js";

export interface PreviewReturnInput {
  saleId: string;
  lines: readonly ReturnDraftLine[];
}

export interface PreviewReturnPorts {
  reader: ReturnSaleReader;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}

export type PreviewReturnOutcome =
  | { kind: "not_found" }
  | { kind: "sale_not_returnable" }
  | { kind: "previewed"; lines: ReturnLineAssessment[]; refundableTotal: number };

export function previewReturn(
  { reader, clock, zoneRules }: PreviewReturnPorts,
  { saleId, lines }: PreviewReturnInput,
): PreviewReturnOutcome {
  const facts = reader.saleForReturn({ kind: "sale", saleId });
  if (facts === undefined) {
    return { kind: "not_found" };
  }
  if (facts.sale.state !== "COMPLETED") {
    return { kind: "sale_not_returnable" };
  }
  const assessed = assessReturnDraft(
    {
      soldAt: facts.occurredAt,
      goodConditionReturnDays: reader.goodConditionReturnDays(),
      now: clock.now(),
      rules: zoneRules.zoneRules(),
      lines: returnSaleLines(facts),
    },
    lines,
  );
  return { kind: "previewed", lines: assessed, refundableTotal: refundableTotal(assessed) };
}
