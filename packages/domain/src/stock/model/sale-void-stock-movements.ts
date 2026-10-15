interface SaleLineStockMovement {
  saleLineId: string;
  productId: string;
  delta: number;
}

export function saleVoidStockMovements(
  saleMovements: readonly SaleLineStockMovement[],
): SaleLineStockMovement[] {
  return saleMovements.map(({ saleLineId, productId, delta }) => ({
    saleLineId,
    productId,
    delta: -delta,
  }));
}
