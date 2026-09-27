import { useCoreStatus } from "../platform/use-core-status";
import { BrandPanelScreen } from "./brand-panel-screen";
import { CoreDownNotice } from "./core-down-notice";

export function App() {
  const coreStatus = useCoreStatus();

  if (coreStatus === "down") {
    return <CoreDownNotice />;
  }

  if (coreStatus === "starting") {
    return <BrandPanelScreen />;
  }

  return (
    <main>
      <p>Puro Sur está listo</p>
    </main>
  );
}
