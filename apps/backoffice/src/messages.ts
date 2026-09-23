import { defineMessages } from "@purosur/ui";

// Every store is in Argentina, so a passkey's dates render in that timezone regardless of the
// browser's own clock, instead of drifting with wherever a device happens to be set to.
const PASSKEY_TIME_ZONE = "America/Argentina/Buenos_Aires";
const PASSKEY_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: PASSKEY_TIME_ZONE,
};
const PASSKEY_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: PASSKEY_TIME_ZONE,
};

export const messages = defineMessages("es-AR", (f) => ({
  shell: {
    brandName: "Puro Sur",
    areaRailLabel: "Áreas",
    signOut: {
      itemLabel: "Salir",
      title: "¿Salir del backoffice?",
      closeLabel: "Cerrar",
      cancel: "Cancelar",
      confirm: "Salir",
      failedTitle: "No se pudo salir",
      failedDetail: "Probá de nuevo.",
    },
  },
  access: {
    brandCaption: "Backoffice",
    signIn: {
      eyebrow: "Puro Sur",
      heading: "Ingresar",
      description:
        "Con la passkey de este dispositivo: la huella, la cara o el PIN de la computadora o del teléfono.",
      recoverLink: "Perdí mis passkeys",
      submit: "Ingresar con passkey",
      blockedTitle: "Demasiados intentos desde esta conexión",
      blockedDetail: (params: { minutes: number }) =>
        `Se puede volver a intentar en ${f.plural(params.minutes, { one: "1 minuto", other: `${params.minutes} minutos` })}.`,
      expiredTitle: "Tu sesión venció",
      expiredDetail: "Se cierra sola a los 30 minutos sin uso o a las 12 horas de haber ingresado.",
      checkFailedTitle: "No pudimos verificar tu sesión",
      checkFailedDetail: "Probá de nuevo en unos minutos.",
      attemptFailedTitle: "No se pudo ingresar",
      attemptFailedDetail: "Probá de nuevo.",
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
      sentNoticeTitle: "Si el correo es de una cuenta, te enviamos el enlace",
      sentNoticeDetail:
        "Vale 15 minutos y se usa una sola vez. Si no aparece, mirá en correo no deseado.",
    },
    registerPasskey: {
      heading: "Registrá una passkey nueva",
      description: "Con ella vas a ingresar de ahora en adelante.",
      nameLabel: "Nombre de la passkey",
      nameHelper: "Por ejemplo, Notebook del local.",
      nameRequired: "Ingresá un nombre para la passkey.",
      nameTooLong: "El nombre no puede superar los 40 caracteres.",
      submit: "Registrar la passkey",
      footerHint:
        "Después conviene agregar una segunda, por ejemplo en el teléfono, desde Mi cuenta.",
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
      sessionsClosedTitle: "Se cerraron las sesiones abiertas de tu cuenta",
      sessionsClosedDetail: "Si alguien más estaba adentro con tu cuenta, ya no lo está.",
    },
  },
  settings: {
    areaLabel: "Config",
    sectionsHeading: "Configuración",
    sectionsNavLabel: "Configuración",
    usersSectionLabel: "Usuarios",
    myAccount: {
      documentTitle: "Mi cuenta · Puro Sur",
      breadcrumb: (params: { name: string }) => `Configuración · ${params.name}`,
      heading: "Mi cuenta",
      passkeys: {
        title: "Passkeys",
        registerAnother: "Registrar otra passkey",
        singlePasskeyWarning:
          "Tenés una sola passkey. Si perdés este dispositivo no podés entrar al backoffice: conviene registrar otra, por ejemplo en el teléfono.",
        noPasskeysWarning:
          "No tenés ninguna passkey. Para volver a entrar al backoffice vas a tener que pedir el enlace de recuperación por correo.",
        rowDetail: (params: { registeredOn: Date; lastUsedAt?: Date; now: Date }) => {
          const registered = `Registrada el ${f.date(params.registeredOn, PASSKEY_DATE_OPTIONS)}`;
          if (!params.lastUsedAt) {
            return registered;
          }
          const time = f.date(params.lastUsedAt, PASSKEY_TIME_OPTIONS);
          const lastUsedDate = f.date(params.lastUsedAt, PASSKEY_DATE_OPTIONS);
          const sameDay = lastUsedDate === f.date(params.now, PASSKEY_DATE_OPTIONS);
          const lastUsed = sameDay
            ? `último uso hoy ${time}`
            : `último uso el ${lastUsedDate} ${time}`;
          return `${registered} · ${lastUsed}`;
        },
        remove: (params: { name: string }) => `Dar de baja la passkey «${params.name}»`,
        loading: "Cargando tus passkeys…",
        loadErrorTitle: "No pudimos abrir tus passkeys",
        loadErrorDetail: "Probá de nuevo en unos minutos.",
        retry: "Reintentar",
        register: {
          eyebrow: "Mi cuenta · Passkeys",
          heading: "Registrar una passkey",
          nameLabel: "Nombre de la passkey",
          nameHelper: "Por ejemplo, Teléfono de Lucía.",
          nameRequired: "Ingresá un nombre para la passkey.",
          nameTooLong: "El nombre no puede superar los 40 caracteres.",
          cancel: "Cancelar",
          submit: "Registrar la passkey",
          closeLabel: "Cerrar",
          attemptFailedTitle: "No se pudo registrar la passkey",
          attemptFailedDetail: "Probá de nuevo.",
        },
        removeModal: {
          title: "¿Dar de baja la passkey?",
          body: (params: { name: string }) => `«${params.name}» deja de servir para entrar.`,
          onlyPasskeyWarning:
            "Es tu única passkey: para volver a entrar vas a tener que pedir el enlace de recuperación por correo.",
          cancel: "Cancelar",
          confirm: "Dar de baja",
          closeLabel: "Cerrar",
          attemptFailedTitle: "No se pudo dar de baja la passkey",
          attemptFailedDetail: "Probá de nuevo.",
        },
      },
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
