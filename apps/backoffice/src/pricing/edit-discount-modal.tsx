import {
  type DiscountSummary,
  type DiscountTargets,
  discountEditBodySchema,
} from "@purosur/contracts";
import { Button, FieldGroup, InlineNotice, Modal } from "@purosur/ui";
import { Check, Info, Pencil, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSendToMyAccount } from "../access/send-to-my-account";
import { useCloudForm } from "../platform/cloud-form";
import { SharedFieldError } from "../platform/cloud-form-fields";
import { retryAfterDetail } from "../platform/retry-after-detail";
import {
  DISCOUNT_EDIT_FIELDS,
  DISCOUNT_KIND_CARDS,
  DISCOUNT_MESSAGES,
  DISCOUNT_TARGET_KIND_OPTIONS,
  discountEditRequestFrom,
  discountFormValues,
  EMPTY_DISCOUNT_EDIT_FORM,
  eligibleTargets,
  keptTarget,
  productSoldByWeightMessage,
  soldByWeightHelp,
  TARGET_SOLD_BY_WEIGHT_MESSAGE,
  targetForKind,
  targetOptions,
  targetPlaceholder,
  targetUnavailableMessage,
  WEEKDAY_OPTIONS,
} from "./discount-form";
import { DISCOUNT_TARGET_KIND_LABELS } from "./discount-texts";
import type { editDiscount } from "./discounts-api";
import type { DiscountReload } from "./pricing-queries";

export type EditDiscountModalServices = {
  editDiscount: typeof editDiscount;
};

type EditDiscountModalProps = {
  target: DiscountSummary | null;
  onClose: () => void;
  onSaved: (discount: DiscountSummary) => void;
  onSessionEnded: () => void;
  reload: (id: string) => Promise<DiscountReload>;
  targets: DiscountTargets;
  services: EditDiscountModalServices;
};

type EditNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "staleVersion" }
  | { kind: "notFound" };

export function EditDiscountModal({
  target,
  onClose,
  onSaved,
  onSessionEnded,
  reload,
  targets,
  services,
}: EditDiscountModalProps) {
  const { editDiscount } = services;
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [loaded, setLoaded] = useState<DiscountSummary | null>(null);
  const [notice, setNotice] = useState<EditNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const { form, submit, submitting, values, reset } = useCloudForm({
    defaultValues: EMPTY_DISCOUNT_EDIT_FORM,
    request: { schema: discountEditBodySchema, from: discountEditRequestFrom },
    fields: DISCOUNT_EDIT_FIELDS,
    messages: DISCOUNT_MESSAGES,
    onSubmit: async (_request, { parsed, showFieldError, showWireFieldError, values }) => {
      if (!target || !parsed) {
        setNotice({ kind: "attemptFailed" });
        return;
      }
      setNotice(null);
      const outcome = await editDiscount(target.id, parsed);
      if (outcome.kind === "ok") {
        onSaved(outcome.discount);
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
      if (outcome.kind === "stale_version") {
        setNotice({ kind: "staleVersion" });
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "target_not_found") {
        showFieldError("targetId", targetUnavailableMessage(values.targetKind));
        return;
      }
      if (outcome.kind === "target_not_sold_by_unit") {
        showFieldError("targetId", TARGET_SOLD_BY_WEIGHT_MESSAGE);
        return;
      }
      if (outcome.kind === "product_sold_by_weight") {
        showFieldError("targetId", productSoldByWeightMessage(outcome.productName));
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });

  function load(discount: DiscountSummary) {
    reset(discountFormValues(discount));
    setLoaded(discount);
    setNotice(null);
  }

  useEffect(() => {
    if (open && target) {
      reset(discountFormValues(target));
      setLoaded(target);
      setNotice(null);
      setReloading(false);
    }
  }, [open, target, reset]);

  async function handleReload() {
    if (!target) {
      return;
    }
    setReloading(true);
    const outcome = await reload(target.id);
    if (outcome.kind === "found") {
      load(outcome.discount);
    }
    if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
    }
    setReloading(false);
  }

  const targetKindLabel = DISCOUNT_TARGET_KIND_LABELS[values.targetKind];
  const options = targetOptions(
    values.targetKind,
    eligibleTargets(values.benefitKind, targets),
    keptTarget(targets, loaded ?? undefined),
  );
  const help = soldByWeightHelp(values, targets);
  const targetField = (
    <form.AppField name="targetId">
      {(field) =>
        options ? (
          <field.Select
            label={targetKindLabel}
            placeholder={targetPlaceholder(values.targetKind)}
            options={options}
            {...(help !== undefined ? { description: help } : {})}
            required
          />
        ) : (
          <FieldGroup label={targetKindLabel} required>
            <SharedFieldError>{() => null}</SharedFieldError>
          </FieldGroup>
        )
      }
    </form.AppField>
  );

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
      context="Catálogo · Promociones"
      title={loaded?.name ?? ""}
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
            disabled={submitting || reloading}
            onPress={() => void submit()}
          >
            Guardar los cambios
          </Button>
        </>
      }
    >
      {target ? (
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se guardó la promoción"
              description="Volvé a intentarlo."
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
          {notice?.kind === "staleVersion" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Esta promoción cambió mientras la editabas"
              description="Recargá sus datos y volvé a hacer el cambio."
            />
          )}
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Esta promoción ya no existe"
            />
          )}
          {notice?.kind === "staleVersion" ? (
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              disabled={submitting || reloading}
              onPress={() => void handleReload()}
            >
              Recargar
            </Button>
          ) : null}
          <form.AppField name="name">
            {(field) => <field.TextField kind="plain-text" label="Nombre" required />}
          </form.AppField>
          <FieldGroup label="Tipo de promoción">
            <form.AppField
              name="benefitKind"
              listeners={{
                onChange: ({ value }) => {
                  const target = targetForKind(form.state.values, value, targets);
                  form.setFieldValue("targetKind", target.targetKind);
                  form.setFieldValue("targetId", target.targetId);
                },
              }}
            >
              {(field) => (
                <field.OptionCardGroup label="Tipo de promoción" options={DISCOUNT_KIND_CARDS} />
              )}
            </form.AppField>
          </FieldGroup>
          {values.benefitKind === "PERCENT_OFF" ? (
            <>
              <FieldGroup label="Se aplica sobre">
                <form.AppField
                  name="targetKind"
                  listeners={{ onChange: () => form.setFieldValue("targetId", null) }}
                >
                  {(field) => (
                    <field.SegmentedControl
                      label="Se aplica sobre"
                      options={DISCOUNT_TARGET_KIND_OPTIONS}
                    />
                  )}
                </form.AppField>
              </FieldGroup>
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">{targetField}</div>
                <div className="w-40">
                  <form.AppField name="percent">
                    {(field) => (
                      <field.TextField kind="plain-text" label="Descuento" suffix="%" required />
                    )}
                  </form.AppField>
                </div>
              </div>
            </>
          ) : (
            <FieldGroup label="Producto y grupo">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">{targetField}</div>
                <div className="w-30">
                  <form.AppField name="buyQty">
                    {(field) => <field.TextField kind="plain-text" label="Lleve" required />}
                  </form.AppField>
                </div>
                <div className="w-30">
                  <form.AppField name="payQty">
                    {(field) => <field.TextField kind="plain-text" label="Pague" required />}
                  </form.AppField>
                </div>
              </div>
            </FieldGroup>
          )}
          <div className="grid grid-cols-2 gap-4">
            <form.AppField name="validFrom">
              {(field) => <field.DateField label="Desde" required />}
            </form.AppField>
            <form.AppField name="validTo">
              {(field) => <field.DateField label="Hasta" required />}
            </form.AppField>
          </div>
          <form.AppField name="weekdays">
            {(field) => (
              <field.ToggleChipGroup
                label="Días de la semana"
                options={WEEKDAY_OPTIONS}
                description="Sin ningún día marcado, vale todos los días."
              />
            )}
          </form.AppField>
          <InlineNotice
            tone="info"
            icon={<Info />}
            description="Una línea de la venta lleva una sola promoción: las promociones no se acumulan entre sí."
          />
          <form.AppField name="active">
            {(field) => (
              <field.Toggle description="Al desactivarla deja de aplicarse en las ventas nuevas; las ventas ya hechas no cambian.">
                Se aplica en la caja
              </field.Toggle>
            )}
          </form.AppField>
        </div>
      ) : null}
    </Modal>
  );
}
