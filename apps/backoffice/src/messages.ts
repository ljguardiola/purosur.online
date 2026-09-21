import { defineMessages } from "@purosur/ui";

export const messages = defineMessages("es-AR", () => ({
  shell: {
    areaRailLabel: "Áreas",
  },
  ayuda: {
    areaLabel: "Ayuda",
    sectionsHeading: "Ayuda",
    searchPlaceholder: "Buscar en la ayuda",
    breadcrumb: (params: { section: string }) => `Ayuda · ${params.section}`,
    relatedHeading: "También te puede servir",
    emptyTitle: "Todavía no hay contenido de ayuda",
    emptyBody: "Cuando se sumen funciones nuevas, sus artículos van a aparecer acá.",
    noResultsTitle: "Sin resultados",
    noResultsBody: "Probá con otras palabras.",
  },
}));
