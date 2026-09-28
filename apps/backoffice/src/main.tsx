import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@purosur/ui/tokens.css";
import { help } from "./help/help";
import { App } from "./shell/app";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App help={help} />
    </StrictMode>,
  );
}
