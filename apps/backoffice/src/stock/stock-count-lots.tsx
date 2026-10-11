import type { SaleUnit } from "@purosur/domain";
import {
  FieldGroup,
  formatCalendarDayNumeric,
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
    <FieldGroup label="Cantidad contada de cada lote">
      <SharedFieldError>
        {(errorMessageId) => {
          const shared = errorMessageId === undefined ? {} : { errorMessageId };
          return (
            <div className="flex flex-col gap-3">
              {lots.map((lot) => (
                <div key={lot.id} className="flex flex-row items-center gap-3">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body font-bold text-text">{lot.lotNumber ?? "—"}</span>
                    <span className="text-detail text-text-subtle">{lotDetail(lot, saleUnit)}</span>
                  </div>
                  <div className="w-40">
                    <TextField
                      {...quantityFieldKind(saleUnit)}
                      label={`Cantidad contada del lote ${lot.lotNumber ?? "sin número"}`}
                      labelVisuallyHidden
                      value={typed[lot.id] ?? ""}
                      onChange={(value) => field.handleChange({ ...typed, [lot.id]: value })}
                      {...shared}
                    />
                  </div>
                </div>
              ))}
              <p className="text-detail text-text-subtle">Un lote sin cantidad queda en cero.</p>
            </div>
          );
        }}
      </SharedFieldError>
    </FieldGroup>
  );
}
