import type { FindSaleForReturnOutcome } from "@purosur/contracts";
import {
  Button,
  formatCents,
  InlineNotice,
  SearchField,
  SidePanel,
  SummaryRowGroup,
} from "@purosur/ui";
import { CircleX, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
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
import { scannedReturnReading, typedReturnReading } from "./return-ticket-form";

export type FoundSale = {
  sale: SaleForReturn;
  source: CompleteReturnInput["ticketSource"];
  verificationRequired: boolean;
};

export type ReturnFindStepProps = {
  rail: ReactNode;
  authorization: AuthorizationState;
  saleId: string | undefined;
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
  findSaleForReturn,
  onFound,
  onAuthorizationRequired,
  onSessionInvalid,
}: ReturnFindStepProps) {
  const [search, setSearch] = useState("");
  const [refusal, setRefusal] = useState<FindRefusalKind>();
  const [looking, setLooking] = useState(false);
  const finding = useRef(false);
  const lastReading = useRef<SaleForReturnReading | undefined>(undefined);
  const searchArea = useRef<HTMLDivElement | null>(null);
  const openedBySale = useRef(false);

  async function look(reading: SaleForReturnReading) {
    if (finding.current) {
      return;
    }
    finding.current = true;
    setLooking(true);
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
    searchArea.current?.querySelector("input")?.focus();
  }, []);

  useEffect(() => {
    if (saleId !== undefined && !openedBySale.current) {
      openedBySale.current = true;
      void look({ kind: "sale", sale_id: saleId });
    }
  });

  function retryLastReading() {
    if (lastReading.current !== undefined) {
      void look(lastReading.current);
    }
  }

  const typed = search.trim() !== "";

  function submitSearch() {
    if (!typed) {
      return;
    }
    const reading = typedReturnReading(search);
    if (reading === undefined) {
      setRefusal("not_a_ticket_number");
    } else {
      void look(reading);
    }
  }

  function takeScan(text: string) {
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
          header={<ReturnPanelFigure label="DEVOLUCIÓN" value={formatCents(0)} />}
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
        <div ref={searchArea}>
          <SearchField
            placeholder="Escaneá el ticket o escribí el número"
            icon={<Search />}
            value={search}
            onChange={(text) => {
              setSearch(text);
              setRefusal(undefined);
            }}
          />
        </div>
        <ReturnLinesTable
          sale={undefined}
          draft={EMPTY_RETURN_DRAFT}
          previewed={undefined}
          selectedLineId={undefined}
          legend={legend}
          footer={
            refusal === undefined ? undefined : (
              <InlineNotice tone="error" icon={<CircleX />} title={findRefusalText(refusal)} />
            )
          }
          onSelect={() => {}}
          onMark={() => {}}
        />
      </main>
    </RegisterFrame>
  );
}
