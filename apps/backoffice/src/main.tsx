import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../../packages/ui/src/styles/tokens.css";
import { App } from "./App";
import { help } from "./help";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App help={help} />
    </StrictMode>,
  );
}
