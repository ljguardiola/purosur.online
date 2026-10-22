export interface SaleCompletions {
  holdsCompletionOf(registerId: string, saleId: string): Promise<boolean>;
}
