import type { FindSaleForReturnOutcome } from "@purosur/contracts";
import {
  Button,
  fieldErrorMessage,
  formatCents,
  InlineNotice,
  SearchField,
  SidePanel,
  SummaryRowGroup,
  useRequestForm,
} from "@purosur/ui";
import { CircleX, Search, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { CompleteReturnInput, SaleForReturnReading } from "../platform/core-client";
import { useKeys } from "../platform/key-layer";
import { AuthorizationModal } from "../shell/authorization-modal";
import { useBarcodeReadings } from "../shell/barcode-readings";
import { RegisterFrame } from "../shell/register-frame";
import type { AuthorizationState } from "../shell/use-authorization";
import { EMPTY_RETURN_DRAFT } from "./return-form";
import { ReturnLinesTable } from "./return-lines-table";
import { ReturnPanelFigure } from "./return-panel-figure";
import type { SaleForReturn } from "./return-sale";
import type { FindRefusalKind } from "./return-text";
import { findRefusalText } from "./return-text";
import {
  EMPTY_RETURN_TICKET_FORM,
  RETURN_TICKET_FIELDS,
  returnTicketRequestFrom,
  returnTicketRequestSchema,
  scannedReturnReading,
} from "./return-ticket-form";
import type { ShownSaleForReturn } from "./returns-queries";
import { useSaleChosenForReturnQuery } from "./returns-queries";

export type FoundSale = {
  sale: SaleForReturn;
  source: CompleteReturnInput["ticketSource"];
  verificationRequired: boolean;
};

export type ReturnFindStepProps = {
  rail: ReactNode;
  authorization: AuthorizationState;
  saleId: string | undefined;
  initialSearch: string;
  findSaleForReturn: (
    reading: SaleForReturnReading,
    authorization: AuthorizationState["value"],
  ) => Promise<FindSaleForReturnOutcome>;
  onFound: (found: FoundSale) => void;
  onAuthorizationRequired: () => void;
  onSessionInvalid: () => void;
};

export function ReturnFindStep({
  rail,
  authorization,
  saleId,
  initialSearch,
  findSaleForReturn,
  onFound,
  onAuthorizationRequired,
  onSessionInvalid,
}: ReturnFindStepProps) {
  const [refusal, setRefusal] = useState<FindRefusalKind>();
  const [looking, setLooking] = useState(false);
  const [searched, setSearched] = useState(false);
  const finding = useRef(false);
  const lastReading = useRef<SaleForReturnReading | undefined>(undefined);
  const searchArea = useRef<HTMLDivElement | null>(null);
  const chosen = useSaleChosenForReturnQuery({ saleId, find: findSaleForReturn });
  const chosenAnswer = chosen.status === "loaded" ? chosen.value : undefined;

  const { form, submit, values } = useRequestForm({
    defaultValues: { ...EMPTY_RETURN_TICKET_FORM, search: initialSearch },
    request: { schema: returnTicketRequestSchema, from: returnTicketRequestFrom },
    fields: RETURN_TICKET_FIELDS,
    messages: { search: findRefusalText("not_a_ticket_number") },
    onSubmit: ({ reading }) => look(reading),
  });

  async function look(reading: SaleForReturnReading) {
    if (finding.current) {
      return;
    }
    finding.current = true;
    setLooking(true);
    setSearched(true);
    lastReading.current = reading;
    setRefusal(undefined);
    const sent = authorization.value;
    const outcome = await findSaleForReturn(reading, sent)
      .catch((): "failed" => "failed")
      .finally(() => {
        finding.current = false;
        setLooking(false);
      });
    authorization.dismiss();
    if (outcome === "failed") {
      setRefusal("unavailable");
      return;
    }
    settle(outcome, sent);
  }

  function settle(outcome: FindSaleForReturnOutcome, sent: AuthorizationState["value"]) {
    switch (outcome.kind) {
      case "found":
        onFound({
          sale: outcome.sale,
          source: outcome.ticket_source,
          verificationRequired: outcome.ticket_verification_required,
        });
        break;
      case "not_found":
      case "voided":
      case "needs_connection":
      case "lookup_failed":
        setRefusal(outcome.kind);
        break;
      case "not_signed_in":
        onSessionInvalid();
        break;
      case "lacks_permission":
        if (sent === undefined) {
          onAuthorizationRequired();
          authorization.ask();
        } else {
          authorization.refuse(outcome);
        }
        break;
      case "wrong_pin":
      case "rate_limited":
      case "locked":
      case "unavailable":
        if (authorization.required) {
          authorization.refuse(outcome);
        } else {
          setRefusal("unavailable");
        }
        break;
    }
  }

  useEffect(() => {
    const input = searchArea.current?.querySelector("input");
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }, []);

  const settleChosen = useEffectEvent((answer: ShownSaleForReturn, chosenId: string) => {
    lastReading.current = { kind: "sale", sale_id: chosenId };
    settle(answer, undefined);
  });

  const chosenId = searched ? undefined : saleId;

  useEffect(() => {
    if (chosenAnswer !== undefined && chosenId !== undefined) {
      settleChosen(chosenAnswer, chosenId);
    }
  }, [chosenAnswer, chosenId]);

  function retryLastReading() {
    if (lastReading.current !== undefined) {
      void look(lastReading.current);
    }
  }

  const typed = values.search.trim() !== "";
  const choosing =
    chosenId !== undefined && (chosen.status === "loading" || chosenAnswer?.kind === "found");

  function submitSearch() {
    if (typed) {
      setSearched(true);
      void submit();
    }
  }

  function takeScan(text: string) {
    setSearched(true);
    const reading = scannedReturnReading(text);
    if (reading === undefined) {
      setRefusal("not_a_ticket_qr");
    } else {
      void look(reading);
    }
  }
  useBarcodeReadings(takeScan);

  const legend = useKeys([{ key: "Enter", label: "Buscar", run: submitSearch }]);

  return (
    <RegisterFrame
      background="subtle"
      rail={rail}
      aside={
        <SidePanel
          label="Devolución"
          width="wide"
          header={
            <ReturnPanelFigure label="DEVOLUCIÓN" value={choosing ? undefined : formatCents(0)} />
          }
          footer={
            <Button
              size="large"
              fullWidth
              icon={<Search />}
              iconPosition="start"
              keycap="Enter"
              disabled={!typed}
              dataStatus={looking ? "loading" : "loaded"}
              onPress={submitSearch}
            >
              Buscar
            </Button>
          }
        >
          <SummaryRowGroup variant="divided" rows={[{ label: "Líneas a devolver", value: "0" }]} />
          <AuthorizationModal
            authorization={authorization}
            subtitle="Devolución"
            action="hacer devoluciones"
            submitting={looking}
            onConfirm={retryLastReading}
          />
        </SidePanel>
      }
    >
      <main className="flex min-w-0 flex-1 flex-col gap-4 px-8 pt-4 pb-6">
        <form.AppField name="search" listeners={{ onChange: () => setRefusal(undefined) }}>
          {(field) => {
            const fieldMessage = fieldErrorMessage(field.state.meta.errors);
            const shown = refusal === undefined ? fieldMessage : findRefusalText(refusal);
            return (
              <>
                <div ref={searchArea}>
                  <SearchField
                    placeholder="Escaneá el ticket o escribí el número"
                    icon={<Search />}
                    value={field.state.value}
                    invalid={fieldMessage !== undefined}
                    onChange={field.handleChange}
                  />
                </div>
                <ReturnLinesTable
                  sale={undefined}
                  draft={EMPTY_RETURN_DRAFT}
                  previewed={undefined}
                  selectedLineId={undefined}
                  legend={legend}
                  loading={choosing}
                  failure={
                    chosenId !== undefined && chosen.status === "failed"
                      ? {
                          icon: <TriangleAlert />,
                          title: "No se pudo buscar la venta",
                          description: "Probá de nuevo.",
                          onRetry: chosen.retry,
                        }
                      : undefined
                  }
                  footer={
                    shown === undefined ? undefined : (
                      <InlineNotice tone="error" icon={<CircleX />} title={shown} />
                    )
                  }
                  onSelect={() => {}}
                  onMark={() => {}}
                />
              </>
            );
          }}
        </form.AppField>
      </main>
    </RegisterFrame>
  );
}
