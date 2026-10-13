import type { PriceProduct } from "@purosur/contracts";
import { Card, FigureStat, formatCents, formatTenthsOfPercent, LoadFailure } from "@purosur/ui";
import { useEffect, useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
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

type ShownMargin = { unitPrice: number; totalCostCents: number; marginTenthsOfPercent: number };

function MarginFigure({ shown }: { shown: ShownMargin | null }) {
  return (
    <Card variant="subtle">
      {shown === null ? (
        <FigureStat label={MARGIN_LABEL} size="heading" value="—" />
      ) : (
        <FigureStat
          label={MARGIN_LABEL}
          size="heading"
          detail={`${formatCents(shown.unitPrice)} − ${formatCents(shown.totalCostCents)} sobre el precio`}
          value={formatTenthsOfPercent(shown.marginTenthsOfPercent)}
        />
      )}
    </Card>
  );
}

function shownMargin(
  unitPrice: number,
  reference: { totalCostCents: number; marginTenthsOfPercent: number | null } | null,
): ShownMargin | null {
  return reference === null || reference.marginTenthsOfPercent === null
    ? null
    : {
        unitPrice,
        totalCostCents: reference.totalCostCents,
        marginTenthsOfPercent: reference.marginTenthsOfPercent,
      };
}

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

  const { costReference, currentPrice } = product;
  if (!costReference) {
    return null;
  }
  if (amount.trim() === "") {
    return (
      <MarginFigure
        shown={currentPrice ? shownMargin(currentPrice.unitPrice, costReference) : null}
      />
    );
  }
  if (typed === undefined) {
    return <MarginFigure shown={null} />;
  }
  if (typed !== settled || margin.status === "loading") {
    return (
      <Card variant="subtle">
        <FigureStat label={MARGIN_LABEL} size="heading" loading />
      </Card>
    );
  }
  if (margin.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(margin, "el margen")} />;
  }
  return <MarginFigure shown={shownMargin(typed, margin.value.costReference)} />;
}
