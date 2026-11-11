import type { FoundProduct } from "@purosur/contracts";
import {
  Button,
  formatCents,
  formatNumber,
  formatWeight,
  InlineNotice,
  ScaleStatusBadge,
  WaitingProduct,
  WeightReadout,
} from "@purosur/ui";
import { Info, Keyboard, Scale } from "lucide-react";
import { useEffect, useId } from "react";
import { useKeys } from "../platform/key-layer";
import type { ScaleWeighing } from "../platform/use-scale-weighing";
import { useScaleWeighing } from "../platform/use-scale-weighing";
import { useBarcodeReadings } from "../shell/barcode-readings";
import { AddWeighedProductModal } from "./add-weighed-product-modal";
import { ChangeLineWeightModal } from "./change-line-weight-modal";

export type { ScaleWeighing } from "../platform/use-scale-weighing";

const SCALE_UNAVAILABLE_NOTE = "La balanza no está disponible. Tipeá el peso.";
const ZERO_WEIGHT_NOTE = "Poné el producto en la balanza o tipeá el peso.";

export type WaitingEntry = {
  productId: string;
  name: string;
  saleUnit: FoundProduct["sale_unit"];
  unitPrice: number | null;
};

export type ScaleReading = { weightThousandths: number; settled: boolean };

export type WeighingCardProps = {
  productName: string;
  unitPrice: number | null | undefined;
  weigh: (confirmedWeightThousandths: number | null) => Promise<ScaleWeighing>;
  typedWeight: (weightThousandths: number) => Promise<"invalid_weight" | "done">;
  currentWeight?: number | undefined;
  waiting: readonly WaitingEntry[];
  onDiscardWaiting: () => void;
  onReading: (reading: ScaleReading | undefined) => void;
  onBarcodeRead?: ((code: string) => void) | undefined;
  onClose: () => void;
};

function unitLabel(saleUnit: WaitingEntry["saleUnit"]) {
  return saleUnit === "KG" ? "kg" : "u";
}

export function WeighingCard({
  productName,
  unitPrice,
  weigh,
  typedWeight,
  currentWeight,
  waiting,
  onDiscardWaiting,
  onReading,
  onBarcodeRead,
  onClose,
}: WeighingCardProps) {
  const titleId = useId();
  const { phase, confirming, zeroRefused, confirm, typeInstead, ifNotTaken } =
    useScaleWeighing(weigh);
  const following =
    phase.kind === "weighing" || phase.kind === "unsteady" || phase.kind === "stable";
  const stable = phase.kind === "stable";
  const taken = phase.kind === "taken";
  const shown =
    phase.kind === "stable" || phase.kind === "unsteady"
      ? phase.reading
      : phase.kind === "weighing"
        ? phase.last
        : undefined;
  const reportedWeight = following ? (shown?.weightThousandths ?? 0) : undefined;
  const firstWaiting = waiting[0];
  const typing = phase.kind === "typing" || phase.kind === "scale_unavailable";

  useBarcodeReadings(typing ? onBarcodeRead : undefined, { whileDialogOpen: true });

  useEffect(() => {
    if (taken) {
      onClose();
    }
  }, [taken, onClose]);

  useEffect(() => {
    onReading(
      reportedWeight === undefined
        ? undefined
        : { weightThousandths: reportedWeight, settled: stable },
    );
  }, [reportedWeight, stable, onReading]);

  useEffect(() => () => onReading(undefined), [onReading]);

  useKeys([
    { key: "Enter", run: confirm, enabled: stable && !confirming },
    { key: "F5", run: typeInstead, enabled: following },
    { key: "Escape", run: onClose, enabled: following },
    { key: "Delete", run: onDiscardWaiting, enabled: following && firstWaiting !== undefined },
  ]);

  const typedModalNotice = phase.kind === "scale_unavailable" ? SCALE_UNAVAILABLE_NOTE : undefined;
  const typed = async (weight: number) => {
    const answer = await ifNotTaken(() => typedWeight(weight));
    return answer === "taken_by_the_scale" ? "done" : answer;
  };

  return (
    <>
      <section
        aria-labelledby={titleId}
        className="overflow-hidden rounded-lg border border-warning-soft bg-warning-subtle"
      >
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start gap-4">
            <span
              aria-hidden="true"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-warning-strong *:size-icon-lg"
            >
              <Scale />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <h2 id={titleId} className="text-title text-text">
                {productName}
              </h2>
              {unitPrice === null || unitPrice === undefined ? null : (
                <p className="text-detail text-warning-strong">{`${formatCents(unitPrice)} / kg`}</p>
              )}
            </div>
            <ScaleStatusBadge status={stable ? "stable" : "moving"}>
              {stable ? "Estable" : "Moviéndose"}
            </ScaleStatusBadge>
            <Button variant="text" keycap="Escape" onPress={onClose}>
              Cancelar
            </Button>
          </div>
          <WeightReadout
            weightLabel="Peso"
            weight={formatWeight(shown?.weightThousandths ?? 0)}
            amountLabel="Importe"
            amount={formatCents(shown?.amount ?? 0)}
            settled={stable}
          />
          {zeroRefused ? (
            <InlineNotice tone="info" icon={<Info />} description={ZERO_WEIGHT_NOTE} />
          ) : null}
          <div className="flex gap-3">
            <Button
              size="large"
              keycap="Enter"
              disabled={!stable}
              dataStatus={confirming ? "loading" : "loaded"}
              onPress={confirm}
            >
              Confirmar
            </Button>
            <Button
              variant="secondary"
              size="large"
              icon={<Keyboard />}
              keycap="F5"
              disabled={!following}
              onPress={typeInstead}
            >
              Escribir peso
            </Button>
          </div>
        </div>
        {firstWaiting === undefined ? null : (
          <div className="border-t border-dashed border-warning-soft bg-surface">
            <WaitingProduct
              label="En espera"
              name={firstWaiting.name}
              detail={
                firstWaiting.unitPrice === null
                  ? undefined
                  : `${formatCents(firstWaiting.unitPrice)} / ${unitLabel(firstWaiting.saleUnit)}`
              }
              more={waiting.length > 1 ? `y ${formatNumber(waiting.length - 1)} más` : undefined}
              discardLabel="Descartar"
              onDiscard={onDiscardWaiting}
            />
          </div>
        )}
      </section>
      {typing ? (
        currentWeight === undefined ? (
          <AddWeighedProductModal
            productName={productName}
            notice={typedModalNotice}
            addWeighedProduct={typed}
            onClose={onClose}
          />
        ) : (
          <ChangeLineWeightModal
            productName={productName}
            currentWeight={currentWeight}
            notice={typedModalNotice}
            changeLineWeight={typed}
            onClose={onClose}
          />
        )
      ) : null}
    </>
  );
}
