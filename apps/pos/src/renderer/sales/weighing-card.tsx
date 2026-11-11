import type { FoundProduct } from "@purosur/contracts";
import {
  Button,
  formatCents,
  formatNumber,
  formatWeight,
  InlineNotice,
  WaitingProduct,
  WeighingPanel,
  WeightReadout,
} from "@purosur/ui";
import { Info, Keyboard } from "lucide-react";
import { useEffect } from "react";
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
    { key: "F5", run: typeInstead, enabled: following },
    { key: "Escape", run: onClose, enabled: following },
    { key: "Delete", run: onDiscardWaiting, enabled: following && firstWaiting !== undefined },
  ]);
  useKeys([{ key: "Enter", run: confirm, enabled: stable && !confirming }], { fallback: true });

  const typedModalNotice = phase.kind === "scale_unavailable" ? SCALE_UNAVAILABLE_NOTE : undefined;
  const typed = async (weight: number) => {
    const answer = await ifNotTaken(() => typedWeight(weight));
    return answer === "taken_by_the_scale" ? "done" : answer;
  };

  return (
    <>
      <WeighingPanel
        title={productName}
        detail={
          unitPrice === null || unitPrice === undefined
            ? undefined
            : `${formatCents(unitPrice)} / kg`
        }
        status={stable ? "stable" : "moving"}
        onCancel={onClose}
        waiting={
          firstWaiting === undefined ? undefined : (
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
          )
        }
      >
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
      </WeighingPanel>
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
