import { useEffect, useId, useRef } from "react";
import { Input as AriaInput, TextField as AriaTextField } from "react-aria-components";
import { fieldBoxClassName, fieldBoxStateClassName } from "../../forms/field-styles";
import { useDecimalTyping } from "../../forms/use-decimal-typing";
import type { KeyLegendItem } from "../key-legend";
import { Table } from "./table";
import { dataColumn } from "./table-columns";
import { useTableModel } from "./use-table-model";

export type MethodRefundRow = {
  id: string;
  method: string;
  when: string;
  amount: string;
};

export type MethodRefundTableProps = {
  "aria-label": string;
  headers: { method: string; when: string; amount: string };
  amountPrefix: string;
  rows: readonly MethodRefundRow[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onAmountChange: (id: string, amount: string) => void;
  legend?: readonly KeyLegendItem[];
};

type IndexedRow = MethodRefundRow & { index: number };

const DECIMALS = 2;

type AmountInputProps = {
  labelledBy: string;
  prefix: string;
  value: string;
  selected: boolean;
  onFocus: () => void;
  onChange: (value: string) => void;
};

function AmountInput({ labelledBy, prefix, value, selected, onFocus, onChange }: AmountInputProps) {
  const [attachInput, onDecimalChange] = useDecimalTyping(DECIMALS, onChange);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (selected) {
      inputRef.current?.focus();
    }
  }, [selected]);

  return (
    <AriaTextField
      aria-labelledby={labelledBy}
      value={value}
      onChange={onDecimalChange}
      onFocus={onFocus}
      inputMode="decimal"
    >
      <div
        className={`${fieldBoxClassName} h-control-3xl w-48 gap-1 px-3 ${fieldBoxStateClassName({ disabled: false })}`}
      >
        <span aria-hidden="true" className="shrink-0 text-body font-bold text-text">
          {prefix}
        </span>
        <AriaInput
          ref={(element) => {
            inputRef.current = element;
            attachInput(element);
          }}
          className="min-w-0 flex-1 bg-transparent text-right text-body font-bold text-text caret-focus outline-none"
        />
      </div>
    </AriaTextField>
  );
}

export function MethodRefundTable({
  "aria-label": ariaLabel,
  headers,
  amountPrefix,
  rows,
  selectedIndex,
  onSelect,
  onAmountChange,
  legend,
}: MethodRefundTableProps) {
  const idPrefix = useId();
  const items: readonly IndexedRow[] = rows.map((row, index) => ({ ...row, index }));
  const methodId = (row: IndexedRow) => `${idPrefix}-${row.id}`;

  const table = useTableModel({
    items,
    id: (item) => item.id,
    columns: [
      dataColumn({
        id: "method",
        header: headers.method,
        render: (item: IndexedRow) => (
          <span id={methodId(item)} className="text-body font-bold text-text">
            {item.method}
          </span>
        ),
      }),
      dataColumn({
        id: "when",
        header: headers.when,
        render: (item: IndexedRow) => <span className="text-body text-text">{item.when}</span>,
      }),
      dataColumn({
        id: "amount",
        header: headers.amount,
        align: "end",
        render: (item: IndexedRow) => (
          <AmountInput
            labelledBy={methodId(item)}
            prefix={amountPrefix}
            value={item.amount}
            selected={item.index === selectedIndex}
            onFocus={() => onSelect(item.index)}
            onChange={(amount) => onAmountChange(item.id, amount)}
          />
        ),
      }),
    ],
  });

  return (
    <Table
      table={table}
      aria-label={ariaLabel}
      fill
      rowState={(item) => (item.index === selectedIndex ? "selected" : undefined)}
      onRowPress={(item) => onSelect(item.index)}
      {...(legend === undefined ? {} : { legend })}
    />
  );
}
