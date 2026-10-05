import type { InternalBarcodeGenerationBody } from "@purosur/contracts";
import { FieldGroup, fieldErrorMessage, IconButton, useFieldContext } from "@purosur/ui";
import { Barcode, ScanBarcode, X } from "lucide-react";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { type BarcodeListValue, internalBarcodeGenerationRequestFrom } from "./product-form";
import type { generateInternalBarcode } from "./products-api";

export const PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED =
  "No se pudo generar el código interno. Probá de nuevo.";

const barcodeActionClassName =
  "flex h-control-xl flex-1 items-center justify-center gap-2 rounded-lg px-3 text-body font-bold " +
  "text-text-accent inset-ring-2 inset-ring-action " +
  "outline-none transition-background";

const scanControlClassName =
  `${barcodeActionClassName} relative min-w-0 cursor-text hover:not-has-disabled:bg-surface-subtle ` +
  "focus-within:focus-ring has-disabled:opacity-disabled";

// `enabled:` keeps the hover fill off a disabled button.
const generateButtonClassName =
  `${barcodeActionClassName} enabled:hover:bg-surface-subtle ` +
  "focus-visible:focus-ring disabled:opacity-disabled";

type BarcodeListControl = {
  list: BarcodeListValue;
  setList: (next: BarcodeListValue) => void;
  problemMessage: (codes: string[]) => string | undefined;
};

export function useBarcodeChips({ list, setList, problemMessage }: BarcodeListControl) {
  const [scanError, setScanError] = useState<string | undefined>(undefined);

  const scanProblemMessage = (code: string, listed: string[]) => problemMessage([...listed, code]);

  const reset = () => setScanError(undefined);

  function changeScanInput(value: string) {
    setList({ ...list, scan: value });
    setScanError(undefined);
  }

  function remove(code: string) {
    const codes = list.codes.filter((existing) => existing !== code);
    setList({ ...list, codes });
    setScanError((current) =>
      current === undefined ? undefined : scanProblemMessage(list.scan.trim(), codes),
    );
  }

  function handleScanKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const code = list.scan.trim();
    if (code === "") {
      return;
    }
    const problem = scanProblemMessage(code, list.codes);
    if (problem) {
      setScanError(problem);
      return;
    }
    setList({ codes: [...list.codes, code], scan: "" });
    setScanError(undefined);
  }

  function addGenerated(code: string) {
    setList({ ...list, codes: [...list.codes, code] });
  }

  return {
    codes: list.codes,
    scanError,
    reset,
    changeScanInput,
    remove,
    handleScanKeyDown,
    addGenerated,
  };
}

type BarcodeChipsState = ReturnType<typeof useBarcodeChips>;

type InternalBarcodeGeneration = {
  start: (() => void) | undefined;
  generating: boolean;
  error: string | undefined;
};

type BarcodeChipsProps = { chips: BarcodeChipsState; generation?: InternalBarcodeGeneration };

export function BarcodeChips({ chips, generation }: BarcodeChipsProps) {
  const field = useFieldContext<BarcodeListValue>();
  const { codes, scan } = field.state.value;
  const error = fieldErrorMessage(field.state.meta.errors) ?? chips.scanError;
  const errorId = useId();
  const generateErrorId = useId();
  const [scanFocused, setScanFocused] = useState(false);

  return (
    <FieldGroup label="Códigos de barras" required>
      {codes.length > 0 && (
        <div className="flex flex-col gap-1">
          {codes.map((code) => (
            <div
              key={code}
              className="flex h-control-xl items-center gap-2 rounded-lg bg-surface-subtle pr-1.5 pl-3"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-detail text-text">
                {code}
              </span>
              <IconButton
                variant="subtle"
                icon={<X />}
                aria-label={`Quitar el código ${code}`}
                onPress={() => chips.remove(code)}
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-3">
        <label className={scanControlClassName}>
          {!scan && !scanFocused && (
            <span
              aria-hidden="true"
              className="pointer-events-none flex min-w-0 items-center justify-center gap-2"
            >
              <ScanBarcode className="size-icon-md shrink-0" />
              <span className="truncate">Escanear otro código</span>
            </span>
          )}
          <input
            className="absolute inset-0 size-full rounded-lg bg-transparent px-3 text-center outline-none"
            value={scan}
            onChange={(event) => chips.changeScanInput(event.target.value)}
            onKeyDown={chips.handleScanKeyDown}
            onFocus={() => setScanFocused(true)}
            onBlur={() => setScanFocused(false)}
            disabled={generation?.generating}
            aria-label="Escanear otro código"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </label>
        {generation ? (
          <button
            type="button"
            className={generateButtonClassName}
            disabled={generation.start === undefined}
            onClick={generation.start}
            aria-describedby={generation.error ? generateErrorId : undefined}
          >
            <Barcode aria-hidden="true" className="size-icon-md shrink-0" />
            <span className="truncate">Generar código interno</span>
          </button>
        ) : null}
      </div>
      {generation?.error ? (
        <span id={generateErrorId} role="alert" className="text-detail text-error">
          {generation.error}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="text-detail text-error">
          {error}
        </span>
      ) : null}
    </FieldGroup>
  );
}

export function useGenerateInternalBarcode(
  chips: Pick<BarcodeChipsState, "codes" | "addGenerated">,
  generateInternalBarcodeService: typeof generateInternalBarcode,
  onSessionEnded: () => void,
  onRateLimited: (retryAfterSeconds: number) => void,
  clearRateLimited: () => void,
  generateFailedMessage: string,
) {
  const sendToMyAccount = useSendToMyAccount();
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | undefined>(undefined);
  const requestIdRef = useRef(0);

  const reset = () => {
    requestIdRef.current += 1;
    setGenerating(false);
    setGenerateError(undefined);
  };

  async function generateFor(request: InternalBarcodeGenerationBody) {
    setGenerateError(undefined);
    clearRateLimited();
    setGenerating(true);
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const outcome = await generateInternalBarcodeService(request);
    if (requestId !== requestIdRef.current) {
      return;
    }
    setGenerating(false);
    if (outcome.kind === "ok") {
      chips.addGenerated(outcome.code);
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    if (outcome.kind === "rate_limited") {
      onRateLimited(outcome.retryAfterSeconds);
      return;
    }
    setGenerateError(generateFailedMessage);
  }

  const request = generating ? undefined : internalBarcodeGenerationRequestFrom(chips.codes);
  const generation: InternalBarcodeGeneration = {
    start: request === undefined ? undefined : () => void generateFor(request),
    generating,
    error: generateError,
  };

  return { generation, reset };
}
