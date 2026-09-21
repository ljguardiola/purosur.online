import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../../packages/ui/src/styles/tokens.css";
import { App } from "./App";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
