import type { PurchaseOrderDetail } from "@purosur/contracts";
import {
  Button,
  Card,
  dataColumn,
  formatSaleUnitQuantity,
  formatSignedCents,
  Table,
  useTableModel,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { ShoppingCart } from "lucide-react";
import { formatPurchaseOrderCreatedDay } from "./purchase-order-created-day";

type Receipt = PurchaseOrderDetail["receipts"][number];
type ReceiptLine = Receipt["lines"][number];

type PurchaseOrderReceiptsProps = {
  order: PurchaseOrderDetail;
  canOpenPurchases: boolean;
  onOpenPurchases: () => void;
};

const NO_PRICE_DIFFERENCE = "—";

export function PurchaseOrderReceipts({
  order,
  canOpenPurchases,
  onOpenPurchases,
}: PurchaseOrderReceiptsProps) {
  if (order.receipts.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-text-accent text-subheading">Recepciones</h2>
      {order.receipts.map((receipt) => (
        <ReceiptCard
          key={receipt.id}
          order={order}
          receipt={receipt}
          canOpenPurchases={canOpenPurchases}
          onOpenPurchases={onOpenPurchases}
        />
      ))}
    </section>
  );
}

function ReceiptCard({
  order,
  receipt,
  canOpenPurchases,
  onOpenPurchases,
}: PurchaseOrderReceiptsProps & { receipt: Receipt }) {
  const day = formatPurchaseOrderCreatedDay(receipt.receivedAt);
  const productOf = (line: ReceiptLine) =>
    order.lines.find((orderLine) => orderLine.product.id === line.productId)?.product;

  const columns = [
    dataColumn({
      id: "product",
      header: "Producto",
      render: (line: ReceiptLine) => {
        const product = productOf(line);
        return product === undefined ? "Producto del pedido" : formatProductDescription(product);
      },
    }),
    dataColumn({
      id: "received",
      header: "Recibido",
      align: "end",
      render: (line: ReceiptLine) =>
        formatSaleUnitQuantity(line.receivedQuantity, productOf(line)?.saleUnit ?? "UNIT"),
    }),
    dataColumn({
      id: "missing",
      header: "Faltante",
      align: "end",
      render: (line: ReceiptLine) =>
        formatSaleUnitQuantity(line.missingQuantity, productOf(line)?.saleUnit ?? "UNIT"),
    }),
    dataColumn({
      id: "priceDifference",
      header: "Diferencia de precio",
      align: "end",
      render: (line: ReceiptLine) =>
        line.priceDifferenceCents === null
          ? NO_PRICE_DIFFERENCE
          : formatSignedCents(line.priceDifferenceCents),
    }),
  ] as const;

  const table = useTableModel({
    items: receipt.lines,
    id: (line) => line.productId,
    columns,
  });

  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-heading">{`Recepción del ${day}`}</h3>
        {canOpenPurchases ? (
          <Button variant="text" icon={<ShoppingCart />} onPress={onOpenPurchases}>
            Ver compras
          </Button>
        ) : null}
      </div>
      <Table aria-label={`Recepción del ${day}`} table={table} loading={false} />
    </Card>
  );
}
