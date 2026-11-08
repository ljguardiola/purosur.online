import type { StockCountResult, StockMovementResult, StockProduct } from "@purosur/contracts";
import { formatProductDescription } from "@purosur/ui/formatters";
import { formatStockChange, formatStockQuantity } from "../platform/stock-quantity";

export function countRegisteredNotice(
  product: StockProduct,
  result: StockCountResult,
  showsBalance: boolean,
) {
  const name = formatProductDescription(product);
  const balance = formatStockQuantity(result.balance, product.saleUnit);
  if (result.superseded) {
    return {
      title: "El recuento no cambió el saldo",
      description: showsBalance
        ? `Hay un recuento posterior de ${name}: el saldo sigue en ${balance}.`
        : `Hay un recuento posterior de ${name}.`,
    };
  }
  if (result.delta === 0) {
    return {
      title: "Sin diferencia",
      description: showsBalance ? `${name} sigue en ${balance}.` : `${name} sigue igual.`,
    };
  }
  return {
    title: "Saldo corregido",
    description: showsBalance
      ? `${name} queda en ${balance}.`
      : `${name}: ${formatStockChange(result.delta, product.saleUnit)}.`,
  };
}

export function movementRegisteredNotice(
  product: StockProduct,
  result: StockMovementResult,
  delta: number,
  showsBalance: boolean,
) {
  const name = formatProductDescription(product);
  const balance = formatStockQuantity(result.balance, product.saleUnit);
  if (result.superseded) {
    return {
      title: "El movimiento no cambió el saldo",
      description: showsBalance
        ? `Hay un recuento posterior de ${name}: el saldo sigue en ${balance}.`
        : `Hay un recuento posterior de ${name}.`,
    };
  }
  return {
    title: "Saldo actualizado",
    description: showsBalance
      ? `${name} queda en ${balance}.`
      : `${name}: ${formatStockChange(delta, product.saleUnit)}.`,
  };
}
