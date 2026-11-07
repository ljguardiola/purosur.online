import type { ListedProduct, TagSummary } from "@purosur/contracts";
import { useEffect, useEffectEvent } from "react";
import type { ProductPanelSections } from "../platform/product-panel-sections";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ProductPanel } from "./product-panel";

export type OpenProductPanelProps = {
  products: readonly ListedProduct[];
  productsAreLoaded: boolean;
  openProduct: string | undefined;
  tab: string | undefined;
  brandNames: ReadonlyMap<string, string>;
  categoryLabels: ReadonlyMap<string, string>;
  tags: readonly TagSummary[];
  access: BackofficeAccess;
  sections: ProductPanelSections;
  onEdit: (product: ListedProduct) => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function OpenProductPanel({
  products,
  productsAreLoaded,
  openProduct,
  tab,
  brandNames,
  categoryLabels,
  tags,
  access,
  sections,
  onEdit,
  onClose,
  onSessionEnded,
}: OpenProductPanelProps) {
  const product = products.find((candidate) => candidate.id === openProduct);
  const closeUnlisted = useEffectEvent(onClose);
  useEffect(() => {
    if (productsAreLoaded && openProduct !== undefined && product === undefined) {
      closeUnlisted();
    }
  }, [productsAreLoaded, openProduct, product]);

  if (product === undefined) {
    return null;
  }
  return (
    <ProductPanel
      key={product.id}
      product={product}
      brandName={product.brandId === null ? undefined : brandNames.get(product.brandId)}
      categoryLabel={categoryLabels.get(product.categoryId) ?? product.categoryName}
      tagNames={tags.filter((tag) => product.tagIds.includes(tag.id)).map((tag) => tag.name)}
      access={access}
      sections={sections}
      tab={tab}
      onEdit={() => onEdit(product)}
      onClose={onClose}
      onSessionEnded={onSessionEnded}
    />
  );
}
