export interface SaleLineRemoval {
  id: string;
  saleId: string;
  saleLineId: string;
  productId: string;
  qtyRemoved: number;
  amountRemoved: number;
  actorId: string;
  occurredAt: Date;
}
