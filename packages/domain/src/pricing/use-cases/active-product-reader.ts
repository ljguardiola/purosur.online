export interface ActiveProductReader {
  isActiveProduct(productId: string): Promise<boolean>;
}
