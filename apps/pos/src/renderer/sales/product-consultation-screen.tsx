import type {
  ConsultProductOutcome,
  CurrentSaleAnswer,
  ProductToConsult,
  SearchProductsOutcome,
} from "@purosur/contracts";
import {
  Button,
  DimmedPanel,
  formatCents,
  formatSaleUnitQuantity,
  formatWeight,
  ModePill,
  ProductCard,
  ScaleCard,
  SearchField,
} from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Eye, ScanBarcode, Search } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { useKeys } from "../platform/key-layer";
import type { SearchResults } from "../platform/product-search-results";
import { ProductSearchResults, searchOptionId } from "../platform/product-search-results";
import { useBarcodeReadings } from "../shell/barcode-readings";
import { OpenSessionRail } from "../shell/open-session-rail";
import { RegisterFrame } from "../shell/register-frame";
import type { SignedInPerson } from "../shell/signed-in-person";
import { consultedPromotionText } from "./consulted-promotion-text";
import { PaymentPanel } from "./payment-panel";
import { useConsultedProductQuery, useCurrentSaleQuery, useSearchProducts } from "./sales-queries";
import type { ScanProblem } from "./scan-problem-message";
import { ScanProblemMessage } from "./scan-problem-message";

export type ProductConsultationScreenProps = {
  sessionId: string;
  person: SignedInPerson;
  lock: () => void;
  currentSale: () => Promise<CurrentSaleAnswer>;
  consultProduct: (product: ProductToConsult) => Promise<ConsultProductOutcome>;
  searchProducts: (query: string) => Promise<SearchProductsOutcome>;
  productId: string | undefined;
  onSessionInvalid: () => void;
};

type Consulted = Extract<ConsultProductOutcome, { kind: "consulted" }>;

const LETTER = /\p{L}/u;
const NO_FIGURE = "—";
const SEARCH_LEGEND = [
  { keyName: "ArrowUpDown", label: "Elegir" },
  { keyName: "Enter", label: "Consultar" },
] as const;

function problemOf(outcome: ConsultProductOutcome): ScanProblem | undefined {
  switch (outcome.kind) {
    case "consulted":
    case "not_signed_in":
    case "no_open_session":
      return undefined;
    case "not_found":
      return { kind: "unknown_code" };
    case "not_permitted":
    case "restoration_in_progress":
      return outcome;
    case "unavailable":
      return { kind: "search_failed" };
  }
}

function figuresOf(consulted: Consulted) {
  const stock = {
    label: "Stock",
    value:
      consulted.stock_thousandths === null
        ? "sin dato"
        : formatSaleUnitQuantity(consulted.stock_thousandths, consulted.sale_unit),
  };
  const amount = {
    label: "Importe",
    value: consulted.amount === null ? NO_FIGURE : formatCents(consulted.amount),
  };
  if (consulted.sale_unit === "UNIT") {
    return [amount, stock];
  }
  const weight = {
    label: "Peso",
    value:
      consulted.weight_thousandths === null
        ? NO_FIGURE
        : formatWeight(consulted.weight_thousandths),
  };
  return [weight, amount, stock];
}

function priceOf(consulted: Consulted) {
  return consulted.unit_price === null
    ? "Sin precio"
    : `${formatCents(consulted.unit_price)} / ${consulted.sale_unit === "KG" ? "kg" : "u"}`;
}

export function ProductConsultationScreen({
  sessionId,
  person,
  lock,
  currentSale,
  consultProduct,
  searchProducts,
  productId,
  onSessionInvalid,
}: ProductConsultationScreenProps) {
  const navigate = useNavigate();
  const field = useRef<HTMLFormElement>(null);
  const listboxId = useId();
  const [wanted, setWanted] = useState<ProductToConsult | undefined>(
    productId === undefined ? undefined : { product_id: productId },
  );
  const [code, setCode] = useState("");
  const [results, setResults] = useState<SearchResults>();
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const current = useCurrentSaleQuery({ sessionId, userId: person.user_id, read: currentSale });
  const consultation = useConsultedProductQuery(consultProduct, wanted);
  const search = useSearchProducts(searchProducts);
  const answer = consultation.status === "loaded" ? consultation.value : undefined;
  const consulted = answer?.kind === "consulted" ? answer : undefined;
  const problem = answer === undefined ? undefined : problemOf(answer);
  const found = results?.query === code.trim() && !dismissed ? results : undefined;
  const choosing = found !== undefined && found.products.length > 0;
  const chosen = choosing ? found.products[activeIndex] : undefined;
  const sale =
    current.status === "loaded" && current.value !== "not_permitted" ? current.value : null;

  useEffect(() => {
    field.current?.querySelector("input")?.focus();
  }, []);

  const sessionGone = answer?.kind === "not_signed_in" || answer?.kind === "no_open_session";
  useEffect(() => {
    if (sessionGone) {
      onSessionInvalid();
    }
  }, [sessionGone, onSessionInvalid]);

  function consult(product: ProductToConsult) {
    setCode("");
    setResults(undefined);
    setWanted(product);
  }

  function leave() {
    void navigate({ to: "/session" });
  }

  function addToSale(product: Consulted) {
    void navigate({
      to: "/session",
      search: {
        add: {
          product_id: product.product_id,
          name: product.name,
          sale_unit: product.sale_unit,
          unit_price: product.unit_price,
        },
      },
    });
  }

  function type(typed: string) {
    setCode(typed);
    setDismissed(false);
    const query = typed.trim();
    if (!LETTER.test(query)) {
      setResults(undefined);
      return;
    }
    void search(query).then((outcome) => {
      if (
        outcome.kind === "results" &&
        field.current?.querySelector("input")?.value.trim() === query
      ) {
        setResults({ query, products: outcome.products, more: outcome.more });
        setActiveIndex(0);
      }
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const submitted = code.trim();
    if (submitted !== "" && !LETTER.test(submitted)) {
      consult({ barcode: submitted });
    }
  }

  useBarcodeReadings((reading) => consult({ barcode: reading.trim() }));

  const resultCount = found?.products.length ?? 0;
  useKeys(
    [
      { key: "Escape", run: () => setDismissed(true), enabled: found !== undefined },
      {
        key: "Enter",
        run: () => {
          if (chosen !== undefined) {
            consult({ product_id: chosen.product_id });
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
        enabled: code.trim() !== "",
      },
    ],
    { within: field },
  );
  useKeys([
    { key: "Escape", run: leave },
    {
      key: "Enter",
      run: () => {
        if (consulted !== undefined) {
          addToSale(consulted);
        }
      },
      enabled: consulted !== undefined,
    },
  ]);

  return (
    <RegisterFrame
      background="subtle"
      rail={<OpenSessionRail lock={lock} current="sale" abilities={person.abilities} />}
      mode={<ModePill icon={<Eye />} label="Consulta" onExit={leave} />}
      aside={
        <DimmedPanel>
          <PaymentPanel
            saleStatus={current.status}
            lineCount={sale?.lines.length ?? 0}
            grossSubtotal={sale?.gross_subtotal ?? 0}
            promotionSavings={sale?.promotion_savings ?? 0}
            saleDiscount={sale?.sale_discount ?? null}
            total={sale?.total ?? 0}
            paid={sale?.paid ?? 0}
            pending={sale?.pending ?? 0}
            cancellable={false}
            hasApprovedPayment={false}
            chargeRefusal={null}
            paidOrderToApply={undefined}
            availability={undefined}
            canCharge={false}
            canCancel={false}
            canDiscount={false}
            onDiscount={() => {}}
            onCharge={() => {}}
            onChargePaidOrder={() => {}}
            onCancel={() => {}}
          />
        </DimmedPanel>
      }
    >
      <main className="flex min-w-0 flex-1 flex-col gap-4 pt-6 pr-6 pb-6 pl-8">
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
              tone="mode"
              placeholder="Escaneá o escribí el nombre"
              icon={LETTER.test(code) ? <Search /> : <ScanBarcode />}
              invalid={problem?.kind === "unknown_code"}
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
              legend={SEARCH_LEGEND}
              onChoose={(product) => consult({ product_id: product.product_id })}
            />
            <ScanProblemMessage problem={problem} />
          </form>
          <ScaleCard
            reading={
              consulted?.weight_thousandths == null
                ? undefined
                : { value: formatWeight(consulted.weight_thousandths), settled: true }
            }
          />
        </div>
        {consulted === undefined ? null : (
          <ProductCard
            name={consulted.name}
            price={priceOf(consulted)}
            soldBy={consulted.sale_unit === "KG" ? "weight" : "unit"}
            tag={
              consulted.promotion === null ? undefined : consultedPromotionText(consulted.promotion)
            }
            figures={figuresOf(consulted)}
            action={
              <Button keycap="Enter" onPress={() => addToSale(consulted)}>
                Agregar a la venta
              </Button>
            }
          />
        )}
      </main>
    </RegisterFrame>
  );
}
