import { Button, FigureStat, formatCents, formatWeight, Modal, StatusIndicator } from "@purosur/ui";
import { Check, Keyboard, Scale } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ScaleWeighing } from "../platform/use-scale-weighing";
import { useScaleWeighing } from "../platform/use-scale-weighing";
import { AddWeighedProductModal } from "./add-weighed-product-modal";

export type { ScaleWeighing } from "../platform/use-scale-weighing";

const SCALE_UNAVAILABLE_NOTE = "La balanza no está disponible. Tipeá el peso.";

export type WeighProductModalProps = {
  productName: string;
  weigh: () => Promise<ScaleWeighing>;
  addWeighedProduct: (weightThousandths: number) => Promise<"invalid_weight" | "done">;
  onClose: () => void;
};

export function WeighProductModal({
  productName,
  weigh,
  addWeighedProduct,
  onClose,
}: WeighProductModalProps) {
  const { phase, typeInstead, ifNotTaken } = useScaleWeighing(weigh);
  const content = useRef<HTMLDivElement>(null);
  const taken = phase.kind === "taken";

  useEffect(() => {
    if (taken) {
      const buttons = content.current?.closest("[role=dialog]")?.querySelectorAll("button");
      buttons?.item(buttons.length - 1).focus();
    }
  }, [taken]);

  if (phase.kind === "typing" || phase.kind === "scale_unavailable") {
    return (
      <AddWeighedProductModal
        productName={productName}
        notice={phase.kind === "scale_unavailable" ? SCALE_UNAVAILABLE_NOTE : undefined}
        addWeighedProduct={async (weight) => {
          const answer = await ifNotTaken(() => addWeighedProduct(weight));
          return answer === "taken_by_the_scale" ? "done" : answer;
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      width="standard"
      tone={taken ? "success" : "info"}
      icon={<Scale />}
      title={`Peso de ${productName}`}
      footer={
        taken ? (
          <Button size="large" fullWidth icon={<Check />} onPress={onClose}>
            Listo
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="large" onPress={onClose}>
              Cancelar
            </Button>
            <Button size="large" fullWidth icon={<Keyboard />} onPress={typeInstead}>
              Tipear peso
            </Button>
          </>
        )
      }
    >
      <div ref={content} className="flex flex-col gap-4">
        {taken ? (
          <StatusIndicator tone="success">Lectura estable</StatusIndicator>
        ) : (
          <StatusIndicator tone="info" busy>
            Pesando…
          </StatusIndicator>
        )}
        <FigureStat
          label="Peso"
          size="heading"
          value={formatWeight(taken ? phase.weightThousandths : 0)}
        />
        <FigureStat label="Importe" size="heading" value={formatCents(taken ? phase.amount : 0)} />
      </div>
    </Modal>
  );
}
