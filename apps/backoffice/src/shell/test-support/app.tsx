import { defineHelp } from "@purosur/ui";
import { page } from "vitest/browser";

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

export async function resetPageState() {
  // The default browser viewport is phone-sized, which the backoffice is not laid out for.
  await page.viewport(1280, 900);
  window.history.pushState(null, "", "/");
  window.localStorage.clear();
}
