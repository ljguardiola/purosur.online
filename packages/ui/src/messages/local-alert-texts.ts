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

type LocalSalesDeniedReason = keyof typeof SALES_DENIED_TEXTS;

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
  late_payment_refund: {
    title: "Reembolso pendiente por un pago tardío",
    meaning: "Mercado Pago cobró un QR de una venta que ya se había cobrado por otro medio.",
    whatToDo:
      "Si ese reembolso ya se hizo desde Mercado Pago, marcarlo como hecho; si todavía no se hizo, hacerlo cuanto antes por el mismo medio, o descartarlo si no corresponde. El Administrador ya fue avisado.",
  },
  refund_task: {
    title: "Reembolso pendiente de confirmar",
    meaning: "Hay un reembolso aprobado que todavía no quedó marcado como hecho en el sistema.",
    whatToDo:
      "Si ese reembolso ya se hizo por fuera del sistema, marcarlo como hecho; si todavía no se hizo, hacerlo cuanto antes. El Administrador ya fue avisado.",
  },
  fiscal_emission_stopped: {
    title: "Emisión de facturas detenida",
    meaning:
      "Esta caja no puede emitir ningún comprobante fiscal por ahora, ni siquiera el de contingencia.",
    whatToDo:
      "Seguir vendiendo igual: se cobra la venta, se entrega al cliente el papel que indica que todavía no es la factura y que debe conservarlo, y la factura se emite sola más adelante. El Administrador ya fue avisado.",
  },
} satisfies Record<string, LocalAlertText>;

export type LocalAlertKind = keyof typeof FIXED_LOCAL_ALERT_TEXTS | "sales_denied";

export type LocalAlertSubject =
  | { kind: "sales_denied"; reason: LocalSalesDeniedReason }
  | { kind: "late_payment_refund"; providerOrderId: string | null; reason?: undefined }
  | { kind: Exclude<LocalAlertKind, "sales_denied" | "late_payment_refund">; reason?: undefined };

export function isLocalAlertKind(value: string): value is LocalAlertKind {
  return value === "sales_denied" || Object.hasOwn(FIXED_LOCAL_ALERT_TEXTS, value);
}

export function localAlertTitle(kind: string): string | undefined {
  if (!isLocalAlertKind(kind)) {
    return undefined;
  }
  return kind === "sales_denied" ? SALES_DENIED_TITLE : FIXED_LOCAL_ALERT_TEXTS[kind].title;
}

function secondPaidOrderText(providerOrderId: string): LocalAlertText {
  return {
    ...FIXED_LOCAL_ALERT_TEXTS.late_payment_refund,
    meaning: `El QR de una venta se pagó dos veces; el pago de más es el de la orden ${providerOrderId} de Mercado Pago.`,
  };
}

export function localAlertText(subject: LocalAlertSubject): LocalAlertText {
  if (subject.kind === "sales_denied") {
    return SALES_DENIED_TEXTS[subject.reason];
  }
  if (subject.kind === "late_payment_refund" && subject.providerOrderId !== null) {
    return secondPaidOrderText(subject.providerOrderId);
  }
  return FIXED_LOCAL_ALERT_TEXTS[subject.kind];
}
