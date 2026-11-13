import type { CorrectRegisterClockOutcome } from "@purosur/contracts";
import { Button, CardModal, formatDayAndTime, InlineNotice, SummaryRowGroup } from "@purosur/ui";
import { Check, Clock, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { useKeys } from "../platform/key-layer";
import { lastDocumentOf } from "./clock-guard-text";
import type { ShownClockGuard } from "./fiscal-queries";

const FAILED_MESSAGE = "No se pudo confirmar la hora. Probá de nuevo.";

const REFUSALS = {
  not_behind: "La hora de la caja ya no está atrasada",
  not_permitted: "No tenés permiso para confirmar la hora de la caja",
  unavailable: FAILED_MESSAGE,
} as const;

export type CorrectRegisterClockModalProps = {
  cashSessionOpen: boolean;
  guard: ShownClockGuard;
  correctRegisterClock: () => Promise<CorrectRegisterClockOutcome>;
  onCorrected: () => void;
  onRefused: () => void;
  onSessionInvalid: () => void;
  onClose: () => void;
};

export function CorrectRegisterClockModal({
  cashSessionOpen,
  guard,
  correctRegisterClock,
  onCorrected,
  onRefused,
  onSessionInvalid,
  onClose,
}: CorrectRegisterClockModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [used, setUsed] = useState(guard.correction === "already_corrected_in_period");
  const [refusal, setRefusal] = useState<string>();
  const [settled, setSettled] = useState(false);
  const correcting = useRef(false);
  const last = lastDocumentOf(guard.blocks);
  const canConfirm = !submitting && !settled && !used;

  async function confirm() {
    if (correcting.current) {
      return;
    }
    correcting.current = true;
    setSubmitting(true);
    setRefusal(undefined);
    const outcome = await correctRegisterClock().catch(
      (): CorrectRegisterClockOutcome => ({ kind: "unavailable" }),
    );
    correcting.current = false;
    setSubmitting(false);
    switch (outcome.kind) {
      case "corrected":
        onCorrected();
        break;
      case "not_signed_in":
        onSessionInvalid();
        break;
      case "already_corrected_in_period":
        setUsed(true);
        onRefused();
        break;
      case "unavailable":
        setRefusal(REFUSALS.unavailable);
        break;
      default:
        setRefusal(REFUSALS[outcome.kind]);
        setSettled(true);
        onRefused();
    }
  }

  useKeys([{ key: "Enter", run: () => void confirm(), enabled: canConfirm }], { modal: true });

  const period = cashSessionOpen
    ? "en esta sesión de caja"
    : "desde que se cerró la última sesión de caja";

  return (
    <CardModal
      open
      onOpenChange={(next) => {
        if (!next && !submitting) {
          onClose();
        }
      }}
      icon={<Clock />}
      title="Reloj atrasado"
      closable={!submitting}
      action={
        <Button
          fullWidth
          icon={<Check />}
          iconPosition="start"
          keycap="Enter"
          disabled={!canConfirm}
          onPress={() => void confirm()}
        >
          Confirmar hora
        </Button>
      }
    >
      <SummaryRowGroup
        rows={[
          { label: "Hora de la caja", value: formatDayAndTime(guard.reading) },
          ...(last === undefined ? [] : [{ label: "Último comprobante", value: last.text }]),
        ]}
      />
      {used ? (
        <InlineNotice
          tone="warning"
          icon={<TriangleAlert />}
          title={`Ya se confirmó la hora ${period}`}
        />
      ) : null}
      {refusal === undefined ? null : (
        <InlineNotice tone="error" icon={<TriangleAlert />} title={refusal} />
      )}
    </CardModal>
  );
}
