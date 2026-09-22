import { defineMessages } from "@purosur/ui";

export const messages = defineMessages("es-AR", (f) => ({
  shell: {
    brandName: "Puro Sur",
    areaRailLabel: "Áreas",
  },
  access: {
    brandCaption: "Backoffice",
    signIn: {
      eyebrow: "Puro Sur",
      heading: "Ingresar",
      description:
        "Con la passkey de este dispositivo: la huella, la cara o el PIN de la computadora o del teléfono.",
      recoverLink: "Perdí mis passkeys",
    },
    accountRecovery: {
      eyebrow: "Perdí mis passkeys",
      heading: "Recuperar el acceso",
      description: "Te mandamos un enlace al correo de tu cuenta para registrar una passkey nueva.",
      emailLabel: "Correo de tu cuenta",
      emailRequired: "Ingresá tu correo.",
      emailInvalid: "Ingresá un correo válido.",
      submit: "Enviar el enlace",
      backLink: "Volver a ingresar",
      rateLimitedTitle: "Demasiados pedidos de recuperación",
      rateLimitedDetail: (params: { minutes: number }) =>
        `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      errorTitle: "No pudimos enviar el enlace",
      errorDetail: "Probá de nuevo en unos minutos.",
      sentEyebrow: "Recuperar el acceso",
      sentHeading: "Revisá tu correo",
      sentNoticeTitle: "Si el correo es de una cuenta, ya llegó el enlace",
      sentNoticeDetail:
        "Vale 15 minutos y se usa una sola vez. Si no aparece, mirá en correo no deseado.",
    },
    registerPasskey: {
      heading: "Registrá una passkey nueva",
      description: "Con ella vas a ingresar de ahora en adelante.",
      submit: "Registrar la passkey",
      footerHint:
        "Después conviene agregar una segunda, por ejemplo en el teléfono, desde Usuarios.",
      loading: "Abriendo el registro…",
      invalidTitle: "Este enlace no es válido",
      invalidDetail: "Revisá que el enlace esté completo.",
      burnedTitle: "Este enlace ya no se puede usar",
      burnedDetail: "Ya se usó o se pidió uno más nuevo.",
      expiredTitle: "Este enlace venció",
      expiredDetail: "Los enlaces valen 15 minutos.",
      requestNewLink: "Pedir un enlace nuevo",
      rateLimitedTitle: "Demasiados intentos desde esta conexión",
      rateLimitedDetail: (params: { minutes: number }) =>
        `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      loadErrorTitle: "No pudimos abrir el registro",
      loadErrorDetail: "Probá de nuevo en unos minutos.",
      retry: "Reintentar",
      attemptFailedTitle: "No se pudo registrar la passkey",
      attemptFailedDetail: "Podés volver a intentarlo con este mismo enlace.",
      successTitle: "Registraste la passkey",
      goToSignIn: "Ir a ingresar",
    },
  },
  help: {
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
