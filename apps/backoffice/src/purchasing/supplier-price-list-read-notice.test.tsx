import { expect, test } from "vitest";
import { type ReadNotice, readNoticeContent } from "./supplier-price-list-read-notice";

test.each([
  [
    { kind: "dailyCapReached" },
    "warning",
    "Por hoy no se pueden leer más listas",
    "Se llegó al tope de lecturas del día de esta sucursal. La lista se puede cargar mañana.",
  ],
  [
    { kind: "fileTooLarge" },
    "error",
    "El archivo es demasiado grande",
    "Elegí un PDF más liviano.",
  ],
  [{ kind: "notAPdf" }, "error", "El archivo no es un PDF válido", "Elegí otro archivo."],
  [
    { kind: "supplierInactive" },
    "error",
    "Este proveedor está desactivado",
    "Elegí otro proveedor.",
  ],
  [{ kind: "supplierNotFound" }, "error", "Este proveedor ya no existe", "Elegí otro proveedor."],
  [
    { kind: "rereadStarted" },
    "success",
    "Actualizando la lista",
    "Se está leyendo la página de nuevo. Mientras tanto, la lista se puede revisar.",
  ],
  [
    { kind: "alreadyReading" },
    "warning",
    "La lista ya se está actualizando",
    "Cuando termine, se ven los cambios.",
  ],
  [
    { kind: "refreshedSupplierInactive" },
    "error",
    "Este proveedor está desactivado",
    "Reactivalo en Proveedores para volver a leer su página.",
  ],
  [
    { kind: "refreshedSupplierNotFound" },
    "error",
    "Este proveedor ya no existe",
    "Su lista ya no se puede actualizar.",
  ],
  [
    { kind: "readingUnavailable" },
    "error",
    "La lectura de listas no está disponible",
    "Volvé a intentarlo más tarde.",
  ],
  [
    { kind: "pageRefused", reason: "too_large" },
    "error",
    "No se pudo leer la página",
    "La página es demasiado pesada.",
  ],
  [
    { kind: "rateLimited", retryAfterSeconds: 60 },
    "error",
    "Demasiadas solicitudes",
    "Se puede volver a intentar en 1 minuto.",
  ],
  [{ kind: "attemptFailed" }, "error", "No se cargó la lista", "Volvé a intentarlo."],
] as const satisfies readonly (readonly [ReadNotice, string, string, string])[])(
  "tells %j",
  (notice, tone, title, description) => {
    expect(readNoticeContent(notice)).toMatchObject({ tone, title, description });
  },
);
