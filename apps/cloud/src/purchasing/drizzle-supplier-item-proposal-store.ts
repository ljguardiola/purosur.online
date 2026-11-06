import type {
  KeptLinkProposal,
  KeptQuantityProposal,
  QuantityProposalShape,
  SupplierItemProposalStore,
} from "@purosur/domain/purchasing/use-cases";
import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { supplierItemLinkProposals, supplierItemQuantityProposals } from "../platform/db/schema.js";

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
    return kept.productId === null
      ? { kind: "none" }
      : {
          kind: "proposed",
          by: kept.proposedBy === "BARCODE" ? "barcode" : "ai",
          productId: kept.productId,
          quantity: kept.quantity,
        };
  }

  async keepLinkProposal(rowId: string, proposal: KeptLinkProposal): Promise<void> {
    const stored =
      proposal.kind === "none"
        ? { kind: "NONE", productId: null, proposedBy: null, quantity: null }
        : {
            kind: "PROPOSED",
            productId: proposal.productId,
            proposedBy: proposal.by === "barcode" ? "BARCODE" : "AI",
            quantity: proposal.quantity,
          };
    await this.db
      .insert(supplierItemLinkProposals)
      .values({ rowId, ...stored })
      .onConflictDoUpdate({ target: supplierItemLinkProposals.rowId, set: stored });
  }

  async keptQuantityProposal(
    rowId: string,
    shape: QuantityProposalShape,
  ): Promise<KeptQuantityProposal | undefined> {
    const [kept] = await this.db
      .select({ quantity: supplierItemQuantityProposals.quantity })
      .from(supplierItemQuantityProposals)
      .where(and(eq(supplierItemQuantityProposals.rowId, rowId), shapeCondition(shape)));
    if (!kept) {
      return undefined;
    }
    return kept.quantity === null
      ? { kind: "none" }
      : { kind: "proposed", quantity: kept.quantity };
  }

  async keepQuantityProposal(
    rowId: string,
    { saleUnit, netContent }: QuantityProposalShape,
    proposal: KeptQuantityProposal,
  ): Promise<void> {
    const stored =
      proposal.kind === "none"
        ? { kind: "NONE", quantity: null }
        : { kind: "PROPOSED", quantity: proposal.quantity };
    await this.db
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
  }
}
