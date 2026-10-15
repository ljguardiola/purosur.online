import type { CorrectRegisterClockOutcome, ReadClockGuardOutcome } from "@purosur/contracts";
import { Button, FloatingNotification, HighlightedNotice } from "@purosur/ui";
import { Check, Clock, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { ShownClockGuard } from "./fiscal-queries";
import { useClockGuardQuery, useRefreshClockGuard } from "./fiscal-queries";
import { CorrectRegisterClockModal } from "./correct-register-clock-modal";

export type ClockGuardOfferProps = {
  registerName: string | null;
  cashSessionOpen: boolean;
  readClockGuard: () => Promise<ReadClockGuardOutcome>;
  correctRegisterClock: () => Promise<CorrectRegisterClockOutcome>;
  onSessionInvalid: () => void;
};

export function ClockGuardOffer({
  registerName,
  cashSessionOpen,
  readClockGuard,
  correctRegisterClock,
  onSessionInvalid,
}: ClockGuardOfferProps) {
  const guard = useClockGuardQuery(readClockGuard);
  const refresh = useRefreshClockGuard();
  const [correcting, setCorrecting] = useState<ShownClockGuard>();
  const [confirmed, setConfirmed] = useState(false);
  const blocked =
    guard.status === "loaded" && guard.value.blocks.length > 0 ? guard.value : undefined;

  return (
    <>
      {blocked === undefined ? null : (
        <HighlightedNotice
          tone="warning"
          icon={<TriangleAlert />}
          title="El reloj de la caja atrasa"
          description="Mientras tanto no se emiten facturas. Se puede vender igual: la factura sale cuando se corrige."
          actions={
            blocked.may_correct ? (
              <Button variant="secondary" icon={<Clock />} onPress={() => setCorrecting(blocked)}>
                Corregir el reloj
              </Button>
            ) : undefined
          }
        />
      )}
      {correcting === undefined ? null : (
        <CorrectRegisterClockModal
          registerName={registerName}
          cashSessionOpen={cashSessionOpen}
          guard={correcting}
          correctRegisterClock={correctRegisterClock}
          onCorrected={() => {
            setCorrecting(undefined);
            setConfirmed(true);
            void refresh();
          }}
          onRefused={() => void refresh()}
          onSessionInvalid={onSessionInvalid}
          onClose={() => setCorrecting(undefined)}
        />
      )}
      {confirmed ? (
        <FloatingNotification
          tone="success"
          icon={<Check />}
          title="La hora de la caja quedó confirmada"
          description="Las facturas se emiten de nuevo."
          onDismiss={() => setConfirmed(false)}
        />
      ) : null}
    </>
  );
}
