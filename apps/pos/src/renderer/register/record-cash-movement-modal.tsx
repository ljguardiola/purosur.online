import type {
  RecordableCashMovementKinds,
  RecordCashMovementOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey, CashMovementKind } from "@purosur/domain";
import {
  Button,
  formatCents,
  formatClockTime,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  OptionCardGroup,
  useRequestForm,
} from "@purosur/ui";
import { TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { AuthorizationSection } from "../platform/authorization-section";
import type { CashMovementInput } from "../platform/core-client";
import { useAuthorization } from "../platform/use-authorization";
import type { SignedInPerson } from "../shell/signed-in-person";
import {
  amountMessage,
  cashMovementRequestFrom,
  EMPTY_CASH_MOVEMENT_FORM,
  INVALID_AMOUNT_MESSAGE,
  recordCashMovementFormRequestSchema,
} from "./cash-movement-form";
import { CASH_MOVEMENT_ICONS } from "./cash-movement-icons";
import { useCashMovementKindsQuery } from "./register-queries";

const NO_OPEN_SESSION_MESSAGE = "No hay una caja abierta.";
const FAILED_MESSAGE = "No se pudo registrar el movimiento. Probá de nuevo.";

function invalidReasonMessage(maxLength: number): string {
  return `Escribí el motivo (hasta ${maxLength} caracteres).`;
}

type KindPresentation = {
  submit: string;
  authorizing: string;
  cashBefore: string | undefined;
};

const PRESENTATION = {
  CASH_IN: {
    submit: "Registrar ingreso",
    authorizing: "registrar ingresos de efectivo",
    cashBefore: undefined,
  },
  CASH_OUT: {
    submit: "Registrar gasto",
    authorizing: "registrar gastos",
    cashBefore: "este gasto",
  },
  WITHDRAWAL: {
    submit: "Registrar retiro",
    authorizing: "retirar efectivo a la caja fuerte",
    cashBefore: "este retiro",
  },
} as const satisfies Record<CashMovementKind, KindPresentation>;

const KIND_OPTIONS = [
  {
    value: "CASH_IN",
    label: "Ingreso",
    description: "Entra plata",
    icon: CASH_MOVEMENT_ICONS.CASH_IN,
  },
  {
    value: "CASH_OUT",
    label: "Gasto",
    description: "Se paga algo",
    icon: CASH_MOVEMENT_ICONS.CASH_OUT,
  },
  {
    value: "WITHDRAWAL",
    label: "Retiro",
    description: "Sale a caja fuerte",
    icon: CASH_MOVEMENT_ICONS.WITHDRAWAL,
  },
] as const;

function eyebrowText(registerName: string | null, openedAt: string): string {
  const session = `Sesión de las ${formatClockTime(openedAt)}`;
  return registerName === null ? session : `${registerName} · ${session}`;
}

export type RecordCashMovementModalProps = {
  open: boolean;
  person: SignedInPerson;
  registerName: string | null;
  openedAt: string;
  expectedCash?: number;
  loadKinds: () => Promise<RecordableCashMovementKinds | null | "unavailable">;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  recordCashMovement: (input: CashMovementInput) => Promise<RecordCashMovementOutcome>;
  onClose: () => void;
  onRecorded: () => void;
};

function MovementModal({
  kinds,
  person,
  registerName,
  openedAt,
  expectedCash: givenExpectedCash,
  loadAuthorizers,
  recordCashMovement,
  onClose,
  onRecorded,
}: Omit<RecordCashMovementModalProps, "open" | "loadKinds"> & {
  kinds: RecordableCashMovementKinds;
}) {
  const [refusedExpectedCash, setRefusedExpectedCash] = useState<number>();
  const expectedCash = refusedExpectedCash ?? givenExpectedCash;
  const [notice, setNotice] = useState<string>();
  const { form, submit, submitting, values, clearFieldError } = useRequestForm({
    defaultValues: EMPTY_CASH_MOVEMENT_FORM,
    request: { schema: recordCashMovementFormRequestSchema, from: cashMovementRequestFrom },
    fields: { kind: null, amount: "amount", reason: null },
    messages: { amount: amountMessage },
    onSubmit: async (request, { showFieldError }) => {
      const outcome = await recordCashMovement({
        ...request,
        authorization: authorization.ready ? authorization.value : undefined,
      }).catch((): "failed" => "failed");
      if (outcome === "failed") {
        setNotice(FAILED_MESSAGE);
        return;
      }
      switch (outcome.kind) {
        case "recorded":
          authorization.performed();
          onRecorded();
          break;
        case "invalid_amount":
          showFieldError("amount", INVALID_AMOUNT_MESSAGE);
          break;
        case "exceeds_expected_cash":
          setRefusedExpectedCash(outcome.expected);
          showFieldError(
            "amount",
            `No hay tanto efectivo en la caja: se esperan ${formatCents(outcome.expected)}.`,
          );
          break;
        case "invalid_reason":
          showFieldError("reason", invalidReasonMessage(outcome.max_length));
          break;
        case "no_open_session":
          setNotice(NO_OPEN_SESSION_MESSAGE);
          break;
        case "wrong_pin":
        case "rate_limited":
        case "locked":
        case "lacks_permission":
          if (authorization.required) {
            authorization.refuse(outcome);
          } else if (outcome.kind === "lacks_permission") {
            setNotice(`Ya no tenés permiso para ${presentation.authorizing}.`);
          } else {
            setNotice(FAILED_MESSAGE);
          }
          break;
        case "unavailable":
        case "not_signed_in":
          setNotice(FAILED_MESSAGE);
          break;
      }
    },
  });
  const { kind } = values;
  const authorization = useAuthorization({
    person,
    permission: kinds[kind].permission,
    required: kinds[kind].authorization_required,
    loadAuthorizers,
  });
  const presentation = PRESENTATION[kind];

  function forgetKindOutcome() {
    setNotice(undefined);
    clearFieldError("amount");
  }

  function handleSubmit() {
    if (submitting || !authorization.ready) {
      return;
    }
    setNotice(undefined);
    clearFieldError("reason");
    void submit();
  }

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={CASH_MOVEMENT_ICONS[kind]}
      context={eyebrowText(registerName, openedAt)}
      title="Registrar un movimiento"
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
            size="large"
            fullWidth
            icon={CASH_MOVEMENT_ICONS[kind]}
            disabled={submitting || !authorization.ready}
            onPress={handleSubmit}
          >
            {presentation.submit}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p aria-hidden="true" className="text-caption font-bold text-text-eyebrow tracking-sm">
            Tipo de movimiento
          </p>
          <form.AppField name="kind" listeners={{ onChange: forgetKindOutcome }}>
            {(field) => (
              <OptionCardGroup
                label="Tipo de movimiento"
                options={KIND_OPTIONS}
                value={field.state.value}
                onChange={(next) => {
                  if (!submitting) {
                    field.handleChange(next);
                  }
                }}
              />
            )}
          </form.AppField>
        </div>
        <form.AppField name="amount" listeners={{ onChange: () => setNotice(undefined) }}>
          {(field) => (
            <field.TextField
              kind="amount"
              prefix="$"
              label="Importe"
              inputMode="numeric"
              disabled={submitting}
              {...(expectedCash === undefined || presentation.cashBefore === undefined
                ? {}
                : {
                    description: `Hay ${formatCents(expectedCash)} en la caja antes de ${presentation.cashBefore}.`,
                  })}
            />
          )}
        </form.AppField>
        <form.AppField name="reason" listeners={{ onChange: () => setNotice(undefined) }}>
          {(field) => <field.TextField kind="plain-text" label="Motivo" disabled={submitting} />}
        </form.AppField>
        <AuthorizationSection
          authorization={authorization}
          action={presentation.authorizing}
          disabled={submitting}
        />
        {notice === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
        )}
      </div>
    </Modal>
  );
}

function MovementModalWhenKindsAreKnown({
  loadKinds,
  ...props
}: Omit<RecordCashMovementModalProps, "open">) {
  const kinds = useCashMovementKindsQuery(props.person.user_id, loadKinds);
  if (kinds.status === "loaded") {
    return <MovementModal {...props} kinds={kinds.value} />;
  }
  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) {
          props.onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={CASH_MOVEMENT_ICONS.CASH_IN}
      context={eyebrowText(props.registerName, props.openedAt)}
      title="Registrar un movimiento"
      footer={
        <Button variant="secondary" size="large" icon={<X />} onPress={props.onClose}>
          Cancelar
        </Button>
      }
    >
      {kinds.status === "failed" ? (
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudieron cargar los movimientos que podés registrar"
          description="Volvé a intentarlo en unos segundos."
          onRetry={kinds.retry}
        />
      ) : (
        <LoadingPlaceholder variant="form" fields={3} />
      )}
    </Modal>
  );
}

export function RecordCashMovementModal({ open, ...props }: RecordCashMovementModalProps) {
  return open ? <MovementModalWhenKindsAreKnown {...props} /> : null;
}
