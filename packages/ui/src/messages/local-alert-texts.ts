export interface LocalAlertText {
  title: string;
  meaning: string;
  whatToDo: string;
}

const SALES_DENIED_TITLE = "La caja no puede vender";

const SALES_DENIED_TEXTS = {
  event_history_broken: {
    title: SALES_DENIED_TITLE,
    meaning:
      "Esta caja dejó de abrir ventas nuevas porque encontró un problema en su registro de operaciones.",
    whatToDo:
      "Avisar al Administrador de inmediato; ya fue notificado, pero conviene confirmarle la situación.",
  },
  local_database_damaged: {
    title: SALES_DENIED_TITLE,
    meaning: "Esta caja dejó de abrir ventas nuevas porque su base de datos está dañada.",
    whatToDo:
      "Restaurar la base de datos de la caja desde su copia de respaldo. No hace falta dar de alta la caja de nuevo: cuando vuelva a vender, esta alerta se cierra sola.",
  },
} satisfies Record<string, LocalAlertText>;

export type LocalSalesDeniedReason = keyof typeof SALES_DENIED_TEXTS;

const FIXED_LOCAL_ALERT_TEXTS = {
  register_silent: {
    title: "La caja no está sincronizando",
    meaning:
      "Hace rato que esta caja no logra mandar nada a la nube durante el horario de atención.",
    whatToDo:
      "Se puede seguir vendiendo con normalidad. Revisar la conexión a internet del local; en cuanto vuelva, la caja se pone al día sola. El Administrador ya fue avisado.",
  },
  installation_revoked: {
    title: "La instalación de esta caja fue revocada",
    meaning:
      "Esta caja ya no abre ventas nuevas: se dio de alta otra instalación para la misma caja, o la nube encontró un problema en el registro de operaciones que le envió. Lo que ya está guardado en la caja se conserva.",
    whatToDo:
      "Avisar al Administrador. Para volver a vender, hay que dar de alta la caja de nuevo con un código de alta emitido desde el backoffice, en Cajas registradoras.",
  },
  serial_device_missing: {
    title: "Revisar la balanza o el lector",
    meaning:
      "La balanza o el lector de códigos dejaron de responder en esta caja, o el conectado no es el registrado.",
    whatToDo:
      "Revisar que esté conectado y encendido. Mientras tanto, tipear el peso a mano y buscar los productos por nombre. Si el problema sigue, avisar al Administrador.",
  },
} satisfies Record<string, LocalAlertText>;

export type LocalAlertKind = keyof typeof FIXED_LOCAL_ALERT_TEXTS | "sales_denied";

export type LocalAlertSubject =
  | { kind: "sales_denied"; reason: LocalSalesDeniedReason }
  | { kind: Exclude<LocalAlertKind, "sales_denied">; reason?: undefined };

export function isLocalAlertKind(value: string): value is LocalAlertKind {
  return value === "sales_denied" || Object.hasOwn(FIXED_LOCAL_ALERT_TEXTS, value);
}

export function localAlertTitle(kind: string): string | undefined {
  if (!isLocalAlertKind(kind)) {
    return undefined;
  }
  return kind === "sales_denied" ? SALES_DENIED_TITLE : FIXED_LOCAL_ALERT_TEXTS[kind].title;
}

export function localAlertText(subject: LocalAlertSubject): LocalAlertText {
  return subject.kind === "sales_denied"
    ? SALES_DENIED_TEXTS[subject.reason]
    : FIXED_LOCAL_ALERT_TEXTS[subject.kind];
}
