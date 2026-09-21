import { useEffect } from "react";
import { messages } from "./messages";
import { navigate, useRoute } from "./router";
import { Shell } from "./Shell";

// The rail and section column stay empty here: later work (the Ayuda screen, then every other
// area) fills them in without touching this redirect or the shell's own layout.
export function App() {
  const route = useRoute();

  useEffect(() => {
    if (route === "/") {
      navigate("/ayuda");
    }
  }, [route]);

  return (
    <Shell areaRailLabel={messages.shell.areaRailLabel} rail={null} sectionColumn={null}>
      {null}
    </Shell>
  );
}
