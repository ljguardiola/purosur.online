import { type InitialInventoryLotList, lotReferenceCostBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, type RequestSubmission, useRequestForm } from "@purosur/ui";
import { Check, Pencil, ShieldX, Store, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { formatStockQuantity } from "../platform/stock-quantity";
import {
  type CostFormValues,
  costFormValuesOf,
  costMessage,
  costRequestFrom,
  referenceCostLabel,
  supplierPriceMessage,
  supplierPriceOptions,
} from "./initial-inventory-cost-form";
import type { SetLotReferenceCostOutcome, setLotReferenceCost } from "./stock-api";

export type InitialInventoryLot = InitialInventoryLotList["lots"][number];

export type EditLotCostModalServices = {
  setLotReferenceCost: typeof setLotReferenceCost;
};

export type EditLotCostModalProps = {
  lot: InitialInventoryLot;
  services: EditLotCostModalServices;
  onClose: () => void;
  onSessionEnded: () => void;
  onSaved: (lot: InitialInventoryLot) => void;
  onGone: (lot: InitialInventoryLot) => void;
};

type Notice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "gone" }
  | { kind: "notInitialCount" }
  | { kind: "pricesLoaded" }
  | { kind: "priceGone" };

export function EditLotCostModal({
  lot,
  services,
  onClose,
  onSessionEnded,
  onSaved,
  onGone,
}: EditLotCostModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<Notice | null>(null);
  const { form, submit, submitting } = useRequestForm({
    defaultValues: costFormValuesOf(lot),
    request: { schema: lotReferenceCostBodySchema, from: costRequestFrom },
    fields: { unitCostCents: "cost", supplierItemId: "supplierItemId" },
    messages: { cost: costMessage, supplierItemId: supplierPriceMessage },
    onSubmit: async (request, submission) => {
      setNotice(null);
      try {
        handleOutcome(await services.setLotReferenceCost(lot.lotId, request), submission);
      } catch {
        setNotice({ kind: "attemptFailed" });
      }
    },
  });

  function handleOutcome(
    outcome: SetLotReferenceCostOutcome,
    { showWireFieldError }: RequestSubmission<CostFormValues>,
  ) {
    if (outcome.kind === "ok") {
      onSaved(lot);
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else if (outcome.kind === "not_found" || outcome.kind === "lot_withdrawn") {
      setNotice({ kind: "gone" });
      onGone(lot);
    } else if (outcome.kind === "not_an_initial_count_lot") {
      setNotice({ kind: "notInitialCount" });
    } else if (outcome.kind === "cost_chosen_from_supplier_prices") {
      setNotice({ kind: "pricesLoaded" });
    } else if (outcome.kind === "supplier_price_not_found") {
      setNotice({ kind: "priceGone" });
    } else if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind !== "validation_failed" || !showWireFieldError(outcome.field)) {
      setNotice({ kind: "attemptFailed" });
    }
  }

  const saveDisabled =
    submitting ||
    notice?.kind === "gone" ||
    notice?.kind === "notInitialCount" ||
    notice?.kind === "pricesLoaded" ||
    notice?.kind === "priceGone";
  const [firstPrice, ...otherPrices] = supplierPriceOptions(lot);
  const lotDescription = lot.withdrawn
    ? `Lote de una línea retirada de la puesta en marcha, con ${formatStockQuantity(lot.remaining, lot.saleUnit)} en stock.`
    : `Lote contado en la puesta en marcha: ${formatStockQuantity(lot.counted, lot.saleUnit)}.`;

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<Pencil />}
      context="Stock · Inventario inicial"
      title={lot.productName}
      closable={!submitting}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            disabled={submitting}
            onPress={onClose}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            disabled={saveDisabled}
            onPress={() => void submit()}
          >
            Guardar el costo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se pudo guardar el costo"
            description="Probá de nuevo."
          />
        )}
        {notice?.kind === "rateLimited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title="Demasiadas solicitudes"
            description={retryAfterDetail(notice.retryAfterSeconds)}
          />
        )}
        {notice?.kind === "gone" && (
          <InlineNotice tone="error" icon={<TriangleAlert />} title="Este lote ya no existe" />
        )}
        {notice?.kind === "notInitialCount" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="Este lote no es de la puesta en marcha"
            description="Solo los lotes del inventario inicial admiten un costo de referencia."
          />
        )}
        {notice?.kind === "pricesLoaded" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="Este producto ya tiene precios de proveedores"
            description="Cerrá y volvé a abrir el lote para elegir uno."
          />
        )}
        {notice?.kind === "priceGone" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="Ese precio ya no está disponible"
            description="Cerrá y volvé a abrir el lote para ver los precios cargados."
          />
        )}
        {firstPrice !== undefined ? (
          <>
            <p className="text-body text-text-subtle">{lotDescription}</p>
            <form.AppField name="supplierItemId">
              {(field) => (
                <field.OptionCardGroup
                  layout="row"
                  label={referenceCostLabel(lot.saleUnit)}
                  options={[
                    { ...firstPrice, icon: <Store /> },
                    ...otherPrices.map((price) => ({ ...price, icon: <Store /> })),
                  ]}
                  required
                />
              )}
            </form.AppField>
          </>
        ) : (
          <form.AppField name="cost">
            {(field) => (
              <field.TextField
                kind="price"
                label={referenceCostLabel(lot.saleUnit)}
                prefix="$"
                inputMode="decimal"
                description={lotDescription}
                required
              />
            )}
          </form.AppField>
        )}
      </div>
    </Modal>
  );
}
