import type { CorrectRegisterClockOutcome } from "@purosur/contracts";
import { Button, HighlightedNotice, InlineNotice, Modal, SummaryRowGroup } from "@purosur/ui";
import { ArrowLeft, Check, Clock, Info, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import type { ShownClockGuard } from "./fiscal-queries";
import { clockReadingText, lastDocumentOf, modalEyebrow } from "./clock-guard-text";

const FAILED_MESSAGE = "No se pudo confirmar la hora. Probá de nuevo.";

const REFUSALS = {
  not_behind: "La hora de la caja ya no está atrasada",
  not_permitted: "No tenés permiso para confirmar la hora de la caja",
  unavailable: FAILED_MESSAGE,
} as const;

export type CorrectRegisterClockModalProps = {
  registerName: string | null;
  cashSessionOpen: boolean;
  guard: ShownClockGuard;
  correctRegisterClock: () => Promise<CorrectRegisterClockOutcome>;
  onCorrected: () => void;
  onRefused: () => void;
  onSessionInvalid: () => void;
  onClose: () => void;
};

export function CorrectRegisterClockModal({
  registerName,
  cashSessionOpen,
  guard,
  correctRegisterClock,
  onCorrected,
  onRefused,
  onSessionInvalid,
  onClose,
}: CorrectRegisterClockModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [used, setUsed] = useState(!guard.correction_available);
  const [refusal, setRefusal] = useState<string>();
  const [settled, setSettled] = useState(false);
  const correcting = useRef(false);
  const last = lastDocumentOf(guard.blocks);

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

  const period = cashSessionOpen
    ? "en esta sesión de caja"
    : "desde que se cerró la última sesión de caja";

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next && !submitting) {
          onClose();
        }
      }}
      width="standard"
      tone="warning"
      icon={<Clock />}
      {...(last === undefined ? {} : { context: modalEyebrow(registerName, last.pointOfSale) })}
      title="No se pueden emitir comprobantes"
      closable={!submitting}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<ArrowLeft />}
            disabled={submitting}
            onPress={onClose}
          >
            Volver
          </Button>
          <Button
            size="large"
            icon={<Check />}
            fullWidth
            disabled={submitting || settled || used}
            onPress={() => void confirm()}
          >
            La hora de la caja es correcta
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-text">
          La hora de la caja quedó atrás de la del último comprobante emitido, así que la caja no
          emite hasta que la hora sea correcta.
        </p>
        <SummaryRowGroup
          rows={[
            { label: "Hora de la caja", value: clockReadingText(guard.reading), strong: true },
            ...(last === undefined ? [] : [{ label: "Último comprobante", value: last.text }]),
          ]}
        />
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-body text-text">
          <li>Fijate en otro reloj confiable qué hora es.</li>
          <li>Si la hora de la caja está mal, corregila en Windows y volvé a probar.</li>
          <li>Si la hora de la caja es la correcta, confirmalo acá abajo.</li>
        </ol>
        {used ? (
          <HighlightedNotice
            tone="warning"
            icon={<TriangleAlert />}
            title={`Ya se confirmó la hora ${period}`}
            description="Si la hora sigue mal, corregila en Windows."
          />
        ) : (
          <HighlightedNotice
            tone="info"
            icon={<Info />}
            title={
              cashSessionOpen
                ? "Se puede confirmar una sola vez por sesión de caja"
                : "Se puede confirmar una sola vez hasta la próxima apertura de caja"
            }
            description="Le avisa al Administrador quién lo confirmó."
          />
        )}
        {refusal === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={refusal} />
        )}
      </div>
    </Modal>
  );
}
