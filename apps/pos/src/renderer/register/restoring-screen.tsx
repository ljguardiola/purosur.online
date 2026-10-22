import type { RestorationStandingAnswer } from "@purosur/contracts";
import { ScreenHeader } from "@purosur/ui";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { registerEyebrow } from "./register-eyebrow";

export type RestoringStep = Exclude<
  Extract<RestorationStandingAnswer, { kind: "in_progress" }>["step"],
  "enroll"
>;

export function RestoringScreen({
  registerName,
  step,
}: {
  registerName: string | null;
  step: RestoringStep;
}) {
  const standing =
    step === "restore" ? "RESTAURANDO DESDE UNA COPIA" : "RESTAURADA DESDE UNA COPIA";
  return (
    <BrandPanelScreen>
      <main className="flex w-full max-w-110 flex-col gap-4">
        <ScreenHeader
          eyebrow={registerEyebrow(registerName, standing)}
          title="La caja no puede vender todavía"
          description="Antes de vender tiene que ponerse al día con la nube, para no repetir números de factura."
        />
      </main>
    </BrandPanelScreen>
  );
}
