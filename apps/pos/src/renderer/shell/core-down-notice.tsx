import { BrandPanelScreen } from "./brand-panel-screen";

export function CoreDownNotice() {
  return (
    <BrandPanelScreen>
      <div role="alert" className="flex w-full max-w-112 flex-col gap-4">
        <p className="text-display text-text-accent">Esperá un momento</p>
        <p className="text-body leading-sm text-text-subtle">
          La caja vuelve a funcionar sola en unos minutos.
        </p>
      </div>
    </BrandPanelScreen>
  );
}
