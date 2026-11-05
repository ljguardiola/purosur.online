import { InlineNotice } from "@purosur/ui";
import { Info, ShieldX, TriangleAlert } from "lucide-react";
import { ActionFailureNotice } from "../platform/action-failure-notice";
import { retryAfterDetail } from "../platform/retry-after-detail";

export type PurchaseCorrectionNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "notFound" }
  | { kind: "unchanged" }
  | { kind: "notEnoughInLot" }
  | { kind: "unitsLeftTheLot" };

export function PurchaseCorrectionNotices({
  notice,
  failedTitle,
}: {
  notice: PurchaseCorrectionNotice | null;
  failedTitle: string;
}) {
  switch (notice?.kind) {
    case "attemptFailed":
      return <ActionFailureNotice title={failedTitle} description="Volvé a intentarlo." />;
    case "rateLimited":
      return (
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title="Demasiadas solicitudes"
          description={retryAfterDetail(notice.retryAfterSeconds)}
        />
      );
    case "notFound":
      return (
        <InlineNotice tone="error" icon={<TriangleAlert />} title="Esta compra ya no existe" />
      );
    case "unchanged":
      return <InlineNotice tone="info" icon={<Info />} title="No hay cambios para guardar" />;
    case "notEnoughInLot":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={failedTitle}
          description="Solo se puede dar otra fecha a menos unidades de las que quedan en el lote."
        />
      );
    case "unitsLeftTheLot":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={failedTitle}
          description="Las unidades que ya salieron del lote no se pueden quitar de la compra."
        />
      );
    case undefined:
      return null;
  }
}
