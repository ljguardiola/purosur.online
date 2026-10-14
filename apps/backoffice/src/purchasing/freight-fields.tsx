import {
  type FreightBody,
  freightBodySchema,
  type LinkablePurchaseList,
  type LinkablePurchaseSummary,
} from "@purosur/contracts";
import {
  Checkbox,
  EmptyState,
  FieldGroup,
  formatCents,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  type RequestSubmission,
  SharedFieldError,
  useFieldContext,
  useRequestForm,
} from "@purosur/ui";
import { ShieldX, ShoppingCart, TriangleAlert } from "lucide-react";
import type { z } from "zod";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { formatDisplayDate } from "../platform/display-date";
import { retryAfterDetail } from "../platform/retry-after-detail";
import type { CloudData } from "../platform/use-cloud-query";
import {
  EMPTY_FREIGHT_FORM,
  FREIGHT_FIELD_MESSAGES,
  FREIGHT_FIELDS,
  type FreightFormValues,
  freightRequestFrom,
} from "./freight-form";
import { receiptLabel } from "./receipt-label";

export type FreightNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "purchasesWithoutValue" }
  | { kind: "notFound" };

type FreightSubmit = (
  request: FreightBody,
  submission: RequestSubmission<FreightFormValues, z.output<typeof freightBodySchema>>,
) => Promise<void>;

export function useFreightRequestForm(onSubmit: FreightSubmit) {
  return useRequestForm({
    defaultValues: EMPTY_FREIGHT_FORM,
    request: { schema: freightBodySchema, from: freightRequestFrom },
    fields: FREIGHT_FIELDS,
    messages: FREIGHT_FIELD_MESSAGES,
    onSubmit,
  });
}

export type FreightRequestForm = ReturnType<typeof useFreightRequestForm>["form"];

export function FreightNotices({
  notice,
  failedTitle,
}: {
  notice: FreightNotice | null;
  failedTitle: string;
}) {
  switch (notice?.kind) {
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
    case "purchasesWithoutValue":
      return (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="Las compras vinculadas no tienen valor"
          description="Elegí otras compras para repartir el flete."
        />
      );
    case "notFound":
      return <InlineNotice tone="error" icon={<TriangleAlert />} title="Este flete ya no existe" />;
    case undefined:
      return null;
  }
}

function purchaseDetail(purchase: LinkablePurchaseSummary): string {
  return [
    formatDisplayDate(purchase.purchasedOn),
    receiptLabel(purchase.receiptType, purchase.receiptNumber),
    formatCents(purchase.valueCents),
  ].join(" · ");
}

function PurchasesChoice({ purchases }: { purchases: LinkablePurchaseSummary[] }) {
  const field = useFieldContext<string[]>();
  const chosen = field.state.value;
  return (
    <div className="flex flex-col gap-3">
      {purchases.map((purchase) => (
        <Checkbox
          key={purchase.id}
          name={`purchaseIds.${purchase.id}`}
          checked={chosen.includes(purchase.id)}
          onCheckedChange={(checked) =>
            field.handleChange(
              checked
                ? [...chosen, purchase.id]
                : chosen.filter((chosenId) => chosenId !== purchase.id),
            )
          }
          description={purchaseDetail(purchase)}
        >
          {purchase.supplier.name}
        </Checkbox>
      ))}
    </div>
  );
}

function PurchasesField({ purchases }: { purchases: CloudData<LinkablePurchaseList> }) {
  return (
    <SharedFieldError>
      {() => {
        if (purchases.status === "loading") {
          return <LoadingPlaceholder variant="list" items={3} />;
        }
        if (purchases.status === "failed") {
          return <LoadFailure {...cloudLoadFailure(purchases, "las compras")} />;
        }
        if (purchases.value.purchases.length === 0) {
          return (
            <EmptyState
              icon={<ShoppingCart />}
              title="No hay compras para vincular"
              description="Aparecen las compras registradas en el período elegido."
              variant="blank"
            />
          );
        }
        return <PurchasesChoice purchases={purchases.value.purchases} />;
      }}
    </SharedFieldError>
  );
}

export function FreightFields({
  form,
  purchases,
}: {
  form: FreightRequestForm;
  purchases: CloudData<LinkablePurchaseList>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="w-45 shrink-0">
          <form.AppField name="date">
            {(field) => <field.DateField label="Fecha" required />}
          </form.AppField>
        </div>
        <div className="min-w-45 flex-1">
          <form.AppField name="amount">
            {(field) => (
              <field.TextField kind="price" prefix="$" label="Monto" inputMode="decimal" required />
            )}
          </form.AppField>
        </div>
        <div className="min-w-45 flex-1">
          <form.Subscribe selector={(state) => state.values.ownTrip}>
            {(ownTrip) => (
              <form.AppField name="carrierName">
                {(field) => (
                  <field.TextField
                    kind="plain-text"
                    label="Medio"
                    required={!ownTrip}
                    disabled={ownTrip}
                  />
                )}
              </form.AppField>
            )}
          </form.Subscribe>
        </div>
      </div>
      <form.AppField name="ownTrip">
        {(field) => <field.Checkbox>Viaje propio (costo estimado)</field.Checkbox>}
      </form.AppField>
      <form.AppField name="description">
        {(field) => <field.TextField kind="plain-text" label="Descripción" required />}
      </form.AppField>
      <FieldGroup
        label="Compras vinculadas"
        required
        description="No cambia costos ni precios. Se reparte entre las líneas de estas compras y se muestra por unidad al decidir un precio."
      >
        <form.AppField name="purchaseIds">
          {() => <PurchasesField purchases={purchases} />}
        </form.AppField>
      </FieldGroup>
    </div>
  );
}
