import type { ChargeSaleByTransferOutcome } from "@purosur/contracts";
import { Button, formatCents, InlineNotice, Modal, SummaryRowGroup } from "@purosur/ui";
import { ArrowLeft, Check, Landmark, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";

const FAILED_MESSAGE = "No se pudo cobrar la venta. Probá de nuevo.";

export type CompletedTransfer = Extract<ChargeSaleByTransferOutcome, { kind: "completed" }>;

export type TransferChargeModalProps = {
  total: number;
  charge: () => Promise<ChargeSaleByTransferOutcome>;
  onChooseAnotherMethod: () => void;
  onCompleted: (charge: CompletedTransfer) => void;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

export function TransferChargeModal({
  total,
  charge,
  onChooseAnotherMethod,
  onCompleted,
  onSaleUnavailable,
  onSessionInvalid,
}: TransferChargeModalProps) {
  const inFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string>();

  async function confirmCredit() {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setNotice(undefined);
    const outcome = await charge().catch(
      (): ChargeSaleByTransferOutcome => ({ kind: "unavailable" }),
    );
    inFlight.current = false;
    setSubmitting(false);
    switch (outcome.kind) {
      case "completed":
        onCompleted(outcome);
        break;
      case "empty_sale":
      case "zero_total":
      case "reaches_buyer_identification_threshold":
      case "no_buyer_identification_threshold":
      case "no_open_sale":
      case "not_permitted":
        onSaleUnavailable();
        break;
      case "not_signed_in":
      case "no_open_session":
        onSessionInvalid();
        break;
      case "unavailable":
        setNotice(FAILED_MESSAGE);
        break;
    }
  }

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) {
          onChooseAnotherMethod();
        }
      }}
      width="standard"
      tone="info"
      icon={<Landmark />}
      context="TRANSFERENCIA"
      contextTone="info"
      title="Esperando el ingreso en la cuenta"
      closable={!submitting}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<ArrowLeft />}
            disabled={submitting}
            onPress={onChooseAnotherMethod}
          >
            No llegó: cambiar de medio
          </Button>
          <Button
            size="large"
            fullWidth
            icon={<Check />}
            dataStatus={submitting ? "loading" : "loaded"}
            onPress={() => void confirmCredit()}
          >
            Vi el ingreso
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <SummaryRowGroup
          rows={[
            { label: "Total de la venta", value: formatCents(total) },
            { label: "Pagado", value: formatCents(0) },
            { label: "A cobrar ahora", value: formatCents(total) },
          ]}
        />
        <InlineNotice
          tone="warning"
          icon={<TriangleAlert />}
          title="No confirmes con la pantalla del cliente"
          description="Una captura falsa o una transferencia programada se ven igual que una real. Confirmá solo al ver el ingreso en el dispositivo del mostrador."
        />
        {notice === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
        )}
      </div>
    </Modal>
  );
}
