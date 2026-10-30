import type { AiCostBody } from "@purosur/contracts";
import { Card, Eyebrow, FigureStat, formatUsd, LoadFailure } from "@purosur/ui";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { incompleteAiCostText } from "./ai-cost-text";
import { useSupplierPriceListAiCostQuery } from "./purchasing-queries";
import type { SupplierPriceListReviewScreenServices } from "./supplier-price-list-review-services";

type Props = {
  listId: string;
  services: Pick<SupplierPriceListReviewScreenServices, "fetchSupplierPriceListAiCost">;
  onSessionEnded: () => void;
};

function figuresOf(cost: AiCostBody | undefined) {
  return [
    { label: "Lectura", total: cost?.reading },
    { label: "Propuestas de vínculo", total: cost?.proposals },
    { label: "Total", total: cost?.total },
  ];
}

export function SupplierPriceListAiCost({ listId, services, onSessionEnded }: Props) {
  const data = useSupplierPriceListAiCostQuery({
    listId,
    fetchSupplierPriceListAiCost: services.fetchSupplierPriceListAiCost,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;

  return (
    <Card>
      <Eyebrow text="Costo de IA" headingLevel={2} />
      {data.status === "failed" ? (
        <LoadFailure {...cloudLoadFailure(data, "el costo de IA")} />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {figuresOf(shown).map(({ label, total }) => {
            if (total === undefined) {
              return <FigureStat key={label} size="heading" label={label} loading />;
            }
            const detail = incompleteAiCostText(total);
            return (
              <FigureStat
                key={label}
                size="heading"
                label={label}
                value={formatUsd(total.costNanoUsd)}
                {...(detail === undefined ? {} : { detail })}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}
