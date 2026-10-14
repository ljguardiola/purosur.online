import { InlineNotice } from "@purosur/ui";
import { ShieldX, TriangleAlert } from "lucide-react";
import { retryAfterDetail } from "../platform/retry-after-detail";

export type AssemblyBatchNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "staleRecipe" }
  | { kind: "productGone" };

export function AssemblyBatchNotice({ notice }: { notice: AssemblyBatchNotice }) {
  switch (notice.kind) {
    case "attemptFailed":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="No se registró la tanda"
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
    case "productGone":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="Este producto ya no tiene receta"
          description="Cerrá esta ventana y actualizá la lista."
        />
      );
  }
}
