import type { AlertKind } from "@purosur/domain";

interface LocalAlertText {
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
} satisfies Partial<Record<AlertKind, LocalAlertText>>;

export function localAlertText(kind: string): LocalAlertText | undefined {
  return Object.hasOwn(LOCAL_ALERT_TEXTS, kind)
    ? LOCAL_ALERT_TEXTS[kind as keyof typeof LOCAL_ALERT_TEXTS]
    : undefined;
}
