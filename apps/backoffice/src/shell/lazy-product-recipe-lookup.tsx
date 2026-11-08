import { Suspense } from "react";
import type { ProductRecipeLookupProps } from "../platform/product-panel-sections";
import { lazyScreen } from "./lazy-screen";

const LoadedProductRecipeLookup = lazyScreen(
  () => import("../stock/product-recipe-lookup"),
  "ProductRecipeLookup",
);

export function LazyProductRecipeLookup(props: ProductRecipeLookupProps) {
  return (
    <Suspense fallback={props.children("unknown")}>
      <LoadedProductRecipeLookup {...props} />
    </Suspense>
  );
}
