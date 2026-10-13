import { Button, formatCents, Modal, SummaryRowGroup } from "@purosur/ui";
import { ArrowRight, CircleCheck } from "lucide-react";

export type MercadoPagoPaidModalProps = {
  context: string;
  title: string;
  paidLabel: string;
  amount: number;
  pending: number | undefined;
  onContinue: () => void;
};

export function MercadoPagoPaidModal({
  context,
  title,
  paidLabel,
  amount,
  pending,
  onContinue,
}: MercadoPagoPaidModalProps) {
  return (
    <Modal
      open
      onOpenChange={() => undefined}
      width="standard"
      tone="success"
      icon={<CircleCheck />}
      context={context}
      contextTone="success"
      title={title}
      closable={false}
      footer={
        <Button size="large" fullWidth icon={<ArrowRight />} onPress={onContinue}>
          Continuar
        </Button>
      }
    >
      <SummaryRowGroup
        rows={[
          { label: paidLabel, value: formatCents(amount) },
          ...(pending === undefined
            ? []
            : [{ label: "Falta cobrar", value: formatCents(pending) }]),
        ]}
      />
    </Modal>
  );
}
