import { InlineNotice } from "@purosur/ui";
import { ShieldX, TriangleAlert } from "lucide-react";
import { retryAfterDetail } from "../platform/retry-after-detail";

export type RecipeSaveNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "staleVersion" }
  | { kind: "productNotFound" };

export function RecipeSaveNotice({ notice }: { notice: RecipeSaveNotice }) {
  return (
    <>
      {notice.kind === "attemptFailed" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="No se guardó la receta"
          description="Volvé a intentarlo."
        />
      )}
      {notice.kind === "rateLimited" && (
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title="Demasiadas solicitudes"
          description={retryAfterDetail(notice.retryAfterSeconds)}
        />
      )}
      {notice.kind === "staleVersion" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="Otra persona cambió esta receta"
          description="Cerrá esta ventana y volvé a abrirla para ver cómo quedó."
        />
      )}
      {notice.kind === "productNotFound" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="Este producto ya no está disponible"
          description="Cerrá esta ventana y actualizá la lista."
        />
      )}
    </>
  );
}
