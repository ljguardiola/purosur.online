import { defineMessages } from "@purosur/ui";

export const messages = defineMessages("es-AR", () => ({
  shell: {
    brandName: "Puro Sur",
    areaRailLabel: "Áreas",
  },
  ayuda: {
    areaLabel: "Ayuda",
    documentTitle: "Ayuda · Puro Sur",
    pageDocumentTitle: (params: { page: string }) => `${params.page} · Ayuda · Puro Sur`,
    sectionsHeading: "Ayuda",
    sectionsNavLabel: "Secciones de ayuda",
    searchPlaceholder: "Buscar en la ayuda",
    breadcrumb: (params: { section: string }) => `Ayuda · ${params.section}`,
    relatedHeading: "También te puede servir",
    emptyTitle: "Todavía no hay contenido de ayuda",
    emptyBody: "Cuando se sumen funciones nuevas, sus artículos van a aparecer acá.",
    pickSectionTitle: "Elegí una sección",
    pickSectionBody: "O buscá un tema.",
    noResultsTitle: "Sin resultados",
    noResultsBody: "Probá con otras palabras.",
  },
}));
