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
  FindProductByCodeOutcome,
  FoundProduct,
  LiveScaleReadingOutcome,
  ManualAdjustmentRequest,
  OpenSale,
  PaymentMethodAvailability,
  PreviewSaleDiscountOutcome,
  PreviewSaleLineAdjustmentOutcome,
  RegisterStatus,
  RemoveSaleLineOutcome,
  SaleDiscountRequest,
  ScanProductOutcome,
  SearchProductsOutcome,
  SignInUser,
  WeighLineOutcome,
  WeighProductOutcome,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import type { KeyLegendItem } from "@purosur/ui";
import {
  EmptyState,
  InlineNotice,
  LoadingPlaceholder,
  localAlertText,
  SearchField,
} from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Ban, BatteryLow, ScanBarcode, Search } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useKeys } from "../platform/key-layer";
import type { SearchResults } from "../platform/product-search-results";
import { ProductSearchResults, searchOptionId } from "../platform/product-search-results";
import type { CoreData } from "../platform/use-core-query";
import type { ScaleWeighing } from "../platform/use-scale-weighing";
import { useBarcodeReadings } from "../shell/barcode-readings";
import { OpenSessionRail } from "../shell/open-session-rail";
import { PaidSaleCancelledModal } from "../shell/paid-sale-cancelled-modal";
import type { Refund } from "../shell/refund-lines";
import { RegisterFrame } from "../shell/register-frame";
import type { SignedInPerson } from "../shell/signed-in-person";
import { CancelPaidSalePanel } from "./cancel-paid-sale-panel";
import { changedLineId } from "./changed-line";
import type { KeyedChargeMethod } from "./charge-method-availability";
import { EmptySalePanel } from "./empty-sale-panel";
import { LinePricePanel } from "./line-price-panel";
import { LiveScaleCard } from "./live-scale-card";
import { PaymentPanel } from "./payment-panel";
import { SaleDiscountPanel } from "./sale-discount-panel";
import { LockedSaleLines, SaleLines } from "./sale-lines";
import {
  useCurrentSaleQuery,
  useFindProductByCode,
  usePaymentMethodAvailabilityQuery,
  useProductByCodeQuery,
  useReadCurrentSale,
  useRefreshPaymentMethodAvailability,
  useResetCurrentSale,
  useSearchProducts,
  useTakeSale,
} from "./sales-queries";
import type { ScanProblem } from "./scan-problem-message";
import { messageFor, ScanProblemMessage } from "./scan-problem-message";
import type { ScaleReading, WaitingEntry } from "./weighing-card";
import { WeighingCard } from "./weighing-card";

export type SaleScreenProps = {
  sessionId: string;
  person: SignedInPerson;
  lock: () => void;
  currentSale: () => Promise<CurrentSaleAnswer>;
  scanProduct: (code: string) => Promise<ScanProductOutcome>;
  searchProducts: (query: string) => Promise<SearchProductsOutcome>;
  findProductByCode: (code: string) => Promise<FindProductByCodeOutcome>;
  addProduct: (productId: string) => Promise<AddProductOutcome>;
  addWeighedProduct: (
    productId: string,
    weightThousandths: number,
  ) => Promise<AddWeighedProductOutcome>;
  readScale: () => Promise<LiveScaleReadingOutcome>;
  weighProduct: (
    productId: string,
    confirmedWeightThousandths: number | null,
  ) => Promise<WeighProductOutcome>;
  weighLine: (
    lineId: string,
    expectedWeightThousandths: number,
    confirmedWeightThousandths: number | null,
  ) => Promise<WeighLineOutcome>;
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
  paymentMethodAvailability: () => Promise<PaymentMethodAvailability | null>;
};

type SaleEditOutcome =
  | ChangeLineQuantityOutcome
  | ChangeLineWeightOutcome
  | RemoveSaleLineOutcome
  | CancelSaleOutcome;

type SaleLine = OpenSale["lines"][number];

type Priced = "by_code" | { unitPrice: number | null } | undefined;

type Weighing =
  | {
      kind: "add";
      productId: string;
      productName: string;
      submitted: string;
      priced: Priced;
    }
  | { kind: "change"; line: SaleLine };

type TakenOutcome =
  | ScanProductOutcome
  | AddProductOutcome
  | Exclude<AddWeighedProductOutcome, { kind: "invalid_weight" | "not_sold_by_weight" }>;

type SaleEditFailure = Extract<
  ScanProblem,
  { kind: "change_failed" | "weight_change_failed" | "remove_failed" | "empty_failed" }
>;

const LETTER = /\p{L}/u;

const PANEL_LEGEND: readonly KeyLegendItem[] = [
  { keyName: "Tab", label: "Campo" },
  { keyName: "ArrowLeftRight", label: "Opción" },
];

const LOCKED_REASONS: Record<NonNullable<OpenSale["lines_lock"]>, string> = {
  approved_payment: "La venta ya no se puede cambiar porque tiene un pago aprobado.",
  mercado_pago_charge_in_progress: "Hay un cobro con Mercado Pago en curso. Esperá a que termine.",
};

function reportsCoreState(outcome: { kind: string }): boolean {
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
  const input = form?.querySelector("input");
  if (input?.getAttribute("aria-disabled") === "true") {
    form?.focus();
    return;
  }
  input?.focus();
}

// A scanner types the next code at the caret, so a refused code left unselected would be joined
// to the next one instead of replaced by it.
function selectScanField(form: HTMLFormElement | null) {
  form?.querySelector("input")?.select();
}

export function SaleScreen({
  sessionId,
  person,
  lock,
  currentSale,
  scanProduct,
  searchProducts,
  findProductByCode,
  addProduct,
  addWeighedProduct,
  readScale,
  weighProduct,
  weighLine,
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
  paymentMethodAvailability,
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
  const findByCode = useFindProductByCode(findProductByCode);
  const [selectedLineId, setSelectedLineId] = useState<string>();
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
  const [waiting, setWaitingState] = useState<WaitingEntry[]>([]);
  const [scaleReading, setScaleReading] = useState<ScaleReading>();
  const [adjusting, setAdjusting] = useState<SaleLine>();
  const [discounting, setDiscounting] = useState(false);
  const editInFlight = useRef(false);
  const confirmingCancelNow = useRef(false);
  const weighingNow = useRef<Weighing>(undefined);
  const waitingNow = useRef<WaitingEntry[]>([]);
  const advancingWaiting = useRef(false);
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
      case "restoration_in_progress":
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
    if (asking !== undefined) {
      setCode("");
    }
  }

  function setWaiting(next: WaitingEntry[]) {
    waitingNow.current = next;
    setWaitingState(next);
  }

  function enqueue(product: FoundProduct) {
    setWaiting([
      ...waitingNow.current,
      {
        productId: product.product_id,
        name: product.name,
        saleUnit: product.sale_unit,
        unitPrice: product.unit_price,
      },
    ]);
  }

  function discardFirstWaiting() {
    setWaiting(waitingNow.current.slice(1));
  }

  function weighingOrWaiting() {
    return weighingNow.current !== undefined || advancingWaiting.current;
  }

  async function take(
    submitted: string,
    outcome: TakenOutcome,
    failure: { kind: "scan_failed" } | { kind: "add_failed" },
    priced?: Priced,
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
        setSelectedLineId(addedLineId);
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
      case "restoration_in_progress":
        refuse(submitted, outcome);
        break;
      case "weight_needed":
        if (field.current?.querySelector("input")?.value.trim() === submitted) {
          setDismissed(true);
        }
        askForWeight({
          kind: "add",
          productId: outcome.product_id,
          productName: outcome.product_name,
          submitted,
          priced,
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

  async function advanceWaiting(): Promise<void> {
    if (advancingWaiting.current) {
      return;
    }
    advancingWaiting.current = true;
    while (weighingNow.current === undefined && waitingNow.current[0] !== undefined) {
      const next = waitingNow.current[0];
      setWaiting(waitingNow.current.slice(1));
      const outcome = await addProduct(next.productId).catch(
        (): AddProductOutcome => ({ kind: "unavailable" }),
      );
      await take("", outcome, { kind: "add_failed" }, { unitPrice: next.unitPrice });
    }
    advancingWaiting.current = false;
  }

  function closeWeighing() {
    askForWeight(undefined);
    void advanceWaiting();
  }

  async function queueByCode(submitted: string) {
    const outcome = await findByCode(submitted);
    switch (outcome.kind) {
      case "found":
        enqueue({
          product_id: outcome.product.product_id,
          name: outcome.product.name,
          sale_unit: outcome.product.sale_unit,
          unit_price: outcome.product.unit_price,
          matches: [],
        });
        setCode((typed) => (typed.trim() === submitted ? "" : typed));
        break;
      case "not_signed_in":
      case "no_open_session":
        onSessionInvalid();
        break;
      case "unknown_code":
      case "not_permitted":
      case "restoration_in_progress":
        refuse(submitted, outcome);
        break;
      case "unavailable":
        refuse(submitted, { kind: "scan_failed" });
        break;
    }
    await advanceWaiting();
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
      refuse("", { kind: "not_sold_by_weight", product_name: asked.productName });
    } else {
      await take("", outcome, { kind: "add_failed" });
    }
    await advanceWaiting();
    return "done";
  }

  async function weighOnScale(
    asked: Extract<Weighing, { kind: "add" }>,
    confirmedWeightThousandths: number | null,
  ): Promise<ScaleWeighing> {
    const outcome = await weighProduct(asked.productId, confirmedWeightThousandths).catch(
      (): WeighProductOutcome => ({ kind: "unavailable" }),
    );
    if (
      outcome.kind === "weighing" ||
      outcome.kind === "unsteady_out_of_range" ||
      outcome.kind === "scale_unavailable" ||
      outcome.kind === "zero_weight"
    ) {
      return outcome;
    }
    if (outcome.kind === "stable" || outcome.kind === "unsteady") {
      return {
        kind: outcome.kind,
        reading: { weightThousandths: outcome.weight_thousandths, amount: outcome.amount },
      };
    }
    if (outcome.kind === "added") {
      await take("", outcome, { kind: "add_failed" });
      const line = outcome.sale.lines.at(-1);
      return line === undefined
        ? { kind: "closed" }
        : { kind: "taken", reading: { weightThousandths: line.quantity, amount: line.line_total } };
    }
    const stillAsked = weighingNow.current === asked;
    if (stillAsked) {
      askForWeight(undefined);
    }
    if (outcome.kind === "not_sold_by_weight") {
      if (stillAsked) {
        refuse("", { kind: "not_sold_by_weight", product_name: asked.productName });
      }
    } else if (stillAsked || reportsCoreState(outcome)) {
      await take("", outcome, { kind: "add_failed" });
    }
    if (stillAsked) {
      void advanceWaiting();
    }
    return { kind: "closed" };
  }

  async function scan(submitted: string) {
    if (weighingOrWaiting()) {
      await queueByCode(submitted);
      return;
    }
    const outcome = await scanProduct(submitted).catch(
      (): ScanProductOutcome => ({ kind: "unavailable" }),
    );
    await take(submitted, outcome, { kind: "scan_failed" }, "by_code");
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
    if (weighingOrWaiting()) {
      enqueue(product);
      setCode((typed) => (typed.trim() === submitted ? "" : typed));
      return;
    }
    const outcome = await addProduct(product.product_id).catch(
      (): AddProductOutcome => ({ kind: "unavailable" }),
    );
    await take(submitted, outcome, { kind: "add_failed" }, { unitPrice: product.unit_price });
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
    await takeSale(discounted);
  }

  async function readSaleAgainAfterDiscounting() {
    askToDiscount(false);
    await resetCurrentSale();
  }

  async function takeAdjustedSale(adjusted: OpenSale, removedSaleDiscount: boolean) {
    askToAdjust(undefined);
    setProblem(removedSaleDiscount ? { kind: "sale_discount_removed" } : undefined);
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
        await takeSale(outcome.sale);
        break;
      case "removed":
        setProblem(outcome.removed_sale_discount ? { kind: "sale_discount_removed" } : undefined);
        await takeSale(outcome.sale);
        break;
      case "cancelled":
        setProblem(undefined);
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
      case "mercado_pago_charge_in_progress":
        setProblem({ kind: outcome.kind, action: "empty" });
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
    await advanceWaiting();
    return "done";
  }

  async function weighLineOnScale(
    asked: Extract<Weighing, { kind: "change" }>,
    confirmedWeightThousandths: number | null,
  ): Promise<ScaleWeighing> {
    const { line } = asked;
    const outcome = await weighLine(line.id, line.quantity, confirmedWeightThousandths).catch(
      (): WeighLineOutcome => ({ kind: "unavailable" }),
    );
    if (
      outcome.kind === "weighing" ||
      outcome.kind === "unsteady_out_of_range" ||
      outcome.kind === "scale_unavailable" ||
      outcome.kind === "zero_weight"
    ) {
      return outcome;
    }
    if (outcome.kind === "stable" || outcome.kind === "unsteady") {
      return {
        kind: outcome.kind,
        reading: { weightThousandths: outcome.weight_thousandths, amount: outcome.amount },
      };
    }
    const changed =
      outcome.kind === "changed"
        ? outcome.sale.lines.find((each) => each.id === line.id)
        : undefined;
    const stillAsked = weighingNow.current === asked;
    if (stillAsked || outcome.kind === "changed" || reportsCoreState(outcome)) {
      await edit(async () => outcome, { kind: "weight_change_failed" }, line);
    }
    if (stillAsked) {
      askForWeight(undefined);
      void advanceWaiting();
    }
    return changed === undefined
      ? { kind: "closed" }
      : {
          kind: "taken",
          reading: { weightThousandths: changed.quantity, amount: changed.line_total },
        };
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

  const priceByCode = useProductByCodeQuery({
    code:
      weighing?.kind === "add" && weighing.priced === "by_code" ? weighing.submitted : undefined,
    read: findProductByCode,
  });
  const codeUnitPrice =
    priceByCode.status === "loaded" && priceByCode.value.kind === "found"
      ? priceByCode.value.product.unit_price
      : undefined;
  const answer = current.status === "loaded" ? current.value : undefined;
  const sale = answer === undefined || answer === "not_permitted" ? null : answer;
  const linesLock = sale?.lines_lock ?? null;
  const editable = linesLock === null;
  const panel =
    adjusting !== undefined && sale !== null
      ? "price"
      : discounting && sale !== null
        ? "discount"
        : confirmingCancel
          ? "empty"
          : confirmingPaidCancel && sale !== null
            ? "cancel"
            : undefined;
  const panelOpen = panel !== undefined;
  const found = results?.query === code.trim() && !dismissed && !panelOpen ? results : undefined;
  const choosing = found !== undefined && found.products.length > 0;
  const chosen = choosing ? found.products[activeIndex] : undefined;
  useBarcodeReadings(editable && !panelOpen ? (reading) => void takeReading(reading) : undefined);
  const saleLines = sale?.lines ?? [];
  const selectedLine = saleLines.find(({ id }) => id === selectedLineId) ?? saleLines.at(-1);
  const paidOrderToApply =
    sale?.rebuilt_paid_order?.applied === false ? sale.rebuilt_paid_order : null;
  const isZeroTotal = saleLines.length > 0 && sale?.total === 0;
  const canCharge =
    sale !== null &&
    saleLines.length > 0 &&
    !isZeroTotal &&
    sale.charge_refusal === null &&
    paidOrderToApply === null;
  const availability = usePaymentMethodAvailabilityQuery({
    sessionId,
    userId: person.user_id,
    read: paymentMethodAvailability,
  });
  const refreshAvailability = useRefreshPaymentMethodAvailability(sessionId, person.user_id);
  const readAvailabilityAgain = useEffectEvent(() => void refreshAvailability());
  const saleTotal = sale?.total;
  const availabilityReadForTotal = useRef<number>(undefined);
  useEffect(() => {
    if (saleTotal === undefined) {
      return;
    }
    if (
      availabilityReadForTotal.current !== undefined &&
      availabilityReadForTotal.current !== saleTotal
    ) {
      readAvailabilityAgain();
    }
    availabilityReadForTotal.current = saleTotal;
  }, [saleTotal]);
  const pointBelowMinimum =
    availability.status === "loaded" && availability.value.point === "below_minimum";
  const qrBelowMinimum =
    availability.status === "loaded" && availability.value.qr === "below_minimum";
  const canChargePaidOrder = paidOrderToApply !== null && sale?.charge_refusal === null;
  const searchEmpty = code === "";
  const canChargeNow = canCharge && weighing === undefined;
  const canCancel = sale !== null && saleLines.length > 0 && !editing && weighing === undefined;
  const canDiscount = sale !== null && sale.sale_discount_refusal === null && editable && !editing;

  function moveSelection(pressed: string) {
    const index = saleLines.findIndex(({ id }) => id === selectedLine?.id);
    const next = Math.min(
      saleLines.length - 1,
      Math.max(0, index + (pressed === "ArrowDown" ? 1 : -1)),
    );
    setSelectedLineId(saleLines[next]?.id);
  }

  function stepSelectedQuantity(pressed: string) {
    const line = selectedLine;
    if (line === undefined) {
      return;
    }
    const quantity = line.quantity + (pressed === "+" ? 1 : -1);
    if (quantity >= 1) {
      void edit(
        () => changeLineQuantity(line.id, quantity, line.quantity),
        { kind: "change_failed" },
        line,
      );
    }
  }

  function charge(method: KeyedChargeMethod | undefined) {
    void navigate({ to: "/charge", search: method === undefined ? {} : { method } });
  }

  function chargePaidOrder() {
    charge(paidOrderToApply?.method === "QR" ? "QR" : undefined);
  }

  const resultCount = found?.products.length ?? 0;
  useKeys(
    [
      { key: "Escape", run: () => setDismissed(true), enabled: found !== undefined },
      {
        key: "Enter",
        run: () => {
          if (chosen !== undefined) {
            void add(chosen);
          }
        },
        enabled: chosen !== undefined,
      },
      {
        key: "ArrowUpDown",
        run: (pressed) => {
          const step = pressed === "ArrowDown" ? 1 : -1;
          setActiveIndex(Math.min(resultCount - 1, Math.max(0, activeIndex + step)));
        },
        enabled: choosing,
      },
      {
        key: "Enter",
        run: () => field.current?.requestSubmit(),
        enabled: weighing !== undefined && code.trim() !== "",
      },
      {
        key: "Enter",
        run: chargePaidOrder,
        enabled: canChargePaidOrder && searchEmpty && weighing === undefined,
      },
    ],
    { within: field, active: !panelOpen },
  );

  const unitLineSelected = selectedLine?.sale_unit === "UNIT";
  const legend = useKeys(
    [
      {
        key: "ArrowUpDown",
        label: "Líneas",
        run: moveSelection,
        enabled: saleLines.length > 0 && !choosing,
      },
      {
        key: "F2",
        label: "Buscar",
        run: () => focusScanField(field.current),
        enabled: answer !== undefined && answer !== "not_permitted",
      },
      {
        key: "F3",
        label: "Pesar",
        run: () => {
          if (selectedLine !== undefined) {
            askForWeight({ kind: "change", line: selectedLine });
          }
        },
        enabled: selectedLine?.sale_unit === "KG" && editable && !editing && weighing === undefined,
      },
      {
        key: "F6",
        label: "Precio",
        run: () => askToAdjust(selectedLine),
        enabled: selectedLine !== undefined && editable && !editing && weighing === undefined,
      },
      { key: "F7", label: "Descuento", run: () => askToDiscount(true), enabled: canDiscount },
      {
        key: "F8",
        label: sale?.lines_lock === "approved_payment" ? "Cancelar venta" : "Vaciar",
        run: () => void askToCancelSale(),
        enabled: canCancel,
      },
      {
        key: "Delete",
        label: "Quitar",
        run: () => {
          if (selectedLine !== undefined) {
            void edit(() => removeSaleLine(selectedLine.id), { kind: "remove_failed" });
          }
        },
        enabled: selectedLine !== undefined && editable && !editing && weighing === undefined,
      },
      {
        key: "NumpadAddSubtract",
        label: "Cantidad",
        whileTyping: true,
        run: stepSelectedQuantity,
        enabled: unitLineSelected && editable && !editing,
      },
      {
        key: "R",
        label: "Reintentar",
        whileTyping: true,
        run: () => {
          if (current.status === "failed") {
            current.retry();
          }
          focusScanField(field.current);
        },
        enabled: current.status === "failed" && searchEmpty,
      },
      { key: "F12", run: () => charge("CASH"), enabled: canChargeNow },
      { key: "F9", run: () => charge("POINT_DEBIT"), enabled: canChargeNow && !pointBelowMinimum },
      {
        key: "F10",
        run: () => charge("POINT_CREDIT"),
        enabled: canChargeNow && !pointBelowMinimum,
      },
      { key: "F11", run: () => charge("QR"), enabled: canChargeNow && !qrBelowMinimum },
      { key: "F1", run: () => charge(undefined), enabled: canChargeNow },
    ],
    { active: !panelOpen },
  );
  const notPermitted = messageFor({ kind: "not_permitted" });
  const shownProblem =
    answer === "not_permitted" && problem?.kind === "not_permitted" ? undefined : problem;
  const lockedReason = linesLock === null ? undefined : LOCKED_REASONS[linesLock];
  const scanFieldLocked = lockedReason !== undefined;
  useEffect(() => {
    if (scanFieldLocked && document.activeElement === document.body) {
      field.current?.focus();
    }
  }, [scanFieldLocked]);
  const refundsOnCancel = sale?.refunds_on_cancel ?? [];

  async function askToCancelSale() {
    const action = sale?.lines_lock === "approved_payment" ? "cancel" : "empty";
    const asked = sale?.cancel_refusal === null ? sale : await readCurrentSale();
    if (asked === "unavailable") {
      setProblem({ kind: action === "cancel" ? "cancel_failed" : "empty_failed" });
    } else if (asked === null || asked === "not_permitted") {
      setProblem(undefined);
    } else if (asked.cancel_refusal !== null) {
      setProblem({ kind: asked.cancel_refusal, action });
    } else if (asked.refunds_on_cancel.length > 0) {
      askToCancelPaid(true);
    } else {
      askToCancel(true);
    }
  }

  const asidePanel =
    panel === "price" && adjusting !== undefined && sale !== null ? (
      <LinePricePanel
        lineId={adjusting.id}
        productName={adjusting.product_name}
        listUnitPrice={adjusting.list_unit_price}
        quantity={adjusting.quantity}
        lineTotal={adjusting.line_total}
        saleUnit={adjusting.sale_unit}
        authorizationRequired={sale.adjust_authorization_required}
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
    ) : panel === "discount" && sale !== null ? (
      <SaleDiscountPanel
        subtotal={sale.subtotal}
        authorizationRequired={sale.sale_discount_authorization_required}
        loadAuthorizers={loadAuthorizers}
        applySaleDiscount={applySaleDiscount}
        previewSaleDiscount={previewSaleDiscount}
        onApplied={(discounted) => void takeDiscountedSale(discounted)}
        onSaleGone={() => void readSaleAgainAfterDiscounting()}
        onSessionInvalid={onSessionInvalid}
        onClose={() => askToDiscount(false)}
      />
    ) : panel === "empty" ? (
      <EmptySalePanel
        lineCount={saleLines.length}
        total={sale?.total ?? 0}
        busy={editing}
        onClose={() => askToCancel(false)}
        onEmpty={() => void edit(cancelSale, { kind: "empty_failed" })}
      />
    ) : panel === "cancel" && sale !== null ? (
      <CancelPaidSalePanel
        saleId={sale.id}
        total={sale.total}
        refundNow={sale.refund_now_on_cancel}
        refunds={refundsOnCancel}
        authorizationRequired={sale.cancel_authorization_required}
        loadAuthorizers={loadAuthorizers}
        cancelPaidSale={cancelPaidSale}
        onCancelled={(refunds) => void takeCancelledPaidSale(refunds)}
        onSaleGone={() => void readSaleAgain()}
        onSessionInvalid={onSessionInvalid}
        onClose={() => askToCancelPaid(false)}
      />
    ) : (
      <PaymentPanel
        saleStatus={current.status}
        lineCount={saleLines.length}
        grossSubtotal={sale?.gross_subtotal ?? 0}
        promotionSavings={sale?.promotion_savings ?? 0}
        saleDiscount={sale?.sale_discount ?? null}
        total={sale?.total ?? 0}
        paid={sale?.paid ?? 0}
        pending={sale?.pending ?? 0}
        cancellable={answer !== undefined}
        hasApprovedPayment={sale?.lines_lock === "approved_payment"}
        chargeRefusal={sale?.charge_refusal ?? null}
        paidOrderToApply={paidOrderToApply ?? undefined}
        availability={availability.status === "loaded" ? availability.value : undefined}
        canCharge={canChargeNow}
        canCancel={canCancel}
        canDiscount={canDiscount}
        onDiscount={() => askToDiscount(true)}
        onCharge={charge}
        onChargePaidOrder={chargePaidOrder}
        onCancel={() => void askToCancelSale()}
      />
    );

  return (
    <RegisterFrame
      background="subtle"
      rail={<OpenSessionRail lock={lock} current="sale" abilities={person.abilities} />}
      aside={asidePanel}
    >
      <main className="flex min-w-0 flex-1 flex-col gap-4 pt-6 pr-6 pb-6 pl-8">
        {diskFull === undefined ? null : (
          <InlineNotice
            tone={diskFull.level === "critical" ? "error" : "warning"}
            icon={<Ban />}
            title={localAlertText(diskFull).title}
            description={localAlertText(diskFull).meaning}
          />
        )}
        <div className="flex items-start gap-4">
          <form
            ref={field}
            noValidate
            tabIndex={-1}
            className="relative min-w-0 flex-1 outline-none"
            onSubmit={submit}
          >
            <SearchField
              label="Producto"
              {...(lockedReason === undefined
                ? { disabled: panelOpen }
                : { disabledReason: lockedReason })}
              placeholder="Escaneá o escribí el nombre"
              icon={LETTER.test(code) ? <Search /> : <ScanBarcode />}
              invalid={shownProblem?.kind === "unknown_code"}
              {...(found === undefined
                ? {}
                : {
                    action: {
                      label: "Cerrar",
                      keyName: "Escape" as const,
                      onPress: () => {
                        setDismissed(true);
                        focusScanField(field.current);
                      },
                    },
                  })}
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
          <LiveScaleCard readScale={readScale} weighingReading={scaleReading} />
        </div>
        {batteryCritical === undefined ? null : (
          <InlineNotice
            tone="error"
            icon={<BatteryLow />}
            title={localAlertText(batteryCritical).title}
            description={localAlertText(batteryCritical).meaning}
          />
        )}
        {weighing?.kind === "add" ? (
          <WeighingCard
            productName={weighing.productName}
            unitPrice={weighing.priced === "by_code" ? codeUnitPrice : weighing.priced?.unitPrice}
            weigh={(confirmedWeightThousandths) =>
              weighOnScale(weighing, confirmedWeightThousandths)
            }
            typedWeight={(weight) => addWithWeight(weighing, weight)}
            waiting={waiting}
            onDiscardWaiting={discardFirstWaiting}
            onReading={setScaleReading}
            onBarcodeRead={(reading) => void takeReading(reading)}
            onClose={closeWeighing}
          />
        ) : null}
        {weighing?.kind === "change" ? (
          <WeighingCard
            productName={weighing.line.product_name}
            unitPrice={weighing.line.list_unit_price}
            currentWeight={weighing.line.quantity}
            weigh={(confirmedWeightThousandths) =>
              weighLineOnScale(weighing, confirmedWeightThousandths)
            }
            typedWeight={(weight) => changeWeight(weighing.line, weight)}
            waiting={waiting}
            onDiscardWaiting={discardFirstWaiting}
            onReading={setScaleReading}
            onBarcodeRead={(reading) => void takeReading(reading)}
            onClose={closeWeighing}
          />
        ) : null}
        {current.status === "loading" ? <LoadingPlaceholder variant="list" items={4} /> : null}
        {answer === "not_permitted" ? (
          <EmptyState
            variant="blank"
            icon={<notPermitted.icon />}
            title={notPermitted.title}
            description={notPermitted.help}
          />
        ) : null}
        {panel === "cancel" ? (
          <LockedSaleLines lines={saleLines} label="Líneas bloqueadas" />
        ) : null}
        {panel !== "cancel" &&
        ((answer !== undefined && answer !== "not_permitted") || current.status === "failed") ? (
          <SaleLines
            lines={saleLines}
            selectedLineId={
              panel === "price" ? adjusting?.id : panelOpen ? undefined : selectedLine?.id
            }
            legend={
              panel === "price" || panel === "discount"
                ? PANEL_LEGEND
                : panelOpen
                  ? undefined
                  : legend
            }
            failed={current.status === "failed"}
            actions={{
              busy: editing || panelOpen,
              weighing: weighing !== undefined,
              editable,
              onChangeWeight: (line) => askForWeight({ kind: "change", line }),
              onAdjust: askToAdjust,
              onRemove: (line) =>
                void edit(() => removeSaleLine(line.id), { kind: "remove_failed" }),
            }}
            onSelect={(line) => {
              if (!panelOpen) {
                setSelectedLineId(line.id);
              }
            }}
          />
        ) : null}
      </main>
      {cancelledRefunds === undefined ? null : (
        <PaidSaleCancelledModal refunds={cancelledRefunds} onClose={closeCancelledPaidSale} />
      )}
    </RegisterFrame>
  );
}
