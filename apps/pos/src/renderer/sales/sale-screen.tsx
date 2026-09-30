import type { CurrentSaleAnswer, OpenSale, ScanProductOutcome } from "@purosur/contracts";
import { scannedCodeSchema } from "@purosur/contracts";
import { EmptyState, LoadFailure, LoadingPlaceholder, SearchField } from "@purosur/ui";
import { ScanBarcode, TriangleAlert } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { SignedInPerson } from "../access/signed-in-person";
import { OpenSessionRail } from "../shell/open-session-rail";
import { SessionEyebrow } from "../shell/session-eyebrow";
import { changedLineId } from "./changed-line";
import { PaymentPanel } from "./payment-panel";
import { SaleLines } from "./sale-lines";
import type { ScanProblem } from "./scan-problem-message";
import { messageFor, ScanProblemMessage } from "./scan-problem-message";

type SaleView =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "not_permitted" }
  | { status: "ready"; sale: OpenSale | null; changedLineId: string | undefined };

export type SaleScreenProps = {
  person: SignedInPerson;
  registerName: string | null;
  openedAt: string;
  currentSale: () => Promise<CurrentSaleAnswer>;
  scanProduct: (code: string) => Promise<ScanProductOutcome>;
  onSessionInvalid: () => void;
};

function focusScanField(form: HTMLFormElement | null) {
  form?.querySelector("input")?.focus();
}

// A scanner types the next code at the caret, so a refused code left unselected would be joined
// to the next one instead of replaced by it.
function selectScanField(form: HTMLFormElement | null) {
  form?.querySelector("input")?.select();
}

export function SaleScreen({
  person,
  registerName,
  openedAt,
  currentSale,
  scanProduct,
  onSessionInvalid,
}: SaleScreenProps) {
  const field = useRef<HTMLFormElement>(null);
  const [view, setView] = useState<SaleView>({ status: "loading" });
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<ScanProblem>();

  useEffect(() => {
    function refocusWhenFocusIsLost(event: FocusEvent) {
      if (event.relatedTarget === null) {
        focusScanField(field.current);
      }
    }
    focusScanField(field.current);
    document.addEventListener("focusout", refocusWhenFocusIsLost);
    return () => document.removeEventListener("focusout", refocusWhenFocusIsLost);
  }, []);

  useEffect(() => {
    if (view.status !== "loading") {
      return;
    }
    let current = true;
    currentSale().then(
      (sale) => {
        if (current) {
          setView(
            sale === "not_permitted"
              ? { status: "not_permitted" }
              : { status: "ready", sale, changedLineId: undefined },
          );
        }
      },
      () => {
        if (current) {
          setView({ status: "failed" });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [view.status, currentSale]);

  function type(typed: string) {
    setCode(typed);
    setProblem(undefined);
  }

  function refuse(submitted: string, refusal: ScanProblem) {
    if (field.current?.querySelector("input")?.value.trim() !== submitted) {
      return;
    }
    setProblem(refusal);
    selectScanField(field.current);
  }

  function take(submitted: string, outcome: ScanProductOutcome) {
    switch (outcome.kind) {
      case "added":
        setProblem(undefined);
        setView((now) => ({
          status: "ready",
          sale: outcome.sale,
          changedLineId: changedLineId(now.status === "ready" ? now.sale : null, outcome.sale),
        }));
        setCode((typed) => (typed === submitted ? "" : typed));
        break;
      case "not_signed_in":
      case "no_open_session":
        onSessionInvalid();
        break;
      case "unknown_code":
      case "no_price":
      case "sold_by_weight":
      case "not_permitted":
      case "installation_revoked":
      case "unavailable":
        refuse(submitted, outcome);
        break;
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = code.trim();
    if (submitted === "") {
      return;
    }
    if (!scannedCodeSchema.safeParse(submitted).success) {
      refuse(submitted, { kind: "unknown_code" });
      return;
    }
    const outcome = await scanProduct(submitted).catch(
      (): ScanProductOutcome => ({ kind: "unavailable" }),
    );
    take(submitted, outcome);
  }

  const sale = view.status === "ready" ? view.sale : null;
  const notPermitted = messageFor({ kind: "not_permitted" });
  const shownProblem =
    view.status === "not_permitted" && problem?.kind === "not_permitted" ? undefined : problem;

  return (
    <div className="flex h-screen w-screen bg-surface-subtle">
      <OpenSessionRail firstName={person.first_name} current="sale" />
      <main className="flex min-w-0 flex-1 flex-col gap-4 pt-6 pr-6 pb-6 pl-8">
        <div className="flex flex-col gap-1.5">
          <SessionEyebrow registerName={registerName} openedAt={openedAt} />
          <h1 className="text-display text-text-accent">Venta en curso</h1>
        </div>
        <form ref={field} noValidate className="relative" onSubmit={submit}>
          <SearchField
            label="Producto"
            placeholder="Escaneá o escribí el nombre del producto"
            icon={<ScanBarcode />}
            value={code}
            onChange={type}
          />
          <ScanProblemMessage problem={shownProblem} />
        </form>
        {view.status === "loading" ? <LoadingPlaceholder variant="list" items={4} /> : null}
        {view.status === "failed" ? (
          <LoadFailure
            icon={<TriangleAlert />}
            title="No se pudo cargar la venta"
            description="Volvé a intentarlo en unos segundos."
            onRetry={() => {
              setView({ status: "loading" });
              focusScanField(field.current);
            }}
          />
        ) : null}
        {view.status === "not_permitted" ? (
          <EmptyState
            variant="blank"
            icon={<notPermitted.icon />}
            title={notPermitted.title}
            description={notPermitted.help}
          />
        ) : null}
        {view.status === "ready" ? (
          <SaleLines lines={sale?.lines ?? []} changedLineId={view.changedLineId} />
        ) : null}
      </main>
      <PaymentPanel lineCount={sale?.lines.length ?? 0} total={sale?.total ?? 0} />
    </div>
  );
}
