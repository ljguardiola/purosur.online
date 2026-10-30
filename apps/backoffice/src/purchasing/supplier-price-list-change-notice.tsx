import { supplierPriceListRowProductCreationBodySchema } from "@purosur/contracts";
import { InlineNotice } from "@purosur/ui";
import { ShieldX, TriangleAlert } from "lucide-react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { schemaLimit } from "../platform/schema-limit";
import type { CreateProductFromSupplierItemOutcome } from "./supplier-item-products-api";
import type {
  ConfirmSupplierPriceListOutcome,
  LinkSupplierPriceListRowOutcome,
} from "./supplier-price-lists-api";

export type SupplierPriceListChangeNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "stale" }
  | { kind: "notEditable" }
  | { kind: "notFound" }
  | { kind: "noRows" }
  | { kind: "unpricedRows" }
  | { kind: "listDateMissing" }
  | { kind: "vatMissing" }
  | { kind: "rereading" }
  | { kind: "packagingNotLinkable" }
  | { kind: "vatRateMissing" }
  | { kind: "alreadyLinked" }
  | { kind: "presentationTooLong" };

const PRESENTATION_LIMIT = schemaLimit(
  supplierPriceListRowProductCreationBodySchema.shape.packagingName.meta()?.["maxLength"],
);

type RefusedChange = Exclude<
  | ConfirmSupplierPriceListOutcome
  | LinkSupplierPriceListRowOutcome
  | CreateProductFromSupplierItemOutcome,
  {
    kind:
      | "ok"
      | "unauthenticated"
      | "forbidden"
      | "barcode_taken"
      | "category_not_leaf"
      | "brand_inactive"
      | "tag_inactive";
  }
>;

export function supplierPriceListChangeNoticeOf(
  outcome: RefusedChange,
): SupplierPriceListChangeNotice {
  switch (outcome.kind) {
    case "rate_limited":
      return { kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds };
    case "stale_version":
      return { kind: "stale" };
    case "not_editable":
      return { kind: "notEditable" };
    case "not_found":
      return { kind: "notFound" };
    case "no_rows":
      return { kind: "noRows" };
    case "unpriced_rows":
      return { kind: "unpricedRows" };
    case "list_date_missing":
      return { kind: "listDateMissing" };
    case "vat_missing":
      return { kind: "vatMissing" };
    case "rereading":
      return { kind: "rereading" };
    case "packaging_not_linkable":
      return { kind: "packagingNotLinkable" };
    case "vat_rate_missing":
      return { kind: "vatRateMissing" };
    case "already_linked":
      return { kind: "alreadyLinked" };
    case "presentation_too_long":
      return { kind: "presentationTooLong" };
    case "failed":
    case "validation_failed":
    case "vat_rate_invalid":
      return { kind: "attemptFailed" };
  }
}

export function supplierPriceListChangeOutdates(
  notice: SupplierPriceListChangeNotice | null,
): boolean {
  return (
    notice?.kind === "stale" ||
    notice?.kind === "notEditable" ||
    notice?.kind === "notFound" ||
    notice?.kind === "alreadyLinked"
  );
}

export function SupplierPriceListChangeNotices({
  notice,
  failedTitle,
}: {
  notice: SupplierPriceListChangeNotice | null;
  failedTitle: string;
}) {
  switch (notice?.kind) {
    case undefined:
    case "listDateMissing":
    case "vatMissing":
      return null;
    case "attemptFailed":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={failedTitle}
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
    case "stale":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="La lista cambió"
          description="Actualizala para ver los cambios y volvé a intentarlo."
        />
      );
    case "notEditable":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="La lista ya no se puede modificar"
        />
      );
    case "notFound":
      return <InlineNotice tone="error" icon={<TriangleAlert />} title="Esta lista ya no existe" />;
    case "alreadyLinked":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="Este ítem ya tiene un producto"
          description="Actualizá la lista para verlo."
        />
      );
    case "presentationTooLong":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="La presentación de la lista es demasiado larga"
          description={`Tiene más de ${PRESENTATION_LIMIT} caracteres, el máximo de una presentación de compra. No se puede crear el producto desde esta lista.`}
        />
      );
    case "rereading":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="La lista se está actualizando"
          description="Cuando termine, se puede confirmar."
        />
      );
    case "noRows":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="La lista no tiene ítems"
          description="Cargá otra lista o descartá esta."
        />
      );
    case "packagingNotLinkable":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="El producto o la presentación ya no se pueden vincular"
          description="Elegí otro producto o presentación."
        />
      );
    case "vatRateMissing":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="Elegí el IVA del ítem"
          description="La lista no incluye el IVA en sus precios."
        />
      );
    case "unpricedRows":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="Hay ítems sin precio"
          description="Escribí el precio de cada uno o quitalos antes de confirmar."
        />
      );
  }
}
