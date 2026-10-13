import type {
  FindCountableProductOutcome,
  InitialCountLine,
  ReadInitialCountOutcome,
  RecordInitialCountLineOutcome,
  SearchCountableProductsOutcome,
  WeighCountedProductOutcome,
  WithdrawInitialCountLineOutcome,
} from "@purosur/contracts";
import {
  Button,
  ElevatedNotice,
  EmptyState,
  FloatingNotification,
  ScreenHeader,
  SearchField,
} from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Ban, Lock, ScanBarcode, TriangleAlert, UserX } from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { SearchResults } from "../platform/product-search-results";
import { ProductSearchResults, searchOptionId } from "../platform/product-search-results";
import { useBarcodeReadings } from "../shell/barcode-readings";
import { NoSessionRail } from "../shell/no-session-rail";
import type { SignedInPerson } from "../shell/signed-in-person";
import { CountLineModal } from "./count-line-modal";
import type { CountableProduct, CountableSearchedProduct } from "./countable-product";
import { InitialCountLines } from "./initial-count-lines";
import { InitialCountSummaryPanel } from "./initial-count-summary-panel";
import {
  linesOf,
  useInitialCountQuery,
  useRefreshInitialCount,
  useSearchCountableProducts,
} from "./stock-queries";

export type InitialCountScreenProps = {
  person: SignedInPerson;
  signOut: () => void;
  readInitialCount: () => Promise<ReadInitialCountOutcome>;
  recordInitialCountLine: (
    productId: string,
    counted: number,
    expiresOn: string | null,
  ) => Promise<RecordInitialCountLineOutcome>;
  withdrawInitialCountLine: (movementId: string) => Promise<WithdrawInitialCountLineOutcome>;
  findCountableProduct: (code: string) => Promise<FindCountableProductOutcome>;
  searchCountableProducts: (query: string) => Promise<SearchCountableProductsOutcome>;
  weighCountedProduct: (productId: string) => Promise<WeighCountedProductOutcome>;
  onSessionInvalid: () => void;
};

type Problem = "unknown_code" | "not_permitted" | "lookup_failed";

const PROBLEM_NOTICES = {
  unknown_code: {
    icon: <ScanBarcode />,
    title: "No hay ningún producto con ese código",
    description: "Buscalo por nombre. Si no aparece, falta darlo de alta en el backoffice.",
  },
  not_permitted: {
    icon: <Lock />,
    title: "No tenés permiso para cargar el inventario inicial",
    description: "Quien administra los roles te lo puede dar en el backoffice.",
  },
  lookup_failed: {
    icon: <TriangleAlert />,
    title: "No se pudo buscar el producto. Probá de nuevo.",
    description: "Volvé a intentarlo en unos segundos.",
  },
} as const;

const WITHDRAW_NOTICES = {
  not_permitted: {
    icon: <UserX />,
    title: "Ya no tenés permiso para cargar el inventario inicial",
    description: "Quien administra los roles te lo puede dar en el backoffice.",
  },
  failed: {
    icon: <TriangleAlert />,
    title: "No se pudo quitar la línea",
    description: "Volvé a intentarlo en unos segundos.",
  },
} as const;

const LETTER = /\p{L}/u;

function focusScanField(form: HTMLFormElement | null) {
  form?.querySelector("input")?.focus();
}

function selectScanField(form: HTMLFormElement | null) {
  form?.querySelector("input")?.select();
}

export function InitialCountScreen({
  person,
  signOut,
  readInitialCount,
  recordInitialCountLine,
  withdrawInitialCountLine,
  findCountableProduct,
  searchCountableProducts,
  weighCountedProduct,
  onSessionInvalid,
}: InitialCountScreenProps) {
  const navigate = useNavigate();
  const field = useRef<HTMLFormElement>(null);
  const withdrawInFlight = useRef(false);
  const count = useInitialCountQuery(readInitialCount);
  const refreshCount = useRefreshInitialCount();
  const search = useSearchCountableProducts(searchCountableProducts);
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<Problem>();
  const [results, setResults] = useState<SearchResults<CountableSearchedProduct>>();
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [counting, setCounting] = useState<CountableProduct>();
  const [retired, setRetired] = useState(false);
  const [withdrawNotice, setWithdrawNotice] = useState<"not_permitted" | "failed">();
  const listboxId = useId();

  useEffect(() => {
    if (counting === undefined) {
      focusScanField(field.current);
    }
  }, [counting]);

  function goHome() {
    void navigate({ to: "/" });
  }

  function retire() {
    setCounting(undefined);
    setRetired(true);
  }

  function refuse(submitted: string, refusal: Problem) {
    if (field.current?.querySelector("input")?.value.trim() !== submitted) {
      return;
    }
    setProblem(refusal);
    setDismissed(true);
    selectScanField(field.current);
  }

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

  function takeSearch(query: string, outcome: SearchCountableProductsOutcome) {
    if (field.current?.querySelector("input")?.value.trim() !== query) {
      return;
    }
    switch (outcome.kind) {
      case "results":
        setResults({ query, products: outcome.products, more: outcome.more });
        setActiveIndex(0);
        break;
      case "not_signed_in":
        onSessionInvalid();
        break;
      case "not_offered":
        retire();
        break;
      case "not_permitted":
        setResults(undefined);
        setProblem("not_permitted");
        break;
      case "unavailable":
        setResults(undefined);
        setProblem("lookup_failed");
        break;
    }
  }

  async function find(submitted: string) {
    const outcome = await findCountableProduct(submitted).catch(
      (): FindCountableProductOutcome => ({ kind: "unavailable" }),
    );
    switch (outcome.kind) {
      case "found":
        setCode((typed) => (typed.trim() === submitted ? "" : typed));
        setCounting(outcome.product);
        break;
      case "unknown_code":
        refuse(submitted, "unknown_code");
        break;
      case "not_permitted":
        refuse(submitted, "not_permitted");
        break;
      case "unavailable":
        refuse(submitted, "lookup_failed");
        break;
      case "not_offered":
        retire();
        break;
      case "not_signed_in":
        onSessionInvalid();
        break;
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = code.trim();
    if (submitted !== "") {
      await find(submitted);
    }
  }

  async function takeReading(reading: string) {
    const submitted = reading.trim();
    flushSync(() => {
      setCode(submitted);
      setProblem(undefined);
      setResults(undefined);
      setDismissed(false);
    });
    await find(submitted);
  }

  function choose(product: CountableProduct) {
    setCode("");
    setResults(undefined);
    setCounting(product);
  }

  async function recorded() {
    setCounting(undefined);
    setProblem(undefined);
    await refreshCount();
  }

  async function withdraw(line: InitialCountLine) {
    if (withdrawInFlight.current) {
      return;
    }
    withdrawInFlight.current = true;
    setWithdrawNotice(undefined);
    const outcome = await withdrawInitialCountLine(line.movement_id).catch(
      (): WithdrawInitialCountLineOutcome => ({ kind: "unavailable" }),
    );
    withdrawInFlight.current = false;
    switch (outcome.kind) {
      case "withdrawn":
      case "not_found":
      case "already_withdrawn":
        await refreshCount();
        break;
      case "not_permitted":
        setWithdrawNotice("not_permitted");
        break;
      case "not_offered":
        retire();
        break;
      case "not_signed_in":
        onSessionInvalid();
        break;
      case "unavailable":
        setWithdrawNotice("failed");
        break;
    }
  }

  const found = results?.query === code.trim() && !dismissed ? results : undefined;
  const choosing = found !== undefined && found.products.length > 0;
  const chosen = choosing ? found.products[activeIndex] : undefined;

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
      choose(chosen);
    } else if (choosing && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(Math.min(found.products.length - 1, Math.max(0, activeIndex + step)));
    }
  }

  const answer = count.status === "loaded" ? count.value : undefined;
  const open = !retired && (answer === undefined || (answer.kind === "read" && answer.offered));
  useBarcodeReadings(open ? (reading) => void takeReading(reading) : undefined);
  const lines = linesOf(count);

  return (
    <div className="flex h-full w-full bg-surface-subtle">
      <NoSessionRail person={person} current="/initial-count" signOut={signOut} />
      <main className="flex min-w-0 flex-1 flex-col gap-4 pt-6 pr-6 pb-6 pl-8">
        <ScreenHeader eyebrow="Puesta en marcha · Sin sesión de caja" title="Inventario inicial" />
        {open ? (
          <>
            <form
              ref={field}
              noValidate
              className="relative"
              onSubmit={submit}
              onKeyDownCapture={driveResults}
            >
              <SearchField
                label="Producto"
                placeholder="Escaneá el producto o buscalo por nombre"
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
                onChoose={choose}
              />
              <ElevatedNotice
                notice={problem === undefined ? undefined : PROBLEM_NOTICES[problem]}
              />
            </form>
            <InitialCountLines state={lines} onWithdraw={(line) => void withdraw(line)} />
          </>
        ) : null}
        {answer?.kind === "not_permitted" ? (
          <EmptyState
            variant="blank"
            icon={<Lock />}
            title="No tenés permiso para cargar el inventario inicial"
          />
        ) : null}
        {answer?.kind === "not_signed_in" ? (
          <EmptyState
            variant="blank"
            icon={<TriangleAlert />}
            title="La sesión terminó. Volvé a ingresar para cargar el inventario inicial"
          />
        ) : null}
        {retired || (answer?.kind === "read" && !answer.offered) ? (
          <EmptyState
            variant="blank"
            icon={<Ban />}
            title="La carga del inventario inicial ya no está disponible"
            actions={<Button onPress={goHome}>Volver al inicio</Button>}
          />
        ) : null}
      </main>
      {open ? <InitialCountSummaryPanel state={lines} onFinish={goHome} /> : null}
      {counting === undefined ? null : (
        <CountLineModal
          product={counting}
          recordLine={recordInitialCountLine}
          weigh={weighCountedProduct}
          onRecorded={() => void recorded()}
          onNotOffered={retire}
          onSessionInvalid={onSessionInvalid}
          onClose={() => setCounting(undefined)}
        />
      )}
      {withdrawNotice === undefined ? null : (
        <FloatingNotification
          tone="error"
          {...WITHDRAW_NOTICES[withdrawNotice]}
          onDismiss={() => setWithdrawNotice(undefined)}
        />
      )}
    </div>
  );
}
