import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import {
  type DeferredSaleInvoice,
  deferredSaleAvailability,
} from "../model/deferred-sale-lookup.js";
import type { DeferredSaleLine, DeferredSaleLookup } from "./deferred-sale-lookup-ports.js";

export type FindDeferredSaleInput =
  | { kind: "short_code"; shortCode: string }
  | { kind: "reference"; id: string; shortCode: string };

export interface FindDeferredSalePorts {
  lookup: DeferredSaleLookup;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}

export type FindDeferredSaleOutcome =
  | { kind: "not_found" }
  | { kind: "voided" }
  | { kind: "expired" }
  | { kind: "out_of_date_order" }
  | {
      kind: "found";
      saleId: string;
      occurredAt: Date;
      total: number;
      shortCode: string;
      invoice: DeferredSaleInvoice;
      originalPrinted: boolean;
      lines: DeferredSaleLine[];
      itemCount: number;
    };

export function findDeferredSale(
  { lookup, clock, zoneRules }: FindDeferredSalePorts,
  input: FindDeferredSaleInput,
): FindDeferredSaleOutcome {
  const facts = lookup.find(input);
  if (facts === null) {
    return { kind: "not_found" };
  }
  const availability = deferredSaleAvailability(facts, clock.now(), zoneRules.zoneRules());
  if (availability !== "available") {
    return { kind: availability };
  }
  const lines = lookup.linesOf(facts.saleId);
  return {
    kind: "found",
    saleId: facts.saleId,
    occurredAt: facts.occurredAt,
    total: facts.total,
    shortCode: facts.shortCode,
    invoice: facts.invoice,
    originalPrinted: facts.originalPrintAttempted,
    lines,
    itemCount: lines.length,
  };
}
