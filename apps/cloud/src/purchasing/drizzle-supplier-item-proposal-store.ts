import { SALE_UNITS } from "@purosur/domain";
import type {
  AiCallRecord,
  KeptLinkProposal,
  KeptQuantityProposal,
  ProposalRecording,
  QuantityProposalShape,
  SupplierItemProposalStore,
} from "@purosur/domain/purchasing/use-cases";
import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  supplierItemLinkProposals,
  supplierItemQuantityProposals,
  supplierPriceListRows,
} from "../platform/db/schema.js";
import { insertAiCallRecords } from "./drizzle-ai-call-records.js";

function shapeCondition({ saleUnit, netContent }: QuantityProposalShape) {
  return and(
    eq(supplierItemQuantityProposals.saleUnit, saleUnit),
    netContent === null
      ? and(
          isNull(supplierItemQuantityProposals.netContentQuantity),
          isNull(supplierItemQuantityProposals.netContentUnit),
        )
      : and(
          eq(supplierItemQuantityProposals.netContentQuantity, netContent.quantity),
          eq(supplierItemQuantityProposals.netContentUnit, netContent.unit),
        ),
  );
}

function saleUnitOf(stored: string) {
  const saleUnit = SALE_UNITS.find((known) => known === stored);
  if (saleUnit === undefined) {
    throw new Error(`a kept link proposal has no known sale unit: ${stored}`);
  }
  return saleUnit;
}

async function rowStillExists<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  rowId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: supplierPriceListRows.id })
    .from(supplierPriceListRows)
    .where(eq(supplierPriceListRows.id, rowId))
    .for("key share");
  return row !== undefined;
}

export class DrizzleSupplierItemProposalStore<TQueryResult extends PgQueryResultHKT>
  implements SupplierItemProposalStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async keptLinkProposal(rowId: string): Promise<KeptLinkProposal | undefined> {
    const [kept] = await this.db
      .select()
      .from(supplierItemLinkProposals)
      .where(eq(supplierItemLinkProposals.rowId, rowId));
    if (!kept) {
      return undefined;
    }
    return {
      askedFrom: {
        description: kept.askedDescription,
        presentation: kept.askedPresentation,
        barcode: kept.askedBarcode,
        otherPresentations: kept.askedOtherPresentations,
      },
      answer:
        kept.productId === null || kept.saleUnit === null
          ? { kind: "none" }
          : {
              kind: "proposed",
              by: kept.proposedBy === "BARCODE" ? "barcode" : "ai",
              productId: kept.productId,
              saleUnit: saleUnitOf(kept.saleUnit),
              quantity: kept.quantity,
            },
    };
  }

  async keptQuantityProposal(
    rowId: string,
    shape: QuantityProposalShape,
  ): Promise<KeptQuantityProposal | undefined> {
    const [kept] = await this.db
      .select()
      .from(supplierItemQuantityProposals)
      .where(and(eq(supplierItemQuantityProposals.rowId, rowId), shapeCondition(shape)));
    if (!kept) {
      return undefined;
    }
    return {
      askedFrom: {
        description: kept.askedDescription,
        presentation: kept.askedPresentation,
        otherPresentations: kept.askedOtherPresentations,
      },
      answer:
        kept.quantity === null ? { kind: "none" } : { kind: "proposed", quantity: kept.quantity },
    };
  }

  recordLinkProposal(
    rowId: string,
    calls: AiCallRecord[],
    kept: KeptLinkProposal | null,
  ): Promise<ProposalRecording> {
    return this.db.transaction(async (tx) => {
      await insertAiCallRecords(tx, calls);
      if (kept === null) {
        return "recorded";
      }
      if (!(await rowStillExists(tx, rowId))) {
        return "row_gone";
      }
      const { askedFrom, answer } = kept;
      const stored = {
        askedDescription: askedFrom.description,
        askedPresentation: askedFrom.presentation,
        askedBarcode: askedFrom.barcode,
        askedOtherPresentations: askedFrom.otherPresentations,
        ...(answer.kind === "none"
          ? { kind: "NONE", productId: null, proposedBy: null, saleUnit: null, quantity: null }
          : {
              kind: "PROPOSED",
              productId: answer.productId,
              proposedBy: answer.by === "barcode" ? "BARCODE" : "AI",
              saleUnit: answer.saleUnit,
              quantity: answer.quantity,
            }),
      };
      await tx
        .insert(supplierItemLinkProposals)
        .values({ rowId, ...stored })
        .onConflictDoUpdate({ target: supplierItemLinkProposals.rowId, set: stored });
      return "recorded";
    });
  }

  recordQuantityProposal(
    rowId: string,
    { saleUnit, netContent }: QuantityProposalShape,
    calls: AiCallRecord[],
    kept: KeptQuantityProposal | null,
  ): Promise<ProposalRecording> {
    return this.db.transaction(async (tx) => {
      await insertAiCallRecords(tx, calls);
      if (kept === null) {
        return "recorded";
      }
      if (!(await rowStillExists(tx, rowId))) {
        return "row_gone";
      }
      const { askedFrom, answer } = kept;
      const stored = {
        askedDescription: askedFrom.description,
        askedPresentation: askedFrom.presentation,
        askedOtherPresentations: askedFrom.otherPresentations,
        ...(answer.kind === "none"
          ? { kind: "NONE", quantity: null }
          : { kind: "PROPOSED", quantity: answer.quantity }),
      };
      await tx
        .insert(supplierItemQuantityProposals)
        .values({
          rowId,
          saleUnit,
          netContentQuantity: netContent?.quantity ?? null,
          netContentUnit: netContent?.unit ?? null,
          ...stored,
        })
        .onConflictDoUpdate({
          target: [
            supplierItemQuantityProposals.rowId,
            supplierItemQuantityProposals.saleUnit,
            supplierItemQuantityProposals.netContentQuantity,
            supplierItemQuantityProposals.netContentUnit,
          ],
          set: stored,
        });
      return "recorded";
    });
  }
}
