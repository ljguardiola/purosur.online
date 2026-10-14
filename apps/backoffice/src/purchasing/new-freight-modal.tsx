import type { Freight } from "@purosur/contracts";
import { Button, Modal } from "@purosur/ui";
import { Check, Truck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  FREIGHT_PURCHASE_NOT_FOUND,
  FreightFields,
  type FreightNotice,
  FreightNotices,
  useFreightRequestForm,
} from "./freight-fields";
import type { FreightPeriod, fetchLinkablePurchases, recordFreight } from "./freights-api";
import { useLinkablePurchasesQuery, useRefreshPurchasing } from "./purchasing-queries";

export type NewFreightModalServices = {
  recordFreight: typeof recordFreight;
  fetchLinkablePurchases: typeof fetchLinkablePurchases;
};

type NewFreightModalProps = {
  open: boolean;
  period: FreightPeriod;
  services: NewFreightModalServices;
  onRecorded: (freight: Freight) => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function NewFreightModal({
  open,
  period,
  services,
  onRecorded,
  onClose,
  onSessionEnded,
}: NewFreightModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const refreshPurchasing = useRefreshPurchasing();
  const [notice, setNotice] = useState<FreightNotice | null>(null);
  const purchases = useLinkablePurchasesQuery({
    input: { period },
    enabled: open,
    fetchLinkablePurchases: services.fetchLinkablePurchases,
    onSessionEnded,
  });
  const { form, submit, submitting, reset } = useFreightRequestForm(
    async (request, { showWireFieldError, showFieldError }) => {
      setNotice(null);
      const outcome = await services.recordFreight(request);
      if (outcome.kind === "ok") {
        onRecorded(outcome.freight);
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
    if (open) {
      reset();
      setNotice(null);
    }
  }, [open, reset]);

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
      icon={<Truck />}
      context="Stock · Flete"
      title="Nuevo flete"
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
            Registrar el flete
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FreightNotices notice={notice} failedTitle="No se registró el flete" />
        <FreightFields form={form} purchases={purchases} />
      </div>
    </Modal>
  );
}
