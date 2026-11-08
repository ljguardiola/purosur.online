import type { PriceProduct } from "@purosur/contracts";
import {
  Button,
  EmptyState,
  FigureStat,
  formatTenthsOfPercent,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  SummaryRowGroup,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { Check, Tag, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import type { ProductPriceCostSectionProps as PlatformProps } from "../platform/product-panel-sections";
import { formatCentsWithUnit } from "./money";
import { PriceChangeModal, type PriceModalOutcome } from "./price-change-modal";
import { PriceCostBreakdown } from "./price-cost-breakdown";
import {
  defaultPricesListScreenServices,
  type PricesListScreenServices,
} from "./prices-list-services";
import { useProductPriceQuery, useRefreshPrices, useReloadPrice } from "./pricing-queries";

export type ProductPriceCostSectionProps = PlatformProps & {
  services?: PricesListScreenServices | undefined;
};

type SectionNotice = { kind: "saved"; description: string } | { kind: "gone"; description: string };

export function ProductPriceCostSection({
  productId,
  onSessionEnded,
  onPriceChanged,
  services = defaultPricesListScreenServices,
}: ProductPriceCostSectionProps) {
  const data = useProductPriceQuery({
    productId,
    fetchPrices: services.fetchPrices,
    onSessionEnded,
  });
  const reloadPrice = useReloadPrice({ fetchPrices: services.fetchPrices });
  const refreshPrices = useRefreshPrices();
  const [changing, setChanging] = useState<PriceProduct | null>(null);
  const [notice, setNotice] = useState<SectionNotice | null>(null);

  if (data.status === "loading") {
    return <LoadingPlaceholder variant="rows" rows={3} />;
  }
  if (data.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(data, "el precio y el costo")} />;
  }
  const product = data.value;
  if (product === null) {
    return (
      <EmptyState
        icon={<TriangleAlert />}
        title="Producto desactivado"
        description="Un producto desactivado no tiene precio para cambiar."
        variant="blank"
      />
    );
  }

  function handleSaved(saved: PriceProduct, outcome: PriceModalOutcome) {
    setChanging(null);
    const cents = outcome.kind === "saved" ? outcome.unitPrice : saved.currentPrice?.unitPrice;
    setNotice({
      kind: "saved",
      description: `${formatProductDescription(saved)} pasa a ${cents === undefined ? "" : formatCentsWithUnit(cents, saved.saleUnit)}.`,
    });
    void refreshPrices();
    onPriceChanged();
  }

  function handleGone(gone: PriceProduct) {
    setChanging(null);
    setNotice({
      kind: "gone",
      description: `${formatProductDescription(gone)} ya no está en el catálogo.`,
    });
    void refreshPrices();
  }

  const margin = product.costReference?.marginTenthsOfPercent ?? null;

  return (
    <div className="flex flex-col gap-4 pt-4">
      {notice === null ? null : (
        <InlineNotice
          tone={notice.kind === "saved" ? "success" : "error"}
          icon={notice.kind === "saved" ? <Check /> : <TriangleAlert />}
          title={notice.kind === "saved" ? "Precio actualizado" : "Producto desactivado"}
          description={notice.description}
        />
      )}
      <SummaryRowGroup
        variant="filled"
        rows={[
          {
            label: "Precio actual",
            value:
              product.currentPrice === null
                ? "Sin precio"
                : formatCentsWithUnit(product.currentPrice.unitPrice, product.saleUnit),
          },
        ]}
      />
      <PriceCostBreakdown product={product} />
      {product.costReference === null ? null : (
        <FigureStat
          label="Margen"
          size="heading"
          value={margin === null ? "—" : formatTenthsOfPercent(margin)}
        />
      )}
      <div className="flex">
        <Button
          variant="secondary"
          size="small"
          icon={<Tag />}
          onPress={() => setChanging(product)}
        >
          Cambiar el precio
        </Button>
      </div>
      <PriceChangeModal
        target={changing}
        previousProductNotice={null}
        onClose={() => setChanging(null)}
        onSessionEnded={onSessionEnded}
        onSaved={handleSaved}
        onGone={handleGone}
        reload={reloadPrice}
        fetchPriceMargin={services.fetchPriceMargin}
        setPrice={services.setPrice}
        confirmPrice={services.confirmPrice}
      />
    </div>
  );
}
