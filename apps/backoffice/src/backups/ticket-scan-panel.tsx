import { Button, EmptyState, formatNumber, StatusIndicator } from "@purosur/ui";
import { VideoOff } from "lucide-react";
import { type ComponentType, useState } from "react";
import type { CameraUnavailableReason, QrScannerProps } from "./qr-camera-scanner";

export type TicketScanPanelProps = {
  scanner: ComponentType<QrScannerProps>;
  progress: { read: number; of: number } | null;
  onCode: (text: string) => void;
};

const CAMERA_ISSUE_TEXT: Record<CameraUnavailableReason, { title: string; description: string }> = {
  denied: {
    title: "La cámara está bloqueada",
    description: "Permitila desde el navegador para leer los tickets.",
  },
  no_camera: {
    title: "No hay una cámara disponible",
    description: "Abrí esta pantalla desde un equipo con cámara.",
  },
};

export function TicketScanPanel({ scanner: Scanner, progress, onCode }: TicketScanPanelProps) {
  const [issue, setIssue] = useState<CameraUnavailableReason | null>(null);
  const [attempt, setAttempt] = useState(0);

  return (
    <div className="flex w-80 shrink-0 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-surface p-6 text-center">
      {issue === null ? (
        <>
          <Scanner key={attempt} onCode={onCode} onUnavailable={setIssue} />
          <p className="font-semibold text-body text-text">Mostrar el QR del ticket a la cámara</p>
          <p className="text-detail text-text-subtle">
            Sirve para recuperar ventas de una caja que se perdió antes de sincronizarlas.
          </p>
          {progress === null ? null : (
            <StatusIndicator tone="info">
              {`QR ${formatNumber(progress.read)} de ${formatNumber(progress.of)} leído`}
            </StatusIndicator>
          )}
        </>
      ) : (
        <EmptyState
          icon={<VideoOff />}
          variant="blank"
          title={CAMERA_ISSUE_TEXT[issue].title}
          description={CAMERA_ISSUE_TEXT[issue].description}
          actions={
            <Button
              variant="secondary"
              onPress={() => {
                setIssue(null);
                setAttempt(attempt + 1);
              }}
            >
              Probar de nuevo
            </Button>
          }
        />
      )}
    </div>
  );
}
