import type { RestorationStandingAnswer } from "@purosur/contracts";
import { ElevatedPanel, InlineNotice } from "@purosur/ui";
import {
  Download,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { registerEyebrow } from "../shell/register-eyebrow";

export type RestoringStanding =
  | Exclude<Extract<RestorationStandingAnswer, { kind: "in_progress" }>, { step: "enroll" }>
  | Extract<RestorationStandingAnswer, { kind: "without_connection" | "failed" }>;

export function RestoringScreen({
  registerName,
  version,
  standing,
}: {
  registerName: string | null;
  version: string | null;
  standing: RestoringStanding;
}) {
  return (
    <BrandPanelScreen version={version}>
      <main className="w-full max-w-110">
        <RestoringPanel registerName={registerName} standing={standing} />
      </main>
    </BrandPanelScreen>
  );
}

function RestoringPanel({
  registerName,
  standing,
}: {
  registerName: string | null;
  standing: RestoringStanding;
}) {
  if (standing.kind === "failed" && standing.step === "replenish") {
    const icon = standing.failure === "unreadable_event" ? <Download /> : <TriangleAlert />;
    return (
      <ElevatedPanel
        eyebrow={registerEyebrow(registerName, originEyebrow(standing.origin))}
        title="La caja no pudo ponerse al día"
        icon={icon}
        tone="error"
      >
        {standing.failure === "unreadable_event" ? (
          <InlineNotice
            tone="error"
            icon={icon}
            title="Actualizá la caja"
            description="Esta versión no puede leer parte de lo que mandó la nube. Después de actualizar, la caja lo intenta sola."
          />
        ) : (
          <InlineNotice
            tone="error"
            icon={icon}
            title="Llamá a un Administrador"
            description="La nube rechazó ponerla al día. Un Administrador tiene que dar de alta la caja de nuevo."
          />
        )}
      </ElevatedPanel>
    );
  }
  if (standing.kind === "failed") {
    return (
      <ElevatedPanel
        eyebrow={registerEyebrow(registerName, "SIN COPIA PARA RESTAURAR")}
        title="No se pudo restaurar la caja"
        icon={<TriangleAlert />}
        tone="error"
      >
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="Contactá a soporte"
          description="Mientras tanto la caja no puede vender."
        />
      </ElevatedPanel>
    );
  }
  const recoveringTickets = standing.step === "recover_contingency_tickets";
  const eyebrow =
    standing.origin === "copy" && standing.step === "restore"
      ? "RESTAURANDO DESDE UNA COPIA"
      : originEyebrow(standing.origin);
  return (
    <ElevatedPanel
      eyebrow={registerEyebrow(registerName, eyebrow)}
      title="La caja no puede vender todavía"
      icon={recoveringTickets ? <Receipt /> : <RefreshCw />}
    >
      {standing.kind === "without_connection" ? <WithoutConnectionNotice /> : null}
      {standing.kind === "in_progress" && !recoveringTickets ? <CatchingUpNotice /> : null}
      {recoveringTickets ? <TicketRecoveryNotices /> : null}
    </ElevatedPanel>
  );
}

function originEyebrow(origin: "copy" | "no_copy") {
  return origin === "no_copy" ? "REINSTALADA SIN COPIA" : "RESTAURADA DESDE UNA COPIA";
}

function WithoutConnectionNotice() {
  return (
    <InlineNotice
      tone="warning"
      icon={<WifiOff />}
      title="Sin conexión con la nube"
      description="Si el local no tiene internet, conectá la notebook al hotspot de un celular. La caja sigue sola en cuanto hay conexión."
    />
  );
}

function CatchingUpNotice() {
  return (
    <InlineNotice
      tone="info"
      icon={<RefreshCw />}
      title="Poniéndose al día con la nube"
      description="Antes de vender, para no repetir números de factura."
    />
  );
}

function TicketRecoveryNotices() {
  return (
    <>
      <InlineNotice
        tone="info"
        icon={<Printer />}
        title="Revisá la impresora y el mostrador"
        description="Buscá un ticket de respaldo que todavía no se haya guardado en la caja del local: el último suele seguir ahí."
      />
      <InlineNotice
        tone="info"
        icon={<QrCode />}
        title="Escaneá los tickets en el backoffice"
        description="En Fiscal, «Rescatar tickets de contingencia». La caja sigue sola cuando se termina el rescate."
      />
    </>
  );
}
