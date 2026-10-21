import { ScreenHeader } from "@purosur/ui";
import { BrandPanelScreen } from "../shell/brand-panel-screen";

export function RestoringScreen({ registerName }: { registerName: string | null }) {
  const restored = "RESTAURADA DESDE UNA COPIA";
  return (
    <BrandPanelScreen>
      <main className="flex w-full max-w-110 flex-col gap-4">
        <ScreenHeader
          eyebrow={registerName === null ? restored : `${registerName.toUpperCase()} · ${restored}`}
          title="La caja no puede vender todavía"
          description="Antes de vender tiene que ponerse al día con la nube, para no repetir números de factura."
        />
      </main>
    </BrandPanelScreen>
  );
}
