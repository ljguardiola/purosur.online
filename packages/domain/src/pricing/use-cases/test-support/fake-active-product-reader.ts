import type { ActiveProductReader } from "../active-product-reader.js";

export function fakeActiveProductReader(activeProductIds: string[]): ActiveProductReader {
  return {
    isActiveProduct: (productId) => Promise.resolve(activeProductIds.includes(productId)),
  };
}
