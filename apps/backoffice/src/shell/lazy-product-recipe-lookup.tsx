import { lazy, Suspense } from "react";
import type { ProductRecipeLookupProps } from "../platform/product-panel-sections";

const LoadedProductRecipeLookup = lazy(async () => ({
  default: (await import("../stock/product-recipe-lookup")).ProductRecipeLookup,
}));

export function LazyProductRecipeLookup(props: ProductRecipeLookupProps) {
  return (
    <Suspense fallback={props.children("unknown")}>
      <LoadedProductRecipeLookup {...props} />
    </Suspense>
  );
}
