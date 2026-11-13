import type {
  CashMovementPreview,
  RecordableCashMovementKinds,
  RecordCashMovementOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey, CashMovementKind } from "@purosur/domain";
import {
  Button,
  FigureStat,
  formatCents,
  HighlightedFigure,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  parseAmountCents,
  SidePanel,
  SidePanelTitle,
  useRequestForm,
} from "@purosur/ui";
import { Check, CircleX, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CashMovementInput } from "../platform/core-client";
import { useKeys } from "../platform/key-layer";
import type { CoreData } from "../platform/use-core-query";
import { AuthorizationModal } from "../shell/authorization-modal";
import type { SignedInPerson } from "../shell/signed-in-person";
import { useAuthorization } from "../shell/use-authorization";
import {
  amountMessage,
  cashMovementRequestFrom,
  EMPTY_CASH_MOVEMENT_FORM,
  INVALID_AMOUNT_MESSAGE,
  recordCashMovementFormRequestSchema,
} from "./cash-movement-form";
import { CASH_MOVEMENT_ICONS } from "./cash-movement-icons";
import type { CashMovementToPreview } from "./register-queries";
import { useCashMovementKindsQuery, useCashMovementPreviewQuery } from "./register-queries";

const NO_OPEN_SESSION_MESSAGE = "No hay una caja abierta.";
const FAILED_MESSAGE = "No se pudo registrar el movimiento. Probá de nuevo.";

function invalidReasonMessage(maxLength: number): string {
  return `Escribí el motivo (hasta ${maxLength} caracteres).`;
}

type KindPresentation = {
  title: string;
  submit: string;
  authorizing: string;
  subtitle: string;
};

const PRESENTATION = {
  CASH_IN: {
    title: "Ingreso",
    submit: "Registrar ingreso",
    authorizing: "registrar ingresos de efectivo",
    subtitle: "Registrar ingreso",
  },
  CASH_OUT: {
    title: "Gasto",
    submit: "Registrar gasto",
    authorizing: "registrar gastos",
    subtitle: "Registrar gasto",
  },
  WITHDRAWAL: {
    title: "Retiro",
    submit: "Registrar retiro",
    authorizing: "retirar efectivo a la caja fuerte",
    subtitle: "Retirar efectivo a la caja fuerte",
  },
} as const satisfies Record<CashMovementKind, KindPresentation>;

function exceedsMessage(expected: number): string {
  return `No hay tanto efectivo en la caja: se esperan ${formatCents(expected)}.`;
}

export type RecordCashMovementPanelProps = {
  kind: CashMovementKind;
  sessionId: string;
  person: SignedInPerson;
  expectedCash?: number;
  loadKinds: () => Promise<RecordableCashMovementKinds | null | "unavailable">;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  recordCashMovement: (input: CashMovementInput) => Promise<RecordCashMovementOutcome>;
  readPreview: (
    movement: CashMovementToPreview,
  ) => Promise<CashMovementPreview | null | "unavailable">;
  onClose: () => void;
  onRecorded: () => void;
};

type PanelProps = Omit<RecordCashMovementPanelProps, "loadKinds" | "person"> & {
  kinds: RecordableCashMovementKinds;
};

function MovementPanel({
  kind,
  sessionId,
  kinds,
  expectedCash,
  loadAuthorizers,
  recordCashMovement,
  readPreview,
  onClose,
  onRecorded,
}: PanelProps) {
  const [refusedExpectedCash, setRefusedExpectedCash] = useState<number>();
  const [notice, setNotice] = useState<string>();
  const amountBox = useRef<HTMLDivElement>(null);
  const presentation = PRESENTATION[kind];
  const { form, submit, submitting, values, clearFieldError } = useRequestForm({
    defaultValues: { ...EMPTY_CASH_MOVEMENT_FORM, kind },
    request: { schema: recordCashMovementFormRequestSchema, from: cashMovementRequestFrom },
    fields: { kind: null, amount: "amount", reason: null },
    messages: { amount: amountMessage },
    onSubmit: async (request, { showFieldError }) => {
      if (!authorization.ready) {
        authorization.ask();
        return;
      }
      const outcome = await recordCashMovement({
        ...request,
        authorization: authorization.value,
      }).catch((): "failed" => "failed");
      authorization.dismiss();
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
  const authorization = useAuthorization({
    permission: kinds[kind].permission,
    required: kinds[kind].authorization_required,
    loadAuthorizers,
  });
  const typedAmount = values.amount.trim() === "" ? undefined : parseAmountCents(values.amount);
  const preview = useCashMovementPreviewQuery(
    sessionId,
    typedAmount === undefined ? undefined : { kind, amount: typedAmount },
    readPreview,
  );
  const missingCash =
    refusedExpectedCash ??
    (preview?.kind === "exceeds_expected_cash" ? preview.expected : undefined);

  useEffect(() => {
    amountBox.current?.querySelector("input")?.focus();
  }, []);

  function handleSubmit() {
    if (submitting) {
      return;
    }
    setNotice(undefined);
    clearFieldError("reason");
    void submit();
  }

  function cancel() {
    if (!submitting) {
      onClose();
    }
  }

  useKeys([{ key: "Escape", run: cancel }]);
  useKeys([{ key: "Enter", run: handleSubmit }], { fallback: true });

  return (
    <SidePanel
      width="wide"
      label={presentation.title}
      header={
        <SidePanelTitle
          icon={CASH_MOVEMENT_ICONS[kind]}
          title={presentation.title}
          onClose={cancel}
          closeDisabled={submitting}
        />
      }
      footer={
        <Button
          size="large"
          fullWidth
          icon={<Check />}
          iconPosition="start"
          keycap="Enter"
          disabled={submitting}
          onPress={handleSubmit}
        >
          {presentation.submit}
        </Button>
      }
    >
      {expectedCash === undefined ? null : (
        <FigureStat size="hero" label="EFECTIVO ESPERADO" value={formatCents(expectedCash)} />
      )}
      <div ref={amountBox}>
        <form.AppField
          name="amount"
          listeners={{
            onChange: () => {
              setNotice(undefined);
              setRefusedExpectedCash(undefined);
            },
          }}
        >
          {(field) => (
            <field.TextField
              kind="amount"
              prefix="$"
              label="Importe"
              decimals={2}
              disabled={submitting}
            />
          )}
        </form.AppField>
      </div>
      <form.AppField name="reason" listeners={{ onChange: () => setNotice(undefined) }}>
        {(field) => <field.TextField kind="plain-text" label="Motivo" disabled={submitting} />}
      </form.AppField>
      <AuthorizationModal
        authorization={authorization}
        subtitle={presentation.subtitle}
        action={presentation.authorizing}
        submitting={submitting}
        onConfirm={handleSubmit}
      />
      {missingCash !== undefined ? (
        <InlineNotice tone="error" icon={<CircleX />} title={exceedsMessage(missingCash)} />
      ) : preview?.kind === "remaining" ? (
        <HighlightedFigure label="QUEDA" tone="neutral" value={formatCents(preview.cash)} />
      ) : null}
      {notice === undefined ? null : (
        <InlineNotice tone="error" icon={<CircleX />} title={notice} />
      )}
    </SidePanel>
  );
}

function LoadingPanel({
  kind,
  state,
  onClose,
}: {
  kind: CashMovementKind;
  state: Exclude<CoreData<RecordableCashMovementKinds>, { status: "loaded" }>;
  onClose: () => void;
}) {
  useKeys([{ key: "Escape", run: onClose }]);
  return (
    <SidePanel
      width="wide"
      label={PRESENTATION[kind].title}
      header={
        <SidePanelTitle
          icon={CASH_MOVEMENT_ICONS[kind]}
          title={PRESENTATION[kind].title}
          onClose={onClose}
        />
      }
    >
      {state.status === "failed" ? (
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudieron cargar los movimientos que podés registrar"
          description="Volvé a intentarlo en unos segundos."
          onRetry={state.retry}
        />
      ) : (
        <LoadingPlaceholder variant="form" fields={2} />
      )}
    </SidePanel>
  );
}

export function RecordCashMovementPanel({
  loadKinds,
  person,
  ...props
}: RecordCashMovementPanelProps) {
  const kinds = useCashMovementKindsQuery(person.user_id, loadKinds);
  if (kinds.status === "loaded") {
    return <MovementPanel {...props} kinds={kinds.value} />;
  }
  return <LoadingPanel kind={props.kind} state={kinds} onClose={props.onClose} />;
}
