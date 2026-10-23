import type { RestorationStandingAnswer } from "@purosur/contracts";
import { InlineNotice, ScreenHeader } from "@purosur/ui";
import { TriangleAlert, WifiOff } from "lucide-react";
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
      </main>
    </BrandPanelScreen>
  );
}
