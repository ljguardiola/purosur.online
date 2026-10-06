import { InlineNotice } from "@purosur/ui";
import { ShieldX, TriangleAlert } from "lucide-react";
import { retryAfterDetail } from "../platform/retry-after-detail";

export type StockMovementNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "notFound" };

export function StockMovementNotice({ notice }: { notice: StockMovementNotice }) {
  return (
    <>
      {notice.kind === "attemptFailed" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="No se pudo guardar el movimiento"
          description="Probá de nuevo."
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
      {notice.kind === "notFound" && (
        <InlineNotice tone="error" icon={<TriangleAlert />} title="Este producto ya no existe" />
      )}
    </>
  );
}
