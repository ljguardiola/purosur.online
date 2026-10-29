import {
  type DiscountSummary,
  type DiscountTargets,
  discountCreationBodySchema,
} from "@purosur/contracts";
import {
  Button,
  FieldGroup,
  InlineNotice,
  Modal,
  SharedFieldError,
  useRequestForm,
} from "@purosur/ui";
import { Check, Info, Percent, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { creatableChoice } from "../platform/creatable-options";
import { DISCOUNT_TARGET_KIND_LABELS } from "../platform/discount-terms-text";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  DISCOUNT_FIELDS,
  DISCOUNT_KIND_CARDS,
  DISCOUNT_MESSAGES,
  discountRequestFrom,
  EMPTY_DISCOUNT_FORM,
  eligibleTargets,
  offersTargetKindChoice,
  TARGET_SOLD_BY_WEIGHT_MESSAGE,
  targetForKind,
  targetKindOptions,
  targetOptions,
  targetPlaceholder,
  targetUnavailableMessage,
  WEEKDAY_OPTIONS,
} from "./discount-form";
import {
  DiscountTargetCreationNotice,
  type DiscountTargetCreationParts,
  type DiscountTargetCreationServices,
  useDiscountTargetCreation,
} from "./discount-target-creation";
import type { createDiscount } from "./discounts-api";

export type NewDiscountModalServices = {
  createDiscount: typeof createDiscount;
} & DiscountTargetCreationServices;

type NewDiscountModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (discount: DiscountSummary) => void;
  onSessionEnded: () => void;
  targets: DiscountTargets;
  creation?: DiscountTargetCreationParts | undefined;
  services: NewDiscountModalServices;
};

type Notice = { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number };

export function NewDiscountModal({
  open,
  onClose,
  onCreated,
  onSessionEnded,
  targets,
  creation,
  services,
}: NewDiscountModalProps) {
  const { createDiscount } = services;
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<Notice | null>(null);
  const { form, submit, submitting, values, reset } = useRequestForm({
    defaultValues: EMPTY_DISCOUNT_FORM,
    request: { schema: discountCreationBodySchema, from: discountRequestFrom },
    fields: DISCOUNT_FIELDS,
    messages: DISCOUNT_MESSAGES,
    onSubmit: async (_request, { parsed, showFieldError, showWireFieldError, values }) => {
      if (!parsed) {
        setNotice({ kind: "attemptFailed" });
        return;
      }
      setNotice(null);
      const outcome = await createDiscount(parsed);
      if (outcome.kind === "ok") {
        onCreated(outcome.discount);
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
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });

  const targetCreation = useDiscountTargetCreation({
    targets,
    services,
    parts: creation,
    benefitKind: () => form.state.values.benefitKind,
    choose: (targetId) => form.setFieldValue("targetId", targetId),
    onSessionEnded,
  });
  const resetCreation = useEffectEvent(targetCreation.reset);
  const closeForm = () => {
    targetCreation.finish();
    onClose();
  };

  useEffect(() => {
    if (open) {
      reset();
      resetCreation();
      setNotice(null);
    }
  }, [open, reset]);

  const targetKindLabel = DISCOUNT_TARGET_KIND_LABELS[values.targetKind];
  const options = targetOptions(
    values.targetKind,
    eligibleTargets(values.benefitKind, targetCreation.sources),
  );
  const targetChoice = creatableChoice(options, targetCreation.creationOf(values.targetKind));
  const targetField = (
    <form.AppField name="targetId">
      {(field) =>
        targetChoice ? (
          <field.ComboBox
            key={values.targetKind}
            label={targetKindLabel}
            placeholder={targetPlaceholder(values.targetKind)}
            required
            {...targetChoice}
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
          closeForm();
        }
      }}
      width="standard"
      tone="info"
      icon={<Percent />}
      context="Catálogo"
      title="Nueva promoción"
      closable
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            disabled={submitting}
            onPress={closeForm}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            disabled={submitting}
            onPress={() => void submit()}
          >
            Crear la promoción
          </Button>
        </>
      }
    >
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
        <DiscountTargetCreationNotice text={targetCreation.notice} />
        <form.AppField name="name">
          {(field) => <field.TextField kind="plain-text" label="Nombre" required />}
        </form.AppField>
        <FieldGroup label="Tipo de promoción">
          <form.AppField
            name="benefitKind"
            listeners={{
              onChange: ({ value }) => {
                const target = targetForKind(form.state.values, value, targetCreation.sources);
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
        {offersTargetKindChoice(values.benefitKind, targetCreation.sources) && (
          <FieldGroup label="Se aplica sobre">
            <form.AppField
              name="targetKind"
              listeners={{ onChange: () => form.setFieldValue("targetId", null) }}
            >
              {(field) => (
                <field.SegmentedControl
                  label="Se aplica sobre"
                  options={targetKindOptions(values.benefitKind, targetCreation.sources)}
                />
              )}
            </form.AppField>
          </FieldGroup>
        )}
        {values.benefitKind === "PERCENT_OFF" ? (
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
        {targetCreation.modals}
      </div>
    </Modal>
  );
}
