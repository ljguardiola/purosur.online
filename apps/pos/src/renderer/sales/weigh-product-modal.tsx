import {
  Button,
  FigureStat,
  formatCents,
  formatWeight,
  InlineNotice,
  Modal,
  StatusIndicator,
} from "@purosur/ui";
import { Check, Info, Keyboard, Scale } from "lucide-react";
import { useEffect } from "react";
import type { ScaleWeighing } from "../platform/use-scale-weighing";
import { useScaleWeighing } from "../platform/use-scale-weighing";
import { AddWeighedProductModal } from "./add-weighed-product-modal";
import { ChangeLineWeightModal } from "./change-line-weight-modal";

export type { ScaleWeighing } from "../platform/use-scale-weighing";

const SCALE_UNAVAILABLE_NOTE = "La balanza no está disponible. Tipeá el peso.";
const ZERO_WEIGHT_NOTE = "Poné el producto en la balanza o tipeá el peso.";

export type WeighProductModalProps = {
  productName: string;
  weigh: (take: boolean) => Promise<ScaleWeighing>;
  typedWeight: (weightThousandths: number) => Promise<"invalid_weight" | "done">;
  currentWeight?: number | undefined;
  onClose: () => void;
};

export function WeighProductModal({
  productName,
  weigh,
  typedWeight,
  currentWeight,
  onClose,
}: WeighProductModalProps) {
  const { phase, confirming, zeroRefused, confirm, typeInstead, ifNotTaken } =
    useScaleWeighing(weigh);
  const weighing = phase.kind === "weighing" || phase.kind === "stable";
  const taken = phase.kind === "taken";

  useEffect(() => {
    if (taken) {
      onClose();
    }
  }, [taken, onClose]);

  useEffect(() => {
    if (!weighing) {
      return;
    }
    function confirmOnEnter(event: KeyboardEvent) {
      if (
        event.key === "Enter" &&
        !event.defaultPrevented &&
        !(event.target instanceof HTMLButtonElement)
      ) {
        event.preventDefault();
        confirm();
      }
    }
    document.addEventListener("keydown", confirmOnEnter);
    return () => document.removeEventListener("keydown", confirmOnEnter);
  }, [weighing, confirm]);

  if (phase.kind === "typing" || phase.kind === "scale_unavailable") {
    const notice = phase.kind === "scale_unavailable" ? SCALE_UNAVAILABLE_NOTE : undefined;
    const typed = async (weight: number) => {
      const answer = await ifNotTaken(() => typedWeight(weight));
      return answer === "taken_by_the_scale" ? "done" : answer;
    };
    return currentWeight === undefined ? (
      <AddWeighedProductModal
        productName={productName}
        notice={notice}
        addWeighedProduct={typed}
        onClose={onClose}
      />
    ) : (
      <ChangeLineWeightModal
        productName={productName}
        currentWeight={currentWeight}
        notice={notice}
        changeLineWeight={typed}
        onClose={onClose}
      />
    );
  }

  const shown =
    phase.kind === "stable" ? phase.reading : phase.kind === "weighing" ? phase.last : undefined;

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<Scale />}
      title={`Peso de ${productName}`}
      footer={
        <>
          <Button variant="secondary" size="large" onPress={onClose}>
            Cancelar
          </Button>
          <Button variant="secondary" size="large" icon={<Keyboard />} onPress={typeInstead}>
            Tipear peso
          </Button>
          <Button
            size="large"
            fullWidth
            icon={<Check />}
            dataStatus={confirming ? "loading" : "loaded"}
            onPress={confirm}
          >
            Confirmar peso
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {phase.kind === "stable" ? (
          <StatusIndicator tone="success">Lectura estable</StatusIndicator>
        ) : (
          <StatusIndicator tone="info" busy>
            Pesando…
          </StatusIndicator>
        )}
        {zeroRefused ? (
          <InlineNotice tone="info" icon={<Info />} description={ZERO_WEIGHT_NOTE} />
        ) : null}
        <FigureStat
          label="Peso"
          size="heading"
          value={formatWeight(shown?.weightThousandths ?? 0)}
        />
        <FigureStat label="Importe" size="heading" value={formatCents(shown?.amount ?? 0)} />
      </div>
    </Modal>
  );
}
