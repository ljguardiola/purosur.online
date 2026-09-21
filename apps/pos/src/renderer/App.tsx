import { messages } from "../messages";
import { BrandPanelScreen } from "./BrandPanelScreen";
import { CoreDownNotice } from "./CoreDownNotice";
import { useCoreStatus } from "./useCoreStatus";

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
      <p>{messages.shell.ready}</p>
    </main>
  );
}
