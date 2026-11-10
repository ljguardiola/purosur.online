import { InlineNotice } from "@purosur/ui";
import { ShieldX, TriangleAlert } from "lucide-react";
import { ActionFailureNotice } from "../platform/action-failure-notice";
import { retryAfterDetail } from "../platform/retry-after-detail";

export type AssemblyBatchNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "staleRecipe" }
  | { kind: "componentGone"; name: string };

export function AssemblyBatchNotice({ notice }: { notice: AssemblyBatchNotice }) {
  switch (notice.kind) {
    case "attemptFailed":
      return (
        <ActionFailureNotice
          title="No se registró la producción"
          description="Volvé a intentarlo."
        />
      );
    case "rateLimited":
      return (
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title="Demasiadas solicitudes"
          description={retryAfterDetail(notice.retryAfterSeconds)}
        />
      );
    case "staleRecipe":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="La receta cambió"
          description="Cerrá esta ventana y volvé a abrirla para usar la receta actual."
        />
      );
    case "componentGone":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={`${notice.name} ya no está disponible`}
          description="Quitalo de la receta en Recetas para registrar esta producción."
        />
      );
  }
}
