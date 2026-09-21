import { messages } from "../messages";
import { CoreDownNotice } from "./CoreDownNotice";
import { useCoreStatus } from "./useCoreStatus";

export function App() {
  const coreStatus = useCoreStatus();

  if (coreStatus === "down") {
    return <CoreDownNotice />;
  }

  if (coreStatus === "starting") {
    return <main />;
  }

  return (
    <main>
      <p>{messages.shell.ready}</p>
    </main>
  );
}
