import type { OpenCashSessionOutcome, OpeningFloatSuggestion } from "@purosur/contracts";
import {
  Button,
  formatCents,
  formatDayMonthAndTime,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  SidePanel,
  SidePanelTitle,
  SummaryRowGroup,
  useRequestForm,
} from "@purosur/ui";
import { Check, TriangleAlert, UserX, Wallet } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  INVALID_OPENING_FLOAT_MESSAGE,
  openCashSessionRequestSchema,
  openingFloatFormFor,
  openingFloatMessage,
  openingFloatRequestFrom,
} from "./opening-float-form";
import { useOpeningFloatSuggestionQuery } from "./register-queries";

type Notice = { title: string; icon: "permission" | "failure" };

const NOT_PERMITTED: Notice = { title: "No tenés permiso para abrir la caja.", icon: "permission" };
const RESTORING: Notice = {
  title: "La caja se está restaurando: todavía no se puede abrir.",
  icon: "failure",
};
const FAILED: Notice = { title: "No se pudo abrir la caja. Probá de nuevo.", icon: "failure" };

const TITLE = "Abrir caja";

export type CashOpeningPanelProps = {
  firstName: string;
  canOpen: boolean;
  open: (openingFloat: number) => Promise<OpenCashSessionOutcome>;
  readOpeningFloatSuggestion: () => Promise<OpeningFloatSuggestion | null | "unavailable">;
};

function PreviousClose({ suggestion }: { suggestion: OpeningFloatSuggestion }) {
  return suggestion.kind === "previous_close" ? (
    <div className="border-b border-border pb-4">
      <SummaryRowGroup
        variant="plain"
        rows={[
          {
            label: "Cierre anterior",
            value: formatDayMonthAndTime(suggestion.closed_at),
            detail: true,
          },
          { label: "Contado", value: formatCents(suggestion.counted_cash), detail: true },
        ]}
      />
    </div>
  ) : null;
}

function OpeningForm({
  open,
  suggestion,
}: {
  open: CashOpeningPanelProps["open"];
  suggestion: OpeningFloatSuggestion;
}) {
  const field = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<Notice>();
  const { form, submit, submitting } = useRequestForm({
    defaultValues: openingFloatFormFor(suggestion),
    request: { schema: openCashSessionRequestSchema, from: openingFloatRequestFrom },
    fields: { opening_float: "openingFloat" },
    messages: { openingFloat: openingFloatMessage },
    onSubmit: async (request, { showFieldError }) => {
      const outcome = await open(request.opening_float).catch(
        (): OpenCashSessionOutcome => ({ kind: "unavailable" }),
      );
      switch (outcome.kind) {
        case "invalid_opening_float":
          showFieldError("openingFloat", INVALID_OPENING_FLOAT_MESSAGE);
          break;
        case "not_permitted":
          setNotice(NOT_PERMITTED);
          break;
        case "restoration_in_progress":
          setNotice(RESTORING);
          break;
        case "unavailable":
          setNotice(FAILED);
          break;
        case "opened":
        case "already_open":
        case "not_signed_in":
          break;
      }
    },
  });

  useEffect(() => {
    field.current?.querySelector("input")?.focus();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setNotice(undefined);
    void submit();
  }

  return (
    <form className="contents" noValidate onSubmit={handleSubmit}>
      <SidePanel
        width="wide"
        label={TITLE}
        header={<SidePanelTitle icon={<Wallet />} title={TITLE} />}
        footer={
          <Button
            type="submit"
            size="large"
            fullWidth
            icon={<Check />}
            iconPosition="start"
            keycap="Enter"
            disabled={submitting}
          >
            {TITLE}
          </Button>
        }
      >
        <PreviousClose suggestion={suggestion} />
        <div ref={field}>
          <form.AppField name="openingFloat" listeners={{ onChange: () => setNotice(undefined) }}>
            {(openingFloat) => (
              <openingFloat.TextField
                kind="amount"
                prefix="$"
                label="Fondo inicial"
                decimals={2}
                disabled={submitting}
              />
            )}
          </form.AppField>
        </div>
        {notice === undefined ? null : (
          <InlineNotice
            tone="error"
            icon={notice.icon === "permission" ? <UserX /> : <TriangleAlert />}
            title={notice.title}
          />
        )}
      </SidePanel>
    </form>
  );
}

function OpeningPanel({
  open,
  readOpeningFloatSuggestion,
}: Pick<CashOpeningPanelProps, "open" | "readOpeningFloatSuggestion">) {
  const suggestion = useOpeningFloatSuggestionQuery(readOpeningFloatSuggestion);
  if (suggestion.status === "loaded") {
    return <OpeningForm open={open} suggestion={suggestion.value} />;
  }
  return (
    <SidePanel
      width="wide"
      label={TITLE}
      header={<SidePanelTitle icon={<Wallet />} title={TITLE} />}
    >
      {suggestion.status === "loading" ? (
        <LoadingPlaceholder variant="form" fields={1} />
      ) : (
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudo leer el cierre anterior"
          description="Volvé a intentarlo en unos segundos."
          onRetry={suggestion.retry}
        />
      )}
    </SidePanel>
  );
}

export function CashOpeningPanel({
  firstName,
  canOpen,
  open,
  readOpeningFloatSuggestion,
}: CashOpeningPanelProps) {
  if (canOpen) {
    return <OpeningPanel open={open} readOpeningFloatSuggestion={readOpeningFloatSuggestion} />;
  }
  return (
    <SidePanel width="wide" label="Apertura de caja">
      <h2 className="text-display font-bold text-text-accent">{firstName}</h2>
    </SidePanel>
  );
}
