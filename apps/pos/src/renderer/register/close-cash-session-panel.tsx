import type { CashBalance, CashCountPreview, CloseCashSessionOutcome } from "@purosur/contracts";
import {
  Button,
  Eyebrow,
  FigureStat,
  formatCents,
  HighlightedFigure,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  SidePanel,
  SidePanelTitle,
  SummaryRowGroup,
  useRequestForm,
} from "@purosur/ui";
import { Check, DoorClosed, TriangleAlert, UserX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useKeys } from "../platform/key-layer";
import type { CoreData } from "../platform/use-core-query";
import { countDifferenceFigure } from "./cash-amounts";
import {
  countedCashMessage,
  countedCashOf,
  countedCashRequestFrom,
  countedCashRequestSchema,
  EMPTY_COUNTED_CASH_FORM,
  INVALID_COUNTED_CASH_MESSAGE,
} from "./counted-cash-form";
import { cashBalanceRows } from "./expected-cash-panel";
import { useCashCountPreviewQuery, useRefreshSessionOpenSale } from "./register-queries";

type Notice = { title: string; icon: "permission" | "failure" };

const NOT_PERMITTED: Notice = {
  title: "No tenés permiso para cerrar la caja.",
  icon: "permission",
};
const FAILED: Notice = { title: "No se pudo cerrar la caja. Probá de nuevo.", icon: "failure" };
const EXPECTED_CASH = "EFECTIVO ESPERADO";

export type CloseCashSessionPanelProps = {
  sessionId: string;
  balance: CoreData<CashBalance>;
  openSale: boolean;
  loadCashCountPreview: (countedCash: number) => Promise<CashCountPreview | null | "unavailable">;
  closeCashSession: (countedCash: number) => Promise<CloseCashSessionOutcome>;
  onClose: () => void;
  onClosed: () => void;
};

function Balance({ balance }: { balance: CoreData<CashBalance> }) {
  if (balance.status === "loading") {
    return (
      <>
        <FigureStat size="hero" variant="plain" label={EXPECTED_CASH} loading />
        <LoadingPlaceholder variant="card" lines={4} />
      </>
    );
  }
  if (balance.status === "failed") {
    return (
      <>
        <Eyebrow text={EXPECTED_CASH} />
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudo leer el efectivo esperado"
          description="Volvé a intentarlo en unos segundos."
          onRetry={balance.retry}
        />
      </>
    );
  }
  return (
    <>
      <FigureStat
        size="hero"
        variant="plain"
        label={EXPECTED_CASH}
        value={formatCents(balance.value.expected)}
      />
      <SummaryRowGroup variant="plain" rows={cashBalanceRows(balance.value, "detail")} />
    </>
  );
}

export function CloseCashSessionPanel({
  sessionId,
  balance,
  openSale,
  loadCashCountPreview,
  closeCashSession,
  onClose,
  onClosed,
}: CloseCashSessionPanelProps) {
  const field = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<Notice>();
  const refreshOpenSale = useRefreshSessionOpenSale(sessionId);
  const { form, submit, submitting, values } = useRequestForm({
    defaultValues: EMPTY_COUNTED_CASH_FORM,
    request: { schema: countedCashRequestSchema, from: countedCashRequestFrom },
    fields: { counted_cash: "countedCash" },
    messages: { countedCash: countedCashMessage },
    onSubmit: async (request, { showFieldError }) => {
      const outcome = await closeCashSession(request.counted_cash).catch(
        (): CloseCashSessionOutcome => ({ kind: "unavailable" }),
      );
      switch (outcome.kind) {
        case "closed":
          onClosed();
          break;
        case "invalid_counted_cash":
          showFieldError("countedCash", INVALID_COUNTED_CASH_MESSAGE);
          break;
        case "open_sale":
          await refreshOpenSale();
          break;
        case "lacks_permission":
          setNotice(NOT_PERMITTED);
          break;
        case "unavailable":
        case "not_signed_in":
          setNotice(FAILED);
          break;
        case "no_open_session":
          break;
      }
    },
  });

  useEffect(() => {
    if (!submitting) {
      field.current?.querySelector("input")?.focus();
    }
  }, [submitting]);

  const counted = countedCashOf(countedCashRequestSchema, values);
  const difference = useCashCountPreviewQuery(sessionId, counted, loadCashCountPreview);
  const figure = difference === undefined ? undefined : countDifferenceFigure(difference);
  const blocked = submitting || openSale || balance.status !== "loaded";

  function handleSubmit() {
    if (blocked) {
      return;
    }
    setNotice(undefined);
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
      label="Cerrar caja"
      header={
        <SidePanelTitle
          icon={<DoorClosed />}
          title="Cerrar caja"
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
          dataStatus={balance.status}
          disabled={submitting || openSale}
          onPress={handleSubmit}
        >
          Cerrar caja
        </Button>
      }
    >
      <Balance balance={balance} />
      <div ref={field} className="flex flex-col gap-1.5">
        <Eyebrow text="Contado" />
        <form.AppField name="countedCash" listeners={{ onChange: () => setNotice(undefined) }}>
          {(countedCash) => (
            <countedCash.TextField
              kind="counted-cash"
              prefix="$"
              label="Contado"
              labelVisuallyHidden
              decimals={2}
              disabled={submitting}
            />
          )}
        </form.AppField>
      </div>
      {figure === undefined ? null : (
        <HighlightedFigure label={figure.label} tone="neutral" value={figure.value} />
      )}
      {notice === undefined ? null : (
        <InlineNotice
          tone="error"
          icon={notice.icon === "permission" ? <UserX /> : <TriangleAlert />}
          description={notice.title}
        />
      )}
    </SidePanel>
  );
}
