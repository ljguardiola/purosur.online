import { type InitialInventoryLotList, lotReferenceCostBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, type RequestSubmission, useRequestForm } from "@purosur/ui";
import { Check, Pencil, ShieldX, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { formatStockQuantity } from "../platform/stock-quantity";
import {
  type CostFormValues,
  costMessage,
  costRequestFrom,
  EMPTY_COST_FORM,
  referenceCostLabel,
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
  | { kind: "notInitialCount" };

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
    defaultValues: EMPTY_COST_FORM,
    request: { schema: lotReferenceCostBodySchema, from: costRequestFrom },
    fields: { unitCostCents: "cost" },
    messages: { cost: costMessage },
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
    } else if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind !== "validation_failed" || !showWireFieldError(outcome.field)) {
      setNotice({ kind: "attemptFailed" });
    }
  }

  const saveDisabled = submitting || notice?.kind === "gone" || notice?.kind === "notInitialCount";

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
        <form.AppField name="cost">
          {(field) => (
            <field.TextField
              kind="price"
              label={referenceCostLabel(lot.saleUnit)}
              prefix="$"
              description={`Lote contado en la puesta en marcha: ${formatStockQuantity(lot.counted, lot.saleUnit)}.`}
              required
            />
          )}
        </form.AppField>
      </div>
    </Modal>
  );
}
