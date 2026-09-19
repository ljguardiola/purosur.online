import { defineHelp } from "@purosur/ui";

// The register's own help content. It ships inside the register's installer and never imports
// from the backoffice's help content, so it stays available offline.
export const help = defineHelp("es-AR", { categories: {}, articles: {} });
