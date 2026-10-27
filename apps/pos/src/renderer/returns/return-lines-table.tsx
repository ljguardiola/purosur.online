import type { ReturnLineRefusalBody } from "@purosur/contracts";
import type { Option } from "@purosur/ui";
import {
  Checkbox,
  dataColumn,
  formatCents,
  formatWeightInput,
  Select,
  Table,
  TableCellText,
  TextField,
  useTableModel,
} from "@purosur/ui";
import type { ReturnDraft, ReturnDraftLine } from "./return-form";
import type { SaleForReturn, SaleLineForReturn } from "./return-sale";
import type { ReturnReasonValue } from "./return-text";
import { DISPOSITION_OPTIONS, quantityText, REASON_OPTIONS } from "./return-text";

export type ReturnLinesTableProps = {
  sale: SaleForReturn;
  draft: ReturnDraft;
  refusals: Readonly<Record<string, ReturnLineRefusalBody | null>>;
  onCheck: (line: SaleLineForReturn, checked: boolean) => void;
  onChange: (lineId: string, change: Partial<ReturnDraftLine>) => void;
};

const PROMOTION_REASON = "Las promociones se devuelven completas";

function descriptionOf(line: SaleLineForReturn): string {
  const sold = `${quantityText(line.sale_unit, line.sold_quantity)} · ${formatCents(line.charged_amount)}`;
  return line.returned_quantity === 0
    ? sold
    : `${sold} · se pueden devolver ${quantityText(line.sale_unit, line.returnable_quantity)}`;
}

function wholeQuantityText(line: SaleLineForReturn): string {
  return line.sale_unit === "KG"
    ? formatWeightInput(line.returnable_quantity)
    : String(line.returnable_quantity);
}

function reasonOptions(
  windows: SaleForReturn["windows"],
): [Option<ReturnReasonValue>, Option<ReturnReasonValue>] {
  const [changeOfMind, defective] = REASON_OPTIONS;
  return [
    windows.change_of_mind.open ? changeOfMind : { ...changeOfMind, status: "Vencido" },
    windows.defective.open ? defective : { ...defective, status: "Vencido" },
  ];
}

export function ReturnLinesTable({
  sale,
  draft,
  refusals,
  onCheck,
  onChange,
}: ReturnLinesTableProps) {
  const options = reasonOptions(sale.windows);
  const columns = [
    dataColumn({
      id: "product",
      header: "Producto",
      render: (line: SaleLineForReturn) =>
        line.returnable_quantity === 0 ? (
          <TableCellText description="Ya se devolvió completa">{line.product_name}</TableCellText>
        ) : (
          <Checkbox
            name={`return-${line.id}`}
            checked={draft[line.id] !== undefined}
            description={descriptionOf(line)}
            onCheckedChange={(checked) => onCheck(line, checked)}
          >
            {line.product_name}
          </Checkbox>
        ),
    }),
    dataColumn({
      id: "quantity",
      header: "Devuelve",
      render: (line: SaleLineForReturn) => {
        const drafted = draft[line.id];
        if (drafted === undefined) {
          return null;
        }
        const label = `Cantidad de ${line.product_name}`;
        return line.must_be_returned_whole ? (
          <TextField
            kind="plain-text"
            label={label}
            labelVisuallyHidden
            value={wholeQuantityText(line)}
            onChange={() => {}}
            readOnly
            readOnlyReason={PROMOTION_REASON}
          />
        ) : (
          <TextField
            kind="plain-text"
            label={label}
            labelVisuallyHidden
            inputMode={line.sale_unit === "KG" ? "decimal" : "numeric"}
            value={drafted.quantity}
            onChange={(quantity) => onChange(line.id, { quantity })}
          />
        );
      },
    }),
    dataColumn({
      id: "reason",
      header: "Motivo",
      render: (line: SaleLineForReturn) => {
        const drafted = draft[line.id];
        return drafted === undefined ? null : (
          <Select
            name={`reason-${line.id}`}
            label={`Motivo de ${line.product_name}`}
            labelVisuallyHidden
            placeholder="Elegí"
            options={options}
            value={drafted.reason}
            onChange={(reason) => onChange(line.id, { reason })}
          />
        );
      },
    }),
    dataColumn({
      id: "resolution",
      header: "Se resuelve con",
      render: (line: SaleLineForReturn) =>
        draft[line.id] === undefined ? null : <TableCellText>Reintegro</TableCellText>,
    }),
    dataColumn({
      id: "disposition",
      header: "Destino",
      render: (line: SaleLineForReturn) => {
        const drafted = draft[line.id];
        return drafted === undefined ? null : (
          <Select
            name={`disposition-${line.id}`}
            label={`Destino de ${line.product_name}`}
            labelVisuallyHidden
            placeholder="Elegí"
            options={DISPOSITION_OPTIONS}
            value={drafted.disposition}
            onChange={(disposition) => onChange(line.id, { disposition })}
          />
        );
      },
    }),
  ] as const;
  const table = useTableModel({ items: sale.lines, id: (line) => line.id, columns });

  return (
    <Table
      table={table}
      aria-label="Líneas de la venta"
      rowState={(line) => (refusals[line.id] ? "warning" : undefined)}
    />
  );
}
