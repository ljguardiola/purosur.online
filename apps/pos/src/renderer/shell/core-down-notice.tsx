import { BrandPanelScreen } from "./brand-panel-screen";

export function CoreDownNotice() {
  return (
    <BrandPanelScreen>
      <div role="alert" className="flex w-full max-w-md flex-col gap-4">
        <p className="text-3xl font-bold text-text-accent">Esperá un momento</p>
        <p className="text-base leading-[1.35] text-text-subtle">
          La caja vuelve a funcionar sola en unos minutos.
        </p>
      </div>
    </BrandPanelScreen>
  );
}
