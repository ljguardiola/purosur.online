import { type PriceProduct, priceSetBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, NotificationCard } from "@purosur/ui";
import { Check, Pencil, RotateCcw, ShieldX, TriangleAlert } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import type { ProductSaleUnit } from "../catalog/products-api";
import { type CloudSubmission, useCloudForm } from "../platform/cloud-form";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { formatCentsWithUnit } from "./money";
import {
  AMOUNT_UNCHANGED,
  amountMessage,
  EMPTY_PRICE_FORM,
  type PriceFormValues,
  priceRequestFrom,
} from "./price-form";
import { modalEyebrow } from "./price-review-age";
import type { ConfirmPriceOutcome, confirmPrice, SetPriceOutcome, setPrice } from "./prices-api";
import type { PriceReload } from "./pricing-queries";

const PRICE_LABEL = {
  UNIT: "Precio de venta por unidad",
  KG: "Precio de venta por kilo",
} satisfies Record<ProductSaleUnit, string>;

export type PriceModalOutcome = { kind: "confirmed" } | { kind: "saved"; unitPrice: number };

type ModalNotice =
  | { kind: "attemptFailed" }
  | { kind: "confirmFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "stale" }
  | { kind: "noPriceToConfirm" }
  | { kind: "notFound" }
  | { kind: "reloadFailed" };

export type ScreenNotice = {
  tone: "success" | "error";
  title: string;
  description: string;
  retryAfterSeconds?: number;
};

export type PriceChangeModalProps = {
  target: PriceProduct | null;
  previousProductNotice: ScreenNotice | null;
  now: () => Date;
  onClose: () => void;
  onSessionEnded: () => void;
  onSaved: (product: PriceProduct, outcome: PriceModalOutcome) => void;
  onGone: (product: PriceProduct) => void;
  reload: (id: string) => Promise<PriceReload>;
  setPrice: typeof setPrice;
  confirmPrice: typeof confirmPrice;
};

export function PriceChangeModal({
  target,
  previousProductNotice,
  now,
  onClose,
  onSessionEnded,
  onSaved,
  onGone,
  reload,
  setPrice,
  confirmPrice,
}: PriceChangeModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [current, setCurrent] = useState<PriceProduct | null>(null);
  const [shownAt, setShownAt] = useState<Date | null>(null);
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<ModalNotice | null>(null);
  const [previousNotice, setPreviousNotice] = useState<ScreenNotice | null>(null);
  const [working, setWorking] = useState(false);
  const { form, submit, submitting, reset } = useCloudForm({
    defaultValues: EMPTY_PRICE_FORM,
    request: { schema: priceSetBodySchema, from: priceRequestFrom },
    fields: { unitPrice: "amount", expectedCurrentPriceId: null },
    messages: { amount: amountMessage },
    onSubmit: async (request, submission) => {
      const product = current;
      if (!product) {
        return;
      }
      setNotice(null);
      setPreviousNotice(null);
      try {
        handleSetPriceOutcome(
          product,
          request.unitPrice,
          await setPrice(product.id, request),
          submission,
        );
      } catch {
        showNotice({ kind: "attemptFailed" });
      }
    },
  });
  const busy = submitting || working;

  function showNotice(ownNotice: ModalNotice) {
    setNotice(ownNotice);
    setPreviousNotice(null);
  }

  function startRequest() {
    setNotice(null);
    setPreviousNotice(null);
    setWorking(true);
  }

  const readNow = useEffectEvent(now);

  useEffect(() => {
    if (target) {
      setCurrent(target);
      setShownAt(readNow());
      setTitle(target.name);
      reset({ amount: "", expectedCurrentPriceId: target.currentPrice?.id ?? null });
      setNotice(null);
      setPreviousNotice(previousProductNotice);
      setWorking(false);
    }
  }, [target, previousProductNotice, reset]);

  function handleSetPriceOutcome(
    product: PriceProduct,
    unitPrice: number,
    outcome: SetPriceOutcome,
    { showFieldError, showWireFieldError }: CloudSubmission<PriceFormValues>,
  ) {
    if (outcome.kind === "ok") {
      onSaved(product, { kind: "saved", unitPrice });
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
      showNotice({ kind: "notFound" });
      onGone(product);
    } else if (outcome.kind === "stale_price") {
      showNotice({ kind: "stale" });
    } else if (outcome.kind === "price_unchanged") {
      showFieldError("amount", AMOUNT_UNCHANGED);
    } else if (outcome.kind === "validation_failed") {
      if (!showWireFieldError(outcome.field)) {
        showNotice(
          outcome.field === "expectedCurrentPriceId"
            ? { kind: "stale" }
            : { kind: "attemptFailed" },
        );
      }
    } else if (outcome.kind === "rate_limited") {
      showNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      showNotice({ kind: "attemptFailed" });
    }
  }

  function handleConfirmPriceOutcome(product: PriceProduct, outcome: ConfirmPriceOutcome) {
    if (outcome.kind === "ok") {
      onSaved(product, { kind: "confirmed" });
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
      showNotice({ kind: "notFound" });
      onGone(product);
    } else if (outcome.kind === "stale_price") {
      showNotice({ kind: "stale" });
    } else if (outcome.kind === "no_price_to_confirm") {
      showNotice({ kind: "noPriceToConfirm" });
    } else if (outcome.kind === "rate_limited") {
      showNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      showNotice({ kind: "confirmFailed" });
    }
  }

  async function handleConfirm() {
    const product = current;
    if (!product?.currentPrice) {
      return;
    }
    startRequest();
    try {
      const outcome = await confirmPrice(product.id, {
        expectedCurrentPriceId: product.currentPrice.id,
      });
      handleConfirmPriceOutcome(product, outcome);
    } catch {
      showNotice({ kind: "confirmFailed" });
    }
    setWorking(false);
  }

  async function handleReload() {
    const product = current;
    if (!product) {
      return;
    }
    setPreviousNotice(null);
    setWorking(true);
    handleReloadOutcome(product, await reload(product.id));
    setWorking(false);
  }

  function handleReloadOutcome(product: PriceProduct, outcome: PriceReload) {
    if (outcome.kind === "found") {
      setCurrent(outcome.product);
      reset({
        amount: form.state.values.amount,
        expectedCurrentPriceId: outcome.product.currentPrice?.id ?? null,
      });
      setShownAt(now());
      setNotice(null);
      return;
    }
    if (outcome.kind === "not_found") {
      showNotice({ kind: "notFound" });
      onGone(product);
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
    if (outcome.kind === "rate_limited") {
      showNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    showNotice({ kind: "reloadFailed" });
  }

  const offersReload =
    notice?.kind === "stale" ||
    notice?.kind === "noPriceToConfirm" ||
    notice?.kind === "reloadFailed";
  const actionsDisabled = busy || notice?.kind === "notFound";

  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<Pencil />}
      context={current && shownAt ? modalEyebrow(current, shownAt) : ""}
      title={title}
      closable={!busy}
      footer={
        current && (
          <>
            {current.currentPrice ? (
              <Button
                variant="secondary"
                size="large"
                icon={<Check />}
                disabled={actionsDisabled}
                onPress={() => void handleConfirm()}
              >
                Confirmar sin cambios
              </Button>
            ) : null}
            <Button
              variant="primary"
              size="large"
              icon={<Check />}
              fullWidth
              disabled={actionsDisabled}
              onPress={() => void submit()}
            >
              Guardar el precio nuevo
            </Button>
          </>
        )
      }
    >
      {current ? (
        <div className="flex flex-col gap-4">
          {previousNotice?.tone === "success" && (
            <NotificationCard
              tone="success"
              icon={<Check />}
              title={previousNotice.title}
              description={previousNotice.description}
            />
          )}
          {previousNotice?.tone === "error" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={previousNotice.title}
              description={previousNotice.description}
            />
          )}
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo guardar el precio"
              description="Probá de nuevo."
            />
          )}
          {notice?.kind === "confirmFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo confirmar el precio"
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
          {notice?.kind === "stale" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Este precio cambió mientras lo mirabas"
              description="Recargá el precio actual y volvé a intentarlo."
            />
          )}
          {notice?.kind === "noPriceToConfirm" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No hay un precio para confirmar"
            />
          )}
          {notice?.kind === "notFound" && (
            <InlineNotice tone="error" icon={<TriangleAlert />} title="Producto desactivado" />
          )}
          {notice?.kind === "reloadFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudieron recargar los datos"
              description="Probá de nuevo."
            />
          )}
          {offersReload ? (
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              disabled={busy}
              onPress={() => void handleReload()}
            >
              Recargar el precio
            </Button>
          ) : null}
          <form.AppField name="amount">
            {(field) => (
              <field.TextField
                kind="price"
                label={PRICE_LABEL[current.saleUnit]}
                prefix="$"
                required
                {...(current.currentPrice
                  ? {
                      description: `Precio actual: ${formatCentsWithUnit(current.currentPrice.unitPrice, current.saleUnit)}`,
                    }
                  : {})}
              />
            )}
          </form.AppField>
        </div>
      ) : null}
    </Modal>
  );
}
