import type { PriceProduct } from "@purosur/contracts";
import { Card, FigureStat, formatCents, formatTenthsOfPercent } from "@purosur/ui";
import { useEffect, useState } from "react";
import { typedUnitPrice } from "./price-form";
import type { fetchPriceMargin } from "./prices-api";
import { usePriceMarginQuery } from "./pricing-queries";

const TYPING_SETTLE_MS = 300;

const MARGIN_LABEL = "Margen con este precio";

export type PriceMarginReferenceProps = {
  product: PriceProduct;
  amount: string;
  fetchPriceMargin: typeof fetchPriceMargin;
  onSessionEnded: () => void;
};

export function PriceMarginReference({
  product,
  amount,
  fetchPriceMargin: readMargin,
  onSessionEnded,
}: PriceMarginReferenceProps) {
  const typed = product.costReference ? typedUnitPrice(amount) : undefined;
  const [settled, setSettled] = useState<number | undefined>(undefined);

  useEffect(() => {
    const handle = setTimeout(() => setSettled(typed), TYPING_SETTLE_MS);
    return () => clearTimeout(handle);
  }, [typed]);

  const margin = usePriceMarginQuery({
    productId: product.id,
    unitPrice: settled,
    fetchPriceMargin: readMargin,
    onSessionEnded,
  });

  if (!product.costReference) {
    return null;
  }

  const reading = typed !== undefined && (typed !== settled || margin.status === "loading");
  const reference = margin.status === "loaded" ? margin.value.costReference : null;
  const tenths = reference?.marginTenthsOfPercent ?? null;

  return (
    <Card variant="subtle">
      {reading ? (
        <FigureStat label={MARGIN_LABEL} size="heading" loading />
      ) : typed !== undefined && reference !== null && tenths !== null ? (
        <FigureStat
          label={MARGIN_LABEL}
          size="heading"
          detail={`${formatCents(typed)} − ${formatCents(reference.totalCostCents)} sobre el precio`}
          value={formatTenthsOfPercent(tenths)}
        />
      ) : (
        <FigureStat label={MARGIN_LABEL} size="heading" value="—" />
      )}
    </Card>
  );
}
