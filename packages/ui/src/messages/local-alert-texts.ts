export interface LocalAlertText {
  title: string;
  meaning: string;
  whatToDo: string;
}

const LOCAL_ALERT_TEXTS = {
  register_silent: {
    title: "La caja no está sincronizando",
    meaning:
      "Hace rato que esta caja no logra mandar nada a la nube durante el horario de atención.",
    whatToDo:
      "Se puede seguir vendiendo con normalidad. Revisar la conexión a internet del local; en cuanto vuelva, la caja se pone al día sola. El Administrador ya fue avisado.",
  },
  sales_denied: {
    title: "La caja no puede vender",
    meaning:
      "Esta caja dejó de abrir ventas nuevas porque encontró un problema en su registro de operaciones.",
    whatToDo:
      "Avisar al Administrador de inmediato; ya fue notificado, pero conviene confirmarle la situación.",
  },
  installation_revoked: {
    title: "La instalación de esta caja fue revocada",
    meaning:
      "Esta caja ya no abre ventas nuevas: se dio de alta otra instalación para la misma caja, o la nube encontró un problema en el registro de operaciones que le envió. Lo que ya está guardado en la caja se conserva.",
    whatToDo:
      "Avisar al Administrador. Para volver a vender, hay que dar de alta la caja de nuevo con un código de alta emitido desde el backoffice, en Cajas registradoras.",
  },
  serial_device_missing: {
    title: "Balanza o lector no detectado",
    meaning:
      "La balanza o el lector de códigos dejaron de responder en esta caja, o el conectado no es el registrado.",
    whatToDo:
      "Revisar que esté conectado y encendido. Mientras tanto, tipear el peso a mano y buscar los productos por nombre. Si sigue sin detectarse, avisar al Administrador.",
  },
} satisfies Record<string, LocalAlertText>;

export type LocalAlertKind = keyof typeof LOCAL_ALERT_TEXTS;

export function isLocalAlertKind(value: string): value is LocalAlertKind {
  return Object.hasOwn(LOCAL_ALERT_TEXTS, value);
}

export function localAlertText(kind: string): LocalAlertText | undefined {
  return isLocalAlertKind(kind) ? LOCAL_ALERT_TEXTS[kind] : undefined;
}
