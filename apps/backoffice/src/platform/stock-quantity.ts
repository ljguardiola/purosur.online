import { stockCountBodySchema } from "@purosur/contracts";
import type { SaleUnit, StockDirection } from "@purosur/domain";
import { formatNumber, parseEsArNumber } from "@purosur/ui";
import { schemaLimit } from "./schema-limit";

const quantityUnits = stockCountBodySchema.shape.counted.meta();
const KG_DECIMALS = schemaLimit(quantityUnits?.["decimals"]);
const STOCK_QUANTITY_PER_UNIT = schemaLimit(quantityUnits?.["perUnit"]);
const MINUS = "−";

function formatMagnitude(quantity: number, saleUnit: SaleUnit): string {
  const units = Math.abs(quantity) / STOCK_QUANTITY_PER_UNIT;
  return saleUnit === "KG"
    ? `${formatNumber(units, { minimumFractionDigits: KG_DECIMALS, maximumFractionDigits: KG_DECIMALS })} kg`
    : `${formatNumber(units, { maximumFractionDigits: 0 })} u`;
}

export function formatStockQuantity(quantity: number, saleUnit: SaleUnit): string {
  const magnitude = formatMagnitude(quantity, saleUnit);
  return quantity < 0 ? `${MINUS} ${magnitude}` : magnitude;
}

export function formatStockQuantityInput(quantity: number, saleUnit: SaleUnit): string {
  const units = quantity / STOCK_QUANTITY_PER_UNIT;
  return saleUnit === "KG"
    ? formatNumber(units, {
        minimumFractionDigits: KG_DECIMALS,
        maximumFractionDigits: KG_DECIMALS,
      })
    : formatNumber(units, { maximumFractionDigits: 0 });
}

export function formatStockChange(delta: number, saleUnit: SaleUnit): string {
  return delta > 0 ? `+ ${formatMagnitude(delta, saleUnit)}` : formatStockQuantity(delta, saleUnit);
}

export function directedQuantity(direction: StockDirection, quantity: number): number {
  return direction === "add" ? quantity : -quantity;
}

export function parseStockQuantity(value: string, saleUnit: SaleUnit): number | undefined {
  const digits = parseEsArNumber(value, saleUnit === "KG" ? KG_DECIMALS : 0);
  if (!digits) {
    return undefined;
  }
  return (
    Number(digits.whole) * STOCK_QUANTITY_PER_UNIT +
    Number(digits.fraction.padEnd(KG_DECIMALS, "0"))
  );
}

export function quantityFieldKind(saleUnit: SaleUnit) {
  return { kind: "plain-text" as const, suffix: saleUnit === "KG" ? "kg" : "u" };
}

export function quantityMessage(saleUnit: SaleUnit): string {
  return saleUnit === "KG"
    ? "Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150."
    : "Escribí una cantidad entera de unidades, por ejemplo 16.";
}
