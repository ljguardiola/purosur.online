import type { Freight, FreightSummary } from "@purosur/contracts";
import { Button, Modal } from "@purosur/ui";
import { Check, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  FreightFields,
  type FreightNotice,
  FreightNotices,
  useFreightRequestForm,
} from "./freight-fields";
import { FREIGHT_PURCHASE_NOT_FOUND, freightFormValuesOf } from "./freight-form";
import type { editFreight, FreightPeriod, fetchLinkablePurchases } from "./freights-api";
import { useLinkablePurchasesQuery, useRefreshPurchasing } from "./purchasing-queries";

export type EditFreightModalServices = {
  editFreight: typeof editFreight;
  fetchLinkablePurchases: typeof fetchLinkablePurchases;
};

type EditFreightModalProps = {
  target: FreightSummary | null;
  period: FreightPeriod;
  services: EditFreightModalServices;
  onSaved: (freight: Freight) => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function EditFreightModal({
  target,
  period,
  services,
  onSaved,
  onClose,
  onSessionEnded,
}: EditFreightModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const refreshPurchasing = useRefreshPurchasing();
  const open = target !== null;
  const [shown, setShown] = useState<FreightSummary | null>(null);
  const [notice, setNotice] = useState<FreightNotice | null>(null);
  const purchases = useLinkablePurchasesQuery({
    input: target === null ? { period } : { period, freightId: target.id },
    enabled: open,
    fetchLinkablePurchases: services.fetchLinkablePurchases,
    onSessionEnded,
  });
  const { form, submit, submitting, reset } = useFreightRequestForm(
    async (request, { showWireFieldError, showFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      const outcome = await services.editFreight(target.id, request);
      if (outcome.kind === "ok") {
        onSaved(outcome.freight);
        return;
      }
      if (outcome.kind === "unauthenticated") {
        onSessionEnded();
        return;
      }
      if (outcome.kind === "forbidden") {
        sendToMyAccount();
        return;
      }
      if (outcome.kind === "not_found") {
        setNotice({ kind: "notFound" });
        return;
      }
      if (outcome.kind === "purchase_not_found") {
        showFieldError("purchaseIds", FREIGHT_PURCHASE_NOT_FOUND);
        void refreshPurchasing();
        return;
      }
      if (outcome.kind === "purchases_without_value") {
        setNotice({ kind: "purchasesWithoutValue" });
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  );

  useEffect(() => {
    if (target) {
      reset(freightFormValuesOf(target));
      setShown(target);
      setNotice(null);
    }
  }, [target, reset]);

  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="wide"
      tone="info"
      icon={<Pencil />}
      context="Stock · Flete"
      title={shown?.description ?? ""}
      closable
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
            dataStatus={purchases.status}
            disabled={submitting}
            onPress={() => void submit()}
          >
            Guardar los cambios
          </Button>
        </>
      }
    >
      {target ? (
        <div className="flex flex-col gap-4">
          <FreightNotices notice={notice} failedTitle="No se guardó el flete" />
          <FreightFields form={form} purchases={purchases} />
        </div>
      ) : null}
    </Modal>
  );
}
