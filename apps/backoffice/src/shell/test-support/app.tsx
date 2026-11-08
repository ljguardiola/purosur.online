import { defineHelp } from "@purosur/ui";
import { page } from "vitest/browser";
import type { FetchAlertsOverviewOutcome } from "../../alerts/alerts-api";

export const emptyHelp = defineHelp("es-AR", { categories: {}, articles: {} });

export const help = defineHelp("es-AR", {
  categories: {
    getting_started: { label: "Primeros pasos" },
    billing: { label: "Facturación" },
  },
  articles: {
    intro: {
      category: "getting_started",
      title: "Bienvenida",
      body: [{ kind: "paragraph", text: "Configurá tu catálogo antes de abrir la caja." }],
    },
    billing_basics: {
      category: "billing",
      title: "Facturación básica",
      body: [{ kind: "paragraph", text: "Cómo emitir una factura." }],
    },
  },
});

export const threeOpenAlerts: FetchAlertsOverviewOutcome = {
  kind: "ok",
  value: {
    critical: { openCount: 1, kinds: ["user_access_increased"], localKinds: [] },
    warning: { openCount: 2, kinds: ["user_email_changed"], localKinds: [] },
    informational: { openCount: 0, kinds: [], localKinds: [] },
  },
};

export async function resetPageState() {
  // The default browser viewport is phone-sized, which the backoffice is not laid out for.
  await page.viewport(1280, 900);
  window.history.pushState(null, "", "/");
  window.localStorage.clear();
}
