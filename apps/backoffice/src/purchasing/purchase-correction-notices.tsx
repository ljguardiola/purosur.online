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
  | { kind: "unitsLeftTheLot" }
  | { kind: "unitsLeftTheLineLot" }
  | { kind: "countedSinceReceipt" }
  | { kind: "lastLine" }
  | { kind: "productNotFound" }
  | { kind: "productInactive" };

const LINE_REFUSAL_DESCRIPTIONS = {
  unitsLeftTheLineLot:
    "Ya salieron unidades del lote de esta línea; corregí el stock con un ajuste.",
  countedSinceReceipt:
    "Se contó el stock después de recibir la compra; corregí el stock con un ajuste.",
  lastLine: "Es la única línea de la compra; no se puede quitar.",
  productNotFound: "Este producto ya no está disponible. Elegí otro.",
  productInactive: "Este producto ya no está activo. Elegí otro.",
} as const;

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
    case "unitsLeftTheLineLot":
    case "countedSinceReceipt":
    case "lastLine":
    case "productNotFound":
    case "productInactive":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={failedTitle}
          description={LINE_REFUSAL_DESCRIPTIONS[notice.kind]}
        />
      );
    case undefined:
      return null;
  }
}
