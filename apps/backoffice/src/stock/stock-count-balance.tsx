import type { StockProduct, StockProductBalance } from "@purosur/contracts";
import { LoadFailure, LoadingPlaceholder, SummaryRowGroup } from "@purosur/ui";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { formatStockChange, formatStockQuantity } from "../platform/stock-quantity";
import type { CloudData } from "../platform/use-cloud-query";

export function CountBalance({
  product,
  balance,
  counted,
  mode,
}: {
  product: StockProduct;
  balance: CloudData<StockProductBalance>;
  counted: number | undefined;
  mode: "product" | "lots";
}) {
  if (balance.status === "loading") {
    return <LoadingPlaceholder variant="card" lines={2} />;
  }
  if (balance.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(balance, "el saldo esperado")} />;
  }
  const { balance: expected } = balance.value;
  const { saleUnit } = product;
  const expectedValue = formatStockQuantity(expected, saleUnit);

  if (mode === "lots") {
    const expectedRow = { label: "Saldo esperado", value: expectedValue, subtle: true } as const;
    if (counted === undefined) {
      return <SummaryRowGroup variant="filled" orientation="horizontal" rows={[expectedRow]} />;
    }
    const delta = counted - expected;
    const difference =
      delta === 0
        ? { label: "Diferencia", value: "Sin diferencia" }
        : { label: "Diferencia", value: formatStockChange(delta, saleUnit) };
    return (
      <SummaryRowGroup
        variant="filled"
        orientation="horizontal"
        rows={[
          { label: "Total contado", value: formatStockQuantity(counted, saleUnit) },
          expectedRow,
          delta < 0 ? { ...difference, tone: "error" } : difference,
        ]}
      />
    );
  }

  const expectedRow = { label: "Saldo esperado", value: expectedValue, detail: true } as const;
  if (counted === undefined) {
    return <SummaryRowGroup variant="plain" rows={[expectedRow]} />;
  }
  const delta = counted - expected;
  const difference = {
    label: "Diferencia",
    value: delta === 0 ? "Sin diferencia" : formatStockChange(delta, saleUnit),
    detail: true,
  } as const;
  return (
    <SummaryRowGroup
      variant="plain"
      rows={[expectedRow, delta < 0 ? { ...difference, tone: "error" } : difference]}
    />
  );
}
