import type {
  AddProductOutcome,
  CancelSaleOutcome,
  ChangeLineQuantityOutcome,
  CurrentSaleAnswer,
  FoundProduct,
  RemoveSaleLineOutcome,
  ScanProductOutcome,
  SearchProductsOutcome,
} from "@purosur/contracts";
import { EmptyState, LoadFailure, LoadingPlaceholder, SearchField } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { ScanBarcode, TriangleAlert } from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { SignedInPerson } from "../access/signed-in-person";
import { OpenSessionRail } from "../shell/open-session-rail";
import { SessionEyebrow } from "../shell/session-eyebrow";
import { CancelSaleModal } from "./cancel-sale-modal";
import { changedLineId } from "./changed-line";
import { PaymentPanel } from "./payment-panel";
import type { SearchResults } from "./product-search-results";
import { ProductSearchResults, searchOptionId } from "./product-search-results";
import { SaleLines } from "./sale-lines";
import {
  useCurrentSaleQuery,
  useResetCurrentSale,
  useSearchProducts,
  useTakeSale,
} from "./sales-queries";
import type { ScanProblem } from "./scan-problem-message";
import { messageFor, ScanProblemMessage } from "./scan-problem-message";

export type SaleScreenProps = {
  sessionId: string;
  person: SignedInPerson;
  registerName: string | null;
  openedAt: string;
  lock: () => void;
  currentSale: () => Promise<CurrentSaleAnswer>;
  scanProduct: (code: string) => Promise<ScanProductOutcome>;
  searchProducts: (query: string) => Promise<SearchProductsOutcome>;
  addProduct: (productId: string) => Promise<AddProductOutcome>;
  changeLineQuantity: (
    lineId: string,
    quantity: number,
    expectedQuantity: number,
  ) => Promise<ChangeLineQuantityOutcome>;
  removeSaleLine: (lineId: string) => Promise<RemoveSaleLineOutcome>;
  cancelSale: () => Promise<CancelSaleOutcome>;
  onSessionInvalid: () => void;
};

type SaleEditOutcome = ChangeLineQuantityOutcome | RemoveSaleLineOutcome | CancelSaleOutcome;

type SaleEditFailure = Extract<
  ScanProblem,
  { kind: "change_failed" | "remove_failed" | "cancel_failed" }
>;

const LETTER = /\p{L}/u;

function focusScanField(form: HTMLFormElement | null) {
  form?.querySelector("input")?.focus();
}

// A scanner types the next code at the caret, so a refused code left unselected would be joined
// to the next one instead of replaced by it.
function selectScanField(form: HTMLFormElement | null) {
  form?.querySelector("input")?.select();
}

export function SaleScreen({
  sessionId,
  person,
  registerName,
  openedAt,
  lock,
  currentSale,
  scanProduct,
  searchProducts,
  addProduct,
  changeLineQuantity,
  removeSaleLine,
  cancelSale,
  onSessionInvalid,
}: SaleScreenProps) {
  const navigate = useNavigate();
  const field = useRef<HTMLFormElement>(null);
  const current = useCurrentSaleQuery({ sessionId, userId: person.user_id, read: currentSale });
  const takeSale = useTakeSale(sessionId, person.user_id);
  const resetCurrentSale = useResetCurrentSale(sessionId, person.user_id);
  const search = useSearchProducts(searchProducts);
  const [changed, setChanged] = useState<string>();
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<ScanProblem>();
  const [results, setResults] = useState<SearchResults>();
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const editInFlight = useRef(false);
  const confirmingCancelNow = useRef(false);
  const listboxId = useId();

  useEffect(() => {
    function refocusWhenFocusIsLost(event: FocusEvent) {
      if (event.relatedTarget === null && !confirmingCancelNow.current) {
        focusScanField(field.current);
      }
    }
    focusScanField(field.current);
    document.addEventListener("focusout", refocusWhenFocusIsLost);
    return () => document.removeEventListener("focusout", refocusWhenFocusIsLost);
  }, []);

  function type(typed: string) {
    setCode(typed);
    setProblem(undefined);
    setDismissed(false);
    const query = typed.trim();
    if (!LETTER.test(query)) {
      setResults(undefined);
      return;
    }
    void search(query).then((outcome) => takeSearch(query, outcome));
  }

  function takeSearch(query: string, outcome: SearchProductsOutcome) {
    if (field.current?.querySelector("input")?.value.trim() !== query) {
      return;
    }
    switch (outcome.kind) {
      case "results":
        setResults({ query, products: outcome.products, more: outcome.more });
        setActiveIndex(0);
        break;
      case "not_signed_in":
      case "no_open_session":
        onSessionInvalid();
        break;
      case "not_permitted":
        setResults(undefined);
        setProblem(outcome);
        break;
      case "unavailable":
        setResults(undefined);
        setProblem({ kind: "search_failed" });
        break;
    }
  }

  function refuse(submitted: string, refusal: ScanProblem) {
    if (field.current?.querySelector("input")?.value.trim() !== submitted) {
      return;
    }
    setProblem(refusal);
    setDismissed(true);
    selectScanField(field.current);
  }

  async function take(
    submitted: string,
    outcome: ScanProductOutcome | AddProductOutcome,
    failure: { kind: "scan_failed" } | { kind: "add_failed" },
  ) {
    switch (outcome.kind) {
      case "added":
        setProblem(undefined);
        setChanged(changedLineId(await takeSale(outcome.sale), outcome.sale));
        setCode((typed) => (typed.trim() === submitted ? "" : typed));
        break;
      case "not_signed_in":
      case "no_open_session":
        onSessionInvalid();
        break;
      case "unknown_code":
      case "product_unavailable":
      case "no_price":
      case "sold_by_weight":
      case "not_permitted":
      case "installation_revoked":
        refuse(submitted, outcome);
        break;
      case "unavailable":
        refuse(submitted, failure);
        break;
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = code.trim();
    if (submitted === "") {
      return;
    }
    const outcome = await scanProduct(submitted).catch(
      (): ScanProductOutcome => ({ kind: "unavailable" }),
    );
    await take(submitted, outcome, { kind: "scan_failed" });
  }

  async function add(product: FoundProduct) {
    const submitted = code.trim();
    const outcome = await addProduct(product.product_id).catch(
      (): AddProductOutcome => ({ kind: "unavailable" }),
    );
    await take(submitted, outcome, { kind: "add_failed" });
  }

  function askToCancel(asking: boolean) {
    confirmingCancelNow.current = asking;
    setConfirmingCancel(asking);
  }

  async function edit(request: () => Promise<SaleEditOutcome>, failure: SaleEditFailure) {
    if (editInFlight.current) {
      return;
    }
    editInFlight.current = true;
    setEditing(true);
    const outcome = await request().catch((): SaleEditOutcome => ({ kind: "unavailable" }));
    editInFlight.current = false;
    setEditing(false);
    switch (outcome.kind) {
      case "changed":
      case "removed":
        setProblem(undefined);
        setChanged(undefined);
        await takeSale(outcome.sale);
        break;
      case "cancelled":
        setProblem(undefined);
        setChanged(undefined);
        await takeSale(null);
        break;
      case "not_signed_in":
      case "no_open_session":
        onSessionInvalid();
        break;
      case "not_permitted":
      case "has_approved_payment":
        setProblem(outcome);
        break;
      case "unknown_line":
      case "stale_quantity":
      case "no_open_sale":
        await resetCurrentSale();
        break;
      case "invalid_quantity":
      case "unavailable":
        setProblem(failure);
        break;
    }
    askToCancel(false);
    focusScanField(field.current);
  }

  useEffect(() => {
    if (!confirmingCancel) {
      focusScanField(field.current);
    }
  }, [confirmingCancel]);

  const found = results?.query === code.trim() && !dismissed ? results : undefined;
  const choosing = found !== undefined && found.products.length > 0;
  const chosen = choosing ? found.products[activeIndex] : undefined;

  // The field is the only thing with the keyboard, so the list is driven from it before the field's
  // own handling: Escape would otherwise clear the text it should keep.
  function driveResults(event: KeyboardEvent) {
    if (found === undefined) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setDismissed(true);
    } else if (chosen !== undefined && event.key === "Enter") {
      event.preventDefault();
      void add(chosen);
    } else if (choosing && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(Math.min(found.products.length - 1, Math.max(0, activeIndex + step)));
    }
  }

  const answer = current.status === "loaded" ? current.value : undefined;
  const sale = answer === undefined || answer === "not_permitted" ? null : answer;
  const notPermitted = messageFor({ kind: "not_permitted" });
  const shownProblem =
    answer === "not_permitted" && problem?.kind === "not_permitted" ? undefined : problem;

  return (
    <div className="flex h-screen w-screen bg-surface-subtle">
      <OpenSessionRail
        firstName={person.first_name}
        registerName={registerName}
        lock={lock}
        current="sale"
      />
      <main className="flex min-w-0 flex-1 flex-col gap-4 pt-6 pr-6 pb-6 pl-8">
        <div className="flex flex-col gap-1.5">
          <SessionEyebrow registerName={registerName} openedAt={openedAt} />
          <h1 className="text-display text-text-accent">Venta en curso</h1>
        </div>
        <form
          ref={field}
          noValidate
          className="relative"
          onSubmit={submit}
          onKeyDownCapture={driveResults}
        >
          <SearchField
            label="Producto"
            placeholder="Escaneá o escribí el nombre del producto"
            icon={<ScanBarcode />}
            value={code}
            onChange={type}
            combobox={{
              expanded: choosing,
              listboxId,
              activeOptionId: choosing ? searchOptionId(listboxId, activeIndex) : undefined,
            }}
          />
          <ProductSearchResults
            listboxId={listboxId}
            search={found}
            activeIndex={activeIndex}
            onChoose={(product) => void add(product)}
          />
          <ScanProblemMessage problem={shownProblem} />
        </form>
        {current.status === "loading" ? <LoadingPlaceholder variant="list" items={4} /> : null}
        {current.status === "failed" ? (
          <LoadFailure
            icon={<TriangleAlert />}
            title="No se pudo cargar la venta"
            description="Volvé a intentarlo en unos segundos."
            onRetry={() => {
              current.retry();
              focusScanField(field.current);
            }}
          />
        ) : null}
        {answer === "not_permitted" ? (
          <EmptyState
            variant="blank"
            icon={<notPermitted.icon />}
            title={notPermitted.title}
            description={notPermitted.help}
          />
        ) : null}
        {answer !== undefined && answer !== "not_permitted" ? (
          <SaleLines
            lines={sale?.lines ?? []}
            changedLineId={changed}
            actions={{
              busy: editing,
              onChangeQuantity: (line, quantity) =>
                void edit(() => changeLineQuantity(line.id, quantity, line.quantity), {
                  kind: "change_failed",
                }),
              onRemove: (line) =>
                void edit(() => removeSaleLine(line.id), { kind: "remove_failed" }),
            }}
          />
        ) : null}
      </main>
      <PaymentPanel
        lineCount={sale?.lines.length ?? 0}
        total={sale?.total ?? 0}
        chargeRefusal={sale?.charge_refusal ?? null}
        canCancel={sale !== null && !editing}
        onCharge={() => void navigate({ to: "/charge" })}
        onCancel={() => askToCancel(true)}
      />
      <CancelSaleModal
        open={confirmingCancel}
        lineCount={sale?.lines.length ?? 0}
        total={sale?.total ?? 0}
        busy={editing}
        onClose={() => askToCancel(false)}
        onCancelSale={() => void edit(cancelSale, { kind: "cancel_failed" })}
      />
    </div>
  );
}
