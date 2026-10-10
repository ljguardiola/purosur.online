export type ProductActivityScope = "active" | "inactive" | "any";

export const PRODUCTS_COUNTED_IN_CATALOG: ProductActivityScope = "active";

export function isInActivityScope(active: boolean, scope: ProductActivityScope): boolean {
  switch (scope) {
    case "active":
      return active;
    case "inactive":
      return !active;
    case "any":
      return true;
  }
}
