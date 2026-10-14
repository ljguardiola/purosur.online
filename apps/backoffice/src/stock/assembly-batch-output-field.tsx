import type { SaleUnit } from "@purosur/domain";
import { SharedFieldError, TextField, useFieldContext } from "@purosur/ui";
import { quantityFieldKind } from "../platform/stock-quantity";

type AssemblyBatchOutputFieldProps = {
  saleUnit: SaleUnit;
  shown: string;
  proposedText: string | undefined;
  refusal: string | undefined;
  onOutputChange: () => void;
};

export function AssemblyBatchOutputField({
  saleUnit,
  shown,
  proposedText,
  refusal,
  onOutputChange,
}: AssemblyBatchOutputFieldProps) {
  const field = useFieldContext<string | null>();
  return (
    <SharedFieldError>
      {(errorMessageId) => (
        <div className="flex flex-col gap-1">
          <TextField
            {...quantityFieldKind(saleUnit)}
            label="Obtenido"
            required
            value={shown}
            onChange={(value) => {
              onOutputChange();
              field.handleChange(value);
            }}
            {...(refusal !== undefined
              ? { errorMessage: refusal }
              : errorMessageId !== undefined
                ? { errorMessageId }
                : {})}
          />
          {proposedText === undefined ? null : (
            <p className="text-detail text-text-subtle">
              Propuesto: {proposedText}, la suma de lo usado.
            </p>
          )}
        </div>
      )}
    </SharedFieldError>
  );
}
