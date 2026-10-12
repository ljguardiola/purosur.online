import type { StockProduct, StockProductBalance } from "@purosur/contracts";
import { LoadFailure, LoadingPlaceholder, SummaryRowGroup } from "@purosur/ui";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { formatStockChange, formatStockQuantity } from "../platform/stock-quantity";
import type { CloudData } from "../platform/use-cloud-query";

export function CountBalance({
  product,
  balance,
  counted,
  countedLabel,
}: {
  product: StockProduct;
  balance: CloudData<StockProductBalance>;
  counted: number | undefined;
  countedLabel: string | null;
}) {
  if (balance.status === "loading") {
    return <LoadingPlaceholder variant="card" lines={2} />;
  }
  if (balance.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(balance, "el saldo esperado")} />;
  }
  const { balance: expected } = balance.value;
  const { saleUnit } = product;
  const expectedRow = { label: "Saldo esperado", value: formatStockQuantity(expected, saleUnit) };
  if (counted === undefined) {
    return <SummaryRowGroup rows={[expectedRow]} />;
  }
  const difference = {
    label: "Diferencia",
    value:
      counted === expected ? "Sin diferencia" : formatStockChange(counted - expected, saleUnit),
  };
  return (
    <SummaryRowGroup
      rows={
        countedLabel === null
          ? [expectedRow, difference]
          : [
              { label: countedLabel, value: formatStockQuantity(counted, saleUnit) },
              expectedRow,
              difference,
            ]
      }
    />
  );
}
