import type { Icon, NoticeTone } from "@purosur/ui";
import { Check, ShieldX, TriangleAlert } from "lucide-react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { webPageRefusalMessage } from "./supplier-price-list-web-page-refusal";
import type { WebPageRefusalReason } from "./supplier-price-lists-api";

export type ReadNotice =
  | { kind: "rereadStarted" }
  | { kind: "alreadyReading" }
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "dailyCapReached" }
  | { kind: "fileTooLarge" }
  | { kind: "notAPdf" }
  | { kind: "supplierInactive" }
  | { kind: "supplierNotFound" }
  | { kind: "refreshedSupplierInactive" }
  | { kind: "refreshedSupplierNotFound" }
  | { kind: "readingUnavailable" }
  | { kind: "pageRefused"; reason: WebPageRefusalReason };

export type ReadNoticeContent = {
  tone: NoticeTone;
  icon: Icon;
  title: string;
  description: string;
};

function problem(title: string, description: string): ReadNoticeContent {
  return { tone: "error", icon: <TriangleAlert />, title, description };
}

export function readNoticeContent(notice: ReadNotice): ReadNoticeContent {
  switch (notice.kind) {
    case "rereadStarted":
      return {
        tone: "success",
        icon: <Check />,
        title: "Actualizando la lista",
        description: "Se está leyendo la página de nuevo. Cuando termine, se ven los cambios.",
      };
    case "alreadyReading":
      return {
        tone: "warning",
        icon: <TriangleAlert />,
        title: "La lista ya se está actualizando",
        description: "Cuando termine, se ven los cambios.",
      };
    case "dailyCapReached":
      return {
        tone: "warning",
        icon: <TriangleAlert />,
        title: "Por hoy no se pueden leer más listas",
        description:
          "Se llegó al tope de lecturas del día de esta sucursal. La lista se puede cargar mañana.",
      };
    case "fileTooLarge":
      return problem("El archivo es demasiado grande", "Elegí un PDF más liviano.");
    case "notAPdf":
      return problem("El archivo no es un PDF válido", "Elegí otro archivo.");
    case "supplierInactive":
      return problem("Este proveedor está desactivado", "Elegí otro proveedor.");
    case "supplierNotFound":
      return problem("Este proveedor ya no existe", "Elegí otro proveedor.");
    case "refreshedSupplierInactive":
      return problem(
        "Este proveedor está desactivado",
        "Reactivalo en Proveedores para volver a leer su página.",
      );
    case "refreshedSupplierNotFound":
      return problem("Este proveedor ya no existe", "Su lista ya no se puede actualizar.");
    case "readingUnavailable":
      return problem("La lectura de listas no está disponible", "Volvé a intentarlo más tarde.");
    case "pageRefused":
      return problem("No se pudo leer la página", webPageRefusalMessage(notice.reason));
    case "rateLimited":
      return {
        tone: "error",
        icon: <ShieldX />,
        title: "Demasiadas solicitudes",
        description: retryAfterDetail(notice.retryAfterSeconds),
      };
    case "attemptFailed":
      return problem("No se cargó la lista", "Volvé a intentarlo.");
  }
}
