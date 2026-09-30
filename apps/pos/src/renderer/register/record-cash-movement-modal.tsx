import type { RecordCashMovementOutcome, SignInUser } from "@purosur/contracts";
import { cashMovementAmountSchema, parseAmountCents } from "@purosur/contracts";
import type { AuthorizablePermissionKey, CashMovementKind } from "@purosur/domain";
import {
  CASH_MOVEMENT_REASON_MAX_LENGTH,
  cashMovementPermission,
  cashMovementReason,
} from "@purosur/domain";
import type { Icon } from "@purosur/ui";
import { Button, InlineNotice, Modal, OptionCardGroup, TextField } from "@purosur/ui";
import { ArrowDownToLine, ArrowUpFromLine, Receipt, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { AuthorizationSection } from "../access/authorization-section";
import type { SignedInPerson } from "../access/signed-in-person";
import { useAuthorization } from "../access/use-authorization";
import { formatClockTime } from "../platform/clock-time";
import type { CashMovementInput } from "../platform/core-client";
import { formatCents } from "../platform/money";

const REQUIRED_AMOUNT_MESSAGE = "Ingresá el importe.";
const INVALID_AMOUNT_MESSAGE = "Ingresá un importe válido, por ejemplo 5.000,00.";
const INVALID_REASON_MESSAGE = `Escribí el motivo (hasta ${CASH_MOVEMENT_REASON_MAX_LENGTH} caracteres).`;
const NO_OPEN_SESSION_MESSAGE = "No hay una caja abierta.";
const FAILED_MESSAGE = "No se pudo registrar el movimiento. Probá de nuevo.";

type KindPresentation = {
  icon: Icon;
  submit: string;
  authorizing: string;
  cashBefore: string | undefined;
};

const PRESENTATION = {
  CASH_IN: {
    icon: <ArrowDownToLine />,
    submit: "Registrar ingreso",
    authorizing: "registrar ingresos de efectivo",
    cashBefore: undefined,
  },
  CASH_OUT: {
    icon: <Receipt />,
    submit: "Registrar gasto",
    authorizing: "registrar gastos",
    cashBefore: "este gasto",
  },
  WITHDRAWAL: {
    icon: <ArrowUpFromLine />,
    submit: "Registrar retiro",
    authorizing: "retirar efectivo a la caja fuerte",
    cashBefore: "este retiro",
  },
} as const satisfies Record<CashMovementKind, KindPresentation>;

const KIND_OPTIONS = [
  { value: "CASH_IN", label: "Ingreso", description: "Entra plata", icon: <ArrowDownToLine /> },
  { value: "CASH_OUT", label: "Gasto", description: "Se paga algo", icon: <Receipt /> },
  {
    value: "WITHDRAWAL",
    label: "Retiro",
    description: "Sale a caja fuerte",
    icon: <ArrowUpFromLine />,
  },
] as const;

function amountFrom(typed: string): { cents: number } | { message: string } {
  if (typed.trim() === "") {
    return { message: REQUIRED_AMOUNT_MESSAGE };
  }
  const amount = cashMovementAmountSchema.safeParse(parseAmountCents(typed));
  return amount.success ? { cents: amount.data } : { message: INVALID_AMOUNT_MESSAGE };
}

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
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  recordCashMovement: (input: CashMovementInput) => Promise<RecordCashMovementOutcome>;
  onClose: () => void;
  onRecorded: () => void;
};

function MovementModal({
  person,
  registerName,
  openedAt,
  expectedCash,
  loadAuthorizers,
  recordCashMovement,
  onClose,
  onRecorded,
}: Omit<RecordCashMovementModalProps, "open">) {
  const [kind, setKind] = useState<CashMovementKind>("CASH_IN");
  const [typedAmount, setTypedAmount] = useState("");
  const [typedReason, setTypedReason] = useState("");
  const [amountMessage, setAmountMessage] = useState<string>();
  const [reasonMessage, setReasonMessage] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const authorization = useAuthorization({
    person,
    permission: cashMovementPermission(kind),
    loadAuthorizers,
  });
  const presentation = PRESENTATION[kind];

  function chooseKind(next: CashMovementKind) {
    if (!submitting) {
      setKind(next);
      setNotice(undefined);
    }
  }

  async function submit() {
    if (submitting || !authorization.ready) {
      return;
    }
    setNotice(undefined);
    const amount = amountFrom(typedAmount);
    const reason = cashMovementReason(typedReason);
    setAmountMessage("message" in amount ? amount.message : undefined);
    setReasonMessage(reason === undefined ? INVALID_REASON_MESSAGE : undefined);
    if ("message" in amount || reason === undefined) {
      return;
    }
    setSubmitting(true);
    const outcome = await recordCashMovement({
      kind,
      amount: amount.cents,
      reason,
      authorization: authorization.value,
    }).catch((): "failed" => "failed");
    setSubmitting(false);
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
        setAmountMessage(INVALID_AMOUNT_MESSAGE);
        break;
      case "invalid_reason":
        setReasonMessage(INVALID_REASON_MESSAGE);
        break;
      case "no_open_session":
        setNotice(NO_OPEN_SESSION_MESSAGE);
        break;
      case "not_signed_in":
        break;
      default:
        if (authorization.required) {
          authorization.refuse(outcome);
        } else if (outcome.kind === "lacks_permission") {
          setNotice(`Ya no tenés permiso para ${presentation.authorizing}.`);
        } else {
          setNotice(FAILED_MESSAGE);
        }
    }
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
      icon={presentation.icon}
      context={eyebrowText(registerName, openedAt)}
      title="Registrar un movimiento"
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
            size="large"
            fullWidth
            icon={presentation.icon}
            disabled={submitting || !authorization.ready}
            onPress={submit}
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
          <OptionCardGroup
            label="Tipo de movimiento"
            options={KIND_OPTIONS}
            value={kind}
            onChange={chooseKind}
          />
        </div>
        <TextField
          kind="amount"
          prefix="$"
          label="Importe"
          inputMode="numeric"
          value={typedAmount}
          onChange={(value) => {
            setTypedAmount(value);
            setAmountMessage(undefined);
            setNotice(undefined);
          }}
          disabled={submitting}
          errorMessage={amountMessage}
          {...(expectedCash === undefined || presentation.cashBefore === undefined
            ? {}
            : {
                description: `Hay ${formatCents(expectedCash)} en la caja antes de ${presentation.cashBefore}.`,
              })}
        />
        <TextField
          kind="plain-text"
          label="Motivo"
          value={typedReason}
          onChange={(value) => {
            setTypedReason(value);
            setReasonMessage(undefined);
            setNotice(undefined);
          }}
          disabled={submitting}
          errorMessage={reasonMessage}
        />
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

export function RecordCashMovementModal({ open, ...props }: RecordCashMovementModalProps) {
  return open ? <MovementModal {...props} /> : null;
}
