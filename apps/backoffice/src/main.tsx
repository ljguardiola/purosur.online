import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../../packages/ui/src/styles/tokens.css";
import { help } from "./help/help";
import { startErrorReporting } from "./platform/error-reporter";
import { fetchErrorReportingConfiguration } from "./platform/error-reporting-configuration-api";
import { App } from "./shell/app";

startErrorReporting({
  target: window,
  fetchConfiguration: fetchErrorReportingConfiguration,
  startSending: async (configuration) =>
    (await import("./platform/sentry-browser")).startSentryReporting(configuration),
});

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App help={help} />
    </StrictMode>,
  );
}
