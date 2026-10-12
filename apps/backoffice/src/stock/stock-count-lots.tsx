import type { SaleUnit } from "@purosur/domain";
import {
  FieldGroup,
  formatCalendarDayNumeric,
  LabelledFieldList,
  SharedFieldError,
  TextField,
  useFieldContext,
} from "@purosur/ui";
import { formatStockQuantity, quantityFieldKind } from "../platform/stock-quantity";
import type { CountLot } from "./stock-count-form";

function lotDetail(lot: CountLot, saleUnit: SaleUnit): string {
  const expiry =
    lot.expiresOn === null
      ? "Sin vencimiento"
      : `Vence el ${formatCalendarDayNumeric(lot.expiresOn)}`;
  return `${expiry} · saldo ${formatStockQuantity(lot.expected, saleUnit)}`;
}

export function CountLotsField({
  lots,
  saleUnit,
}: {
  lots: readonly CountLot[];
  saleUnit: SaleUnit;
}) {
  const field = useFieldContext<Record<string, string>>();
  const typed = field.state.value;
  return (
    <FieldGroup
      label="Cantidad contada de cada lote"
      description="Un lote sin cantidad queda en cero."
    >
      <SharedFieldError>
        {(errorMessageId) => {
          const shared = errorMessageId === undefined ? {} : { errorMessageId };
          return (
            <LabelledFieldList
              monospaceTitles
              items={lots.map((lot) => ({
                id: lot.id,
                title: lot.lotNumber ?? "—",
                detail: lotDetail(lot, saleUnit),
                field: (
                  <TextField
                    {...quantityFieldKind(saleUnit)}
                    label={`Cantidad contada del lote ${lot.lotNumber ?? "sin número"}`}
                    labelVisuallyHidden
                    value={typed[lot.id] ?? ""}
                    onChange={(value) => field.handleChange({ ...typed, [lot.id]: value })}
                    {...shared}
                  />
                ),
              }))}
            />
          );
        }}
      </SharedFieldError>
    </FieldGroup>
  );
}
