import type {
  AddProductOutcome,
  AddWeighedProductOutcome,
  AdjustSaleLineOutcome,
  ApplySaleDiscountOutcome,
  Authorization,
  CancelPaidSaleOutcome,
  CancelSaleOutcome,
  ChangeLineQuantityOutcome,
  ChangeLineWeightOutcome,
  CurrentSaleAnswer,
  FoundProduct,
  ManualAdjustmentRequest,
  OpenSale,
  PreviewSaleDiscountOutcome,
  PreviewSaleLineAdjustmentOutcome,
  RegisterStatus,
  RemoveSaleLineOutcome,
  SaleDiscountRequest,
  ScanProductOutcome,
  SearchProductsOutcome,
  SignInUser,
  WeighProductOutcome,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import {
  EmptyState,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  localAlertText,
  ScreenHeader,
  SearchField,
} from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Ban, ScanBarcode, TriangleAlert } from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { SearchResults } from "../platform/product-search-results";
import { ProductSearchResults, searchOptionId } from "../platform/product-search-results";
import type { CoreData } from "../platform/use-core-query";
import type { ScaleWeighing } from "../platform/use-scale-weighing";
import { useBarcodeReadings } from "../shell/barcode-readings";
import { OpenSessionRail } from "../shell/open-session-rail";
import { PaidSaleCancelledModal } from "../shell/paid-sale-cancelled-modal";
import type { Refund } from "../shell/refund-lines";
import type { SignedInPerson } from "../shell/signed-in-person";
import { AdjustLineModal } from "./adjust-line-modal";
import { ApplySaleDiscountModal } from "./apply-sale-discount-modal";
import { CancelPaidSaleModal } from "./cancel-paid-sale-modal";
import { CancelSaleModal } from "./cancel-sale-modal";
import { ChangeLineWeightModal } from "./change-line-weight-modal";
import { changedLineId } from "./changed-line";
import { PaymentPanel } from "./payment-panel";
import { SaleLines } from "./sale-lines";
import {
  useCurrentSaleQuery,
  useReadCurrentSale,
  useResetCurrentSale,
  useSearchProducts,
  useTakeSale,
} from "./sales-queries";
import type { ScanProblem } from "./scan-problem-message";
import { messageFor, ScanProblemMessage } from "./scan-problem-message";
import { WeighProductModal } from "./weigh-product-modal";

export type SaleScreenProps = {
  sessionId: string;
  person: SignedInPerson;
  registerName: string | null;
  lock: () => void;
  currentSale: () => Promise<CurrentSaleAnswer>;
  scanProduct: (code: string) => Promise<ScanProductOutcome>;
  searchProducts: (query: string) => Promise<SearchProductsOutcome>;
  addProduct: (productId: string) => Promise<AddProductOutcome>;
  addWeighedProduct: (
    productId: string,
    weightThousandths: number,
  ) => Promise<AddWeighedProductOutcome>;
  weighProduct: (productId: string) => Promise<WeighProductOutcome>;
  changeLineQuantity: (
    lineId: string,
    quantity: number,
    expectedQuantity: number,
  ) => Promise<ChangeLineQuantityOutcome>;
  changeLineWeight: (
    lineId: string,
    weightThousandths: number,
    expectedWeightThousandths: number,
  ) => Promise<ChangeLineWeightOutcome>;
  adjustSaleLine: (
    lineId: string,
    adjustment: ManualAdjustmentRequest,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<AdjustSaleLineOutcome>;
  previewSaleLineAdjustment: (
    lineId: string,
    adjustment: ManualAdjustmentRequest,
  ) => Promise<PreviewSaleLineAdjustmentOutcome>;
  applySaleDiscount: (
    discount: SaleDiscountRequest,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ApplySaleDiscountOutcome>;
  previewSaleDiscount: (discount: SaleDiscountRequest) => Promise<PreviewSaleDiscountOutcome>;
  removeSaleLine: (lineId: string) => Promise<RemoveSaleLineOutcome>;
  cancelSale: () => Promise<CancelSaleOutcome>;
  cancelPaidSale: (
    saleId: string,
    authorization: Authorization | undefined,
  ) => Promise<CancelPaidSaleOutcome>;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  onSessionInvalid: () => void;
  registerStatus: CoreData<RegisterStatus>;
};

type SaleEditOutcome =
  | ChangeLineQuantityOutcome
  | ChangeLineWeightOutcome
  | RemoveSaleLineOutcome
  | CancelSaleOutcome;

type SaleLine = OpenSale["lines"][number];

type Weighing =
  | { kind: "add"; productId: string; productName: string; submitted: string }
  | { kind: "change"; line: SaleLine };

type TakenOutcome =
  | ScanProductOutcome
  | AddProductOutcome
  | Exclude<AddWeighedProductOutcome, { kind: "invalid_weight" | "not_sold_by_weight" }>;

type SaleEditFailure = Extract<
  ScanProblem,
  { kind: "change_failed" | "weight_change_failed" | "remove_failed" | "cancel_failed" }
>;

const LETTER = /\p{L}/u;

const LOCKED_REASONS: Record<NonNullable<OpenSale["lines_lock"]>, string> = {
  approved_payment: "La venta ya no se puede cambiar porque tiene un pago aprobado.",
  mercado_pago_charge_in_progress: "Hay un cobro con Mercado Pago en curso. Esperá a que termine.",
};

function reportsCoreState(outcome: TakenOutcome): boolean {
  return (
    outcome.kind === "not_signed_in" ||
    outcome.kind === "no_open_session" ||
    outcome.kind === "sale_has_payments"
  );
}

function discountRemovedFrom(sale: OpenSale, lineId: string | undefined): ScanProblem | undefined {
  const line = sale.lines.find(({ id }) => id === lineId);
  return line === undefined
    ? undefined
    : { kind: "manual_discount_removed", product_name: line.product_name };
}

function discountsRemovedFrom(
  sale: OpenSale,
  lineId: string | undefined,
  removed: { manual: boolean; saleTotal: boolean },
): ScanProblem | undefined {
  const manualRemoved = removed.manual ? discountRemovedFrom(sale, lineId) : undefined;
  if (!removed.saleTotal) {
    return manualRemoved;
  }
  return manualRemoved?.kind === "manual_discount_removed"
    ? { kind: "manual_and_sale_discount_removed", product_name: manualRemoved.product_name }
    : { kind: "sale_discount_removed" };
}

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
  lock,
  currentSale,
  scanProduct,
  searchProducts,
  addProduct,
  addWeighedProduct,
  weighProduct,
  changeLineQuantity,
  changeLineWeight,
  adjustSaleLine,
  previewSaleLineAdjustment,
  applySaleDiscount,
  previewSaleDiscount,
  removeSaleLine,
  cancelSale,
  cancelPaidSale,
  loadAuthorizers,
  onSessionInvalid,
  registerStatus,
}: SaleScreenProps) {
  const navigate = useNavigate();
  const field = useRef<HTMLFormElement>(null);
  const current = useCurrentSaleQuery({ sessionId, userId: person.user_id, read: currentSale });
  const diskFull =
    registerStatus.status === "loaded"
      ? registerStatus.value.conditions.find(
          (condition) => condition.kind === "sales_denied" && condition.reason === "disk_full",
        )
      : undefined;
  const batteryCritical =
    registerStatus.status === "loaded"
      ? registerStatus.value.conditions.find(
          (condition) =>
            condition.kind === "sales_denied" && condition.reason === "battery_critical",
        )
      : undefined;
  const takeSale = useTakeSale(sessionId, person.user_id);
  const resetCurrentSale = useResetCurrentSale(sessionId, person.user_id);
  const readCurrentSale = useReadCurrentSale(sessionId, person.user_id, currentSale);
  const search = useSearchProducts(searchProducts);
  const [changed, setChanged] = useState<string>();
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<ScanProblem>();
  const [results, setResults] = useState<SearchResults>();
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingPaidCancel, setConfirmingPaidCancel] = useState(false);
  const [cancelledRefunds, setCancelledRefunds] = useState<Refund[]>();
  const [weighing, setWeighing] = useState<Weighing>();
  const [adjusting, setAdjusting] = useState<SaleLine>();
  const [discounting, setDiscounting] = useState(false);
  const editInFlight = useRef(false);
  const confirmingCancelNow = useRef(false);
  const weighingNow = useRef<Weighing>(undefined);
  const adjustingNow = useRef(false);
  const discountingNow = useRef(false);
  const listboxId = useId();

  useEffect(() => {
    function refocusWhenFocusIsLost(event: FocusEvent) {
      if (
        event.relatedTarget === null &&
        !confirmingCancelNow.current &&
        !adjustingNow.current &&
        !discountingNow.current &&
        weighingNow.current === undefined
      ) {
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

  function askForWeight(asking: Weighing | undefined) {
    weighingNow.current = asking;
    setWeighing(asking);
  }

  async function take(
    submitted: string,
    outcome: TakenOutcome,
    failure: { kind: "scan_failed" } | { kind: "add_failed" },
  ) {
    switch (outcome.kind) {
      case "added": {
        const addedLineId = changedLineId(await takeSale(outcome.sale), outcome.sale);
        setProblem(
          discountsRemovedFrom(outcome.sale, addedLineId, {
            manual: outcome.removed_manual_discount,
            saleTotal: outcome.removed_sale_discount,
          }),
        );
        setChanged(addedLineId);
        setCode((typed) => (typed.trim() === submitted ? "" : typed));
        break;
      }
      case "not_signed_in":
      case "no_open_session":
        onSessionInvalid();
        break;
      case "unknown_code":
      case "product_unavailable":
      case "no_price":
      case "line_quantity_limit":
      case "not_permitted":
      case "installation_revoked":
      case "disk_space_short":
      case "local_database_damaged":
      case "battery_critical":
      case "paid_order_without_sale":
      case "paid_orders_not_checked":
        refuse(submitted, outcome);
        break;
      case "weight_needed":
        askForWeight({
          kind: "add",
          productId: outcome.product_id,
          productName: outcome.product_name,
          submitted,
        });
        break;
      case "sale_has_payments":
        setProblem(undefined);
        setCode((typed) => (typed.trim() === submitted ? "" : typed));
        await resetCurrentSale();
        break;
      case "unavailable":
        refuse(submitted, failure);
        break;
    }
  }

  async function addWithWeight(
    asked: Extract<Weighing, { kind: "add" }>,
    weight: number,
  ): Promise<"invalid_weight" | "done"> {
    const outcome = await addWeighedProduct(asked.productId, weight).catch(
      (): AddWeighedProductOutcome => ({ kind: "unavailable" }),
    );
    if (outcome.kind === "invalid_weight") {
      return "invalid_weight";
    }
    askForWeight(undefined);
    if (outcome.kind === "not_sold_by_weight") {
      refuse(asked.submitted, { kind: "not_sold_by_weight", product_name: asked.productName });
    } else {
      await take(asked.submitted, outcome, { kind: "add_failed" });
    }
    return "done";
  }

  async function weighOnScale(asked: Extract<Weighing, { kind: "add" }>): Promise<ScaleWeighing> {
    const outcome = await weighProduct(asked.productId).catch(
      (): WeighProductOutcome => ({ kind: "unavailable" }),
    );
    if (outcome.kind === "weighing" || outcome.kind === "scale_unavailable") {
      return outcome;
    }
    if (outcome.kind === "added") {
      await take(asked.submitted, outcome, { kind: "add_failed" });
      const line = outcome.sale.lines.at(-1);
      return line === undefined
        ? { kind: "closed" }
        : { kind: "taken", weightThousandths: line.quantity, amount: line.line_total };
    }
    const stillAsked = weighingNow.current === asked;
    if (stillAsked) {
      askForWeight(undefined);
    }
    if (outcome.kind === "not_sold_by_weight") {
      if (stillAsked) {
        refuse(asked.submitted, { kind: "not_sold_by_weight", product_name: asked.productName });
      }
    } else if (stillAsked || reportsCoreState(outcome)) {
      await take(asked.submitted, outcome, { kind: "add_failed" });
    }
    return { kind: "closed" };
  }

  async function scan(submitted: string) {
    const outcome = await scanProduct(submitted).catch(
      (): ScanProductOutcome => ({ kind: "unavailable" }),
    );
    await take(submitted, outcome, { kind: "scan_failed" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = code.trim();
    if (submitted === "") {
      return;
    }
    await scan(submitted);
  }

  async function takeReading(reading: string) {
    const submitted = reading.trim();
    flushSync(() => {
      setCode(submitted);
      setProblem(undefined);
      setResults(undefined);
      setDismissed(false);
    });
    await scan(submitted);
  }

  async function add(product: FoundProduct) {
    const submitted = code.trim();
    const outcome = await addProduct(product.product_id).catch(
      (): AddProductOutcome => ({ kind: "unavailable" }),
    );
    await take(submitted, outcome, { kind: "add_failed" });
  }

  function askToAdjust(line: SaleLine | undefined) {
    adjustingNow.current = line !== undefined;
    setAdjusting(line);
  }

  function askToDiscount(asking: boolean) {
    discountingNow.current = asking;
    setDiscounting(asking);
  }

  async function takeDiscountedSale(discounted: OpenSale) {
    askToDiscount(false);
    setProblem(undefined);
    setChanged(undefined);
    await takeSale(discounted);
  }

  async function readSaleAgainAfterDiscounting() {
    askToDiscount(false);
    await resetCurrentSale();
  }

  async function takeAdjustedSale(adjusted: OpenSale, removedSaleDiscount: boolean) {
    askToAdjust(undefined);
    setProblem(removedSaleDiscount ? { kind: "sale_discount_removed" } : undefined);
    setChanged(undefined);
    await takeSale(adjusted);
  }

  async function readSaleAgainAfterAdjusting() {
    askToAdjust(undefined);
    await resetCurrentSale();
  }

  function askToCancel(asking: boolean) {
    confirmingCancelNow.current = asking;
    setConfirmingCancel(asking);
  }

  function askToCancelPaid(asking: boolean) {
    confirmingCancelNow.current = asking;
    setConfirmingPaidCancel(asking);
  }

  async function takeCancelledPaidSale(refunds: Refund[]) {
    setProblem(undefined);
    setChanged(undefined);
    setCancelledRefunds(refunds);
    askToCancelPaid(false);
    await takeSale(null);
  }

  async function readSaleAgain() {
    askToCancelPaid(false);
    await resetCurrentSale();
  }

  function closeCancelledPaidSale() {
    confirmingCancelNow.current = false;
    setCancelledRefunds(undefined);
    focusScanField(field.current);
  }

  async function edit(
    request: () => Promise<SaleEditOutcome>,
    failure: SaleEditFailure,
    line?: SaleLine,
  ): Promise<SaleEditOutcome["kind"] | undefined> {
    if (editInFlight.current) {
      return undefined;
    }
    editInFlight.current = true;
    setEditing(true);
    const outcome = await request().catch((): SaleEditOutcome => ({ kind: "unavailable" }));
    editInFlight.current = false;
    setEditing(false);
    if (outcome.kind === "invalid_weight") {
      return outcome.kind;
    }
    switch (outcome.kind) {
      case "changed":
        setProblem(
          discountsRemovedFrom(outcome.sale, line?.id, {
            manual: outcome.removed_manual_discount,
            saleTotal: outcome.removed_sale_discount,
          }),
        );
        setChanged(undefined);
        await takeSale(outcome.sale);
        break;
      case "removed":
        setProblem(outcome.removed_sale_discount ? { kind: "sale_discount_removed" } : undefined);
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
      case "mercado_pago_charge_in_progress":
        setProblem(outcome);
        break;
      case "sale_has_payments":
        setProblem(undefined);
        await resetCurrentSale();
        break;
      case "unknown_line":
      case "stale_quantity":
      case "stale_weight":
      case "sold_by_weight":
      case "not_sold_by_weight":
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
    return outcome.kind;
  }

  async function changeWeight(line: SaleLine, weight: number): Promise<"invalid_weight" | "done"> {
    const outcome = await edit(
      () => changeLineWeight(line.id, weight, line.quantity),
      { kind: "weight_change_failed" },
      line,
    );
    if (outcome === "invalid_weight") {
      return "invalid_weight";
    }
    askForWeight(undefined);
    return "done";
  }

  useEffect(() => {
    if (
      !confirmingCancel &&
      !confirmingPaidCancel &&
      cancelledRefunds === undefined &&
      weighing === undefined &&
      adjusting === undefined &&
      !discounting
    ) {
      focusScanField(field.current);
    }
  }, [confirmingCancel, confirmingPaidCancel, cancelledRefunds, weighing, adjusting, discounting]);

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
  const linesLock = sale?.lines_lock ?? null;
  const editable = linesLock === null;
  useBarcodeReadings(editable ? (reading) => void takeReading(reading) : undefined);
  const notPermitted = messageFor({ kind: "not_permitted" });
  const shownProblem =
    answer === "not_permitted" && problem?.kind === "not_permitted" ? undefined : problem;
  const lockedReason = linesLock === null ? undefined : LOCKED_REASONS[linesLock];
  const refundsOnCancel = sale?.refunds_on_cancel ?? [];

  async function askToCancelSale() {
    const asked = sale?.cancel_refusal === null ? sale : await readCurrentSale();
    if (asked === "unavailable") {
      setProblem({ kind: "cancel_failed" });
    } else if (asked === null || asked === "not_permitted") {
      setProblem(undefined);
    } else if (asked.cancel_refusal !== null) {
      setProblem({ kind: asked.cancel_refusal });
    } else if (asked.refunds_on_cancel.length > 0) {
      askToCancelPaid(true);
    } else {
      askToCancel(true);
    }
  }

  return (
    <div className="flex h-full w-full bg-surface-subtle">
      <OpenSessionRail
        registerName={registerName}
        lock={lock}
        current="sale"
        abilities={person.abilities}
      />
      <main className="flex min-w-0 flex-1 flex-col gap-4 pt-6 pr-6 pb-6 pl-8">
        <ScreenHeader eyebrow={registerName ?? undefined} title="Venta en curso" />
        {diskFull === undefined ? null : (
          <InlineNotice
            tone={diskFull.level === "critical" ? "error" : "warning"}
            icon={<Ban />}
            title={localAlertText(diskFull).title}
            description={localAlertText(diskFull).meaning}
          />
        )}
        {batteryCritical === undefined ? null : (
          <InlineNotice
            tone="error"
            icon={<Ban />}
            title={localAlertText(batteryCritical).title}
            description={localAlertText(batteryCritical).meaning}
          />
        )}
        <form
          ref={field}
          noValidate
          className="relative"
          onSubmit={submit}
          onKeyDownCapture={driveResults}
        >
          <SearchField
            label="Producto"
            {...(lockedReason === undefined ? {} : { disabledReason: lockedReason })}
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
              editable,
              lockedReason,
              onChangeQuantity: (line, quantity) =>
                void edit(
                  () => changeLineQuantity(line.id, quantity, line.quantity),
                  { kind: "change_failed" },
                  line,
                ),
              onChangeWeight: (line) => askForWeight({ kind: "change", line }),
              onAdjust: askToAdjust,
              onRemove: (line) =>
                void edit(() => removeSaleLine(line.id), { kind: "remove_failed" }),
            }}
          />
        ) : null}
      </main>
      <PaymentPanel
        saleStatus={current.status}
        lineCount={sale?.lines.length ?? 0}
        subtotal={sale?.subtotal ?? 0}
        saleDiscount={sale?.sale_discount ?? null}
        total={sale?.total ?? 0}
        paid={sale?.paid ?? 0}
        pending={sale?.pending ?? 0}
        cancellable={answer !== undefined}
        chargeRefusal={sale?.charge_refusal ?? null}
        canCancel={sale !== null && !editing}
        canDiscount={sale !== null && sale.sale_discount_refusal === null && editable && !editing}
        onDiscount={() => askToDiscount(true)}
        onCharge={() => void navigate({ to: "/charge" })}
        onCancel={() => void askToCancelSale()}
      />
      <CancelSaleModal
        open={confirmingCancel}
        lineCount={sale?.lines.length ?? 0}
        total={sale?.total ?? 0}
        busy={editing}
        onClose={() => askToCancel(false)}
        onCancelSale={() => void edit(cancelSale, { kind: "cancel_failed" })}
      />
      {weighing?.kind === "add" ? (
        <WeighProductModal
          productName={weighing.productName}
          weigh={() => weighOnScale(weighing)}
          addWeighedProduct={(weight) => addWithWeight(weighing, weight)}
          onClose={() => askForWeight(undefined)}
        />
      ) : null}
      {weighing?.kind === "change" ? (
        <ChangeLineWeightModal
          productName={weighing.line.product_name}
          currentWeight={weighing.line.quantity}
          changeLineWeight={(weight) => changeWeight(weighing.line, weight)}
          onClose={() => askForWeight(undefined)}
        />
      ) : null}
      {adjusting !== undefined && sale !== null ? (
        <AdjustLineModal
          lineId={adjusting.id}
          productName={adjusting.product_name}
          listUnitPrice={adjusting.list_unit_price}
          quantity={adjusting.quantity}
          saleUnit={adjusting.sale_unit}
          authorizationRequired={sale.adjust_authorization_required}
          person={person}
          loadAuthorizers={loadAuthorizers}
          adjustSaleLine={adjustSaleLine}
          previewAdjustment={previewSaleLineAdjustment}
          onAdjusted={(adjusted, removedSaleDiscount) =>
            void takeAdjustedSale(adjusted, removedSaleDiscount)
          }
          onSaleGone={() => void readSaleAgainAfterAdjusting()}
          onSessionInvalid={onSessionInvalid}
          onClose={() => askToAdjust(undefined)}
        />
      ) : null}
      {discounting && sale !== null ? (
        <ApplySaleDiscountModal
          lineCount={sale.lines.length}
          subtotal={sale.subtotal}
          authorizationRequired={sale.sale_discount_authorization_required}
          person={person}
          loadAuthorizers={loadAuthorizers}
          applySaleDiscount={applySaleDiscount}
          previewSaleDiscount={previewSaleDiscount}
          onApplied={(discounted) => void takeDiscountedSale(discounted)}
          onSaleGone={() => void readSaleAgainAfterDiscounting()}
          onSessionInvalid={onSessionInvalid}
          onClose={() => askToDiscount(false)}
        />
      ) : null}
      {confirmingPaidCancel && sale !== null ? (
        <CancelPaidSaleModal
          saleId={sale.id}
          total={sale.total}
          paid={sale.paid}
          refunds={refundsOnCancel}
          authorizationRequired={sale.cancel_authorization_required}
          person={person}
          loadAuthorizers={loadAuthorizers}
          cancelPaidSale={cancelPaidSale}
          onCancelled={(refunds) => void takeCancelledPaidSale(refunds)}
          onSaleGone={() => void readSaleAgain()}
          onSessionInvalid={onSessionInvalid}
          onClose={() => askToCancelPaid(false)}
        />
      ) : null}
      {cancelledRefunds === undefined ? null : (
        <PaidSaleCancelledModal refunds={cancelledRefunds} onClose={closeCancelledPaidSale} />
      )}
    </div>
  );
}
