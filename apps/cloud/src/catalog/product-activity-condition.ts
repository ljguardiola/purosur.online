import type { ProductActivityScope } from "@purosur/domain/catalog/use-cases";
import { eq } from "drizzle-orm";
import { products } from "../platform/db/schema.js";

export function productActivityCondition(scope: ProductActivityScope) {
  switch (scope) {
    case "active":
      return eq(products.active, true);
    case "inactive":
      return eq(products.active, false);
    case "any":
      return undefined;
  }
}
