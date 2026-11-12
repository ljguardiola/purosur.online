import type {
  FindCountableProductOutcome,
  InitialCountLine,
  ReadInitialCountOutcome,
  RecordInitialCountLineOutcome,
  SearchCountableProductsOutcome,
  WeighCountedProductOutcome,
  WithdrawInitialCountLineOutcome,
} from "@purosur/contracts";
import type { KeyLegendItem } from "@purosur/ui";
import { ElevatedNotice, InlineNotice, SearchField, ToastStack } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Ban, Lock, ScanBarcode, TriangleAlert, UserX } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useKeys } from "../platform/key-layer";
import type { SearchResults } from "../platform/product-search-results";
import { ProductSearchResults, searchOptionId } from "../platform/product-search-results";
import { useBarcodeReadings } from "../shell/barcode-readings";
import { NoSessionRail } from "../shell/no-session-rail";
import { RegisterFrame } from "../shell/register-frame";
import type { SignedInPerson } from "../shell/signed-in-person";
import { CountLinePanel } from "./count-line-panel";
import type { CountableProduct, CountableSearchedProduct } from "./countable-product";
import { InitialCountLines } from "./initial-count-lines";
import { InitialCountSummaryPanel } from "./initial-count-summary-panel";
import { InitialCountUnavailablePanel } from "./initial-count-unavailable-panel";
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
  weighCountedProduct: (
    productId: string,
    confirmedWeightThousandths: number | null,
  ) => Promise<WeighCountedProductOutcome>;
  onSessionInvalid: () => void;
};

type Problem = "unknown_code" | "not_permitted" | "lookup_failed";

const UNKNOWN_CODE_NOTICE = {
  icon: <ScanBarcode />,
  title: "No hay ningún producto con ese código",
  description: "Buscalo por nombre. Si no aparece, falta darlo de alta en el backoffice.",
} as const;

const PROBLEM_NOTICES = {
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

const FIELD_KEY: KeyLegendItem = { keyName: "Tab", label: "Campo" };

function focusScanField(form: HTMLFormElement | null) {
  form?.querySelector("input")?.focus();
}

function selectScanField(form: HTMLFormElement | null) {
  form?.querySelector("input")?.select();
}

function unavailableReason(answer: ReadInitialCountOutcome | undefined, retired: boolean) {
  if (retired || (answer?.kind === "read" && !answer.offered)) {
    return { icon: <Ban />, title: "La carga del inventario inicial ya no está disponible" };
  }
  if (answer?.kind === "not_permitted") {
    return { icon: <Lock />, title: "No tenés permiso para cargar el inventario inicial" };
  }
  if (answer?.kind === "not_signed_in") {
    return {
      icon: <TriangleAlert />,
      title: "La sesión terminó. Volvé a ingresar para cargar el inventario inicial",
    };
  }
  return undefined;
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
  const main = useRef<HTMLElement>(null);
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
  const [selectedLineId, setSelectedLineId] = useState<string>();
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
    if (submitted !== "" && counting === undefined) {
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
    if (counting !== undefined) {
      return;
    }
    setCode("");
    setResults(undefined);
    setCounting(product);
  }

  async function recorded() {
    setCounting(undefined);
    setProblem(undefined);
    await refreshCount();
  }

  async function withdraw(line: InitialCountLine, neighbor: InitialCountLine | undefined) {
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
        setSelectedLineId(neighbor?.movement_id);
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

  const resultCount = found?.products.length ?? 0;
  useKeys([{ key: "Escape", run: () => setDismissed(true) }], { active: found !== undefined });
  useKeys(
    [
      {
        key: "Enter",
        run: () => {
          if (chosen !== undefined) {
            choose(chosen);
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
    ],
    { within: field },
  );

  const answer = count.status === "loaded" ? count.value : undefined;
  const unavailable = unavailableReason(answer, retired);
  const open = unavailable === undefined;
  const counted = counting === undefined;
  useBarcodeReadings(open && counted ? (reading) => void takeReading(reading) : undefined);
  const lines = linesOf(count);
  const countedLines = lines.status === "loaded" ? lines.value : [];
  const selectedLine =
    countedLines.find(({ movement_id }) => movement_id === selectedLineId) ?? countedLines[0];

  function moveSelection(pressed: string) {
    const index = countedLines.findIndex(
      ({ movement_id }) => movement_id === selectedLine?.movement_id,
    );
    const next = Math.min(
      countedLines.length - 1,
      Math.max(0, index + (pressed === "ArrowDown" ? 1 : -1)),
    );
    setSelectedLineId(countedLines[next]?.movement_id);
  }

  function withdrawSelected() {
    if (selectedLine === undefined) {
      return;
    }
    const index = countedLines.indexOf(selectedLine);
    void withdraw(selectedLine, countedLines[index + 1] ?? countedLines[index - 1]);
  }

  const lineBindings = [
    {
      key: "ArrowUpDown",
      label: "Líneas",
      run: moveSelection,
      enabled: open && countedLines.length > 0 && !choosing,
    },
    {
      key: "Delete",
      label: "Quitar",
      run: withdrawSelected,
      enabled: open && selectedLine !== undefined,
    },
  ] as const;
  const lineLegend = useKeys(lineBindings, { active: counted });
  useKeys(lineBindings, { active: !counted, within: main });
  useKeys([{ key: "F12", run: goHome, enabled: open && counted }]);
  useKeys([{ key: "Enter", run: goHome, enabled: !open }], { fallback: true });
  const legend = counted ? lineLegend : [...lineLegend, FIELD_KEY];

  return (
    <RegisterFrame
      background="subtle"
      crumb="Inventario inicial"
      rail={<NoSessionRail person={person} current="/initial-count" signOut={signOut} />}
      aside={
        !open ? (
          <InitialCountUnavailablePanel onGoHome={goHome} />
        ) : counting === undefined ? (
          <InitialCountSummaryPanel state={lines} onFinish={goHome} onClose={goHome} />
        ) : (
          <CountLinePanel
            product={counting}
            recordLine={recordInitialCountLine}
            weigh={weighCountedProduct}
            onRecorded={() => void recorded()}
            onNotOffered={retire}
            onSessionInvalid={onSessionInvalid}
            onClose={() => setCounting(undefined)}
          />
        )
      }
    >
      <main ref={main} className="flex min-w-0 flex-1 flex-col gap-4 pt-6 pr-6 pb-6 pl-8">
        <h1 className="sr-only">Inventario inicial</h1>
        <form ref={field} noValidate className="relative" onSubmit={submit}>
          <SearchField
            label="Producto"
            placeholder="Escaneá el producto o buscalo por nombre"
            icon={<ScanBarcode />}
            disabled={!open}
            invalid={problem === "unknown_code"}
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
          {problem === "unknown_code" ? (
            <div className="mt-4">
              <InlineNotice tone="error" {...UNKNOWN_CODE_NOTICE} />
            </div>
          ) : null}
          <ElevatedNotice
            notice={
              problem === undefined || problem === "unknown_code"
                ? undefined
                : PROBLEM_NOTICES[problem]
            }
          />
        </form>
        <ToastStack
          toasts={
            withdrawNotice === undefined
              ? []
              : [
                  {
                    id: withdrawNotice,
                    tone: "error",
                    ...WITHDRAW_NOTICES[withdrawNotice],
                    onDismiss: () => setWithdrawNotice(undefined),
                  },
                ]
          }
        >
          <InitialCountLines
            state={lines}
            selectedLineId={selectedLine?.movement_id}
            legend={open ? legend : []}
            onSelect={(line) => setSelectedLineId(line.movement_id)}
            {...(unavailable === undefined ? {} : { unavailable })}
          />
        </ToastStack>
      </main>
    </RegisterFrame>
  );
}
