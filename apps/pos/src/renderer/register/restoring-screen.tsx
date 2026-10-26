import type { RestorationStandingAnswer } from "@purosur/contracts";
import { InlineNotice, ScreenHeader } from "@purosur/ui";
import { Printer, QrCode, TriangleAlert, WifiOff } from "lucide-react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { registerEyebrow } from "./register-eyebrow";

export type RestoringStanding =
  | Exclude<Extract<RestorationStandingAnswer, { kind: "in_progress" }>, { step: "enroll" }>
  | Extract<RestorationStandingAnswer, { kind: "without_connection" | "failed" }>;

export function RestoringScreen({
  registerName,
  standing,
}: {
  registerName: string | null;
  standing: RestoringStanding;
}) {
  if (standing.kind === "failed" && standing.step === "replenish") {
    const originEyebrow =
      standing.origin === "no_copy" ? "REINSTALADA SIN COPIA" : "RESTAURADA DESDE UNA COPIA";
    return (
      <BrandPanelScreen>
        <main className="flex w-full max-w-110 flex-col gap-4">
          <ScreenHeader
            eyebrow={registerEyebrow(registerName, originEyebrow)}
            title="La caja no pudo ponerse al día"
            description="La caja no puede vender hasta ponerse al día con la nube."
          />
          {standing.failure === "unreadable_event" ? (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Actualizá la caja"
              description="Esta versión no puede leer parte de lo que mandó la nube. Después de actualizar, la caja lo intenta sola."
            />
          ) : (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Llamá a un Administrador"
              description="La nube rechazó ponerla al día. Un Administrador tiene que dar de alta la caja de nuevo."
            />
          )}
        </main>
      </BrandPanelScreen>
    );
  }
  if (standing.kind === "failed") {
    return (
      <BrandPanelScreen>
        <main className="flex w-full max-w-110 flex-col gap-4">
          <ScreenHeader
            eyebrow={registerEyebrow(registerName, "SIN COPIA PARA RESTAURAR")}
            title="No se pudo restaurar la caja"
            description="Ninguna copia de esta caja se pudo recuperar. Se vuelve a intentar la próxima vez que se inicie la aplicación."
          />
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="Contactá a soporte"
            description="Mientras tanto la caja no puede vender."
          />
        </main>
      </BrandPanelScreen>
    );
  }
  const restoredEyebrow =
    standing.step === "restore" ? "RESTAURANDO DESDE UNA COPIA" : "RESTAURADA DESDE UNA COPIA";
  const eyebrow = standing.origin === "no_copy" ? "REINSTALADA SIN COPIA" : restoredEyebrow;
  return (
    <BrandPanelScreen>
      <main className="flex w-full max-w-110 flex-col gap-4">
        <ScreenHeader
          eyebrow={registerEyebrow(registerName, eyebrow)}
          title="La caja no puede vender todavía"
          description="Antes de vender tiene que ponerse al día con la nube, para no repetir números de factura."
        />
        {standing.kind === "without_connection" ? (
          <InlineNotice
            tone="warning"
            icon={<WifiOff />}
            title="Sin conexión con la nube"
            description="Si el local no tiene internet, conectá la notebook al hotspot de un celular. La caja sigue sola en cuanto hay conexión."
          />
        ) : null}
        {standing.step === "recover_contingency_tickets" ? (
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
              description="En Rescate de tickets. La caja sigue sola cuando se termina el rescate."
            />
          </>
        ) : null}
      </main>
    </BrandPanelScreen>
  );
}
