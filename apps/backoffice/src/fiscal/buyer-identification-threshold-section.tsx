import {
  argentinaCalendarDay,
  type BuyerIdentificationThreshold,
  thresholdInEffectOn,
  thresholdScheduledAfter,
} from "@purosur/domain";
import { Button, formatCents, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { Plus } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import type { CloudData } from "../platform/use-cloud-query";
import { formatDisplayDate } from "./display-date";
import { DataPair } from "./fiscal-data-pair";

type BuyerIdentificationThresholdSectionProps = {
  data: CloudData<BuyerIdentificationThreshold[]>;
  onRecord: () => void;
  now: () => Date;
};

function useToday(now: () => Date, thresholds: BuyerIdentificationThreshold[] | null): string {
  const [today, setToday] = useState(() => argentinaCalendarDay(now()));
  const readToday = useEffectEvent((_thresholds: BuyerIdentificationThreshold[] | null) =>
    setToday(argentinaCalendarDay(now())),
  );

  useEffect(() => readToday(thresholds), [thresholds]);

  return today;
}

export function BuyerIdentificationThresholdSection({
  data,
  onRecord,
  now,
}: BuyerIdentificationThresholdSectionProps) {
  const thresholds = data.status === "loaded" ? data.value : null;
  const today = useToday(now, thresholds);
  const inEffect = thresholds && thresholdInEffectOn(thresholds, today);
  const scheduled = thresholds && thresholdScheduledAfter(thresholds, today);

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
      {thresholds !== null && (
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
