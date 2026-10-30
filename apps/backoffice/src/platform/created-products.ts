export function withCreatedProducts<Product extends { id: string }>(
  products: readonly Product[],
  created: readonly Product[],
): Product[] {
  return [...products, ...created.filter((one) => !products.some(({ id }) => id === one.id))];
}
