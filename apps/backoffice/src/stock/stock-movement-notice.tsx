import { InlineNotice } from "@purosur/ui";
import { ShieldX, TriangleAlert } from "lucide-react";
import { ActionFailureNotice } from "../platform/action-failure-notice";
import { retryAfterDetail } from "../platform/retry-after-detail";

export type StockMovementNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "notFound" };

export function StockMovementNotice({ notice }: { notice: StockMovementNotice }) {
  return (
    <>
      {notice.kind === "attemptFailed" && (
        <ActionFailureNotice title="No se pudo guardar el movimiento" />
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
