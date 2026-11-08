import type { StockCount, StockMovement } from "@purosur/contracts";

export type StockRecordKind = "count" | "adjustment" | "loss";

export type StockRecord = {
  id: string;
  kind: StockRecordKind;
  occurredAt: string;
  productName: string;
  brandName: string | null;
  netContent: StockCount["netContent"];
  categoryName: string;
  saleUnit: StockCount["saleUnit"];
  delta: number;
  superseded: boolean;
  detail:
    | { kind: "count"; expected: number; counted: number; lotCount: StockCount["lotCount"] }
    | { kind: "movement"; reason: StockMovement["reason"] };
};

function countRecord(count: StockCount): StockRecord {
  return {
    id: `count:${count.id}`,
    kind: "count",
    occurredAt: count.occurredAt,
    productName: count.productName,
    brandName: count.brandName,
    netContent: count.netContent,
    categoryName: count.categoryName,
    saleUnit: count.saleUnit,
    delta: count.delta,
    superseded: count.superseded,
    detail: {
      kind: "count",
      expected: count.expected,
      counted: count.counted,
      lotCount: count.lotCount,
    },
  };
}

function movementRecord(movement: StockMovement): StockRecord {
  return {
    id: `movement:${movement.id}`,
    kind: movement.kind,
    occurredAt: movement.occurredAt,
    productName: movement.productName,
    brandName: movement.brandName,
    netContent: movement.netContent,
    categoryName: movement.categoryName,
    saleUnit: movement.saleUnit,
    delta: movement.delta,
    superseded: movement.superseded,
    detail: { kind: "movement", reason: movement.reason },
  };
}

export function stockRecords(
  counts: readonly StockCount[],
  movements: readonly StockMovement[],
): StockRecord[] {
  return [...counts.map(countRecord), ...movements.map(movementRecord)];
}
