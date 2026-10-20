import { chargeLine } from "./line-pricing.js";
import type { ManualAdjustmentValue } from "./manual-adjustment.js";
import { codeUnitOrder, nameOrder } from "./report-order.js";
import type { SaleDiscountValue } from "./sale-discount.js";
import { grossLineTotal, saleUnitOfWeightSource, soldQuantity } from "./sale-line.js";
import type { WeightSource } from "./weight-source.js";

interface ManualDiscountOrigin {
  saleId: string;
  operationNumber: number | null;
  completedAt: Date;
  actorId: string;
  actorName: string | null;
  authorizedBy: string | null;
  authorizedByName: string | null;
  reason: string;
}

export interface SaleDiscountRecord extends ManualDiscountOrigin {
  discount: SaleDiscountValue;
  amount: number;
}

export interface LineDiscountRecord extends ManualDiscountOrigin {
  lineId: string;
  productName: string;
  quantity: number;
  weightSource: WeightSource | null;
  listUnitPrice: number;
  adjustment: ManualAdjustmentValue;
}

export interface ManualDiscountRecords {
  saleDiscounts: SaleDiscountRecord[];
  lineDiscounts: LineDiscountRecord[];
}

export interface DiscountAuthorizer {
  id: string;
  name: string | null;
}

export interface ManualDiscountRow {
  saleId: string;
  operationNumber: number | null;
  completedAt: Date;
  kind: "SALE" | "LINE";
  lineId: string | null;
  productName: string | null;
  adjustment: ManualAdjustmentValue;
  reason: string;
  authorizer: DiscountAuthorizer;
  discounted: number;
}

export interface ManualDiscountTotals {
  discounted: number;
  count: number;
  lineCount: number;
  saleCount: number;
  mostAuthorized: { id: string; name: string | null; count: number } | null;
}

function authorizerOf(origin: ManualDiscountOrigin): DiscountAuthorizer {
  return origin.authorizedBy === null
    ? { id: origin.actorId, name: origin.actorName }
    : { id: origin.authorizedBy, name: origin.authorizedByName };
}

function lineDiscounted(record: LineDiscountRecord): number {
  const line = {
    quantity: record.quantity,
    saleUnit: saleUnitOfWeightSource(record.weightSource),
    listUnitPrice: record.listUnitPrice,
  };
  const charged = chargeLine(soldQuantity(line), line.listUnitPrice, [], record.adjustment);
  return grossLineTotal(line) - charged.lineTotal;
}

function rowOfSale(record: SaleDiscountRecord): ManualDiscountRow {
  return {
    saleId: record.saleId,
    operationNumber: record.operationNumber,
    completedAt: record.completedAt,
    kind: "SALE",
    lineId: null,
    productName: null,
    adjustment: record.discount,
    reason: record.reason,
    authorizer: authorizerOf(record),
    discounted: record.amount,
  };
}

function rowOfLine(record: LineDiscountRecord): ManualDiscountRow {
  return {
    saleId: record.saleId,
    operationNumber: record.operationNumber,
    completedAt: record.completedAt,
    kind: "LINE",
    lineId: record.lineId,
    productName: record.productName,
    adjustment: record.adjustment,
    reason: record.reason,
    authorizer: authorizerOf(record),
    discounted: lineDiscounted(record),
  };
}

function lineKey(row: ManualDiscountRow): string {
  return row.lineId ?? "";
}

function newestFirst(a: ManualDiscountRow, b: ManualDiscountRow): number {
  return (
    b.completedAt.getTime() - a.completedAt.getTime() ||
    codeUnitOrder(a.saleId, b.saleId) ||
    codeUnitOrder(lineKey(a), lineKey(b))
  );
}

export function manualDiscountRows({
  saleDiscounts,
  lineDiscounts,
}: ManualDiscountRecords): ManualDiscountRow[] {
  return [
    ...saleDiscounts.map(rowOfSale),
    ...lineDiscounts.map(rowOfLine).filter((row) => row.discounted > 0),
  ].sort(newestFirst);
}

function byName(a: DiscountAuthorizer, b: DiscountAuthorizer): number {
  return nameOrder(a.name, b.name) || codeUnitOrder(a.id, b.id);
}

export function manualDiscountAuthorizers(
  rows: readonly ManualDiscountRow[],
): DiscountAuthorizer[] {
  const authorizers = new Map<string, DiscountAuthorizer>();
  for (const { authorizer } of rows) {
    authorizers.set(authorizer.id, authorizer);
  }
  return [...authorizers.values()].sort(byName);
}

interface AuthorizerTally extends DiscountAuthorizer {
  count: number;
  discounted: number;
}

function mostAuthorizedOrder(a: AuthorizerTally, b: AuthorizerTally): number {
  return b.count - a.count || b.discounted - a.discounted || byName(a, b);
}

export function manualDiscountTotals(rows: readonly ManualDiscountRow[]): ManualDiscountTotals {
  const tallies = new Map<string, AuthorizerTally>();
  for (const { authorizer, discounted } of rows) {
    const tally = tallies.get(authorizer.id) ?? { ...authorizer, count: 0, discounted: 0 };
    tallies.set(authorizer.id, {
      ...tally,
      count: tally.count + 1,
      discounted: tally.discounted + discounted,
    });
  }
  const [most] = [...tallies.values()].sort(mostAuthorizedOrder);
  const lineCount = rows.filter((row) => row.kind === "LINE").length;
  return {
    discounted: rows.reduce((sum, row) => sum + row.discounted, 0),
    count: rows.length,
    lineCount,
    saleCount: rows.length - lineCount,
    mostAuthorized: most === undefined ? null : { id: most.id, name: most.name, count: most.count },
  };
}
