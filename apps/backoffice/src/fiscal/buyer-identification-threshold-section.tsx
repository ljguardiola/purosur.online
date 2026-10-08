import { Button, formatCents, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { Plus } from "lucide-react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { formatDisplayDate } from "../platform/display-date";
import type { CloudData } from "../platform/use-cloud-query";
import type { BuyerIdentificationThresholds } from "./buyer-identification-threshold-api";
import { DataPair } from "./fiscal-data-pair";

type BuyerIdentificationThresholdSectionProps = {
  data: CloudData<BuyerIdentificationThresholds>;
  onRecord: () => void;
};

export function BuyerIdentificationThresholdSection({
  data,
  onRecord,
}: BuyerIdentificationThresholdSectionProps) {
  const loaded = data.status === "loaded" ? data.value : null;
  const inEffect = loaded?.inEffect;
  const scheduled = loaded?.scheduled;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <h2 className="flex-1 text-text-accent text-subheading">
          Umbral de identificación del comprador
        </h2>
        <Button
          variant="secondary"
          size="small"
          icon={<Plus />}
          dataStatus={data.status}
          onPress={onRecord}
        >
          Cargar un umbral nuevo
        </Button>
      </div>
      {data.status === "loading" && <LoadingPlaceholder variant="form" fields={1} />}
      {data.status === "failed" && (
        <LoadFailure {...cloudLoadFailure(data, "el umbral de identificación del comprador")} />
      )}
      {loaded !== null && (
        <>
          <div className="flex gap-8">
            <DataPair label="Vigente" value={inEffect ? formatCents(inEffect.amount) : null} />
            {inEffect ? (
              <DataPair label="Desde" value={formatDisplayDate(inEffect.validFrom)} />
            ) : null}
            {scheduled ? (
              <>
                <DataPair label="Próximo" value={formatCents(scheduled.amount)} />
                <DataPair label="Desde" value={formatDisplayDate(scheduled.validFrom)} />
              </>
            ) : null}
          </div>
          <p className="text-text-subtle text-detail">
            Una venta de este importe o más no se puede cobrar en la caja.
          </p>
        </>
      )}
    </div>
  );
}
